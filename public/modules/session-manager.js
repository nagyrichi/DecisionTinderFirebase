// Session kezelés modul

// Egyszerű session kezelés (heartbeat nélkül)
async function joinSession() {
  try {
    // User hozzáadása a session-hoz
    await db.collection("session").doc(window.sessionId).update({
      [`active_users.${window.userId}`]: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log(`🚀 [SESSION] User csatlakozott - userId: ${window.userId}, sessionId: ${window.sessionId}`);
  } catch (error) {
    console.error(`❌ [SESSION] Hiba a csatlakozásnál - userId: ${window.userId}`, error);
  }
}

async function leaveSession() {
  try {
    console.log(`🚪 [SESSION] User kilépési kísérlet - userId: ${window.userId}, sessionId: ${window.sessionId}`);
    
    // User eltávolítása a session-ból
    await db.collection("session").doc(window.sessionId).update({
      [`active_users.${window.userId}`]: firebase.firestore.FieldValue.delete()
    });
    console.log(`✅ [SESSION] User sikeresen kilépett - userId: ${window.userId}`);
    
    // Ellenőrizzük, hogy maradt-e még valaki
    await checkIfSessionEmpty();
  } catch (error) {
    console.log(`⚠️ [SESSION] Session már nem létezik vagy hiba történt - ${error.message}`);
  }
}

async function checkIfSessionEmpty() {
  try {
    const sessionDoc = await db.collection("session").doc(window.sessionId).get();
    if (!sessionDoc.exists) {
      console.log(`📭 [SESSION] Session már nem létezik - sessionId: ${window.sessionId}`);
      return;
    }
    
    const data = sessionDoc.data();
    const activeUsers = data.active_users || {};
    const userCount = Object.keys(activeUsers).length;
    
    console.log(`👥 [SESSION] Aktív userek száma: ${userCount}, users: [${Object.keys(activeUsers).join(', ')}]`);
    
    // Ha nincs aktív user, töröljük a sessiont
    if (userCount === 0) {
      console.log(`🗑️ [SESSION] Session üres, törlés megkezdése - sessionId: ${window.sessionId}`);
      await deleteSession();
    }
  } catch (error) {
    console.error(`❌ [SESSION] Hiba az üres session ellenőrzésben`, error);
  }
}

async function deleteSession() {
  try {
    console.log(`🗑️ [SESSION] Session törlése megkezdve - sessionId: ${window.sessionId}`);
    
    // Session törlése
    await db.collection("session").doc(window.sessionId).delete();
    console.log(`✅ [SESSION] Session dokumentum törölve - sessionId: ${window.sessionId}`);
    
    // Kapcsolódó swipe-ok törlése
    const swipesSnapshot = await db.collection("swipes")
      .where("session", "==", window.sessionId)
      .get();
      
    console.log(`🧹 [SESSION] ${swipesSnapshot.size} db swipe dokumentum törlése...`);
    
    const batch = db.batch();
    swipesSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    
    console.log(`✅ [SESSION] Session és ${swipesSnapshot.size} db swipe törölve - sessionId: ${window.sessionId}`);
  } catch (error) {
    console.error(`❌ [SESSION] Hiba a session törlésekor`, error);
  }
}

// Session státusz ellenőrzés
async function checkSessionStatus() {
  try {
    console.log(`🔍 [INIT] Session státusz ellenőrzése - sessionId: ${window.sessionId}, userId: ${window.userId}`);
    
    const doc = await db.collection("session").doc(window.sessionId).get();
    if (doc.exists && doc.data().topic) {
      // Van aktív session -> csatlakozunk
      window.currentTopic = doc.data().topic;
      const activeUsers = Object.keys(doc.data().active_users || {});
      
      console.log(`📋 [INIT] Aktív session találva - topic: ${window.currentTopic}, activeUsers: [${activeUsers.join(', ')}]`);
      
      await joinSession(); // Jelezzük, hogy csatlakoztunk
      
      // Betöltjük a korábbi szavazatainkat a szerverről
      await window.votesModule.loadUserVotes();
      
      window.topicsModule.startTopic(window.currentTopic);
      
      // Eldöntjük, hogy swipe vagy match képernyőre kerüljünk
      if (window.votesModule.hasUserFinishedVoting()) {
        console.log(`✅ [INIT] User már befejezte a szavazást, match képernyő`);
        window.utils.showScreen("screen-match");
      } else {
        console.log(`🎯 [INIT] User folytatja a szavazást`);
        window.utils.showScreen("screen-swipe");
      }
    } else {
      // Nincs aktív session -> első vagyunk, topic választás
      console.log(`🎯 [INIT] Nincs aktív session, topic választás mutatása`);
      window.utils.showScreen("screen-topic");
    }
  } catch (error) {
    console.error(`❌ [INIT] Hiba a session státusz ellenőrzésben`, error);
    window.utils.showScreen("screen-topic");
  }
}

// Export
window.sessionManager = {
  joinSession,
  leaveSession,
  checkIfSessionEmpty,
  deleteSession,
  checkSessionStatus
};
