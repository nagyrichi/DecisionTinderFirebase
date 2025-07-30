// Szavazatok kezelése modul

// User szavazatok betöltése a szerverről
async function loadUserVotes() {
  try {
    console.log(`📥 [VOTES] Korábbi szavazatok betöltése - userId: ${window.userId}`);
    
    const swipeDoc = await db.collection("swipes").doc(`${window.sessionId}_${window.userId}`).get();
    
    if (swipeDoc.exists) {
      const data = swipeDoc.data();
      window.votes = data.swipes || {};
      window.subtopicVotes = data.subtopicSwipes || {}; // Subtopic szavazatok betöltése
      
      // Accepted lista újraépítése a votes alapján
      window.accepted = [];
      Object.entries(window.votes).forEach(([item, vote]) => {
        if (vote === "yes") {
          window.accepted.push(item);
        }
      });
      
      console.log(`✅ [VOTES] Szavazatok betöltve - ${Object.keys(window.votes).length} elem, elfogadva: [${window.accepted.join(', ')}]`);
      console.log(`✅ [SUBTOPIC-VOTES] Subtopic szavazatok betöltve:`, window.subtopicVotes);
    } else {
      console.log(`📭 [VOTES] Nincsenek korábbi szavazatok`);
      window.votes = {};
      window.subtopicVotes = {};
      window.accepted = [];
    }
  } catch (error) {
    console.error(`❌ [VOTES] Hiba a szavazatok betöltésekor`, error);
    window.votes = {};
    window.subtopicVotes = {};
    window.accepted = [];
  }
}

// Szavazatok küldése a szerverre
async function sendSwipes() {
  try {
    const voteCount = Object.keys(window.votes).length;
    const yesCount = Object.values(window.votes).filter(v => v === "yes").length;
    
    console.log(`📤 [VOTES] Szavazatok küldése - összesen: ${voteCount}, igen: ${yesCount}, nem: ${voteCount - yesCount}`);
    console.log(`📤 [SUBTOPIC-VOTES] Subtopic szavazatok:`, window.subtopicVotes);
    
    await db.collection("swipes").doc(`${window.sessionId}_${window.userId}`).set({
      user: window.userId,
      session: window.sessionId,
      topic: window.currentTopic,
      swipes: window.votes,
      subtopicSwipes: window.subtopicVotes, // Új mező a subtopic szavazatoknak
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [VOTES] Szavazatok sikeresen elküldve - userId: ${window.userId}, sessionId: ${window.sessionId}`);
  } catch (error) {
    console.error(`❌ [VOTES] Hiba a szavazatok küldésekor`, error);
  }
}

// Ellenőrzi, hogy a user befejezte-e a szavazást
function hasUserFinishedVoting() {
  // FRISSÍTVE: csak a főtémákra ellenőrzünk - a subtopicok dinamikusan kerülnek be
  const allItems = window.topics[window.currentTopic]?.items || [];
  const votedItems = Object.keys(window.votes);
  
  console.log(`🔍 [CHECK] Szavazás állapot - főtémák: ${allItems.length}, megszavazott: ${votedItems.length}`);
  
  // Minden főtémára szavaztunk-e? (subtopicok automatikusan kerülnek be)
  const mainTopicsFinished = allItems.length > 0 && allItems.every(item => window.votes.hasOwnProperty(item));
  
  // Továbbá: minden elfogadott főtéma subtopicjaira is szavaztunk-e?
  let subtopicsFinished = true;
  for (const mainTopic of allItems) {
    if (window.votes[mainTopic] === "yes") {
      const subtopics = window.subtopicManager.getSubtopicsForItem(mainTopic);
      const allSubtopicsVoted = subtopics.every(subtopic => window.votes.hasOwnProperty(subtopic));
      if (!allSubtopicsVoted) {
        subtopicsFinished = false;
        console.log(`🎯 [CHECK] "${mainTopic}" subtopicjai még nem szavazva: [${subtopics.filter(sub => !window.votes.hasOwnProperty(sub)).join(', ')}]`);
        break;
      }
    }
  }
  
  const isFinished = mainTopicsFinished && subtopicsFinished;
  
  if (isFinished) {
    console.log(`✅ [CHECK] User befejezte a szavazást (főtémák + subtopicok)`);
  } else {
    const missingMainTopics = allItems.filter(item => !window.votes.hasOwnProperty(item));
    console.log(`🎯 [CHECK] User még nem fejezte be`);
    if (missingMainTopics.length > 0) {
      console.log(`   📋 Hiányzó főtémák: [${missingMainTopics.join(', ')}]`);
    }
  }
  
  return isFinished;
}

// Igen/Nem váltás
function addVoteToggleListener(el, item, currentlyVotedYes) {
  el.addEventListener('click', () => {
    // Jelenlegi szavazat állapota
    const wasYes = currentlyVotedYes;
    const newVote = wasYes ? "no" : "yes";
    
    console.log(`🔄 [VOTE] Szavazat váltása - "${item}": ${wasYes ? 'IGEN' : 'NEM'} → ${newVote === 'yes' ? 'IGEN' : 'NEM'}`);
    
    // Frissítjük a votes objektumot
    window.votes[item] = newVote;
    
    // Frissítjük az accepted listát
    if (newVote === "yes" && !window.accepted.includes(item)) {
      window.accepted.push(item);
      console.log(`✅ [VOTE] "${item}" hozzáadva az elfogadottakhoz`);
    } else if (newVote === "no") {
      window.accepted = window.accepted.filter(i => i !== item);
      console.log(`❌ [VOTE] "${item}" eltávolítva az elfogadottakból`);
      
      // ÚJ: Ha egy főtémát "nem"-re váltunk, az összes subtopicját is "nem"-re állítjuk
      const subtopics = window.subtopicManager.getSubtopicsForItem(item);
      if (subtopics.length > 0) {
        console.log(`❌ [SUBTOPIC] "${item}" elutasítva - ${subtopics.length} subtopic automatikus elutasítása`);
        
        subtopics.forEach(subtopic => {
          window.votes[subtopic] = "no";
          // Subtopic votes objektumból is töröljük/frissítjük
          if (window.subtopicVotes[item]) {
            window.subtopicVotes[item][subtopic] = "no";
          }
        });
        
        console.log(`📋 [SUBTOPIC] Subtopicok elutasítva: [${subtopics.join(', ')}]`);
      }
    }
    
    // Küldés a szervernek
    sendSwipes();
  });
}

// Export
window.votesModule = {
  loadUserVotes,
  sendSwipes,
  hasUserFinishedVoting,
  addVoteToggleListener
};
