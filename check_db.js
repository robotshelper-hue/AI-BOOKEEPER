import fs from 'fs';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  const q = collection(db, 'Transactions');
  const snapshot = await getDocs(q);
  console.log(`Found ${snapshot.size} transactions`);
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
run().catch(console.error);
