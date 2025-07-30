// Törlés funkciók modul

// Hosszú nyomás törlés
function addLongPressDeleteListener(listItem, itemName) {
  let pressTimer = null;
  let startTime = 0;
  
  const startPress = (event) => {
    event.stopPropagation(); // Megakadályozzuk az esemény buborékolását
    startTime = Date.now();
    pressTimer = setTimeout(() => {
      // 800ms után megkérdezzük
      if (confirm(`Biztosan törlöd: "${itemName}"?`)) {
        console.log(`🗑️ [LONGPRESS] User megerősítette a törlést: "${itemName}"`);
        deleteItemFromFirestore(itemName);
      } else {
        console.log(`🚫 [LONGPRESS] User lemondta a törlést: "${itemName}"`);
      }
    }, 800); // 800ms hosszú nyomás
  };
  
  const cancelPress = (event) => {
    if (event) event.stopPropagation(); // Megakadályozzuk az esemény buborékolását
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  
  // Mouse események
  listItem.addEventListener('mousedown', startPress);
  listItem.addEventListener('mouseup', cancelPress);
  listItem.addEventListener('mouseleave', cancelPress);
  
  // Touch események
  listItem.addEventListener('touchstart', startPress, { passive: false }); // passive: false hogy stopPropagation működjön
  listItem.addEventListener('touchend', cancelPress);
  listItem.addEventListener('touchcancel', cancelPress);
  listItem.addEventListener('touchmove', cancelPress); // Ha mozog, törljük
}

// Egyszerű törlés funkció
async function deleteItemFromFirestore(item) {
  try {
    console.log(`🗑️ [DELETE] Elem törlése megkezdve: "${item}"`);

    // Ellenőrizzük, hogy főtéma vagy subtopic-e
    let isMainTopic = false;
    let isSubtopic = false;
    let parentMainTopic = null;
    
    // FRISSÍTVE: topics objektum új struktúrája miatt .items kell
    const mainTopics = window.topics[window.currentTopic]?.items || [];
    
    if (mainTopics.includes(item)) {
      isMainTopic = true;
      console.log(`📋 [DELETE] "${item}" főtéma törlése`);
    } else {
      // Keressük meg, hogy melyik főtéma subtopicja
      for (const mainTopic of mainTopics) {
        const subtopics = window.subtopicManager.getSubtopicsForItem(mainTopic);
        if (subtopics.includes(item)) {
          isSubtopic = true;
          parentMainTopic = mainTopic;
          console.log(`📋 [DELETE] "${item}" subtopic törlése (szülő: "${parentMainTopic}")`);
          break;
        }
      }
    }

    // Lokális törlés
    if (window.votes[item]) {
      delete window.votes[item];
      console.log(`🧹 [DELETE] Lokális vote törölve: "${item}"`);
    }
    
    // Subtopic votes tisztítása
    if (isMainTopic && window.subtopicVotes[item]) {
      delete window.subtopicVotes[item];
      console.log(`🧹 [DELETE] Subtopic votes törölve: "${item}"`);
    } else if (isSubtopic && window.subtopicVotes[parentMainTopic] && window.subtopicVotes[parentMainTopic][item]) {
      delete window.subtopicVotes[parentMainTopic][item];
      console.log(`🧹 [DELETE] Subtopic vote törölve: "${parentMainTopic}" -> "${item}"`);
    }
    
    window.accepted = window.accepted.filter(i => i !== item);
    window.decidedItems.delete(item);
    window.userAddedItems.delete(item);
    
    console.log(`📝 [DELETE] Lokális adatok frissítve - elfogadottak: [${window.accepted.join(', ')}]`);

    // Firestore törlés
    if (isMainTopic) {
      // Főtéma törlése a topics-ból
      await db.collection("topics").doc(window.currentTopic).update({
        items: firebase.firestore.FieldValue.arrayRemove(item),
        [`subtopics.${item}`]: firebase.firestore.FieldValue.delete()
      });
      console.log(`🔥 [DELETE] Főtéma és subtopicjai törölve a Firestore-ból: "${item}"`);
    } else if (isSubtopic && parentMainTopic) {
      // Subtopic törlése
      await db.collection("topics").doc(window.currentTopic).update({
        [`subtopics.${parentMainTopic}`]: firebase.firestore.FieldValue.arrayRemove(item)
      });
      console.log(`🔥 [DELETE] Subtopic törölve a Firestore-ból: "${parentMainTopic}" -> "${item}"`);
    }
    
    // Adatbázis dump törlés után
    setTimeout(() => window.dbDump(), 500);

    // Swipes frissítése
    await window.votesModule.sendSwipes();

    // Lokális topics objektum frissítése
    if (window.topics[window.currentTopic]) {
      if (isMainTopic) {
        window.topics[window.currentTopic].items = window.topics[window.currentTopic].items.filter(i => i !== item);
        if (window.topics[window.currentTopic].subtopics && window.topics[window.currentTopic].subtopics[item]) {
          delete window.topics[window.currentTopic].subtopics[item];
        }
      } else if (isSubtopic && parentMainTopic) {
        if (window.topics[window.currentTopic].subtopics && window.topics[window.currentTopic].subtopics[parentMainTopic]) {
          window.topics[window.currentTopic].subtopics[parentMainTopic] = window.topics[window.currentTopic].subtopics[parentMainTopic].filter(s => s !== item);
        }
      }
      console.log(`🔄 [DELETE] Lokális topics objektum frissítve`);
    }

    console.log(`✅ [DELETE] "${item}" sikeresen törölve mindenhonnan - realtime sync aktiválva`);
  } catch (error) {
    console.error(`❌ [DELETE] Hiba az elem törlésekor: "${item}"`, error);
  }
}

// Export
window.deleteModule = {
  addLongPressDeleteListener,
  deleteItemFromFirestore
};
