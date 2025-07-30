// Fő alkalmazás inicializáció és koordináció

// Globális változók inicializálása
function initGlobalVariables() {
  window.topics = {};
  window.currentTopic = null;
  window.currentItems = [];
  window.currentIndex = 0;
  window.votes = {}; // Főtémák szavazatai
  window.subtopicVotes = {}; // Altémák szavazatai: {mainTopic: {subtopic: "yes/no"}}
  window.decidedItems = new Set();
  window.userId = null;
  window.sessionId = "global";
  window.accepted = [];
  window.unsubscribeTopicListener = null;
  window.unsubscribeMatchListener = null;
  window.lastActivityTimestamp = Date.now();
  
  // Hozzáadott elemek követése userid szerint - hogy ne kapjon modal a hozzáadó
  window.userAddedItems = new Set();
}

// Alkalmazás inicializálása
function initApp() {
  console.log(`🚀 [INIT] Alkalmazás indítása...`);
  
  // Globális változók inicializálása
  initGlobalVariables();
  
  // User ID beállítása
  window.userId = localStorage.getItem("swipy_user_id") || window.utils.generateUserId();
  localStorage.setItem("swipy_user_id", window.userId);
  window.sessionId = "global";
  
  console.log(`👤 [INIT] User ID: ${window.userId}, Session ID: ${window.sessionId}`);
  
  // Rejtett admin funkció aktiválása
  const resultsTitle = document.querySelector("#screen-match h2");
  if (resultsTitle) {
    resultsTitle.addEventListener("click", window.handleSecretClick);
    console.log(`🤫 [SECRET] Admin listener telepítve az Eredmények címre`);
  } else {
    console.log(`❌ [SECRET] Eredmények cím nem található!`);
  }
  
  // Automatikus join ha van sessionId a URL-ben
  const urlSessionId = window.utils.getSessionIdFromURL();
  console.log(`🔗 [INIT] URL session ID ellenőrzés:`, urlSessionId ? urlSessionId : "nincs");
  
  if (urlSessionId) {
    window.sessionId = urlSessionId;
    window.sessionManager.joinSession(urlSessionId);
  }
  
  // Modulok inicializálása
  window.topicsModule.loadTopics();
  window.sessionManager.checkSessionStatus();
  
  // Event listenerek beállítása
  setupEventListeners();
  
  // QR és egyéb funkciók
  window.miscModule.initQRFunctionality();
  window.miscModule.initPageLeaveListeners();
  
  console.log(`✅ [INIT] Alkalmazás sikeresen inicializálva`);
}

// Event listenerek beállítása
function setupEventListeners() {
  // Főbb gombok
  window.utils.addInstantClick(document.getElementById("topicNextBtn"), window.topicsModule.onTopicNext);
  window.utils.addInstantClick(document.getElementById("yesBtn"), () => window.swipeModule.handleSwipe(true));
  window.utils.addInstantClick(document.getElementById("noBtn"), () => window.swipeModule.handleSwipe(false));
  
  // Pending vote modal gombok
  window.utils.addInstantClick(document.getElementById("pendingVoteYes"), () => {
    const item = document.getElementById('pendingItemText').textContent;
    console.log(`✅ [MODAL] Új elem elfogadva: "${item}"`);
    window.votes[item] = "yes";
    if (!window.accepted.includes(item)) window.accepted.push(item);
    window.votesModule.sendSwipes();
    bootstrap.Modal.getInstance(document.getElementById('pendingVoteModal')).hide();
  });
  
  window.utils.addInstantClick(document.getElementById("pendingVoteNo"), () => {
    const item = document.getElementById('pendingItemText').textContent;
    console.log(`❌ [MODAL] Új elem elutasítva: "${item}"`);
    window.votes[item] = "no";
    window.accepted = window.accepted.filter(i => i !== item);
    window.votesModule.sendSwipes();
    bootstrap.Modal.getInstance(document.getElementById('pendingVoteModal')).hide();
  });
}

// Oldal betöltés után inicializálás
window.addEventListener('DOMContentLoaded', initApp);

console.log(`📦 [APP] Főmodul betöltve, várakozás DOM-ra...`);
