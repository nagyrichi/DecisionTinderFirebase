const firebaseConfig = {
  apiKey: "AIzaSyDp3HumzdoZ6SWWQX6wPLmk0RzYl0qPbjs",
  authDomain: "decisiontinderfirebase.firebaseapp.com",
  projectId: "decisiontinderfirebase",
  storageBucket: "decisiontinderfirebase.appspot.com",
  messagingSenderId: "743649100420",
  appId: "1:743649100420:web:18f276d16d855241dbf8d1",
  measurementId: "G-2T7C1GQFXF"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log("🔥 Firebase inicializálva");

// Debug funkció: teljes adatbázis tartalom kiírása
async function logDatabaseContents() {
  try {
    const [sessionsSnap, swipesSnap, topicsSnap] = await Promise.all([
      db.collection("session").get(),
      db.collection("swipes").get(),
      db.collection("topics").get()
    ]);
    
    console.log(`📊 [DB] ========== TELJES ADATBÁZIS DUMP ==========`);
    console.log(`   📂 Sessions: ${sessionsSnap.size} db`);
    console.log(`   📂 Swipes: ${swipesSnap.size} db`);
    console.log(`   📂 Topics: ${topicsSnap.size} db`);
    console.log(`================================================`);
    
    // Sessions részletes kiírása
    console.log(`🗂️ [SESSIONS] Részletes tartalom:`);
    if (sessionsSnap.size === 0) {
      console.log(`   (nincs session)`);
    } else {
      sessionsSnap.forEach(doc => {
        const data = doc.data();
        console.log(`   📋 Session ID: ${doc.id}`);
        console.log(`      ├─ topic: "${data.topic}"`);
        console.log(`      ├─ users: [${data.users ? data.users.join(', ') : 'nincs'}]`);
        console.log(`      ├─ createdAt: ${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'nincs'}`);
        console.log(`      └─ lastActivity: ${data.lastActivity ? new Date(data.lastActivity.toDate()).toLocaleString() : 'nincs'}`);
      });
    }
    
    // Swipes részletes kiírása
    console.log(`🎯 [SWIPES] Részletes tartalom:`);
    if (swipesSnap.size === 0) {
      console.log(`   (nincs swipe)`);
    } else {
      swipesSnap.forEach(doc => {
        const data = doc.data();
        console.log(`   👆 Swipe ID: ${doc.id}`);
        console.log(`      ├─ sessionId: ${data.sessionId}`);
        console.log(`      ├─ userId: ${data.userId}`);
        console.log(`      ├─ item: "${data.item}"`);
        console.log(`      ├─ vote: ${data.vote}`);
        console.log(`      └─ timestamp: ${data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : 'nincs'}`);
      });
    }
    
    // Topics részletes kiírása
    console.log(`📖 [TOPICS] Részletes tartalom:`);
    if (topicsSnap.size === 0) {
      console.log(`   (nincs topic)`);
    } else {
      topicsSnap.forEach(doc => {
        const data = doc.data();
        const items = data.items || [];
        console.log(`   📚 Topic ID: ${doc.id}`);
        console.log(`      ├─ elemek száma: ${items.length}`);
        console.log(`      └─ elemek: [${items.join(', ')}]`);
      });
    }
    
    console.log(`================================================`);
    console.log(`✅ [DB] Adatbázis dump befejezve`);
  } catch (error) {
    console.log(`⚠️ [DB] Nem sikerült betölteni az adatbázis tartalmat:`, error.message);
  }
}

// 1 másodperc múlva kiírjuk az adatbázis tartalmat
setTimeout(logDatabaseContents, 1000);

// Globális debug funkció - konzolból hívható: window.dbDump()
window.dbDump = logDatabaseContents;
console.log(`🔧 [DEBUG] Használd: window.dbDump() a teljes adatbázis dump-hoz`);

// EGYSZERI ADMIN FUNKCIÓ - konzolból hívható: window.initDB()
window.initDB = initializeTopicsWithSubtopics;
console.log(`🔧 [ADMIN] Használd: window.initDB() az adatbázis inicializáláshoz subtopicokkal`);
console.log(`⚠️ [ADMIN] FONTOS: Először törölj minden topics dokumentumot a Firestore Console-ban!`);

// --- Globális változók ---
let topics = {};
let currentTopic = null;
let currentItems = [];
let currentIndex = 0;
let votes = {}; // Főtémák szavazatai
let subtopicVotes = {}; // Altémák szavazatai: {mainTopic: {subtopic: "yes/no"}}
let decidedItems = new Set();
let userId = null;
let sessionId = "global";
let accepted = [];
let unsubscribeTopicListener = null;
let unsubscribeMatchListener = null;
let lastActivityTimestamp = Date.now();

// Rejtett admin funkció
let secretClickCount = 0;
let secretClickTimer = null;

// Hozzáadott elemek követése userid szerint - hogy ne kapjon modal a hozzáadó
let userAddedItems = new Set();

// --- Segéd ---
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function getRandomPastelColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 30%, 40%)`;
}

function getSessionIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('session');
}

function updateActivity() {
  lastActivityTimestamp = Date.now();
}

// --- Subtopic UI segédfüggvény: teljes lista újraszámítása ---
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

// --- Subtopic kezelő funkciók ---
async function addMainTopicToFirestore(mainTopic) {
  try {
    console.log(`➕ [MAIN-TOPIC] Új főtéma hozzáadása Firestore-hoz: "${mainTopic}"`);
    
    // Jelöljük, hogy ez a user adta hozzá
    userAddedItems.add(mainTopic);
    
    // Firestore-ban frissítjük a főtémák listáját
    await db.collection("topics").doc(currentTopic).update({
      items: firebase.firestore.FieldValue.arrayUnion(mainTopic)
    });
    
    console.log(`✅ [MAIN-TOPIC] "${mainTopic}" sikeresen hozzáadva a Firestore-hoz`);
  } catch (error) {
    console.error(`❌ [MAIN-TOPIC] Hiba a főtéma hozzáadásakor`, error);
    alert(`Hiba történt: ${error.message}`);
  }
}

async function addSubtopicToFirestore(mainTopic, subtopic) {
  try {
    console.log(`➕ [SUBTOPIC] Új subtopic hozzáadása Firestore-hoz: "${subtopic}" -> "${mainTopic}"`);
    
    // Jelöljük, hogy ez a user adta hozzá
    userAddedItems.add(subtopic);
    
    // Firestore-ban frissítjük a subtopicok listáját
    const updatePath = `subtopics.${mainTopic}`;
    await db.collection("topics").doc(currentTopic).update({
      [updatePath]: firebase.firestore.FieldValue.arrayUnion(subtopic)
    });
    
    // Ha a főtéma igen szavazatot kapott, akkor az altéma is automatikusan igen
    if (votes[mainTopic] === "yes") {
      if (!subtopicVotes[mainTopic]) subtopicVotes[mainTopic] = {};
      subtopicVotes[mainTopic][subtopic] = "yes";
      console.log(`✅ [SUBTOPIC] "${subtopic}" automatikusan elfogadva, mert "${mainTopic}" elfogadva`);
      
      // Szavazatok mentése
      await sendSwipes();
    }
    
    console.log(`✅ [SUBTOPIC] "${subtopic}" sikeresen hozzáadva a Firestore-hoz`);
  } catch (error) {
    console.error(`❌ [SUBTOPIC] Hiba a subtopic hozzáadásakor`, error);
    alert(`Hiba történt: ${error.message}`);
  }
}

function addSubtopic(mainTopic, subtopic) {
  console.log(`➕ [SUBTOPIC] Új subtopic hozzáadása: "${subtopic}" -> "${mainTopic}"`);
  
  // Ha a főtéma igen szavazatot kapott, akkor az altéma is automatikusan igen
  if (votes[mainTopic] === "yes") {
    if (!subtopicVotes[mainTopic]) subtopicVotes[mainTopic] = {};
    subtopicVotes[mainTopic][subtopic] = "yes";
    console.log(`✅ [SUBTOPIC] "${subtopic}" automatikusan elfogadva, mert "${mainTopic}" elfogadva`);
  }
}

function toggleSubtopicVote(mainTopic, subtopic) {
  // Subtopic szavazat váltása
  if (!subtopicVotes[mainTopic]) subtopicVotes[mainTopic] = {};
  
  const currentSubVote = subtopicVotes[mainTopic][subtopic];
  const newSubVote = currentSubVote === "yes" ? "no" : "yes";
  
  subtopicVotes[mainTopic][subtopic] = newSubVote;
  
  // Főszavazatban is frissítjük (fallback kompatibilitás)
  votes[subtopic] = newSubVote;
  
  console.log(`🔄 [SUBTOPIC] "${subtopic}" szavazat váltása: ${currentSubVote || 'nincs'} → ${newSubVote}`);
  
  // Frissítjük a szavazatokat a szerveren
  sendSwipes();
}

function getSubtopicsForItem(item) {
  // FRISSÍTVE: Firebase-ből olvassuk be a subtopicokat
  const currentTopicData = topics[currentTopic];
  console.log(`🔍 [SUBTOPIC-GET] Subtopicok lekérése - item: "${item}", currentTopic: "${currentTopic}"`);
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

// --- Rejtett admin funkció (5x gyors kattintás az "Eredmények" címre) ---
async function secretAdminCleanup() {
  try {
    console.log(`🔥 [SECRET] ADMIN CLEANUP MEGKEZDÉSE - MINDEN ADAT TÖRLÉSE`);
    
    // 1. Minden session törlése
    const sessionsSnapshot = await db.collection("session").get();
    console.log(`🗑️ [SECRET] ${sessionsSnapshot.size} db session törlése...`);
    
    const sessionBatch = db.batch();
    sessionsSnapshot.forEach(doc => {
      sessionBatch.delete(doc.ref);
    });
    await sessionBatch.commit();
    
    // 2. Minden swipe törlése
    const swipesSnapshot = await db.collection("swipes").get();
    console.log(`🗑️ [SECRET] ${swipesSnapshot.size} db swipe törlése...`);
    
    const swipesBatch = db.batch();
    swipesSnapshot.forEach(doc => {
      swipesBatch.delete(doc.ref);
    });
    await swipesBatch.commit();
    
    // 3. Lokális adatok törlése
    localStorage.removeItem("swipy_user_id");
    
    console.log(`✅ [SECRET] TELJES CLEANUP BEFEJEZVE - ${sessionsSnapshot.size} session, ${swipesSnapshot.size} swipe törölve`);
    
    // Visszajelzés a usernek
    alert(`🔥 ADMIN CLEANUP KÉSZ!\n\nTörölve:\n- ${sessionsSnapshot.size} session\n- ${swipesSnapshot.size} swipe\n- localStorage adatok\n\nOldal újratöltése...`);
    
    // Oldal újratöltése
    window.location.reload();
    
  } catch (error) {
    console.error(`❌ [SECRET] Hiba az admin cleanup-ban`, error);
    alert(`❌ Hiba történt: ${error.message}`);
  }
}

// --- EGYSZERI DB INICIALIZÁLÓ FUNKCIÓ (CSAK FEJLESZTÉSHEZ!) ---
async function initializeTopicsWithSubtopics() {
  try {
    console.log(`🔧 [INIT-DB] ADATBÁZIS INICIALIZÁLÁS MEGKEZDÉSE`);
    
    // Teljes témák adatstruktúra subtopicokkal - EREDETI TÉMÁK EMOJIKKAL
    const topicsWithSubtopics = {
      "🍽️ Mit együnk?": {
        items: [
          "🍕 Pizza",
          "🍣 Sushi", 
          "🍔 Hamburger",
          "🍜 Pho leves",
          "🍝 Tészta",
          "🥙 Gyros",
          "🍲 Ramen"
        ],
        subtopics: {
          "🍕 Pizza": ["Margherita", "Hawaii", "Pepperoni", "Quattro Stagioni"],
          "🍣 Sushi": ["Maki", "Nigiri", "Sashimi", "Temaki"],
          "🍔 Hamburger": ["KFC", "Burger King", "McDonald's", "Subway"],
          "🍜 Pho leves": ["Marhahúsos", "Csirkehúsos", "Vegán", "Garnélás"],
          "🍝 Tészta": ["Carbonara", "Pesto", "Bolognese", "Amatriciana"],
          "🥙 Gyros": ["Csirke", "Marha", "Vegán", "Kevert"],
          "🍲 Ramen": ["Tonkotsu", "Shoyu", "Miso", "Shio"]
        }
      },
      "🎬 Mit nézzünk?": {
        items: [
          "🎬 Akció",
          "😂 Vígjáték", 
          "💕 Romantikus",
          "👻 Horror",
          "🚀 Sci-fi",
          "🎭 Dráma"
        ],
        subtopics: {
          "🎬 Akció": ["Marvel", "DC", "Halálos iramban", "Mission Impossible"],
          "😂 Vígjáték": ["Komédia", "Romantikus vígjáték", "Szatíra", "Paródia"],
          "💕 Romantikus": ["Szerelmes", "Drámai", "Időutazásos", "Karácsonyi"],
          "👻 Horror": ["Pszichológiai", "Slasher", "Supernatural", "Zombie"],
          "🚀 Sci-fi": ["Űrutazás", "Időutazás", "Robotok", "Dystopia"],
          "🎭 Dráma": ["Történelmi", "Bírósági", "Családi", "Háborús"]
        }
      },
      "✈️ Hová menjünk?": {
        items: [
          "🏖️ Tengerpart",
          "🏔️ Hegyek",
          "🏙️ Nagyváros",
          "🌳 Természet",
          "🏛️ Történelmi helyek",
          "🎡 Szórakozópark"
        ],
        subtopics: {
          "🏖️ Tengerpart": ["Mediterrán", "Trópusi", "Északi-tenger", "Fekete-tenger"],
          "🏔️ Hegyek": ["Alpok", "Tátra", "Himalája", "Sziklás-hegység"],
          "🏙️ Nagyváros": ["Európai főváros", "Amerikai nagyváros", "Ázsiai metropolisz", "Ausztrál város"],
          "🌳 Természet": ["Nemzeti park", "Esőerdő", "Szavanna", "Sivatag"],
          "🏛️ Történelmi helyek": ["Antik romok", "Várak", "Múzeumok", "Vallási helyek"],
          "🎡 Szórakozópark": ["Disneyland", "Universal", "Európai park", "Vízipark"]
        }
      },
      "🎵 Mit hallgassunk?": {
        items: [
          "🎸 Rock",
          "🎤 Pop",
          "🎧 Elektronikus",
          "🎺 Jazz",
          "🎻 Klasszikus",
          "🥁 Hip-hop"
        ],
        subtopics: {
          "🎸 Rock": ["Alternatív", "Metal", "Punk", "Indie"],
          "🎤 Pop": ["Mainstream", "K-pop", "Retro", "Indie pop"],
          "🎧 Elektronikus": ["House", "Techno", "Dubstep", "Ambient"],
          "🎺 Jazz": ["Smooth", "Bebop", "Fusion", "Swing"],
          "🎻 Klasszikus": ["Barokk", "Romantikus", "Modern", "Opera"],
          "🥁 Hip-hop": ["Old school", "Trap", "Conscious", "Drill"]
        }
      },
      "🎮 Mit játsszunk?": {
        items: [
          "🎯 Akció",
          "🧩 Puzzle",
          "🏎️ Verseny",
          "⚔️ RPG",
          "🏗️ Építés",
          "⚽ Sport"
        ],
        subtopics: {
          "🎯 Akció": ["FPS", "Hack & Slash", "Battle Royale", "Platformer"],
          "🧩 Puzzle": ["Logic", "Match-3", "Escape room", "Brain training"],
          "🏎️ Verseny": ["Formula", "Rally", "Arcade", "Szimulátor"],
          "⚔️ RPG": ["Fantasy", "Sci-fi", "JRPG", "Action RPG"],
          "🏗️ Építés": ["City builder", "Sandbox", "Survival", "Management"],
          "⚽ Sport": ["Futball", "Kosárlabda", "Tenisz", "Extrém sport"]
        }
      }
    };
    
    // Minden témát feltöltünk a Firestore-ba
    const batch = db.batch();
    
    for (const [topicName, topicData] of Object.entries(topicsWithSubtopics)) {
      const topicRef = db.collection("topics").doc(topicName);
      batch.set(topicRef, {
        items: topicData.items,
        subtopics: topicData.subtopics,
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        version: "2.0_with_subtopics"
      });
      console.log(`📚 [INIT-DB] "${topicName}" téma előkészítve - ${topicData.items.length} fő elem, ${Object.keys(topicData.subtopics).length} subtopic csoport`);
    }
    
    // Batch végrehajtás
    await batch.commit();
    
    console.log(`✅ [INIT-DB] ${Object.keys(topicsWithSubtopics).length} téma sikeresen feltöltve subtopicokkal!`);
    
    // Visszajelzés
    alert(`🎉 DB INICIALIZÁLÁS KÉSZ!\n\nLétrehozva:\n- ${Object.keys(topicsWithSubtopics).length} téma\n- Subtopicok minden témához\n\nOldal újratöltése...`);
    
    // Adatbázis dump
    setTimeout(() => logDatabaseContents(), 1000);
    
    // Oldal újratöltése
    setTimeout(() => window.location.reload(), 2000);
    
  } catch (error) {
    console.error(`❌ [INIT-DB] Hiba az adatbázis inicializálásban`, error);
    alert(`❌ Hiba történt: ${error.message}`);
  }
}

function handleSecretClick() {
  secretClickCount++;
  console.log(`🤫 [SECRET] Rejtett kattintás ${secretClickCount}/5`);
  
  // Timer törlése és újraindítása
  if (secretClickTimer) {
    clearTimeout(secretClickTimer);
  }
  
  // Ha 5 kattintás 3 másodpercen belül
  if (secretClickCount >= 5) {
    console.log(`🔥 [SECRET] 5 kattintás elérve - admin cleanup aktiválása!`);
    secretClickCount = 0;
    secretAdminCleanup();
    return;
  }
  
  // 3 másodperc után reset
  secretClickTimer = setTimeout(() => {
    console.log(`⏰ [SECRET] Timeout - counter reset`);
    secretClickCount = 0;
  }, 3000);
}

// --- Egyszerű session kezelés (heartbeat nélkül) ---
async function joinSession() {
  try {
    // User hozzáadása a session-hoz
    await db.collection("session").doc(sessionId).update({
      [`active_users.${userId}`]: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log(`🚀 [SESSION] User csatlakozott - userId: ${userId}, sessionId: ${sessionId}`);
  } catch (error) {
    console.error(`❌ [SESSION] Hiba a csatlakozásnál - userId: ${userId}`, error);
  }
}

async function leaveSession() {
  try {
    console.log(`🚪 [SESSION] User kilépési kísérlet - userId: ${userId}, sessionId: ${sessionId}`);
    
    // User eltávolítása a session-ból
    await db.collection("session").doc(sessionId).update({
      [`active_users.${userId}`]: firebase.firestore.FieldValue.delete()
    });
    console.log(`✅ [SESSION] User sikeresen kilépett - userId: ${userId}`);
    
    // Ellenőrizzük, hogy maradt-e még valaki
    await checkIfSessionEmpty();
  } catch (error) {
    console.log(`⚠️ [SESSION] Session már nem létezik vagy hiba történt - ${error.message}`);
  }
}

async function checkIfSessionEmpty() {
  try {
    const sessionDoc = await db.collection("session").doc(sessionId).get();
    if (!sessionDoc.exists) {
      console.log(`📭 [SESSION] Session már nem létezik - sessionId: ${sessionId}`);
      return;
    }
    
    const data = sessionDoc.data();
    const activeUsers = data.active_users || {};
    const userCount = Object.keys(activeUsers).length;
    
    console.log(`👥 [SESSION] Aktív userek száma: ${userCount}, users: [${Object.keys(activeUsers).join(', ')}]`);
    
    // Ha nincs aktív user, töröljük a sessiont
    if (userCount === 0) {
      console.log(`🗑️ [SESSION] Session üres, törlés megkezdése - sessionId: ${sessionId}`);
      await deleteSession();
    }
  } catch (error) {
    console.error(`❌ [SESSION] Hiba az üres session ellenőrzésben`, error);
  }
}

async function deleteSession() {
  try {
    console.log(`🗑️ [SESSION] Session törlése megkezdve - sessionId: ${sessionId}`);
    
    // Session törlése
    await db.collection("session").doc(sessionId).delete();
    console.log(`✅ [SESSION] Session dokumentum törölve - sessionId: ${sessionId}`);
    
    // Kapcsolódó swipe-ok törlése
    const swipesSnapshot = await db.collection("swipes")
      .where("session", "==", sessionId)
      .get();
      
    console.log(`🧹 [SESSION] ${swipesSnapshot.size} db swipe dokumentum törlése...`);
    
    const batch = db.batch();
    swipesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    console.log(`✅ [SESSION] Session és ${swipesSnapshot.size} db swipe törölve - sessionId: ${sessionId}`);
  } catch (error) {
    console.error(`❌ [SESSION] Hiba a session törlésekor`, error);
  }
}

function addInstantClick(element, callback) {
  if (!element) return;
  let touchMoved = false;
  element.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  element.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  element.addEventListener('touchend', (e) => { if (!touchMoved) { e.preventDefault(); callback(e); } });
  element.addEventListener('click', (e) => { if ('ontouchend' in document.documentElement) return; callback(e); });
}

// --- Képernyő ---
function showScreen(screenId) {
  ["screen-topic", "screen-swipe", "screen-match"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active-screen', id === screenId);
  });
}

// --- Új item modal ---
function showNewItemModal(item) {
  const modalEl = document.getElementById('pendingVoteModal');
  if (!modalEl) return;
  modalEl.querySelector('#pendingItemText').textContent = item;
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  
  console.log(`🆕 [MODAL] Új elem modal megjelenítve: "${item}"`);
}

// --- Témák betöltése ---
async function loadTopics() {
  try {
    console.log(`📚 [TOPICS] Témák betöltése kezdődik...`);
    
    const snapshot = await db.collection("topics").get();
    topics = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const items = data.items || [];
      const subtopics = data.subtopics || {};
      
      // FRISSÍTVE: subtopicokat is tároljuk
      topics[doc.id] = {
        items: items,
        subtopics: subtopics
      };
      
      console.log(`📖 [TOPICS] "${doc.id}" betöltve - ${items.length} elem, ${Object.keys(subtopics).length} subtopic csoport`);
    });
    
    const topicSelect = document.getElementById("topic");
    topicSelect.innerHTML = "";
    
    Object.keys(topics).forEach(topic => {
      const opt = document.createElement("option");
      opt.value = topic;
      opt.innerText = topic;
      topicSelect.appendChild(opt);
    });
    
    console.log(`✅ [TOPICS] ${Object.keys(topics).length} téma sikeresen betöltve: [${Object.keys(topics).join(', ')}]`);
  } catch (error) {
    console.error(`❌ [TOPICS] Hiba a témák betöltésekor`, error);
  }
}

// --- Session státusz ellenőrzés ---
async function checkSessionStatus() {
  try {
    console.log(`🔍 [INIT] Session státusz ellenőrzése - sessionId: ${sessionId}, userId: ${userId}`);
    
    const doc = await db.collection("session").doc(sessionId).get();
    if (doc.exists && doc.data().topic) {
      // Van aktív session -> csatlakozunk
      currentTopic = doc.data().topic;
      const activeUsers = Object.keys(doc.data().active_users || {});
      
      console.log(`📋 [INIT] Aktív session találva - topic: ${currentTopic}, activeUsers: [${activeUsers.join(', ')}]`);
      
      await joinSession(); // Jelezzük, hogy csatlakoztunk
      
      // Betöltjük a korábbi szavazatainkat a szerverről
      await loadUserVotes();
      
      startTopic(currentTopic);
      
      // Eldöntjük, hogy swipe vagy match képernyőre kerüljünk
      if (hasUserFinishedVoting()) {
        console.log(`✅ [INIT] User már befejezte a szavazást, match képernyő`);
        showScreen("screen-match");
      } else {
        console.log(`🎯 [INIT] User folytatja a szavazást`);
        showScreen("screen-swipe");
      }
    } else {
      // Nincs aktív session -> első vagyunk, topic választás
      console.log(`🎯 [INIT] Nincs aktív session, topic választás mutatása`);
      showScreen("screen-topic");
    }
  } catch (error) {
    console.error(`❌ [INIT] Hiba a session státusz ellenőrzésben`, error);
    showScreen("screen-topic");
  }
}

// --- Téma választás ---
async function onTopicNext() {
  try {
    const topicSelect = document.getElementById("topic");
    currentTopic = topicSelect.value;
    if (!currentTopic) { 
      console.log(`⚠️ [TOPIC] Nincs téma kiválasztva`);
      alert("Válassz témát!"); 
      return; 
    }

    console.log(`🎯 [TOPIC] Új session létrehozása - topic: ${currentTopic}, userId: ${userId}`);

    // Session létrehozása
    await db.collection("session").doc(sessionId).set({
      topic: currentTopic,
      last_updated: firebase.firestore.FieldValue.serverTimestamp(),
      active_users: {
        [userId]: firebase.firestore.FieldValue.serverTimestamp()
      }
    });

    console.log(`✅ [TOPIC] Session sikeresen létrehozva - sessionId: ${sessionId}, topic: ${currentTopic}`);
    
    // Adatbázis dump session létrehozás után
    setTimeout(() => logDatabaseContents(), 500);

    // Új session esetén törljük a korábbi szavazatokat
    votes = {};
    accepted = [];
    decidedItems.clear();
    userAddedItems.clear(); // Saját hozzáadott elemek is törlődnek

    startTopic(currentTopic);
    showScreen("screen-swipe");
  } catch (error) {
    console.error(`❌ [TOPIC] Hiba a session létrehozásban`, error);
    alert("Hiba történt a session létrehozásakor!");
  }
}

// --- Téma listener ---
function startTopicListener(topic) {
  if (unsubscribeTopicListener) unsubscribeTopicListener();

  const topicDocRef = db.collection("topics").doc(topic);
  unsubscribeTopicListener = topicDocRef.onSnapshot(doc => {
    if (!doc.exists) return;
    const docData = doc.data();
    const newItems = docData.items || [];
    const newSubtopics = docData.subtopics || {};
    // FRISSÍTVE: topics objektum új struktúrája miatt .items kell
    const oldItems = topics[topic]?.items || [];
    const oldSubtopics = topics[topic]?.subtopics || {};
    
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
        if (votes[item]) {
          delete votes[item];
          console.log(`🧹 [TOPIC] Törölt elem szavazata eltávolítva: "${item}"`);
        }
        accepted = accepted.filter(i => i !== item);
        decidedItems.delete(item);
      });
      
      // Ha match screen-en vagyunk, frissítsük a listát
      if (document.getElementById('screen-match').classList.contains('active-screen')) {
        console.log(`🔄 [TOPIC] Match lista frissítése törlés után`);
        // A match listener automatikusan frissíti a listát
      }
    }
    
    // FRISSÍTVE: teljes topic objektum frissítése
    const prevTopics = JSON.stringify(topics[topic]);
    topics[topic] = {
      items: newItems,
      subtopics: newSubtopics
    };
    const newTopics = JSON.stringify(topics[topic]);
    
    if (prevTopics !== newTopics) {
      console.log(`✅ [TOPIC-LISTENER] Topics objektum frissítve: "${topic}"`);
    }

    newItems.forEach(item => {
      // Csak akkor mutassunk modal-t, ha a MATCH screen-en vagyunk és új elem érkezett
      // ÉS a user nem ő maga adta hozzá
      if (!decidedItems.has(item) && !votes.hasOwnProperty(item) && !userAddedItems.has(item)) {
        decidedItems.add(item);
        
        // Modal csak match screen-en
        if (document.getElementById('screen-match').classList.contains('active-screen')) {
          showNewItemModal(item);
          console.log(`🆕 [TOPIC] Új elem érkezett match screen-en: "${item}"`);
        } else {
          console.log(`🆕 [TOPIC] Új elem érkezett swipe közben: "${item}" - modal elhalasztva`);
        }
      } else if (userAddedItems.has(item)) {
        console.log(`🚫 [TOPIC] Saját hozzáadott elem: "${item}" - modal kihagyva`);
        decidedItems.add(item); // Biztosítsuk, hogy decided legyen
      }
    });

    // Ha új elemek érkeztek és épp a swipe screen-en vagyunk, frissítsük a currentItems listát
    if (document.getElementById('screen-swipe').classList.contains('active-screen')) {
      const oldLength = currentItems.length;
      currentItems = [...newItems];
      
      if (newItems.length > oldLength) {
        console.log(`📈 [TOPIC] ${newItems.length - oldLength} új elem hozzáadva a listához`);
      }
    }
  });
}

// --- Szavazatok realtime listener ---
function startMatchListener() {
  console.log(`🎧 [MATCH] Match listener indítása - topic: ${currentTopic}, userId: ${userId}`);
  console.log(`📊 [MATCH] Saját votes objektum:`, votes);

  if (unsubscribeMatchListener) unsubscribeMatchListener();

  unsubscribeMatchListener = db.collection("swipes")
    .where("session", "==", sessionId)
    .where("topic", "==", currentTopic)
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
      const originalItems = topics[currentTopic]?.items || [];
      console.log("📢 originalItems:", originalItems);

      // Subtopicokat minden fő itemhez megadunk
      const allItemsWithSubtopics = originalItems.map(item => {
        return {
          name: item,
          subtopics: getSubtopicsForItem(item)
        };
      });

      const totalUsers = Object.keys(userSwipes).length;
      console.log(`📈 [MATCH] Szavazatok frissítése - ${totalUsers} user, ${allItemsWithSubtopics.length} item`);

      const voteCounts = {};
      const subtopicVoteCounts = {};
      const ownVotes = votes;

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
        // if (shouldBeExpanded) {
        //   li.classList.add('expanded');
        // }

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
            const subVote = subtopicVotes[name] ? subtopicVotes[name][sub] : (votes[sub] || null);
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
              toggleSubtopicVote(name, sub);
            });
            
            subBadgesWrapper.appendChild(subVoteBadge);
            
            subLi.appendChild(subText);
            subLi.appendChild(subBadgesWrapper);
            
            // Megakadályozzuk az esemény buborékolását a subtopic elemen
            subLi.addEventListener('click', (event) => {
              event.stopPropagation();
            });
            
            // Long press törlés hozzáadása subtopicokhoz is
            addLongPressDeleteListener(subLi, sub);
            
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
              await addSubtopicToFirestore(name, newSubtopic.trim());
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
            setTimeout(() => recalculateAllMargins(), 50);
            
            const expandIcon = itemTextSpan.querySelector('i');
            if (expandIcon) {
              expandIcon.className = isVisible ? 'fas fa-chevron-down me-2 text-muted' : 'fas fa-chevron-up me-2 text-muted';
            }
          };
        }

        li.appendChild(subUl);
        ownVotesList.appendChild(li);

        // Szavazat váltás a főtopicra
        addVoteToggleListener(voteBadge, name, ownVote === "yes");
        addLongPressDeleteListener(li, name);
      });
      
      // ÚJ FŐ TOPIC HOZZÁADÓ GOMB a lista végére - SUBTOPIC STÍLUSSAL
      const addTopicLi = document.createElement("li");
      addTopicLi.className = "list-group-item add-item text-center py-2";
      addTopicLi.style.cursor = "pointer";
      addTopicLi.innerHTML = `<i class="fas fa-plus me-1"></i> Új fő topic`;
      addTopicLi.onclick = async () => {
        const newTopic = prompt("Új fő topic hozzáadása:");
        if (newTopic && newTopic.trim()) {
          await addMainTopicToFirestore(newTopic.trim());
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
        const subtopics = getSubtopicsForItem(mainTopic);
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


// --- Swipe ---

function handleSwipe(yes) {
  const item = currentItems[currentIndex];
  decidedItems.add(item);

  console.log(`👍👎 [SWIPE] Szavazat - "${item}": ${yes ? 'IGEN' : 'NEM'} (${currentIndex + 1}/${currentItems.length})`);

  // Szavazat mentése a votes objektumba
  votes[item] = yes ? "yes" : "no";

  const card = document.getElementById("card");
  card.classList.add(yes ? "swipe-right" : "swipe-left");

  setTimeout(() => {
    if (yes && !accepted.includes(item)) {
      accepted.push(item);
      console.log(`✅ [SWIPE] "${item}" hozzáadva az elfogadott listához`);
      
      // ÚJ: Ha IGEN szavazat, és van subtopic, akkor beszúrjuk őket a listába
      const subtopics = getSubtopicsForItem(item);
      console.log(`🔍 [SWIPE-DEBUG] "${item}" ellenőrzése - currentTopic: "${currentTopic}"`);
      console.log(`🔍 [SWIPE-DEBUG] Elérhető topics objektum:`, topics);
      console.log(`🔍 [SWIPE-DEBUG] Aktuális topic adatok:`, topics[currentTopic]);
      
      if (subtopics.length > 0) {
        console.log(`🔀 [SUBTOPIC] "${item}" igen szavazat - ${subtopics.length} subtopic beszúrása`);
        
        // Keverjük meg a subtopicokat
        const shuffledSubtopics = [...subtopics];
        shuffle(shuffledSubtopics);
        
        // Beszúrjuk a subtopicokat a currentIndex+1 pozíciótól
        currentItems.splice(currentIndex + 1, 0, ...shuffledSubtopics);
        
        console.log(`📋 [SUBTOPIC] Subtopicok beszúrva: [${shuffledSubtopics.join(', ')}]`);
        console.log(`📊 [SUBTOPIC] Új lista hossz: ${currentItems.length}`);
        console.log(`📄 [SUBTOPIC] Teljes currentItems lista:`, currentItems);
      } else {
        console.log(`⚠️ [SUBTOPIC] "${item}" - nincs subtopic, beszúrás kihagyva`);
      }
    } else if (!yes) {
      // ÚJ: Ha NEM szavazat, minden subtopicot automatikusan "no"-ra állítunk
      const subtopics = getSubtopicsForItem(item);
      if (subtopics.length > 0) {
        console.log(`❌ [SUBTOPIC] "${item}" nem szavazat - ${subtopics.length} subtopic automatikus elutasítása`);
        
        subtopics.forEach(subtopic => {
          votes[subtopic] = "no";
        });
        
        console.log(`📋 [SUBTOPIC] Subtopicok elutasítva: [${subtopics.join(', ')}]`);
      }
    }
    
    currentIndex++;
    if (currentIndex >= currentItems.length) {
      console.log(`📤 [SWIPE] Szavazás befejezve, eredmények küldése - elfogadott: [${accepted.join(', ')}]`);
      sendSwipes().then(() => {
        showScreen("screen-match");
        checkMatch();
      });
    } else {
      showNextItem();
    }
  }, 400);
}


function startTopic(topic) {
  console.log(`🏁 [SWIPE] Téma indítása - topic: ${topic}, userId: ${userId}`);
  
  currentTopic = topic;
  // MÓDOSÍTVA: először csak a főtémákat töltjük be
  const mainTopics = topics[topic]?.items || [];
  currentItems = [...mainTopics];
  shuffle(currentItems);
  
  // KIEGÉSZÍTVE: ha már voltak szavazatok, rekonstruáljuk a teljes listát
  const alreadyAcceptedMainTopics = mainTopics.filter(item => votes[item] === "yes");
  console.log(`🔄 [SWIPE] Elfogadott főtémák újratöltésnél: [${alreadyAcceptedMainTopics.join(', ')}]`);
  
  // Beszúrjuk az elfogadott főtémák subtopicjait
  alreadyAcceptedMainTopics.forEach(mainTopic => {
    const subtopics = getSubtopicsForItem(mainTopic);
    if (subtopics.length > 0) {
      console.log(`🔀 [SWIPE] "${mainTopic}" subtopicjainak beszúrása: [${subtopics.join(', ')}]`);
      
      // Megkeressük a főtéma pozícióját a listában
      const mainTopicIndex = currentItems.indexOf(mainTopic);
      if (mainTopicIndex !== -1) {
        // Beszúrjuk a subtopicokat a főtéma után
        currentItems.splice(mainTopicIndex + 1, 0, ...subtopics);
      }
    }
  });
  
  // Keressük meg, hogy hol tartunk a szavazásban
  currentIndex = 0;
  for (let i = 0; i < currentItems.length; i++) {
    if (!votes.hasOwnProperty(currentItems[i])) {
      currentIndex = i;
      break;
    }
  }
  
  // Ha minden elemre szavaztunk, akkor a végére állítjuk
  if (currentIndex === 0 && currentItems.length > 0 && votes.hasOwnProperty(currentItems[0])) {
    currentIndex = currentItems.length;
  }
  
  // decidedItems újraépítése - MINDEN létező elemet hozzáadunk
  decidedItems.clear();
  // Csak a főtémákat adjuk hozzá decided-hez - a subtopicok dinamikusan kerülnek be
  mainTopics.forEach(item => {
    decidedItems.add(item);
  });
  
  console.log(`🔀 [SWIPE] ${currentItems.length} elem (főtémák + subtopicok) - jelenlegi pozíció: ${currentIndex}/${currentItems.length}`);
  console.log(`📊 [SWIPE] Korábbi szavazatok: ${Object.keys(votes).length}, elfogadva: [${accepted.join(', ')}]`);
  console.log(`🎯 [SWIPE] Decided főtémák: [${[...decidedItems].join(', ')}]`);
  console.log(`📋 [SWIPE] Aktuális lista: [${currentItems.join(', ')}]`);
  
  document.querySelector('#screen-swipe h2').textContent = currentTopic;
  showNextItem();

  startTopicListener(topic);
  startMatchListener();
}

function showNextItem() {
  const card = document.getElementById("card");
  if (currentIndex >= currentItems.length) {
    console.log(`🏁 [SWIPE] Minden elem eldöntve (${currentItems.length}/${currentItems.length}), átváltás match képernyőre`);
    showScreen("screen-match");
    return;
  }
  
  const item = currentItems[currentIndex];
  console.log(`👀 [SWIPE] Következő elem megjelenítése - ${currentIndex + 1}/${currentItems.length}: "${item}"`);
  
  document.getElementById("itemText").innerText = item;
  card.style.backgroundColor = getRandomPastelColor();
  card.className = 'card text-center shadow-lg';
  card.style.transform = 'translateX(0) rotate(0deg)';
  card.style.opacity = 1;
  setupSwipeGesture(card);
}

// --- Szavazat küldés ---
async function sendSwipes() {
  try {
    const voteCount = Object.keys(votes).length;
    const yesCount = Object.values(votes).filter(v => v === "yes").length;
    
    console.log(`📤 [VOTES] Szavazatok küldése - összesen: ${voteCount}, igen: ${yesCount}, nem: ${voteCount - yesCount}`);
    console.log(`📤 [SUBTOPIC-VOTES] Subtopic szavazatok:`, subtopicVotes);
    
    await db.collection("swipes").doc(`${sessionId}_${userId}`).set({
      user: userId,
      session: sessionId,
      topic: currentTopic,
      swipes: votes,
      subtopicSwipes: subtopicVotes, // Új mező a subtopic szavazatoknak
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [VOTES] Szavazatok sikeresen elküldve - userId: ${userId}, sessionId: ${sessionId}`);
  } catch (error) {
    console.error(`❌ [VOTES] Hiba a szavazatok küldésekor`, error);
  }
}

