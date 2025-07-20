// --- Globális változók ---
let topics = {}, currentTopic = null, currentItems = [], currentIndex = 0, accepted = [], decidedItems = new Set();
let userId = null, sessionId = "global", pendingVoteModal = null, currentPendingItem = null;
let wasJustDragging = false;
let lastServerItemsJSON = "";
let currentlyOpenListItem = null;

const db = window.db; // firestore db a html scriptből (importálva)

// --- Segédfüggvények ---
function generateUserId() { return 'user_' + Math.random().toString(36).substr(2, 9); }
function shuffle(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
function getRandomPastelColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 30;
  const lightness = 40;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// --- Képernyőkezelés ---
function showScreen(screenId) {
  const screens = ["screen-topic", "screen-swipe", "screen-match"];
  screens.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      if (id === screenId) element.classList.add('active-screen');
      else element.classList.remove('active-screen');
    }
  });
}

function addInstantClick(element, callback) {
  if (!element) return;
  let touchMoved = false;
  element.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  element.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  element.addEventListener('touchend', (e) => {
    if (!touchMoved) { e.preventDefault(); callback(e); }
  });
  element.addEventListener('click', (e) => {
    if ('ontouchend' in document.documentElement) { return; }
    callback(e);
  });
}

// --- API helyett Firestore műveletek ---

// Betölti a topicokat a Firestore "topics" gyűjteményből (vagy helyben ha még nincs adat)
async function loadTopics() {
  try {
    // Firestore-ból betöltjük az összes dokumentumot a "topics" kollekcióból
    const topicsSnap = await db.collection('topics').get();
    topics = {};
    topicsSnap.forEach(doc => {
      topics[doc.id] = doc.data().items || [];
    });
  } catch (err) {
    console.error("Hiba a topicok betöltésekor:", err);
    // fallback: ha nem elérhető, tesztadat
    topics = {
      "Étel": ["Pizza", "Hamburger", "Sushi", "Leves", "Saláta"],
      "Utazás": ["Róma", "Párizs", "Barcelona", "Budapest"]
    };
  }

  const topicSelect = document.getElementById("topic");
  topicSelect.innerHTML = "";
  Object.keys(topics).forEach(topic => {
    const opt = document.createElement("option");
    opt.value = topic;
    opt.innerText = topic;
    topicSelect.appendChild(opt);
  });
}

// Témaválasztás beállítása Firestore-ba
async function setTopic(topic) {
  try {
    // Mentés "sessions" gyűjtemény session dokumentumába
    await db.collection('sessions').doc(sessionId).set({ topic: topic });
  } catch (err) {
    console.error("Hiba a téma mentésekor:", err);
    throw err;
  }
}

