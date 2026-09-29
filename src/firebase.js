import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Fully configured Firebase credentials provisioned for AutoDM
export const firebaseConfig = {
  apiKey: "AIzaSyDH0ecbopGMII4pwciTJe57HtCQEuB-6is",
  authDomain: "global-operator-2bndl.firebaseapp.com",
  projectId: "global-operator-2bndl",
  storageBucket: "global-operator-2bndl.firebasestorage.app",
  messagingSenderId: "84831818696",
  appId: "1:84831818696:web:3bf87765f72b644bab26fd",
  firestoreDatabaseId: "ai-studio-autodminstagrama-1438c4db-f6b2-4675-b121-6ab7980372cb"
};

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with the provisioned named database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
