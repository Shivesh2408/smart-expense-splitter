import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBYf8P1rMq9Kmr0qaw8VSnydI0Glq-HmEQ",
  authDomain: "smart-expense-55507.firebaseapp.com",
  projectId: "smart-expense-55507",
  storageBucket: "smart-expense-55507.firebasestorage.app",
  messagingSenderId: "727684181884",
  appId: "1:727684181884:web:56f767ab0cc55a8191fef9",
  measurementId: "G-9D3MED94MB"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