// --- Swipe gesztus ---
function setupSwipeGesture(card) {
  let startX = 0, currentX = 0, isDragging = false;
  const onDragStart = (clientX) => { isDragging = true; startX = clientX; card.style.transition = 'none'; };
  const onDragMove = (clientX) => { if (!isDragging) return; currentX = clientX - startX; card.style.transform = `translateX(${currentX}px) rotate(${currentX / 20}deg)`; };
  const onDragEnd = () => {
    if (!isDragging) return; isDragging = false;
    const threshold = card.offsetWidth * 0.4;
    if (currentX > threshold) handleSwipe(true);
    else if (currentX < -threshold) handleSwipe(false);
    else { card.style.transition = 'transform 0.3s ease'; card.style.transform = 'translateX(0) rotate(0deg)'; }
    currentX = 0;
  };
  card.onmousedown = (e) => onDragStart(e.clientX);
  card.onmousemove = (e) => isDragging && onDragMove(e.clientX);
  card.onmouseup = () => isDragging && onDragEnd();
  card.ontouchstart = (e) => onDragStart(e.touches[0].clientX);
  card.ontouchmove = (e) => onDragMove(e.touches[0].clientX);
  card.ontouchend = () => onDragEnd();
}

// --- Hosszú nyomás törlés ---
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

