// --- Globális változók ---
let topics = {}, currentTopic = null, currentItems = [], currentIndex = 0, accepted = [], decidedItems = new Set();
let userId = null, sessionId = "global", matchInterval = null, pendingVoteModal = null, currentPendingItem = null;
let wasJustDragging = false;
let currentlyOpenListItem = null;

let unsubscribeTopicListener = null;
let unsubscribeMatchListener = null;

// --- Segédfüggvények ---
function generateUserId() { return 'user_' + Math.random().toString(36).substr(2, 9); }
function shuffle(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
function getRandomPastelColor() { const hue = Math.floor(Math.random() * 360); return `hsl(${hue}, 30%, 40%)`; }

// --- Képernyőkezelés ---
function showScreen(screenId) {
  ["screen-topic", "screen-swipe", "screen-match"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active-screen', id === screenId);
  });
}

function addInstantClick(element, callback) {
  if (!element) return;
  let touchMoved = false;
  element.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  element.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  element.addEventListener('touchend', (e) => { if (!touchMoved) { e.preventDefault(); callback(e); } });
  element.addEventListener('click', (e) => { if ('ontouchend' in document.documentElement) return; callback(e); });
}

// --- Firebase logika ---

async function loadTopics() {
  const snapshot = await db.collection("topics").get();
  console.log("Topics snapshot:", snapshot);
  topics = {};
  snapshot.forEach(doc => {
    topics[doc.id] = doc.data().items || [];
  });
  console.log("Topics objektum:", topics);

  const topicSelect = document.getElementById("topic");
  topicSelect.innerHTML = "";
  Object.keys(topics).forEach(topic => {
    const opt = document.createElement("option");
    opt.value = topic;
    opt.innerText = topic;
    topicSelect.appendChild(opt);
  });
  console.log("Beállított select:", topicSelect);
}

async function onTopicNext() {
  const topicSelect = document.getElementById("topic");
  currentTopic = topicSelect.value;
  if (!currentTopic) { alert("Válassz témát!"); return; }

  await db.collection("session").doc(sessionId).set({
    topic: currentTopic,
    last_updated: firebase.firestore.FieldValue.serverTimestamp()
  });

  startTopic(currentTopic);
  showScreen("screen-swipe");
}

async function checkSessionStatus() {
  const doc = await db.collection("session").doc(sessionId).get();
  if (doc.exists && doc.data().topic) {
    currentTopic = doc.data().topic;
    startTopic(currentTopic);
    showScreen("screen-swipe");
  } else {
    showScreen("screen-topic");
  }
}

// Új listener a topics dokumentumra (valós idejű figyelés új elem/törlés esetén)
function startTopicListener(topic) {
  if (unsubscribeTopicListener) unsubscribeTopicListener();

  const topicDocRef = db.collection("topics").doc(topic);
  unsubscribeTopicListener = topicDocRef.onSnapshot(doc => {
    if (!doc.exists) return;

    const newItems = doc.data().items || [];
    // Frissítjük a lokális topics objektumot
    topics[topic] = newItems;

    // Ha éppen az aktuális témán vagyunk, frissítjük a swipet és új elem esetén jelezünk
    if (currentTopic === topic) {
      // Keresünk új itemeket
      const newItemsSet = new Set(newItems);
      let foundNew = false;
      newItems.forEach(item => {
        if (!decidedItems.has(item)) {
          foundNew = true;
          decidedItems.add(item);
          // Felugró ablak új elemhez
          showNewItemModal(item);
        }
      });

      // Ha már a swipen túl vagyunk, frissítsük a listát (pl. ha új elem jött)
      if (currentIndex >= currentItems.length) {
        currentItems = [...newItems];
      }
    }
  });
}

