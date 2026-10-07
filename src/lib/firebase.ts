import { getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseEnabled = Object.values(config).every(Boolean)
const app = firebaseEnabled ? (getApps()[0] ?? initializeApp(config)) : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured.')
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutFirebase() {
  if (auth) await signOut(auth)
}