// --- Egyszerű törlés funkció ---
async function deleteItemFromFirestore(item) {
  try {
    console.log(`🗑️ [DELETE] Elem törlése megkezdve: "${item}"`);

    // Ellenőrizzük, hogy főtéma vagy subtopic-e
    let isMainTopic = false;
    let isSubtopic = false;
    let parentMainTopic = null;
    
    // FRISSÍTVE: topics objektum új struktúrája miatt .items kell
    const mainTopics = topics[currentTopic]?.items || [];
    
    if (mainTopics.includes(item)) {
      isMainTopic = true;
      console.log(`📋 [DELETE] "${item}" főtéma törlése`);
    } else {
      // Keressük meg, hogy melyik főtéma subtopicja
      for (const mainTopic of mainTopics) {
        const subtopics = getSubtopicsForItem(mainTopic);
        if (subtopics.includes(item)) {
          isSubtopic = true;
          parentMainTopic = mainTopic;
          console.log(`📋 [DELETE] "${item}" subtopic törlése (szülő: "${parentMainTopic}")`);
          break;
        }
      }
    }

    // Lokális törlés
    if (votes[item]) {
      delete votes[item];
      console.log(`🧹 [DELETE] Lokális vote törölve: "${item}"`);
    }
    
    // Subtopic votes tisztítása
    if (isMainTopic && subtopicVotes[item]) {
      delete subtopicVotes[item];
      console.log(`🧹 [DELETE] Subtopic votes törölve: "${item}"`);
    } else if (isSubtopic && subtopicVotes[parentMainTopic] && subtopicVotes[parentMainTopic][item]) {
      delete subtopicVotes[parentMainTopic][item];
      console.log(`🧹 [DELETE] Subtopic vote törölve: "${parentMainTopic}" -> "${item}"`);
    }
    
    accepted = accepted.filter(i => i !== item);
    decidedItems.delete(item);
    userAddedItems.delete(item);
    
    console.log(`📝 [DELETE] Lokális adatok frissítve - elfogadottak: [${accepted.join(', ')}]`);

    // Firestore törlés
    if (isMainTopic) {
      // Főtéma törlése a topics-ból
      await db.collection("topics").doc(currentTopic).update({
        items: firebase.firestore.FieldValue.arrayRemove(item),
        [`subtopics.${item}`]: firebase.firestore.FieldValue.delete()
      });
      console.log(`🔥 [DELETE] Főtéma és subtopicjai törölve a Firestore-ból: "${item}"`);
    } else if (isSubtopic && parentMainTopic) {
      // Subtopic törlése
      await db.collection("topics").doc(currentTopic).update({
        [`subtopics.${parentMainTopic}`]: firebase.firestore.FieldValue.arrayRemove(item)
      });
      console.log(`🔥 [DELETE] Subtopic törölve a Firestore-ból: "${parentMainTopic}" -> "${item}"`);
    }
    
    // Adatbázis dump törlés után
    setTimeout(() => logDatabaseContents(), 500);

    // Swipes frissítése
    await sendSwipes();

    // Lokális topics objektum frissítése
    if (topics[currentTopic]) {
      if (isMainTopic) {
        topics[currentTopic].items = topics[currentTopic].items.filter(i => i !== item);
        if (topics[currentTopic].subtopics && topics[currentTopic].subtopics[item]) {
          delete topics[currentTopic].subtopics[item];
        }
      } else if (isSubtopic && parentMainTopic) {
        if (topics[currentTopic].subtopics && topics[currentTopic].subtopics[parentMainTopic]) {
          topics[currentTopic].subtopics[parentMainTopic] = topics[currentTopic].subtopics[parentMainTopic].filter(s => s !== item);
        }
      }
      console.log(`🔄 [DELETE] Lokális topics objektum frissítve`);
    }

    console.log(`✅ [DELETE] "${item}" sikeresen törölve mindenhonnan - realtime sync aktiválva`);
  } catch (error) {
    console.error(`❌ [DELETE] Hiba az elem törlésekor: "${item}"`, error);
  }
}

