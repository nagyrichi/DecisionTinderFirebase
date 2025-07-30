// Subtopic kezelő modul

// Subtopic UI segédfüggvény: teljes lista újraszámítása
function recalculateAllMargins() {
  const allItems = document.querySelectorAll('#ownVotes .main-topic-item');
  
  // EGYSZERŰ MEGOLDÁS: töröljük az összes margint!
  // Az altopicok természetesen elfoglalják a helyüket a DOM-ban,
  // nem kell külön margint hozzáadni!
  allItems.forEach(item => {
    item.style.marginTop = '';
  });
  
  console.log(`📐 [SUBTOPIC] Minden margin törölve - a DOM természetes flow-ja kezeli a pozicionálást`);
}

// Főtéma hozzáadása Firestore-hoz
async function addMainTopicToFirestore(mainTopic) {
  try {
    console.log(`➕ [MAIN-TOPIC] Új főtéma hozzáadása Firestore-hoz: "${mainTopic}"`);
    
    // Jelöljük, hogy ez a user adta hozzá
    window.userAddedItems.add(mainTopic);
    
    // Firestore-ban frissítjük a főtémák listáját
    await db.collection("topics").doc(window.currentTopic).update({
      items: firebase.firestore.FieldValue.arrayUnion(mainTopic)
    });
    
    console.log(`✅ [MAIN-TOPIC] "${mainTopic}" sikeresen hozzáadva a Firestore-hoz`);
  } catch (error) {
    console.error(`❌ [MAIN-TOPIC] Hiba a főtéma hozzáadásakor`, error);
    alert(`Hiba történt: ${error.message}`);
  }
}

// Subtopic hozzáadása Firestore-hoz
async function addSubtopicToFirestore(mainTopic, subtopic) {
  try {
    console.log(`➕ [SUBTOPIC] Új subtopic hozzáadása Firestore-hoz: "${subtopic}" -> "${mainTopic}"`);
    
    // Jelöljük, hogy ez a user adta hozzá
    window.userAddedItems.add(subtopic);
    
    // Firestore-ban frissítjük a subtopicok listáját
    const updatePath = `subtopics.${mainTopic}`;
    await db.collection("topics").doc(window.currentTopic).update({
      [updatePath]: firebase.firestore.FieldValue.arrayUnion(subtopic)
    });
    
    // Ha a főtéma igen szavazatot kapott, akkor az altéma is automatikusan igen
    if (window.votes[mainTopic] === "yes") {
      if (!window.subtopicVotes[mainTopic]) window.subtopicVotes[mainTopic] = {};
      window.subtopicVotes[mainTopic][subtopic] = "yes";
      console.log(`✅ [SUBTOPIC] "${subtopic}" automatikusan elfogadva, mert "${mainTopic}" elfogadva`);
      
      // Szavazatok mentése
      await window.votesModule.sendSwipes();
    }
    
    console.log(`✅ [SUBTOPIC] "${subtopic}" sikeresen hozzáadva a Firestore-hoz`);
  } catch (error) {
    console.error(`❌ [SUBTOPIC] Hiba a subtopic hozzáadásakor`, error);
    alert(`Hiba történt: ${error.message}`);
  }
}

// Subtopic hozzáadása lokálisan
function addSubtopic(mainTopic, subtopic) {
  console.log(`➕ [SUBTOPIC] Új subtopic hozzáadása: "${subtopic}" -> "${mainTopic}"`);
  
  // Ha a főtéma igen szavazatot kapott, akkor az altéma is automatikusan igen
  if (window.votes[mainTopic] === "yes") {
    if (!window.subtopicVotes[mainTopic]) window.subtopicVotes[mainTopic] = {};
    window.subtopicVotes[mainTopic][subtopic] = "yes";
    console.log(`✅ [SUBTOPIC] "${subtopic}" automatikusan elfogadva, mert "${mainTopic}" elfogadva`);
  }
}

// Subtopic szavazat váltása
function toggleSubtopicVote(mainTopic, subtopic) {
  // Subtopic szavazat váltása
  if (!window.subtopicVotes[mainTopic]) window.subtopicVotes[mainTopic] = {};
  
  const currentSubVote = window.subtopicVotes[mainTopic][subtopic];
  const newSubVote = currentSubVote === "yes" ? "no" : "yes";
  
  window.subtopicVotes[mainTopic][subtopic] = newSubVote;
  
  // Főszavazatban is frissítjük (fallback kompatibilitás)
  window.votes[subtopic] = newSubVote;
  
  console.log(`🔄 [SUBTOPIC] "${subtopic}" szavazat váltása: ${currentSubVote || 'nincs'} → ${newSubVote}`);
  
  // Frissítjük a szavazatokat a szerveren
  window.votesModule.sendSwipes();
}

// Subtopicok lekérése egy elemhez
function getSubtopicsForItem(item) {
  // FRISSÍTVE: Firebase-ből olvassuk be a subtopicokat
  const currentTopicData = window.topics[window.currentTopic];
  console.log(`🔍 [SUBTOPIC-GET] Subtopicok lekérése - item: "${item}", currentTopic: "${window.currentTopic}"`);
  console.log(`🔍 [SUBTOPIC-GET] Elérhető subtopicok:`, currentTopicData?.subtopics);
  
  if (currentTopicData && currentTopicData.subtopics && currentTopicData.subtopics[item]) {
    const result = currentTopicData.subtopics[item];
    console.log(`✅ [SUBTOPIC-GET] "${item}" subtopicjai: [${result.join(', ')}]`);
    return result;
  }
  
  // Fallback: ha nincs subtopic adat, üres tömb
  console.log(`⚠️ [SUBTOPIC-GET] "${item}" - nincs subtopic adat`);
  return [];
}

// Export
window.subtopicManager = {
  recalculateAllMargins,
  addMainTopicToFirestore,
  addSubtopicToFirestore,
  addSubtopic,
  toggleSubtopicVote,
  getSubtopicsForItem
};
