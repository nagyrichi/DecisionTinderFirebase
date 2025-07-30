// Debug és admin funkciókat tartalmazó modul

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

// Rejtett admin funkció (5x gyors kattintás az "Eredmények" címre)
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

// EGYSZERI DB INICIALIZÁLÓ FUNKCIÓ (CSAK FEJLESZTÉSHEZ!)
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

// Rejtett kattintás számláló
let secretClickCount = 0;
let secretClickTimer = null;

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

// Globális debug funkció
window.dbDump = logDatabaseContents;
window.initDB = initializeTopicsWithSubtopics;
window.handleSecretClick = handleSecretClick;

// 1 másodperc múlva kiírjuk az adatbázis tartalmat
setTimeout(logDatabaseContents, 1000);

console.log(`🔧 [DEBUG] Használd: window.dbDump() a teljes adatbázis dump-hoz`);
console.log(`🔧 [ADMIN] Használd: window.initDB() az adatbázis inicializáláshoz subtopicokkal`);
console.log(`⚠️ [ADMIN] FONTOS: Először törölj minden topics dokumentumot a Firestore Console-ban!`);