// --- Igen/Nem váltás ---
function addVoteToggleListener(el, item, currentlyVotedYes) {
  el.addEventListener('click', () => {
    // Jelenlegi szavazat állapota
    const wasYes = currentlyVotedYes;
    const newVote = wasYes ? "no" : "yes";
    
    console.log(`🔄 [VOTE] Szavazat váltása - "${item}": ${wasYes ? 'IGEN' : 'NEM'} → ${newVote === 'yes' ? 'IGEN' : 'NEM'}`);
    
    // Frissítjük a votes objektumot
    votes[item] = newVote;
    
    // Frissítjük az accepted listát
    if (newVote === "yes" && !accepted.includes(item)) {
      accepted.push(item);
      console.log(`✅ [VOTE] "${item}" hozzáadva az elfogadottakhoz`);
    } else if (newVote === "no") {
      accepted = accepted.filter(i => i !== item);
      console.log(`❌ [VOTE] "${item}" eltávolítva az elfogadottakból`);
      
      // ÚJ: Ha egy főtémát "nem"-re váltunk, az összes subtopicját is "nem"-re állítjuk
      const subtopics = getSubtopicsForItem(item);
      if (subtopics.length > 0) {
        console.log(`❌ [SUBTOPIC] "${item}" elutasítva - ${subtopics.length} subtopic automatikus elutasítása`);
        
        subtopics.forEach(subtopic => {
          votes[subtopic] = "no";
          // Subtopic votes objektumból is töröljük/frissítjük
          if (subtopicVotes[item]) {
            subtopicVotes[item][subtopic] = "no";
          }
        });
        
        console.log(`📋 [SUBTOPIC] Subtopicok elutasítva: [${subtopics.join(', ')}]`);
      }
    }
    
    // Küldés a szervernek
    sendSwipes();
  });
}

