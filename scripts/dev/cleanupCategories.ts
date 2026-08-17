import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  const q = collection(db, 'categories');
  const snapshot = await getDocs(q);
  
  const seen = new Set();
  const toDelete = [];
  
  snapshot.forEach(d => {
    const data = d.data();
    const key = `${data.userId}-${data.ledger}-${data.name}`;
    if (seen.has(key)) {
      toDelete.push(d.id);
    } else {
      seen.add(key);
    }
  });
  
  console.log(`Found ${toDelete.length} duplicates to delete.`);
  
  for (const id of toDelete) {
    await deleteDoc(doc(db, 'categories', id));
  }
  console.log('Cleanup complete.');
  process.exit(0);
}

run();
