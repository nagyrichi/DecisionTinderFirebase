// Segédfüggvények és utility funkciók

// User ID generátor
function generateUserId() {
  return 'user_' + Math.random().toString(36).substr(2, 9);
}

// Tömb keverő algoritmus
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Véletlenszerű pasztell szín generátor
function getRandomPastelColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 30%, 40%)`;
}

// Session ID kinyerése az URL-ből
function getSessionIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('session');
}

// Aktivitás frissítése
function updateActivity() {
  window.lastActivityTimestamp = Date.now();
}

// Képernyő váltás
function showScreen(screenId) {
  ["screen-topic", "screen-swipe", "screen-match"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active-screen', id === screenId);
  });
  
  // iOS görgetés letiltása topic és swipe képernyőkön
  document.body.classList.remove('topic-screen-active', 'swipe-screen-active');
  
  if (screenId === 'screen-topic') {
    document.body.classList.add('topic-screen-active');
  } else if (screenId === 'screen-swipe') {
    document.body.classList.add('swipe-screen-active');
  }
}

// Új item modal megjelenítése
function showNewItemModal(item) {
  const modalEl = document.getElementById('pendingVoteModal');
  if (!modalEl) return;
  modalEl.querySelector('#pendingItemText').textContent = item;
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
  
  console.log(`🆕 [MODAL] Új elem modal megjelenítve: "${item}"`);
}

// Instant click (touch optimalizálás)
function addInstantClick(element, callback) {
  if (!element) return;
  let touchMoved = false;
  element.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  element.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  element.addEventListener('touchend', (e) => { if (!touchMoved) { e.preventDefault(); callback(e); } });
  element.addEventListener('click', (e) => { if ('ontouchend' in document.documentElement) return; callback(e); });
}

// Exportáljuk a globális használatra
window.utils = {
  generateUserId,
  shuffle,
  getRandomPastelColor,
  getSessionIdFromURL,
  updateActivity,
  showScreen,
  showNewItemModal,
  addInstantClick
};