// A swipolt tételek mentése Firestore-ba
async function sendSwipes() {
  if (!sessionId || !userId || !currentTopic) return;

  try {
    await db.collection('swipes').doc(`${sessionId}_${userId}_${currentTopic}`).set({
      session: sessionId,
      user_id: userId,
      topic: currentTopic,
      swipes: accepted,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Hiba a swipes mentésekor:", err);
  }
}

// Új item hozzáadása Firestore-hoz
async function addItemToFirestore(item) {
  try {
    // Például a "pendingItems" kollekcióba kerül
    await db.collection('pendingItems').add({
      session: sessionId,
      item: item,
      added_by: userId,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Hiba az item hozzáadásakor:", err);
  }
}

// Item törlése (pl. "deletedItems" kollekcióba vagy flaggel)
async function deleteItemFirestore(item) {
  try {
    // Esetleg létrehozol egy "deletedItems" kollekciót és oda írsz, vagy szerver oldali kezelést
    await db.collection('deletedItems').add({
      session: sessionId,
      item: item,
      deleted_by: userId,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Hiba a tétel törlésekor:", err);
  }
}

// --- Játéklogika ---
function startTopic(topic) {
  currentTopic = topic;
  currentItems = [...(topics[topic] || [])];
  currentIndex = 0;
  accepted = [];
  decidedItems.clear();
  shuffle(currentItems);
  const swipeTitle = document.querySelector('#screen-swipe h2');
  if (swipeTitle) swipeTitle.textContent = currentTopic;
  showNextItem();
}

function showNextItem() {
  const card = document.getElementById("card");
  if (currentIndex >= currentItems.length) {
    sendSwipes().then(() => {
      showScreen("screen-match");
      // Itt nem indítunk pollingot, mert onSnapshot fog figyelni
    });
    return;
  }

  const itemTextEl = document.getElementById("itemText");
  itemTextEl.innerText = currentItems[currentIndex];

  card.style.backgroundColor = getRandomPastelColor();
  card.className = 'card text-center shadow-lg';
  card.style.transform = 'translateX(0) rotate(0deg)';
  card.style.opacity = 1;

  setupSwipeGesture(card);
}

function handleSwipe(yes) {
  const item = currentItems[currentIndex];
  decidedItems.add(item);
  const card = document.getElementById("card");
  card.classList.add(yes ? "swipe-right" : "swipe-left");
  setTimeout(() => {
    if (yes) {
      if (!accepted.includes(item)) accepted.push(item);
    }
    currentIndex++;
    showNextItem();
  }, 400);
}

async function handleDeleteItem(itemToDelete) {
  await deleteItemFirestore(itemToDelete);
  decidedItems.delete(itemToDelete);
  const index = accepted.indexOf(itemToDelete);
  if (index > -1) {
    accepted.splice(index, 1);
  }
}

async function handleAddItem() {
  const input = document.getElementById('newItemInput');
  const item = input.value.trim();
  if (!item) return;

  await addItemToFirestore(item);

  await handleVoteOnPending('yes', item);

  input.value = '';
  input.dispatchEvent(new Event('input'));
}

async function handleVoteOnPending(vote, itemToVote = currentPendingItem) {
  decidedItems.add(itemToVote);
  if (vote === 'yes') {
    if (!accepted.includes(itemToVote)) {
      accepted.push(itemToVote);
    }
  }
  await sendSwipes();
  if (pendingVoteModal._isShown) { pendingVoteModal.hide(); }
  // UI frissítés a Firestore realtime callback-ből jön majd
}

// --- UI kezelés onSnapshot segítségével ---
function listenToMatches() {
  // Figyeljük a "matchResults/global" dokumentumot vagy collectiont - ezt alakítsd ki a backendben Firestore-ban!
  const matchDocRef = db.collection('matchResults').doc(sessionId);

  matchDocRef.onSnapshot(doc => {
    if (!doc.exists) return;

    const data = doc.data();

    const serverItems = data.items || [];
    const voteCounts = data.voteCounts || {};

    const newServerItemsJSON = JSON.stringify({ items: serverItems, votes: voteCounts });
    if (newServerItemsJSON === lastServerItemsJSON) return;
    lastServerItemsJSON = newServerItemsJSON;

    const ownVotesList = document.getElementById("ownVotes");
    ownVotesList.innerHTML = "";

    const ownYesVotes = new Set(accepted);

    serverItems.forEach(item => {
      const li = document.createElement("li");
      li.className = "list-group-item p-0";
      li.style.position = 'relative';

      const contentWrapper = document.createElement('div');
      contentWrapper.className = "list-item-content d-flex justify-content-between align-items-center p-3";
      const itemTextSpan = document.createElement('span');
      itemTextSpan.textContent = item;

      const badgesWrapper = document.createElement('div');
      badgesWrapper.className = 'd-flex align-items-center';

      const count = voteCounts[item] || 0;
      const countBadge = document.createElement('span');
      countBadge.className = 'badge text-bg-secondary me-2';
      countBadge.innerHTML = `<i class="fas fa-users me-1"></i>${count}`;
      badgesWrapper.appendChild(countBadge);

      const hasVotedYes = ownYesVotes.has(item);
      const hasDecided = decidedItems.has(item);
      const voteBadge = document.createElement("span");
      voteBadge.className = `badge rounded-pill ${hasVotedYes ? 'bg-success' : (hasDecided ? 'bg-danger' : 'bg-secondary')}`;
      voteBadge.innerHTML = hasVotedYes ? 'Igen' : (hasDecided ? 'Nem' : '?');
      badgesWrapper.appendChild(voteBadge);

      contentWrapper.appendChild(itemTextSpan);
      contentWrapper.appendChild(badgesWrapper);
      li.appendChild(contentWrapper);

      ownVotesList.appendChild(li);

      addVoteToggleListener(contentWrapper, item, hasVotedYes, hasDecided);
      makeItemDeletable(li, contentWrapper, item);
    });

    // Frissítjük a match státuszt is
    const matchResultEl = document.getElementById("matchResult");
    const participantCount = `(${data.current_users || 0} résztvevő)`;

    if (data.status === "waiting") {
      matchResultEl.className = 'alert alert-info text-center flex-shrink-0';
      matchResultEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Várakozás a többiekre... ${participantCount}`;
    } else if (data.status === "no_match") {
      matchResultEl.className = 'alert alert-warning text-center flex-shrink-0';
      matchResultEl.innerHTML = `<i class="fas fa-times-circle"></i> Nincs közös választás ${participantCount}`;
    } else if (data.status === "ok") {
      matchResultEl.className = 'alert alert-success text-center flex-shrink-0';
      matchResultEl.innerHTML = `<i class="fas fa-check-circle"></i> Közös választás ${participantCount}: <strong>${data.match.join(", ")}</strong>`;
    }
  });
}

// --- Egyéb UI helper függvények ---

function addVoteToggleListener(element, item, hasVotedYes, hasDecided) {
  const callback = () => {
    if (wasJustDragging) return;
    if (currentlyOpenListItem && currentlyOpenListItem.contains(element)) return;
    if (!hasDecided) return;

    if (hasVotedYes) {
      const index = accepted.indexOf(item);
      if (index > -1) accepted.splice(index, 1);
    } else {
      accepted.push(item);
    }
    sendSwipes();
  };
  addInstantClick(element, callback);
}

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
      contentWrapper.style.transform = 'translateX(0)';
      listItem.classList.remove('open');
      currentlyOpenListItem = null;
    } else {
      if (listItem.classList.contains('open')) {
        contentWrapper.style.transform = 'translateX(-80px)';
      } else {
        contentWrapper.style.transform = 'translateX(0)';
      }
    }

    if (crossedThreshold || (listItem.classList.contains('open') && currentX > 40)) {
      wasJustDragging = true;
      setTimeout(() => { wasJustDragging = false; }, 200);
    }
  };

  contentWrapper.addEventListener('mousedown', onDragStart);
  contentWrapper.addEventListener('touchstart', onDragStart, { passive: true });

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

// --- Gesztusvezérlés ---
function setupSwipeGesture(card) {
  let startX = 0;
  let currentX = 0;
  let isDragging = false;

  function onDragStart(clientX) {
    isDragging = true;
    startX = clientX;
    card.style.transition = 'none';
  }

  function onDragMove(clientX) {
    if (!isDragging) return;
    currentX = clientX - startX;
    const rotation = currentX / 20;
    card.style.transform = `translateX(${currentX}px) rotate(${rotation}deg)`;
  }

  function onDragEnd() {
    if (!isDragging) return;
    isDragging = false;

    const threshold = card.offsetWidth * 0.4;
    if (currentX > threshold) {
      handleSwipe(true);
    } else if (currentX < -threshold) {
      handleSwipe(false);
    } else {
      card.style.transition = 'transform 0.3s ease';
      card.style.transform = 'translateX(0) rotate(0deg)';
    }
    currentX = 0;
  }

  card.onmousedown = (e) => onDragStart(e.clientX);
  card.onmousemove = (e) => isDragging && onDragMove(e.clientX);
  card.onmouseup = () => isDragging && onDragEnd();

  card.ontouchstart = (e) => onDragStart(e.touches[0].clientX);
  card.ontouchmove = (e) => onDragMove(e.touches[0].clientX);
  card.ontouchend = () => onDragEnd();
}

function setupModalSwipe() {
  const modalContent = document.getElementById('pendingCard');
  if (!modalContent) return;
  let startX = 0, currentX = 0, isDragging = false;
  const onModalDragStart = (clientX) => { isDragging = true; startX = clientX; modalContent.style.transition = 'none'; };
  const onModalDragMove = (clientX) => {
    if (!isDragging) return;
    currentX = clientX - startX;
    const rotation = currentX / 30;
    modalContent.style.transform = `translateX(${currentX}px) rotate(${rotation}deg)`;
  };
  const onModalDragEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const threshold = modalContent.offsetWidth * 0.25;
    if (currentX > threshold) {
      handleVoteOnPending('yes');
    } else if (currentX < -threshold) {
      handleVoteOnPending('no');
    } else {
      modalContent.style.transition = 'transform 0.3s ease';
      modalContent.style.transform = 'translateX(0) rotate(0deg)';
    }
    currentX = 0;
  };

  modalContent.onmousedown = (e) => onModalDragStart(e.clientX);
  modalContent.onmousemove = (e) => isDragging && onModalDragMove(e.clientX);
  modalContent.onmouseup = () => isDragging && onModalDragEnd();

  modalContent.ontouchstart = (e) => onModalDragStart(e.touches[0].clientX);
  modalContent.ontouchmove = (e) => onModalDragMove(e.touches[0].clientX);
  modalContent.ontouchend = () => onModalDragEnd();
}

// --- Indulás ---
document.addEventListener("DOMContentLoaded", async () => {
  userId = localStorage.getItem('user_id') || generateUserId();
  localStorage.setItem('user_id', userId);

  await loadTopics();

  const topicSelect = document.getElementById('topic');
  const topicNextBtn = document.getElementById('topicNext');
  topicNextBtn.disabled = true;

  topicSelect.addEventListener('change', () => {
    topicNextBtn.disabled = topicSelect.value === "";
  });

  topicNextBtn.addEventListener('click', async () => {
    const chosenTopic = topicSelect.value;
    if (!chosenTopic) return;

    await setTopic(chosenTopic);
    startTopic(chosenTopic);
    showScreen('screen-swipe');
  });

  // Induljon a match figyelés már a session elejétől
  listenToMatches();

  // Swipe gombok kezelése
  addInstantClick(document.getElementById("btnNo"), () => handleSwipe(false));
  addInstantClick(document.getElementById("btnYes"), () => handleSwipe(true));

  // Új tétel hozzáadás
  document.getElementById('addItemBtn').addEventListener('click', handleAddItem);

  // Input enter kezelése az új itemhez
  document.getElementById('newItemInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleAddItem();
    }
  });

  setupModalSwipe();
});
