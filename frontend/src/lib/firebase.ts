import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const APP_NAME = 'resumatch-ai';

// Defensive initialization
const isServer = typeof window === 'undefined';

let app: FirebaseApp;
let auth: Auth;
const googleProvider = new GoogleAuthProvider();

if (!isServer) {
  const existingApp = getApps().find(a => a.name === APP_NAME);
  if (existingApp) {
    app = existingApp;
  } else {
    try {
      app = initializeApp(firebaseConfig, APP_NAME);
    } catch (e) {
      app = getApp(APP_NAME);
    }
  }
  auth = getAuth(app);
} else {
  // Mock objects for the build system to prevent initialization errors
  app = { name: APP_NAME } as FirebaseApp;
  auth = { app: app } as unknown as Auth;
}

export { app, auth, googleProvider };
