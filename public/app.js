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

// Adatbázis tartalom kiírása
async function logDatabaseContents() {
  try {
    const [sessionsSnap, swipesSnap, topicsSnap] = await Promise.all([
      db.collection("session").get(),
      db.collection("swipes").get(),
      db.collection("topics").get()
    ]);
    
    console.log(`📊 [DB] Jelenlegi adatbázis állapot:`);
    console.log(`   📂 Sessions: ${sessionsSnap.size} db`);
    console.log(`   📂 Swipes: ${swipesSnap.size} db`);
    console.log(`   📂 Topics: ${topicsSnap.size} db`);
    
    topicsSnap.forEach(doc => {
      const items = doc.data().items || [];
      console.log(`   📖 Topic "${doc.id}": ${items.length} elem - [${items.slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''}]`);
    });
  } catch (error) {
    console.log(`⚠️ [DB] Nem sikerült betölteni az adatbázis tartalmat:`, error.message);
  }
}

// 1 másodperc múlva kiírjuk az adatbázis tartalmat
setTimeout(logDatabaseContents, 1000);

// --- Globális változók ---
let topics = {};
let currentTopic = null;
let currentItems = [];
let currentIndex = 0;
let votes = {};
let decidedItems = new Set();
let userId = null;
let sessionId = "global";
let accepted = [];
let unsubscribeTopicListener = null;
let unsubscribeMatchListener = null;
let wasJustDragging = false;
let currentlyOpenListItem = null;
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
      const items = doc.data().items || [];
      topics[doc.id] = items;
      console.log(`📖 [TOPICS] "${doc.id}" betöltve - ${items.length} elem`);
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
    const newItems = doc.data().items || [];
    const oldItems = topics[topic] || [];
    
    // Törölt elemek detektálása
    const deletedItems = oldItems.filter(item => !newItems.includes(item));
    if (deletedItems.length > 0) {
      console.log(`🗑️ [TOPIC] Törött elemek detektálva: [${deletedItems.join(', ')}]`);
      
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
    
    topics[topic] = newItems;

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

      const userSwipes = {}; // userId => { item: vote, ... }
      snapshot.forEach(doc => {
        const data = doc.data();
        userSwipes[data.user] = data.swipes || {};
      });

      const allItems = topics[currentTopic] || [];
      const totalUsers = Object.keys(userSwipes).length;

      console.log(`📈 [MATCH] Szavazatok frissítése - ${totalUsers} user, ${allItems.length} item`);

      const voteCounts = {}; // item => hány YES szavazat van
      const ownVotes = votes; // lokális user votes

      let matchSet = new Set(allItems);

      allItems.forEach(item => {
        let yesCount = 0;
        for (const user in userSwipes) {
          if (userSwipes[user][item] === "yes") yesCount++;
          if (userSwipes[user][item] !== "yes") matchSet.delete(item);
        }
        voteCounts[item] = yesCount;
      });

      console.log(`🎯 [MATCH] Közös találatok: [${[...matchSet].join(', ')}] (${matchSet.size} db)`);

      const ownVotesList = document.getElementById("ownVotes");
      ownVotesList.innerHTML = "";

      allItems.forEach(item => {
        const li = document.createElement("li");
        li.className = "list-group-item p-0";
        li.style.position = 'relative';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = "list-item-content d-flex justify-content-between align-items-center p-3";

        const itemTextSpan = document.createElement('span');
        itemTextSpan.textContent = item;

        const badgesWrapper = document.createElement('div');
        badgesWrapper.className = 'd-flex align-items-center';

        // Hány YES szavazat
        const countBadge = document.createElement('span');
        countBadge.className = 'badge text-bg-secondary me-2';
        countBadge.innerHTML = `<i class="fas fa-users me-1"></i>${voteCounts[item] || 0}/${totalUsers}`;
        badgesWrapper.appendChild(countBadge);

        // Saját szavazat badge
        const ownVote = ownVotes[item];
        const voteBadge = document.createElement("span");
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

        contentWrapper.appendChild(itemTextSpan);
        contentWrapper.appendChild(badgesWrapper);
        li.appendChild(contentWrapper);

        ownVotesList.appendChild(li);

        // Katt a szavazat váltásához
        addVoteToggleListener(contentWrapper, item, ownVote === "yes");

        // Swipe-to-delete + Firestore törlés
        makeItemDeletable(li, contentWrapper, item);
      });

      const matchResultEl = document.getElementById("matchResult");
      if (matchSet.size > 0) {
        matchResultEl.className = 'alert alert-success text-center flex-shrink-0';
        matchResultEl.innerHTML = `<i class="fas fa-check-circle"></i> Közös választás: <strong>${[...matchSet].join(", ")}</strong>`;
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
  currentItems = [...topics[topic]];
  shuffle(currentItems);
  
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
  currentItems.forEach(item => {
    decidedItems.add(item);
  });
  
  console.log(`🔀 [SWIPE] ${currentItems.length} elem keverve - jelenlegi pozíció: ${currentIndex}/${currentItems.length}`);
  console.log(`📊 [SWIPE] Korábbi szavazatok: ${Object.keys(votes).length}, elfogadva: [${accepted.join(', ')}]`);
  console.log(`🎯 [SWIPE] Decided items: [${[...decidedItems].join(', ')}]`);
  
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
    
    await db.collection("swipes").doc(`${sessionId}_${userId}`).set({
      user: userId,
      session: sessionId,
      topic: currentTopic,
      swipes: votes,
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

// --- Swipe to reveal delete ---
function makeItemDeletable(listItem, contentWrapper, itemName) {
  let startX = 0, currentX = 0, isDragging = false, crossedThreshold = false;

  const closeAnyOpen = () => {
    if (currentlyOpenListItem && currentlyOpenListItem !== listItem) {
      currentlyOpenListItem.classList.remove('open');
      currentlyOpenListItem.querySelector('.list-item-content').style.transform = 'translateX(0)';
      currentlyOpenListItem = null;
    }
  };

  const onDragStart = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    isDragging = true;
    crossedThreshold = false;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    contentWrapper.style.transition = 'none';

    closeAnyOpen();

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragMove, { passive: true });
    document.addEventListener('touchend', onDragEnd);
  };

  const onDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    currentX = clientX - startX;

    if (currentX < -40) crossedThreshold = true;

    if (currentX < 0) {
      contentWrapper.style.transform = `translateX(${currentX}px)`;
    } else if (currentX > 0 && listItem.classList.contains('open')) {
      // Swipe back -> engedjük visszacsúszni
      contentWrapper.style.transform = `translateX(${Math.min(currentX - 80, 0)}px)`;
    } else {
      contentWrapper.style.transform = 'translateX(0)';
    }
  };

  const onDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;

    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);

    contentWrapper.style.transition = 'transform 0.3s ease';

    if (crossedThreshold) {
      contentWrapper.style.transform = 'translateX(-80px)';
      listItem.classList.add('open');
      currentlyOpenListItem = listItem;
    } else if (listItem.classList.contains('open') && currentX > 40) {
      // Swipe back bezárás
      contentWrapper.style.transform = 'translateX(0)';
      listItem.classList.remove('open');
      currentlyOpenListItem = null;
    } else {
      // Alap helyreállítás
      if (listItem.classList.contains('open')) {
        contentWrapper.style.transform = 'translateX(-80px)';
      } else {
        contentWrapper.style.transform = 'translateX(0)';
      }
    }
    if (crossedThreshold || (listItem.classList.contains('open') && currentX > 40)) {
      wasJustDragging = true;
      setTimeout(() => {
        wasJustDragging = false;
      }, 200); // növeljük a tiltást 200ms-ra a biztonság kedvéért
    }
  };

  contentWrapper.addEventListener('mousedown', onDragStart);
  contentWrapper.addEventListener('touchstart', onDragStart, { passive: true });

  // Kuka ikon
  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
  deleteBtn.addEventListener('click', () => {
    listItem.classList.add('item-deleted');
    handleDeleteItem(itemName);
    setTimeout(() => {
      if (listItem.parentNode) listItem.parentNode.removeChild(listItem);
      if (currentlyOpenListItem === listItem) currentlyOpenListItem = null;
    }, 300);
  });
  listItem.appendChild(deleteBtn);
}

