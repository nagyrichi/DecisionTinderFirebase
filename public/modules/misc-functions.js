// QR kód és egyéb funkciók

// QR kód megjelenítése
function initQRFunctionality() {
  window.utils.addInstantClick(document.getElementById("shareQrBtn"), () => {
    const link = window.location.href;
    document.getElementById("qrLinkText").textContent = link;
    const qrContainer = document.getElementById("qrCodeContainer");
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, { text: link, width: 180, height: 180 });
    new bootstrap.Modal(document.getElementById("qrModal")).show();
  });
}

// Oldal elhagyás figyelés
function initPageLeaveListeners() {
  // Oldal elhagyás figyelés
  window.addEventListener('beforeunload', () => {
    console.log(`🚪 [EVENT] beforeunload event - user kilépés`);
    window.sessionManager.leaveSession();
  });

  // További kilépés események figyelése
  window.addEventListener('pagehide', () => {
    console.log(`🚪 [EVENT] pagehide event - user kilépés`);
    window.sessionManager.leaveSession();
  });

  // Visibility API - ha a tab inaktív lesz HOSSZÚ IDEIG
  let visibilityTimer = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Tab elrejtve - várunk 2 percet, hátha visszajön
      console.log(`👁️ [EVENT] Tab elrejtve, 2 perces timer indítása`);
      visibilityTimer = setTimeout(() => {
        console.log(`⏰ [EVENT] Tab 2 perce inaktív, kilépés végrehajtása`);
        window.sessionManager.leaveSession();
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
      if (window.currentTopic && window.sessionId) {
        console.log(`🔄 [EVENT] Újracsatlakozás sessionhez`);
        window.sessionManager.joinSession();
      }
    }
  });
}

// Export
window.miscModule = {
  initQRFunctionality,
  initPageLeaveListeners
};
