// Firebase konfigurációs modul
const firebaseConfig = {
  apiKey: "AIzaSyDp3HumzdoZ6SWWQX6wPLmk0RzYl0qPbjs",
  authDomain: "decisiontinderfirebase.firebaseapp.com",
  projectId: "decisiontinderfirebase",
  storageBucket: "decisiontinderfirebase.appspot.com",
  messagingSenderId: "743649100420",
  appId: "1:743649100420:web:18f276d16d855241dbf8d1",
  measurementId: "G-2T7C1GQFXF"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

console.log("🔥 Firebase inicializálva");

// Exportáljuk a szükséges objektumokat
window.firebaseApp = app;
window.db = db;
