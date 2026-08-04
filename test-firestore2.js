import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, getDocFromServer } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function test() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Connection with ID successful!");
  } catch (e) {
    console.error("Error with explicit db ID:", e);
  }
}

test();