// --- Match ellenőrzés (üres függvény, a listener automatikusan frissít) ---
function checkMatch() {
  console.log(`🔍 [MATCH] Match ellenőrzés hívva - a realtime listener automatikusan frissíti az eredményeket`);
}

// --- User szavazatok betöltése a szerverről ---
async function loadUserVotes() {
  try {
    console.log(`📥 [VOTES] Korábbi szavazatok betöltése - userId: ${userId}`);
    
    const swipeDoc = await db.collection("swipes").doc(`${sessionId}_${userId}`).get();
    
    if (swipeDoc.exists) {
      const data = swipeDoc.data();
      votes = data.swipes || {};
      subtopicVotes = data.subtopicSwipes || {}; // Subtopic szavazatok betöltése
      
      // Accepted lista újraépítése a votes alapján
      accepted = [];
      Object.entries(votes).forEach(([item, vote]) => {
        if (vote === "yes") {
          accepted.push(item);
        }
      });
      
      console.log(`✅ [VOTES] Szavazatok betöltve - ${Object.keys(votes).length} elem, elfogadva: [${accepted.join(', ')}]`);
      console.log(`✅ [SUBTOPIC-VOTES] Subtopic szavazatok betöltve:`, subtopicVotes);
    } else {
      console.log(`📭 [VOTES] Nincsenek korábbi szavazatok`);
      votes = {};
      subtopicVotes = {};
      accepted = [];
    }
  } catch (error) {
    console.error(`❌ [VOTES] Hiba a szavazatok betöltésekor`, error);
    votes = {};
    subtopicVotes = {};
    accepted = [];
  }
}

