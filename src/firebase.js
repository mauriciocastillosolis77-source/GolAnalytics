import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBb0tRGpi7qabQW01xI6WAx-q2TuNHhhBY",
  authDomain: "golanalytics.firebaseapp.com",
  projectId: "golanalytics",
  storageBucket: "golanalytics.firebasestorage.app",
  messagingSenderId: "5198057915",
  appId: "1:5198057915:web:876577c8b274eafa46349e"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore
export const db = getFirestore(app);
