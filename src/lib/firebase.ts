// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth, onAuthStateChanged, User, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// --- 1. REGISTRY KONFIGURÁCIÓ (Tulajdonosoknak) ---
const registryConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_OWNER_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_OWNER_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_OWNER_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_OWNER_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_OWNER_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_OWNER_FIREBASE_MESSAGING_SENDER_ID,
};

// --- 2. DATA KONFIGURÁCIÓ (Dolgozóknak / Adatoknak) ---
// FONTOS: Exportáljuk 'firebaseConfig' néven is a kompatibilitás miatt!
export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Inicializálás (Singleton minta)
function initApp(name: string, config: FirebaseOptions) {
  const existing = getApps().find(app => app.name === name);
  return existing || initializeApp(config, name);
}

// Létrehozzuk a két app példányt
// A Data appot (dolgozói) kezeljük alapértelmezettként a kompatibilitás miatt
const dataApp = !getApps().length ? initializeApp(firebaseConfig) : getApp(); 
const registryApp = initApp("REGISTRY", registryConfig);

// --- EXPORTOK ---

// 1. A dolgozói rendszer (DATA)
export const auth = getAuth(dataApp);
export const db = getFirestore(dataApp);

// Perzisztencia beállítása a dolgozói auth-ra
setPersistence(auth, browserLocalPersistence).catch(() => {});

// 2. A menedzser rendszer (REGISTRY)
export const registryAuth = getAuth(registryApp);
export const registryDb = getFirestore(registryApp);

// Perzisztencia beállítása a menedzser auth-ra is
setPersistence(registryAuth, browserLocalPersistence).catch(() => {});

// Offline támogatás a Data DB-hez
enableIndexedDbPersistence(db).catch(err => {
    if (err.code == 'failed-precondition') {
        console.warn('Több tab van nyitva, a perzisztencia csak egyben működik.');
    } else if (err.code == 'unimplemented') {
        console.warn('A böngésző nem támogatja a perzisztenciát.');
    }
});

// --- HELPER: Várakozás a betöltésre ---
export async function waitForAuth(): Promise<User | null> {
    if (auth.currentUser) return auth.currentUser;

    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); 
            resolve(user); 
        });
    });
}