async function handleDeleteItem(item) {
  try {
    console.log(`�️ [DELETE] Elem törlése megkezdve: "${item}"`);

    // Lokális törlés
    if (votes[item]) {
      delete votes[item];
      console.log(`🧹 [DELETE] Lokális vote törölve: "${item}"`);
    }
    accepted = accepted.filter(i => i !== item);
    decidedItems.delete(item);
    userAddedItems.delete(item); // User added items-ból is töröljük
    
    console.log(`📝 [DELETE] Lokális adatok frissítve - elfogadottak: [${accepted.join(', ')}]`);

    // ELSŐ: Firestore topics-ból törlés - EZ TRIGGERELI A TOPIC LISTENER-T MINDENKINEK!
    await db.collection("topics").doc(currentTopic).update({
      items: firebase.firestore.FieldValue.arrayRemove(item)
    });
    console.log(`🔥 [DELETE] Firestore topics frissítve - realtime listener aktiválva`);

    // MÁSODIK: Swipes frissítése - ezzel minden user-nél frissül a vote lista
    await sendSwipes();

    // Lokális topics objektum frissítése is
    if (topics[currentTopic]) {
      topics[currentTopic] = topics[currentTopic].filter(i => i !== item);
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
    if (wasJustDragging) {
      console.log(`🚫 [VOTE] Kattintás blokkolva - épp drag történt`);
      return;
    }
    
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
      
      // Accepted lista újraépítése a votes alapján
      accepted = [];
      Object.entries(votes).forEach(([item, vote]) => {
        if (vote === "yes") {
          accepted.push(item);
        }
      });
      
      console.log(`✅ [VOTES] Szavazatok betöltve - ${Object.keys(votes).length} elem, elfogadva: [${accepted.join(', ')}]`);
    } else {
      console.log(`📭 [VOTES] Nincsenek korábbi szavazatok`);
      votes = {};
      accepted = [];
    }
  } catch (error) {
    console.error(`❌ [VOTES] Hiba a szavazatok betöltésekor`, error);
    votes = {};
    accepted = [];
  }
}

