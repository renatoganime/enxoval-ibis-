
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCRUM9Agnt6VpD097goJUFeaA4i9DDaWjY",
  authDomain: "enxoval-ibis-c3106.firebaseapp.com",
  databaseURL: "https://enxoval-ibis-c3106-default-rtdb.firebaseio.com",
  projectId: "enxoval-ibis-c3106",
  storageBucket: "enxoval-ibis-c3106.firebasestorage.app",
  messagingSenderId: "271278026989",
  appId: "1:271278026989:web:0715d54ec8d54d7b591ce4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export async function loadData(key, fallback) {
  try {
    const snapshot = await get(ref(db, "enxoval/" + key));
    if (snapshot.exists()) return snapshot.val();
  } catch (e) { console.error(e); }
  return fallback;
}

export async function saveData(key, val) {
  try { await set(ref(db, "enxoval/" + key), val); return true; }
  catch (e) { console.error(e); return false; }
}

export function subscribeData(key, callback) {
  return onValue(ref(db, "enxoval/" + key), (snapshot) => {
    if (snapshot.exists()) callback(snapshot.val());
  });
}
