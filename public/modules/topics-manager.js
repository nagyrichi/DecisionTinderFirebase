// Témák kezelése és betöltése modul

// Témák betöltése
async function loadTopics() {
  try {
    console.log(`📚 [TOPICS] Témák betöltése kezdődik...`);
    
    const snapshot = await db.collection("topics").get();
    window.topics = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const items = data.items || [];
      const subtopics = data.subtopics || {};
      
      // FRISSÍTVE: subtopicokat is tároljuk
      window.topics[doc.id] = {
        items: items,
        subtopics: subtopics
      };
      
      console.log(`📖 [TOPICS] "${doc.id}" betöltve - ${items.length} elem, ${Object.keys(subtopics).length} subtopic csoport`);
    });
    
    const topicSelect = document.getElementById("topic");
    topicSelect.innerHTML = "";
    
    Object.keys(window.topics).forEach(topic => {
      const opt = document.createElement("option");
      opt.value = topic;
      opt.innerText = topic;
      topicSelect.appendChild(opt);
    });
    
    console.log(`✅ [TOPICS] ${Object.keys(window.topics).length} téma sikeresen betöltve: [${Object.keys(window.topics).join(', ')}]`);
  } catch (error) {
    console.error(`❌ [TOPICS] Hiba a témák betöltésekor`, error);
  }
}

// Téma választás
async function onTopicNext() {
  try {
    const topicSelect = document.getElementById("topic");
    window.currentTopic = topicSelect.value;
    if (!window.currentTopic) { 
      console.log(`⚠️ [TOPIC] Nincs téma kiválasztva`);
      alert("Válassz témát!"); 
      return; 
    }

    console.log(`🎯 [TOPIC] Új session létrehozása - topic: ${window.currentTopic}, userId: ${window.userId}`);

    // Session létrehozása
    await db.collection("session").doc(window.sessionId).set({
      topic: window.currentTopic,
      last_updated: firebase.firestore.FieldValue.serverTimestamp(),
      active_users: {
        [window.userId]: firebase.firestore.FieldValue.serverTimestamp()
      }
    });

    console.log(`✅ [TOPIC] Session sikeresen létrehozva - sessionId: ${window.sessionId}, topic: ${window.currentTopic}`);
    
    // Adatbázis dump session létrehozás után
    setTimeout(() => window.dbDump(), 500);

    // Új session esetén törljük a korábbi szavazatokat
    window.votes = {};
    window.accepted = [];
    window.decidedItems.clear();
    window.userAddedItems.clear(); // Saját hozzáadott elemek is törlődnek

    startTopic(window.currentTopic);
    window.utils.showScreen("screen-swipe");
  } catch (error) {
    console.error(`❌ [TOPIC] Hiba a session létrehozásban`, error);
    alert("Hiba történt a session létrehozásakor!");
  }
}

// Téma listener
function startTopicListener(topic) {
  if (window.unsubscribeTopicListener) window.unsubscribeTopicListener();

  const topicDocRef = db.collection("topics").doc(topic);
  window.unsubscribeTopicListener = topicDocRef.onSnapshot(doc => {
    if (!doc.exists) return;
    const docData = doc.data();
    const newItems = docData.items || [];
    const newSubtopics = docData.subtopics || {};
    // FRISSÍTVE: topics objektum új struktúrája miatt .items kell
    const oldItems = window.topics[topic]?.items || [];
    const oldSubtopics = window.topics[topic]?.subtopics || {};
    
    console.log(`🔄 [TOPIC-LISTENER] Változások detektálva - "${topic}"`);
    console.log(`📋 [TOPIC-LISTENER] Régi items: [${oldItems.join(', ')}]`);
    console.log(`📋 [TOPIC-LISTENER] Új items: [${newItems.join(', ')}]`);
    console.log(`🎯 [TOPIC-LISTENER] Régi subtopics:`, oldSubtopics);
    console.log(`🎯 [TOPIC-LISTENER] Új subtopics:`, newSubtopics);
    
    // Törölt elemek detektálása
    const deletedItems = oldItems.filter(item => !newItems.includes(item));
    if (deletedItems.length > 0) {
      console.log(`🗑️ [TOPIC] Törölt elemek detektálva: [${deletedItems.join(', ')}]`);
      
      // Törölt elemek eltávolítása a lokális adatokból
      deletedItems.forEach(item => {
        if (window.votes[item]) {
          delete window.votes[item];
          console.log(`🧹 [TOPIC] Törölt elem szavazata eltávolítva: "${item}"`);
        }
        window.accepted = window.accepted.filter(i => i !== item);
        window.decidedItems.delete(item);
      });
      
      // Ha match screen-en vagyunk, frissítsük a listát
      if (document.getElementById('screen-match').classList.contains('active-screen')) {
        console.log(`🔄 [TOPIC] Match lista frissítése törlés után`);
        // A match listener automatikusan frissíti a listát
      }
    }
    
    // FRISSÍTVE: teljes topic objektum frissítése
    const prevTopics = JSON.stringify(window.topics[topic]);
    window.topics[topic] = {
      items: newItems,
      subtopics: newSubtopics
    };
    const newTopics = JSON.stringify(window.topics[topic]);
    
    if (prevTopics !== newTopics) {
      console.log(`✅ [TOPIC-LISTENER] Topics objektum frissítve: "${topic}"`);
    }

    newItems.forEach(item => {
      // Csak akkor mutassunk modal-t, ha a MATCH screen-en vagyunk és új elem érkezett
      // ÉS a user nem ő maga adta hozzá
      if (!window.decidedItems.has(item) && !window.votes.hasOwnProperty(item) && !window.userAddedItems.has(item)) {
        window.decidedItems.add(item);
        
        // Modal csak match screen-en
        if (document.getElementById('screen-match').classList.contains('active-screen')) {
          window.utils.showNewItemModal(item);
          console.log(`🆕 [TOPIC] Új elem érkezett match screen-en: "${item}"`);
        } else {
          console.log(`🆕 [TOPIC] Új elem érkezett swipe közben: "${item}" - modal elhalasztva`);
        }
      } else if (window.userAddedItems.has(item)) {
        console.log(`🚫 [TOPIC] Saját hozzáadott elem: "${item}" - modal kihagyva`);
        window.decidedItems.add(item); // Biztosítsuk, hogy decided legyen
      }
    });

    // Ha új elemek érkeztek és épp a swipe screen-en vagyunk, frissítsük a currentItems listát
    if (document.getElementById('screen-swipe').classList.contains('active-screen')) {
      const oldLength = window.currentItems.length;
      window.currentItems = [...newItems];
      
      if (newItems.length > oldLength) {
        console.log(`📈 [TOPIC] ${newItems.length - oldLength} új elem hozzáadva a listához`);
      }
    }
  });
}

