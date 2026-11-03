import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Singleton – přežije HMR i opakované importy. */
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);

/**
 * Offline cache v IndexedDB: dělník v terénu bez signálu dál zapisuje,
 * Firestore synchronizuje po obnovení spojení. Více záložek sdílí jednu cache.
 */
function createDb(): Firestore {
  if (typeof window === 'undefined') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app); // už inicializováno (HMR)
  }
}

export const db = createDb();
export const auth = getAuth(app);
export const storage = getStorage(app);
