// Swipe kezelés modul

// Swipe kezelése
function handleSwipe(yes, fromGesture = false) {
  const item = window.currentItems[window.currentIndex];
  window.decidedItems.add(item);

  console.log(`👍👎 [SWIPE] Szavazat - "${item}": ${yes ? 'IGEN' : 'NEM'} (${window.currentIndex + 1}/${window.currentItems.length})`);

  // Szavazat mentése a votes objektumba
  window.votes[item] = yes ? "yes" : "no";

  const card = document.getElementById("card");
  
  if (fromGesture) {
    // Gesture-ből jön: törljük a gesture event listener-eket hogy ne interferáljanak
    card.onmousedown = null;
    card.onmousemove = null;
    card.onmouseup = null;
    card.ontouchstart = null;
    card.ontouchmove = null;
    card.ontouchend = null;
    
    // Gesture animáció - folytatja a jelenlegi pozícióból
    card.classList.add(yes ? "swipe-right" : "swipe-left");
  } else {
    // Button-ből jön: különböző animáció osztály
    card.classList.add(yes ? "button-swipe-right" : "button-swipe-left");
  }

  setTimeout(() => {
    if (yes && !window.accepted.includes(item)) {
      window.accepted.push(item);
      console.log(`✅ [SWIPE] "${item}" hozzáadva az elfogadott listához`);
      
      // ÚJ: Ha IGEN szavazat, és van subtopic, akkor beszúrjuk őket a listába
      const subtopics = window.subtopicManager.getSubtopicsForItem(item);
      console.log(`🔍 [SWIPE-DEBUG] "${item}" ellenőrzése - currentTopic: "${window.currentTopic}"`);
      console.log(`🔍 [SWIPE-DEBUG] Elérhető topics objektum:`, window.topics);
      console.log(`🔍 [SWIPE-DEBUG] Aktuális topic adatok:`, window.topics[window.currentTopic]);
      
      if (subtopics.length > 0) {
        console.log(`🔀 [SUBTOPIC] "${item}" igen szavazat - ${subtopics.length} subtopic beszúrása`);
        
        // Keverjük meg a subtopicokat
        const shuffledSubtopics = [...subtopics];
        window.utils.shuffle(shuffledSubtopics);
        
        // Beszúrjuk a subtopicokat a currentIndex+1 pozíciótól
        window.currentItems.splice(window.currentIndex + 1, 0, ...shuffledSubtopics);
        
        // FONTOS: Eltávolítjuk a főtémát a listából, hogy ne jelenjen meg újra
        const remainingItems = window.currentItems.filter((currentItem, index) => 
          index <= window.currentIndex || currentItem !== item
        );
        window.currentItems = remainingItems;
        
        console.log(`🗑️ [SUBTOPIC] Főtéma "${item}" eltávolítva a listából (subtopicok beszúrva)`);
        console.log(`📋 [SUBTOPIC] Subtopicok beszúrva: [${shuffledSubtopics.join(', ')}]`);
        console.log(`📊 [SUBTOPIC] Új lista hossz: ${window.currentItems.length}`);
        console.log(`📄 [SUBTOPIC] Teljes currentItems lista:`, window.currentItems);
      } else {
        console.log(`⚠️ [SUBTOPIC] "${item}" - nincs subtopic, beszúrás kihagyva`);
      }
    } else if (!yes) {
      // ÚJ: Ha NEM szavazat, minden subtopicot automatikusan "no"-ra állítunk
      const subtopics = window.subtopicManager.getSubtopicsForItem(item);
      if (subtopics.length > 0) {
        console.log(`❌ [SUBTOPIC] "${item}" nem szavazat - ${subtopics.length} subtopic automatikus elutasítása`);
        
        subtopics.forEach(subtopic => {
          window.votes[subtopic] = "no";
        });
        
        console.log(`📋 [SUBTOPIC] Subtopicok elutasítva: [${subtopics.join(', ')}]`);
      }
    }
    
    window.currentIndex++;
    if (window.currentIndex >= window.currentItems.length) {
      console.log(`📤 [SWIPE] Szavazás befejezve, eredmények küldése - elfogadott: [${window.accepted.join(', ')}]`);
      window.votesModule.sendSwipes().then(() => {
        window.utils.showScreen("screen-match");
        checkMatch();
      });
    } else {
      showNextItem();
    }
  }, fromGesture ? 400 : 350); // Button esetén rövidebb várakozás
}

