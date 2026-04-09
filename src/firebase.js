import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, doc } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Handle placeholders gracefully if no proper env config
let app;
let analytics = null;
try {
  app = initializeApp(firebaseConfig);
  if (firebaseConfig.measurementId && typeof window !== "undefined") {
    analytics = getAnalytics(app);
  }
} catch (error) {
  console.warn("Firebase initialization failed, using demo fallback", error);
  app = initializeApp({ projectId: "demo-project" });
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// Helpers de colección — rutas multitenant
export const getUserCollection = (uid, colName) => collection(db, `users/${uid}/${colName}`);
export const getUserDocRef = (uid, colName, docId) => doc(db, `users/${uid}/${colName}`, docId);

// Colecciones públicas (como rates_history)
export const getGlobalCollection = (colName) => collection(db, colName);
