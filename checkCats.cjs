const { readFileSync } = require('fs');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId || "(default)");

async function run() {
  const q = collection(db, 'categories');
  const snapshot = await getDocs(q);
  
  snapshot.forEach(d => {
    const data = d.data();
    console.log(data.ledger, data.name);
  });
  
  console.log('Done.');
  process.exit(0);
}

run();