// Téma indítása
function startTopic(topic) {
  console.log(`🏁 [SWIPE] Téma indítása - topic: ${topic}, userId: ${window.userId}`);
  
  window.currentTopic = topic;
  // MÓDOSÍTVA: először csak a főtémákat töltjük be
  const mainTopics = window.topics[topic]?.items || [];
  window.currentItems = [...mainTopics];
  window.utils.shuffle(window.currentItems);
  
  // KIEGÉSZÍTVE: ha már voltak szavazatok, rekonstruáljuk a teljes listát
  const alreadyAcceptedMainTopics = mainTopics.filter(item => window.votes[item] === "yes");
  console.log(`🔄 [SWIPE] Elfogadott főtémák újratöltésnél: [${alreadyAcceptedMainTopics.join(', ')}]`);
  
  // Beszúrjuk az elfogadott főtémák subtopicjait
  alreadyAcceptedMainTopics.forEach(mainTopic => {
    const subtopics = window.subtopicManager.getSubtopicsForItem(mainTopic);
    if (subtopics.length > 0) {
      console.log(`🔀 [SWIPE] "${mainTopic}" subtopicjainak beszúrása: [${subtopics.join(', ')}]`);
      
      // Megkeressük a főtéma pozícióját a listában
      const mainTopicIndex = window.currentItems.indexOf(mainTopic);
      if (mainTopicIndex !== -1) {
        // Beszúrjuk a subtopicokat a főtéma után
        window.currentItems.splice(mainTopicIndex + 1, 0, ...subtopics);
      }
    }
  });
  
  // Keressük meg, hogy hol tartunk a szavazásban
  window.currentIndex = 0;
  for (let i = 0; i < window.currentItems.length; i++) {
    if (!window.votes.hasOwnProperty(window.currentItems[i])) {
      window.currentIndex = i;
      break;
    }
  }
  
  // Ha minden elemre szavaztunk, akkor a végére állítjuk
  if (window.currentIndex === 0 && window.currentItems.length > 0 && window.votes.hasOwnProperty(window.currentItems[0])) {
    window.currentIndex = window.currentItems.length;
  }
  
  // decidedItems újraépítése - MINDEN létező elemet hozzáadunk
  window.decidedItems.clear();
  // Csak a főtémákat adjuk hozzá decided-hez - a subtopicok dinamikusan kerülnek be
  mainTopics.forEach(item => {
    window.decidedItems.add(item);
  });
  
  console.log(`🔀 [SWIPE] ${window.currentItems.length} elem (főtémák + subtopicok) - jelenlegi pozíció: ${window.currentIndex}/${window.currentItems.length}`);
  console.log(`📊 [SWIPE] Korábbi szavazatok: ${Object.keys(window.votes).length}, elfogadva: [${window.accepted.join(', ')}]`);
  console.log(`🎯 [SWIPE] Decided főtémák: [${[...window.decidedItems].join(', ')}]`);
  console.log(`📋 [SWIPE] Aktuális lista: [${window.currentItems.join(', ')}]`);
  
  document.querySelector('#screen-swipe h2').textContent = window.currentTopic;
  window.swipeModule.showNextItem();

  startTopicListener(topic);
  window.matchModule.startMatchListener();
}

// Export
window.topicsModule = {
  loadTopics,
  onTopicNext,
  startTopicListener,
  startTopic
};