// Következő elem megjelenítése
function showNextItem() {
  const card = document.getElementById("card");
  if (window.currentIndex >= window.currentItems.length) {
    console.log(`🏁 [SWIPE] Minden elem eldöntve (${window.currentItems.length}/${window.currentItems.length}), átváltás match képernyőre`);
    window.utils.showScreen("screen-match");
    return;
  }
  
  const item = window.currentItems[window.currentIndex];
  console.log(`👀 [SWIPE] Következő elem megjelenítése - ${window.currentIndex + 1}/${window.currentItems.length}: "${item}"`);
  
  document.getElementById("itemText").innerText = item;
  
  // TELJES RESET - eltávolítjuk MINDEN osztályt és stílust
  card.className = 'card text-center shadow-lg';
  
  // Speciálisan eltávolítjuk az összes animáció osztályt
  card.classList.remove('swipe-left', 'swipe-right', 'button-swipe-left', 'button-swipe-right');
  
  // Összes animáció és inline stílus törlése
  card.style.cssText = '';
  
  // Alapértelmezett stílusok beállítása
  card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  card.style.opacity = '1';
  card.style.transition = '';
  card.style.animation = '';
  
  // Force reflow több lépésben
  card.offsetHeight;
  
  // Random gradient osztály hozzáadása
  const gradientNumber = Math.floor(Math.random() * 8) + 1;
  card.classList.add(`gradient-${gradientNumber}`);
  console.log(`🎨 [SWIPE] Kártya gradient: gradient-${gradientNumber}`);
  
  // Még egy reflow a gradient után
  card.offsetHeight;
  
  // Setup gesture a teljes reset után
  setTimeout(() => {
    setupSwipeGesture(card);
  }, 100); // Nagyobb delay a biztonság kedvéért
}

// Swipe gesztus beállítása
function setupSwipeGesture(card) {
  let startX = 0, currentX = 0, isDragging = false;
  
  // Clean up any existing event listeners
  card.onmousedown = null;
  card.onmousemove = null;
  card.onmouseup = null;
  card.ontouchstart = null;
  card.ontouchmove = null;
  card.ontouchend = null;
  
  const onDragStart = (clientX) => { 
    isDragging = true; 
    startX = clientX; 
    // iOS fix: Force stop any running animations
    card.style.animation = 'none';
    card.style.transition = 'none'; 
    // Force reflow to ensure changes are applied
    card.offsetHeight;
  };
  
  const onDragMove = (clientX) => { 
    if (!isDragging) return; 
    currentX = clientX - startX; 
    // iOS optimized transform
    card.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX / 20}deg)`;
  };
  
  const onDragEnd = () => {
    if (!isDragging) return; 
    isDragging = false;
    const threshold = card.offsetWidth * 0.4;
    
    if (currentX > threshold) {
      // IGEN swipe - azonnal átadjuk a CSS animációnak
      card.style.transition = 'none';
      card.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX / 20}deg)`;
      handleSwipe(true, true); // fromGesture = true
    } else if (currentX < -threshold) {
      // NEM swipe - azonnal átadjuk a CSS animációnak  
      card.style.transition = 'none';
      card.style.transform = `translate3d(${currentX}px, 0, 0) rotate(${currentX / 20}deg)`;
      handleSwipe(false, true); // fromGesture = true
    } else { 
      // Return to center with smooth animation
      card.style.transition = 'transform 0.3s ease'; 
      card.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
    }
    currentX = 0;
  };
  
  // Mouse events
  card.onmousedown = (e) => {
    e.preventDefault();
    onDragStart(e.clientX);
  };
  card.onmousemove = (e) => isDragging && onDragMove(e.clientX);
  card.onmouseup = () => isDragging && onDragEnd();
  
  // Touch events with iOS optimizations
  card.ontouchstart = (e) => {
    e.preventDefault(); // Prevent iOS bounce/scroll
    onDragStart(e.touches[0].clientX);
  };
  card.ontouchmove = (e) => {
    e.preventDefault(); // Prevent iOS bounce/scroll
    if (e.touches.length === 1) { // Only single touch
      onDragMove(e.touches[0].clientX);
    }
  };
  card.ontouchend = (e) => {
    e.preventDefault(); // Prevent iOS bounce/scroll
    onDragEnd();
  };
  
  // iOS specific: prevent touch callout and selection
  card.style.webkitTouchCallout = 'none';
  card.style.webkitUserSelect = 'none';
  card.style.userSelect = 'none';
}

// Match ellenőrzés (üres függvény, a listener automatikusan frissít)
function checkMatch() {
  console.log(`🔍 [MATCH] Match ellenőrzés hívva - a realtime listener automatikusan frissíti az eredményeket`);
}

// Export
window.swipeModule = {
  handleSwipe,
  showNextItem,
  setupSwipeGesture,
  checkMatch
};
