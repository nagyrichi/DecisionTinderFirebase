// Swipe kezelés modul

// Swipe kezelése
function handleSwipe(yes) {
  const item = window.currentItems[window.currentIndex];
  window.decidedItems.add(item);

  console.log(`👍👎 [SWIPE] Szavazat - "${item}": ${yes ? 'IGEN' : 'NEM'} (${window.currentIndex + 1}/${window.currentItems.length})`);

  // Szavazat mentése a votes objektumba
  window.votes[item] = yes ? "yes" : "no";

  const card = document.getElementById("card");
  card.classList.add(yes ? "swipe-right" : "swipe-left");

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
  }, 400);
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
  
  // Véletlenszerű gradient osztály hozzáadása
  const gradientNumber = Math.floor(Math.random() * 8) + 1; // 1-8 között
  card.className = `card text-center shadow-lg gradient-${gradientNumber}`;
  console.log(`🎨 [SWIPE] Kártya gradient: gradient-${gradientNumber}`);
  
  card.style.transform = 'translateX(0) rotate(0deg)';
  card.style.opacity = 1;
  card.style.backgroundColor = ''; // Töröljük a korábbi inline stílust
  setupSwipeGesture(card);
}

// Swipe gesztus beállítása
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