// --- Ellenőrzi, hogy a user befejezte-e a szavazást ---
function hasUserFinishedVoting() {
  // FRISSÍTVE: csak a főtémákra ellenőrzünk - a subtopicok dinamikusan kerülnek be
  const allItems = topics[currentTopic]?.items || [];
  const votedItems = Object.keys(votes);
  
  console.log(`🔍 [CHECK] Szavazás állapot - főtémák: ${allItems.length}, megszavazott: ${votedItems.length}`);
  
  // Minden főtémára szavaztunk-e? (subtopicok automatikusan kerülnek be)
  const mainTopicsFinished = allItems.length > 0 && allItems.every(item => votes.hasOwnProperty(item));
  
  // Továbbá: minden elfogadott főtéma subtopicjaira is szavaztunk-e?
  let subtopicsFinished = true;
  for (const mainTopic of allItems) {
    if (votes[mainTopic] === "yes") {
      const subtopics = getSubtopicsForItem(mainTopic);
      const allSubtopicsVoted = subtopics.every(subtopic => votes.hasOwnProperty(subtopic));
      if (!allSubtopicsVoted) {
        subtopicsFinished = false;
        console.log(`🎯 [CHECK] "${mainTopic}" subtopicjai még nem szavazva: [${subtopics.filter(sub => !votes.hasOwnProperty(sub)).join(', ')}]`);
        break;
      }
    }
  }
  
  const isFinished = mainTopicsFinished && subtopicsFinished;
  
  if (isFinished) {
    console.log(`✅ [CHECK] User befejezte a szavazást (főtémák + subtopicok)`);
  } else {
    const missingMainTopics = allItems.filter(item => !votes.hasOwnProperty(item));
    console.log(`🎯 [CHECK] User még nem fejezte be`);
    if (missingMainTopics.length > 0) {
      console.log(`   📋 Hiányzó főtémák: [${missingMainTopics.join(', ')}]`);
    }
  }
  
  return isFinished;
}

