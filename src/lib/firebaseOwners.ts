// src/lib/firebaseOwners.ts
import { initializeApp, FirebaseOptions } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

/**
 * Második Firebase projekt (TELEPVEZETŐK + ELŐFIZETÉSEK)
 * Env változók:
 *  - VITE_OWNER_FIREBASE_API_KEY
 *  - VITE_OWNER_FIREBASE_AUTH_DOMAIN
 *  - VITE_OWNER_FIREBASE_PROJECT_ID
 *  - VITE_OWNER_FIREBASE_STORAGE_BUCKET
 *  - VITE_OWNER_FIREBASE_APP_ID
 *  - VITE_OWNER_FIREBASE_MESSAGING_SENDER_ID (opcionális)
 */

function env(name: string): string | undefined {
  const v = (import.meta as any).env?.[name];
  return typeof v === "string" ? v : undefined;
}

const apiKey = env("VITE_OWNER_FIREBASE_API_KEY");
const authDomain = env("VITE_OWNER_FIREBASE_AUTH_DOMAIN");
const projectId = env("VITE_OWNER_FIREBASE_PROJECT_ID");
let storageBucket = env("VITE_OWNER_FIREBASE_STORAGE_BUCKET");
const appId = env("VITE_OWNER_FIREBASE_APP_ID");
const messagingSenderId = env("VITE_OWNER_FIREBASE_MESSAGING_SENDER_ID");

// Bucket normalizálása, ha .firebasestorage.app végű
if (storageBucket && storageBucket.endsWith(".firebasestorage.app")) {
  storageBucket = `${projectId}.appspot.com`;
}

export const ownerFirebaseConfig: FirebaseOptions = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  appId,
  ...(messagingSenderId ? { messagingSenderId } : {}),
};

// Külön névvel inicializáljuk, hogy ne ütközzön az alap app-pal
const ownerApp = initializeApp(ownerFirebaseConfig, "owner-app");

export const ownerAuth = getAuth(ownerApp);
setPersistence(ownerAuth, browserLocalPersistence).catch(() => {});

export const ownerDb = getFirestore(ownerApp);
enableIndexedDbPersistence(ownerDb).catch(() => {});
