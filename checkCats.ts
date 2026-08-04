import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  const q = collection(db, 'categories');
  const snapshot = await getDocs(q);
  
  snapshot.forEach(d => {
    const data = d.data();
    if (data.name.toLowerCase().includes('sub')) {
      console.log(data);
    }
  });
  
  console.log('Done.');
  process.exit(0);
}

run();