// --- QR ---
addInstantClick(document.getElementById("shareQrBtn"), () => {
  const link = window.location.href;
  document.getElementById("qrLinkText").textContent = link;
  const qrContainer = document.getElementById("qrCodeContainer");
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, { text: link, width: 180, height: 180 });
  new bootstrap.Modal(document.getElementById("qrModal")).show();
});

// --- Oldal betöltés ---
window.onload = () => {
  console.log(`🚀 [INIT] Alkalmazás indítása...`);
  
  userId = localStorage.getItem("swipy_user_id") || generateUserId();
  localStorage.setItem("swipy_user_id", userId);
  sessionId = "global";
  
  console.log(`👤 [INIT] User ID: ${userId}, Session ID: ${sessionId}`);
  
  // --- Rejtett admin funkció aktiválása ---
  const resultsTitle = document.querySelector("#screen-match h2");
  if (resultsTitle) {
    resultsTitle.addEventListener("click", handleSecretClick);
    console.log(`🤫 [SECRET] Admin listener telepítve az Eredmények címre`);
  } else {
    console.log(`❌ [SECRET] Eredmények cím nem található!`);
  }
  
  // Automatikus join ha van sessionId a URL-ben
  const urlSessionId = getSessionIdFromURL();
  console.log(`🔗 [INIT] URL session ID ellenőrzés:`, urlSessionId ? urlSessionId : "nincs");
  
  if (urlSessionId) {
    sessionId = urlSessionId;
    joinSession(urlSessionId);
  }
  
  loadTopics();
  checkSessionStatus();
  addInstantClick(document.getElementById("topicNextBtn"), onTopicNext);
  addInstantClick(document.getElementById("yesBtn"), () => handleSwipe(true));
  addInstantClick(document.getElementById("noBtn"), () => handleSwipe(false));
  
  // Pending vote modal gombok
  addInstantClick(document.getElementById("pendingVoteYes"), () => {
    const item = document.getElementById('pendingItemText').textContent;
    console.log(`✅ [MODAL] Új elem elfogadva: "${item}"`);
    votes[item] = "yes";
    if (!accepted.includes(item)) accepted.push(item);
    sendSwipes();
    bootstrap.Modal.getInstance(document.getElementById('pendingVoteModal')).hide();
  });
  
  addInstantClick(document.getElementById("pendingVoteNo"), () => {
    const item = document.getElementById('pendingItemText').textContent;
    console.log(`❌ [MODAL] Új elem elutasítva: "${item}"`);
    votes[item] = "no";
    accepted = accepted.filter(i => i !== item);
    sendSwipes();
    bootstrap.Modal.getInstance(document.getElementById('pendingVoteModal')).hide();
  });
  
  console.log(`✅ [INIT] Alkalmazás sikeresen inicializálva`);
};

