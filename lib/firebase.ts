import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBQPCFNSkyRXsUCoQpjPof3sMbSAaLMvi0",
  authDomain:  "altronics-e5305.firebaseapp.com",
  projectId:  "altronics-e5305",
  storageBucket: "altronics-e5305.firebasestorage.app",
  messagingSenderId: "410757868135",
  appId: "1:410757868135:web:008d2852ea46142be382c2",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);