import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Fully configured Firebase credentials for autodm-mridalini
export const firebaseConfig = {
  apiKey: "AIzaSyDG1LPs5a_o01Fgl3BMiAUa-w8vLeO35D4",
  authDomain: "autodm-mridalini.firebaseapp.com",
  projectId: "autodm-mridalini",
  storageBucket: "autodm-mridalini.firebasestorage.app",
  messagingSenderId: "607066007132",
  appId: "1:607066007132:web:eba74328aa07ccaef96899",
  measurementId: "G-JBS9W01448"
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Google Auth Provider configured for popups
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Test connection on boot per Firebase skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore connection notice:", error.message);
    }
  }
}
testConnection();