// --- Oldal elhagyás figyelés ---
window.addEventListener('beforeunload', () => {
  console.log(`🚪 [EVENT] beforeunload event - user kilépés`);
  leaveSession();
});

// További kilépés események figyelése
window.addEventListener('pagehide', () => {
  console.log(`🚪 [EVENT] pagehide event - user kilépés`);
  leaveSession();
});

// Visibility API - ha a tab inaktív lesz HOSSZÚ IDEIG
let visibilityTimer = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Tab elrejtve - várunk 2 percet, hátha visszajön
    console.log(`👁️ [EVENT] Tab elrejtve, 2 perces timer indítása`);
    visibilityTimer = setTimeout(() => {
      console.log(`⏰ [EVENT] Tab 2 perce inaktív, kilépés végrehajtása`);
      leaveSession();
    }, 2 * 60 * 1000); // 2 perc
  } else if (document.visibilityState === 'visible') {
    // Tab ismét aktív - töröljük a timert és újra csatlakozunk
    console.log(`👁️ [EVENT] Tab ismét látható`);
    if (visibilityTimer) {
      clearTimeout(visibilityTimer);
      visibilityTimer = null;
      console.log(`⏰ [EVENT] Timer törölve`);
    }
    // Ha van aktív topic, újra csatlakozunk
    if (currentTopic && sessionId) {
      console.log(`🔄 [EVENT] Újracsatlakozás sessionhez`);
      joinSession();
    }
  }
});




