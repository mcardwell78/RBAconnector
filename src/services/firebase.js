import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
// import { getAnalytics } from "firebase/analytics"; // Optional, only for browser

const firebaseConfig = {
  apiKey: "AIzaSyCj0ZHK9D6IHEPM3YQjLoCRmgJO_P2ztQs",
  authDomain: "dc-power-connector.firebaseapp.com",
  projectId: "dc-power-connector",
  storageBucket: "dc-power-connector.appspot.com",
  messagingSenderId: "561694963434",
  appId: "1:561694963434:web:5ccb8a5f846eff1d480993",
  measurementId: "G-R79Z1N8SN8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
// const analytics = getAnalytics(app); // Optional, only for browser

// Expose for browser debugging
if (typeof window !== 'undefined') {
  window.firebaseApp = app;
  window.auth = auth;
  window.db = db;
  window.functions = functions;
  window.firebaseConfig = firebaseConfig;
}

auth.onAuthStateChanged(user => {
  console.log('onAuthStateChanged:', user);
  // Store user in localStorage for Firestore queries (for legacy code)
  if (user) {
    localStorage.setItem('user', JSON.stringify({ uid: user.uid, email: user.email }));
  } else {
    localStorage.removeItem('user');
  }
});

export { app, db, auth, functions };
