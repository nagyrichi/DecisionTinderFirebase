// Match képernyő és real-time listener modul

// Szavazatok realtime listener
function startMatchListener() {
  console.log(`🎧 [MATCH] Match listener indítása - topic: ${window.currentTopic}, userId: ${window.userId}`);
  console.log(`📊 [MATCH] Saját votes objektum:`, window.votes);

  if (window.unsubscribeMatchListener) window.unsubscribeMatchListener();

  window.unsubscribeMatchListener = db.collection("swipes")
    .where("session", "==", window.sessionId)
    .where("topic", "==", window.currentTopic)
    .onSnapshot(snapshot => {
      if (!document.getElementById('screen-match').classList.contains('active-screen')) return;

      const userSwipes = {};
      const userSubtopicSwipes = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        userSwipes[data.user] = data.swipes || {};
        userSubtopicSwipes[data.user] = data.subtopicSwipes || {};
      });

      // FRISSÍTVE: topics objektum új struktúrája miatt .items kell
      const originalItems = window.topics[window.currentTopic]?.items || [];
      console.log("📢 originalItems:", originalItems);

      // Subtopicokat minden fő itemhez megadunk
      const allItemsWithSubtopics = originalItems.map(item => {
        return {
          name: item,
          subtopics: window.subtopicManager.getSubtopicsForItem(item)
        };
      });

      const totalUsers = Object.keys(userSwipes).length;
      console.log(`📈 [MATCH] Szavazatok frissítése - ${totalUsers} user, ${allItemsWithSubtopics.length} item`);

      const voteCounts = {};
      const subtopicVoteCounts = {};
      const ownVotes = window.votes;

      // Főtémák match ellenőrzése
      let matchSet = new Set(allItemsWithSubtopics.map(i => i.name));

      allItemsWithSubtopics.forEach(({name, subtopics}) => {
        let yesCount = 0;
        for (const user in userSwipes) {
          if (userSwipes[user][name] === "yes") yesCount++;
          if (userSwipes[user][name] !== "yes") matchSet.delete(name);
        }
        voteCounts[name] = yesCount;
        
        // Subtopicok szavazatszámlálása
        if (subtopics.length > 0) {
          subtopicVoteCounts[name] = {};
          subtopics.forEach(subtopic => {
            let subYesCount = 0;
            for (const user in userSubtopicSwipes) {
              if (userSubtopicSwipes[user][name] && userSubtopicSwipes[user][name][subtopic] === "yes") {
                subYesCount++;
              } else if (userSwipes[user][subtopic] === "yes") {
                // Fallback: ha a főszavazásokban van
                subYesCount++;
              }
            }
            subtopicVoteCounts[name][subtopic] = subYesCount;
          });
        }
      });

      const ownVotesList = document.getElementById("ownVotes");
      ownVotesList.innerHTML = "";

      allItemsWithSubtopics.forEach(({name, subtopics}) => {
        const li = document.createElement("li");
        li.className = "list-group-item main-topic-item";
        
        // MINDEN TOPIC BEZÁRVA KEZDŐDIK - a user manuálisan nyitja ki ha akarja
        const ownVote = ownVotes[name];
        const shouldBeExpanded = false; // Mindig bezárva kezdünk

        const itemContainer = document.createElement('div');
        itemContainer.className = 'd-flex justify-content-between align-items-center';

        const itemTextSpan = document.createElement('span');
        itemTextSpan.className = 'text-wrap fw-bold';
        itemTextSpan.textContent = name;
        itemTextSpan.style.cursor = subtopics.length > 0 ? 'pointer' : 'default';

        // Expand/collapse ikon hozzáadása, ha vannak subtopicok
        if (subtopics.length > 0) {
          const expandIcon = document.createElement('i');
          expandIcon.className = 'fas fa-chevron-down me-2 text-muted';
          expandIcon.style.fontSize = '0.8rem';
          itemTextSpan.prepend(expandIcon);
        }

        // Badge-ek wrapper
        const badgesWrapper = document.createElement('div');
        badgesWrapper.className = 'd-flex align-items-center gap-2';

        const countBadge = document.createElement('span');
        countBadge.className = 'badge text-bg-secondary';
        countBadge.innerHTML = `<i class="fas fa-users me-1"></i>${voteCounts[name] || 0}/${totalUsers}`;
        badgesWrapper.appendChild(countBadge);

        const voteBadge = document.createElement("span");
        voteBadge.style.cursor = "pointer";
        if (ownVote === "yes") {
          voteBadge.className = "badge rounded-pill bg-success";
          voteBadge.innerText = "Igen";
        } else if (ownVote === "no") {
          voteBadge.className = "badge rounded-pill bg-danger";
          voteBadge.innerText = "Nem";
        } else {
          voteBadge.className = "badge rounded-pill bg-secondary";
          voteBadge.innerText = "?";
        }
        badgesWrapper.appendChild(voteBadge);

        itemContainer.appendChild(itemTextSpan);
        itemContainer.appendChild(badgesWrapper);
        li.appendChild(itemContainer);

        // Subtopicok lista
        const subUl = document.createElement("ul");
        subUl.className = "list-group mt-2 ms-3 subtopics-list";
        
        // MINDEN ALAPÉRTELMEZETTEN REJTETT
        subUl.style.display = "none";
        
        // Ikon frissítése az állapot szerint - mindig lefelé néző nyíl kezdetben
        if (subtopics.length > 0) {
          const expandIcon = itemTextSpan.querySelector('i');
          if (expandIcon) {
            expandIcon.className = 'fas fa-chevron-down me-2 text-muted';
          }
        }

        if (subtopics.length > 0) {
          subtopics.forEach(sub => {
            const subLi = document.createElement("li");
            subLi.className = "list-group-item subtopic-item d-flex justify-content-between align-items-center py-2";
            
            const subText = document.createElement('span');
            subText.textContent = sub;
            subText.className = 'text-wrap';
            
            // Subtopic szavazatok container (count + vote badge)
            const subBadgesWrapper = document.createElement('div');
            subBadgesWrapper.className = 'd-flex align-items-center gap-2';
            
            // Subtopic szavazatszám badge
            const subCountBadge = document.createElement('span');
            subCountBadge.className = 'badge text-bg-secondary';
            const subCount = subtopicVoteCounts[name] ? (subtopicVoteCounts[name][sub] || 0) : 0;
            subCountBadge.innerHTML = `<i class="fas fa-users me-1"></i>${subCount}/${totalUsers}`;
            subBadgesWrapper.appendChild(subCountBadge);
            
            // Subtopic szavazat badge
            const subVote = window.subtopicVotes[name] ? window.subtopicVotes[name][sub] : (window.votes[sub] || null);
            const subVoteBadge = document.createElement("span");
            subVoteBadge.style.cursor = "pointer";
            subVoteBadge.className = "badge rounded-pill";
            
            if (subVote === "yes") {
              subVoteBadge.classList.add("bg-success");
              subVoteBadge.innerText = "✓";
            } else if (subVote === "no") {
              subVoteBadge.classList.add("bg-danger");
              subVoteBadge.innerText = "✗";
            } else {
              subVoteBadge.classList.add("bg-secondary");
              subVoteBadge.innerText = "?";
            }
            
            // Subtopic szavazat váltás
            subVoteBadge.addEventListener('click', (event) => {
              event.stopPropagation(); // Megakadályozzuk az esemény buborékolását
              console.log(`🔄 [SUBTOPIC-CLICK] "${sub}" szavazat váltás`);
              window.subtopicManager.toggleSubtopicVote(name, sub);
            });
            
            subBadgesWrapper.appendChild(subVoteBadge);
            
            subLi.appendChild(subText);
            subLi.appendChild(subBadgesWrapper);
            
            // Megakadályozzuk az esemény buborékolását a subtopic elemen
            subLi.addEventListener('click', (event) => {
              event.stopPropagation();
            });
            
            // Long press törlés hozzáadása subtopicokhoz is
            window.deleteModule.addLongPressDeleteListener(subLi, sub);
            
            subUl.appendChild(subLi);
          });
          
          // "Új altopic hozzáadása" gomb
          const addSubLi = document.createElement("li");
          addSubLi.className = "list-group-item add-subtopic text-center text-primary py-2";
          addSubLi.style.cursor = "pointer";
          addSubLi.innerHTML = `<i class="fas fa-plus me-1"></i> Új altopic`;
          addSubLi.onclick = async (event) => {
            event.stopPropagation(); // Megakadályozzuk az esemény buborékolását
            const newSubtopic = prompt(`Új altopic hozzáadása "${name}"-hoz:`);
            if (newSubtopic && newSubtopic.trim()) {
              await window.subtopicManager.addSubtopicToFirestore(name, newSubtopic.trim());
            }
          };
          subUl.appendChild(addSubLi);
        } else {
          // Ha nincs subtopic, üres állapot
          const emptyLi = document.createElement("li");
          emptyLi.className = "list-group-item text-center text-muted py-2 fst-italic";
          emptyLi.textContent = "Nincs altopic";
          
          // Megakadályozzuk az esemény buborékolását az üres elemen is
          emptyLi.addEventListener('click', (event) => {
            event.stopPropagation();
          });
          
          subUl.appendChild(emptyLi);
        }

        // Expand/collapse funkcionalitás
        if (subtopics.length > 0) {
          itemTextSpan.onclick = () => {
            const isVisible = subUl.style.display !== "none";
            
            if (isVisible) {
              // Bezárás
              subUl.style.display = "none";
              li.classList.remove('expanded');
            } else {
              // Kinyitás
              subUl.style.display = "block";
              li.classList.add('expanded');
            }
            
            // Teljes lista újraszámítása minden expand/collapse után
            setTimeout(() => window.subtopicManager.recalculateAllMargins(), 50);
            
            const expandIcon = itemTextSpan.querySelector('i');
            if (expandIcon) {
              expandIcon.className = isVisible ? 'fas fa-chevron-down me-2 text-muted' : 'fas fa-chevron-up me-2 text-muted';
            }
          };
        }

        li.appendChild(subUl);
        ownVotesList.appendChild(li);

        // Szavazat váltás a főtopicra
        window.votesModule.addVoteToggleListener(voteBadge, name, ownVote === "yes");
        window.deleteModule.addLongPressDeleteListener(li, name);
      });
      
      // ÚJ FŐ TOPIC HOZZÁADÓ GOMB a lista végére - SUBTOPIC STÍLUSSAL
      const addTopicLi = document.createElement("li");
      addTopicLi.className = "list-group-item add-item text-center py-2";
      addTopicLi.style.cursor = "pointer";
      addTopicLi.innerHTML = `<i class="fas fa-plus me-1"></i> Új fő topic`;
      addTopicLi.onclick = async () => {
        const newTopic = prompt("Új fő topic hozzáadása:");
        if (newTopic && newTopic.trim()) {
          await window.subtopicManager.addMainTopicToFirestore(newTopic.trim());
        }
      };
      ownVotesList.appendChild(addTopicLi);
      
      // Mivel minden topic bezárva kezdődik, nincs szükség margin számításra kezdetben
      console.log(`✅ [MATCH] ${allItemsWithSubtopics.length} topic megjelenítve - minden bezárva`);

      // Match eredmény doboz - FRISSÍTETT LOGIKA subtopicokkal
      const matchResultEl = document.getElementById("matchResult");
      
      // Közös főtémák
      const commonMainTopics = [...matchSet];
      
      // Közös subtopicok - csak az elfogadott főtémák subtopicjai között
      let commonSubtopics = [];
      commonMainTopics.forEach(mainTopic => {
        const subtopics = window.subtopicManager.getSubtopicsForItem(mainTopic);
        subtopics.forEach(subtopic => {
          let allUsersVotedYes = true;
          for (const user in userSubtopicSwipes) {
            const userSubVote = userSubtopicSwipes[user][mainTopic] && userSubtopicSwipes[user][mainTopic][subtopic];
            const userMainVote = userSwipes[user][subtopic]; // Fallback
            
            if (userSubVote !== "yes" && userMainVote !== "yes") {
              allUsersVotedYes = false;
              break;
            }
          }
          
          if (allUsersVotedYes && totalUsers > 0) {
            commonSubtopics.push(`${mainTopic} → ${subtopic}`);
          }
        });
      });
      
      if (commonMainTopics.length > 0 || commonSubtopics.length > 0) {
        matchResultEl.className = 'alert alert-success text-center flex-shrink-0';
        let resultText = `<i class="fas fa-check-circle"></i> Közös választás:<br>`;
        
        if (commonMainTopics.length > 0) {
          resultText += `<strong>Főtémák:</strong> ${commonMainTopics.join(", ")}<br>`;
        }
        
        if (commonSubtopics.length > 0) {
          resultText += `<strong>Altémák:</strong> ${commonSubtopics.join(", ")}`;
        }
        
        matchResultEl.innerHTML = resultText;
      } else {
        matchResultEl.className = 'alert alert-warning text-center flex-shrink-0';
        matchResultEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Még nincs közös találat`;
      }
    });
}

// Export
window.matchModule = {
  startMatchListener
};
