import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAe1_5s7ujsaVC9_8tcaVbIgn78-dCpViU",
  authDomain: "quick-crud-3dea0.firebaseapp.com",
  projectId: "quick-crud-3dea0",
  storageBucket: "quick-crud-3dea0.firebasestorage.app",
  messagingSenderId: "154946577128",
  appId: "1:154946577128:web:934de755d5036a70bf5f5d",
  measurementId: "G-4J3S0TVL13"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase Services for your app
export const auth = getAuth(app);
export const db = getFirestore(app);

export { app, analytics };