function showNewItemModal(item) {
  const modalEl = document.getElementById('newItemModal');
  if (!modalEl) return;

  modalEl.querySelector('.modal-body').textContent = `Új elem érkezett: ${item}`;
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

function startTopic(topic) {
  currentTopic = topic;
  currentItems = [...topics[topic]];
  shuffle(currentItems);
  currentIndex = 0;
  accepted = [];
  decidedItems.clear();
  document.querySelector('#screen-swipe h2').textContent = currentTopic;
  showNextItem();

  startTopicListener(topic);
  startMatchListener();
}

function showNextItem() {
  const card = document.getElementById("card");
  if (currentIndex >= currentItems.length) {
    sendSwipes().then(() => {
      showScreen("screen-match");
      // startMatchListener() már itt is fut, felesleges újra
    });
    return;
  }
  document.getElementById("itemText").innerText = currentItems[currentIndex];
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
    if (yes && !accepted.includes(item)) accepted.push(item);
    currentIndex++;
    showNextItem();
  }, 400);
}

async function sendSwipes() {
  await db.collection("swipes").doc(`${sessionId}_${userId}`).set({
    user: userId,
    session: sessionId,
    topic: currentTopic,
    swipes: accepted,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
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

async function handleAddItem() {
  const input = document.getElementById('newItemInput');
  const item = input.value.trim();
  if (!item) return;

  // Locális topics frissítése
  if (!topics[currentTopic]) topics[currentTopic] = [];
  topics[currentTopic].push(item);

  // Firestore frissítése
  await db.collection("topics").doc(currentTopic).update({
    items: topics[currentTopic]
  });

  // Opcionális: saját szavazat automatikusan igen
  if (!accepted.includes(item)) accepted.push(item);
  await sendSwipes();

  // Input ürítés és gomb frissítése
  input.value = '';
  input.dispatchEvent(new Event('input'));
}

async function handleDeleteItem(itemToDelete) {
  const topicRef = doc(db, "topics", currentTopic);
  await updateDoc(topicRef, {
    items: arrayRemove(itemToDelete)
  });
  decidedItems.delete(itemToDelete);
  const index = accepted.indexOf(itemToDelete);
  if (index > -1) accepted.splice(index, 1);
}




function startMatchListener() {
  if (unsubscribeMatchListener) unsubscribeMatchListener();

  unsubscribeMatchListener = db.collection("swipes")
    .where("session", "==", sessionId)
    .where("topic", "==", currentTopic)
    .onSnapshot(snapshot => {
      if (!document.getElementById('screen-match').classList.contains('active-screen')) return;

      const allVotes = [];
      snapshot.forEach(doc => allVotes.push(doc.data().swipes));

      const voteCounts = {};
      let matchSet = null;

      allVotes.forEach(votes => {
        votes.forEach(item => {
          voteCounts[item] = (voteCounts[item] || 0) + 1;
        });
        if (!matchSet) matchSet = new Set(votes);
        else matchSet = new Set(votes.filter(x => matchSet.has(x)));
      });

      const ownVotesList = document.getElementById("ownVotes");
      ownVotesList.innerHTML = "";
      const ownYesVotes = new Set(accepted);

      const allItems = [...new Set(allVotes.flat())];
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

        const countBadge = document.createElement('span');
        countBadge.className = 'badge text-bg-secondary me-2';
        countBadge.innerHTML = `<i class="fas fa-users me-1"></i>${voteCounts[item] || 0}`;
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

      const matchResultEl = document.getElementById("matchResult");
      if (matchSet && matchSet.size) {
        matchResultEl.className = 'alert alert-success text-center flex-shrink-0';
        matchResultEl.innerHTML = `<i class="fas fa-check-circle"></i> Közös választás: <strong>${[...matchSet].join(", ")}</strong>`;
      } else {
        matchResultEl.className = 'alert alert-warning text-center flex-shrink-0';
        matchResultEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Várakozás...`;
      }
    });
}

function stopMatchListener() {
  if (unsubscribeMatchListener) {
    unsubscribeMatchListener();
    unsubscribeMatchListener = null;
  }
}

async function checkMatch() {
  if (!document.getElementById('screen-match').classList.contains('active-screen')) return;

  const swipesSnap = await db.collection("swipes").where("session", "==", sessionId).where("topic", "==", currentTopic).get();
  const allVotes = [];
  swipesSnap.forEach(doc => allVotes.push(doc.data().swipes));

  const voteCounts = {};
  let matchSet = null;

  allVotes.forEach(votes => {
    votes.forEach(item => {
      voteCounts[item] = (voteCounts[item] || 0) + 1;
    });
    if (!matchSet) matchSet = new Set(votes);
    else matchSet = new Set(votes.filter(x => matchSet.has(x)));
  });

  const ownVotesList = document.getElementById("ownVotes");
  ownVotesList.innerHTML = "";
  const ownYesVotes = new Set(accepted);

  const allItems = [...new Set(allVotes.flat())];
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

    const countBadge = document.createElement('span');
    countBadge.className = 'badge text-bg-secondary me-2';
    countBadge.innerHTML = `<i class="fas fa-users me-1"></i>${voteCounts[item] || 0}`;
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

  const matchResultEl = document.getElementById("matchResult");
  if (matchSet && matchSet.size) {
    matchResultEl.className = 'alert alert-success text-center flex-shrink-0';
    matchResultEl.innerHTML = `<i class="fas fa-check-circle"></i> Közös választás: <strong>${[...matchSet].join(", ")}</strong>`;
  } else {
    matchResultEl.className = 'alert alert-warning text-center flex-shrink-0';
    matchResultEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Várakozás...`;
  }
}

function addVoteToggleListener(element, item, hasVotedYes, hasDecided) {
  const callback = () => {
    if (wasJustDragging) return;
    if (!hasDecided) return;
    if (hasVotedYes) accepted = accepted.filter(i => i !== item);
    else accepted.push(item);
    sendSwipes();
  };
  addInstantClick(element, callback);
}

// --- Swipe, drag, modal és QR marad ---
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

// --- Oldal betöltés ---
window.onload = () => {
  // Felhasználói azonosító betöltése vagy létrehozása
  userId = localStorage.getItem("swipy_user_id");
  if (!userId) {
    userId = generateUserId();
    localStorage.setItem("swipy_user_id", userId);
  }

  // Session ID fixen global
  sessionId = "global";

  // Témák betöltése és munkamenet ellenőrzése
  loadTopics();
  checkSessionStatus();

  // Modális ablak példány
  pendingVoteModal = new bootstrap.Modal(document.getElementById('pendingVoteModal'));

  // AddItem gomb + input kezelés
  const addItemBtn = document.getElementById('addItemBtn');
  const newItemInput = document.getElementById('newItemInput');
  if (newItemInput && addItemBtn) {
    const updateButtonState = () => {
      const hasText = newItemInput.value.trim().length > 0;
      addItemBtn.disabled = !hasText;
      addItemBtn.classList.toggle('btn-primary', hasText);
      addItemBtn.classList.toggle('btn-outline-secondary', !hasText);
    };

    // Első állapot beállítása
    updateButtonState();

    // Input változás követése
    newItemInput.addEventListener('input', updateButtonState);

    // Gomb eseménykezelő hozzáadása
    addInstantClick(addItemBtn, handleAddItem);
  }

  // Egyéb gombok eseménykezelői
  addInstantClick(document.getElementById("topicNextBtn"), onTopicNext);
  addInstantClick(document.getElementById("yesBtn"), () => handleSwipe(true));
  addInstantClick(document.getElementById("noBtn"), () => handleSwipe(false));
  
  // Ha modális gombok vannak
  addInstantClick(document.getElementById('pendingVoteYes'), () => handleVoteOnPending('yes'));
  addInstantClick(document.getElementById('pendingVoteNo'), () => handleVoteOnPending('no'));

  // QR-kód megosztás gomb
  addInstantClick(document.getElementById("shareQrBtn"), () => {
    const link = window.location.href;
    document.getElementById("qrLinkText").textContent = link;

    const qrContainer = document.getElementById("qrCodeContainer");
    qrContainer.innerHTML = "";

    new QRCode(qrContainer, {
      text: link,
      width: 180,
      height: 180
    });

    const qrModal = new bootstrap.Modal(document.getElementById("qrModal"));
    qrModal.show();
  });

  // Kezdőképernyő beállítása, ha szükséges
  showScreen("screen-topic");
};
