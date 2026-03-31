import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBPgtr9pxozyz_vmoEcMHhYkiIcuoOCfjk",
  authDomain: "maths-app-d5e3b.firebaseapp.com",
  projectId: "maths-app-d5e3b",
  storageBucket: "maths-app-d5e3b.firebasestorage.app",
  messagingSenderId: "1005196713617",
  appId: "1:1005196713617:web:aed31f31b01a4f8ccca930"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