// --- Ellenőrzi, hogy a user befejezte-e a szavazást ---
function hasUserFinishedVoting() {
  const allItems = topics[currentTopic] || [];
  const votedItems = Object.keys(votes);
  
  console.log(`🔍 [CHECK] Szavazás állapot - összes elem: ${allItems.length}, megszavazott: ${votedItems.length}`);
  
  // Ha minden elemre szavaztunk, akkor kész vagyunk
  const isFinished = allItems.length > 0 && allItems.every(item => votes.hasOwnProperty(item));
  
  if (isFinished) {
    console.log(`✅ [CHECK] User befejezte a szavazást`);
  } else {
    console.log(`🎯 [CHECK] User még nem fejezte be - hiányzó elemek: [${allItems.filter(item => !votes.hasOwnProperty(item)).join(', ')}]`);
  }
  
  return isFinished;
}

// --- Új elem hozzáadása ---
async function handleAddItem() {
  try {
    const input = document.getElementById('newItemInput');
    const item = input.value.trim();
    if (!item) {
      console.log(`⚠️ [ADD] Üres elem, hozzáadás megszakítva`);
      return;
    }
    
    console.log(`➕ [ADD] Új elem hozzáadása: "${item}" a "${currentTopic}" témához`);
    
    // Rögzítjük, hogy ez a user adta hozzá - ne kapjon róla modal-t
    userAddedItems.add(item);
    console.log(`📝 [ADD] Elem rögzítve saját hozzáadásként: "${item}"`);
    
    if (!topics[currentTopic]) topics[currentTopic] = [];
    topics[currentTopic].push(item);
    
    await db.collection("topics").doc(currentTopic).update({ 
      items: topics[currentTopic] 
    });
    
    console.log(`📝 [ADD] "${item}" hozzáadva a Firestore topics-hoz`);
    
    // AUTOMATIKUS IGEN szavazat a hozzáadónak (aki hozzáadta, annak tetszik)
    votes[item] = "yes";
    if (!accepted.includes(item)) {
      accepted.push(item);
      console.log(`✅ [ADD] "${item}" automatikusan elfogadva a hozzáadó által`);
    }
    
    // Hozzáadó ne kapjon modal-t - már döntött
    decidedItems.add(item);
    console.log(`🚫 [ADD] "${item}" hozzáadva a decided items-hez - nincs modal a hozzáadónak`);
    
    await sendSwipes();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    
    console.log(`✅ [ADD] Új elem sikeresen hozzáadva és szavazat elküldve`);
  } catch (error) {
    console.error(`❌ [ADD] Hiba az új elem hozzáadásakor`, error);
  }
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
  addInstantClick(document.getElementById("addItemBtn"), handleAddItem);
  
  // Új elem input mező figyelése - gomb engedélyezés/tiltás
  const newItemInput = document.getElementById('newItemInput');
  const addItemBtn = document.getElementById('addItemBtn');
  
  function updateAddButtonState() {
    const hasText = newItemInput.value.trim().length > 0;
    addItemBtn.disabled = !hasText;
    
    // Vizuális állapot frissítése
    if (hasText) {
      addItemBtn.className = 'btn btn-primary';
      addItemBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Hozzáadás';
    } else {
      addItemBtn.className = 'btn btn-secondary';
      addItemBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Hozzáadás';
    }
    
    console.log(`🎛️ [INPUT] Hozzáadás gomb állapot: ${hasText ? 'engedélyezve (kék)' : 'tiltva (szürke)'} - szöveg: "${newItemInput.value.trim()}"`);
  }
  
  // Kezdeti állapot beállítása
  updateAddButtonState();
  
  // Input esemény figyelése
  newItemInput.addEventListener('input', updateAddButtonState);
  
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




