// --- Globális változók ---
let topics = {}, currentTopic = null, currentItems = [], currentIndex = 0, accepted = [], decidedItems = new Set();
let userId = null, sessionId = "global", matchInterval = null, pendingVoteModal = null, currentPendingItem = null;
let wasJustDragging = false;
let currentlyOpenListItem = null;

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

function startTopic(topic) {
  currentTopic = topic;
  currentItems = [...topics[topic]];
  shuffle(currentItems);
  currentIndex = 0;
  accepted = [];
  decidedItems.clear();
  document.querySelector('#screen-swipe h2').textContent = currentTopic;
  showNextItem();
}

function showNextItem() {
  const card = document.getElementById("card");
  if (currentIndex >= currentItems.length) {
    sendSwipes().then(() => {
      showScreen("screen-match");
      startMatchPolling();
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

function startMatchPolling() {
  stopMatchPolling();
  matchInterval = setInterval(checkMatch, 1000);
  checkMatch();
}

function stopMatchPolling() {
  if (matchInterval) clearInterval(matchInterval);
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
  userId = localStorage.getItem("swipy_user_id") || generateUserId();
  localStorage.setItem("swipy_user_id", userId);
  
  loadTopics();
  checkSessionStatus();
  
  pendingVoteModal = new bootstrap.Modal(document.getElementById('pendingVoteModal'));
  
  addInstantClick(document.getElementById("topicNextBtn"), onTopicNext);
  addInstantClick(document.getElementById("yesBtn"), () => handleSwipe(true));
  addInstantClick(document.getElementById("noBtn"), () => handleSwipe(false));

  // QR-kód megjelenítése a megosztás gombbal
  addInstantClick(document.getElementById("shareQrBtn"), () => {
    const link = window.location.href;
    document.getElementById("qrLinkText").textContent = link;

    const qrContainer = document.getElementById("qrCodeContainer");
    qrContainer.innerHTML = ""; // töröljük az előző QR-kódot, ha van

    new QRCode(qrContainer, {
      text: link,
      width: 180,
      height: 180
    });

    const qrModal = new bootstrap.Modal(document.getElementById("qrModal"));
    qrModal.show();
  });
};
