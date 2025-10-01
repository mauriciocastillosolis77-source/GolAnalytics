// firebaseConfig.ts
import { initializeApp } from "firebase/app";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBb8tRGp17qabQW01xI6WAx-q2TuNhhhBY",
  authDomain: "golanalytics.firebaseapp.com",
  projectId: "golanalytics",
  storageBucket: "golanalytics.firebasestorage.app",
  messagingSenderId: "5198057915",
  appId: "1:5198057915:web:876577c8b274eafa46349e"
};

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig);