(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyDg5ATsX4I8-W_6LvI44JAn1M716yNj4lM",
    authDomain: "banana-blitz-1fdf6.firebaseapp.com",
    databaseURL: "https://banana-blitz-1fdf6-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "banana-blitz-1fdf6",
    storageBucket: "banana-blitz-1fdf6.firebasestorage.app",
    messagingSenderId: "382122369323",
    appId: "1:382122369323:web:e50f4e673da09c7077656e"
  };

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    console.error("Firebase init error:", e);
  }

  window.firebaseApp = firebase.app();
  window.firebaseAuth = firebase.auth();
  window.firebaseDb = firebase.database();
})();