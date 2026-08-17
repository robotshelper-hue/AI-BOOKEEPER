/**
 * patch_tax_mappings.cjs
 * One-time script to reset all tax mappings in Firestore.
 * - Sets taxActMapping to "" (blank)
 * - Sets status to "Not Verified"
 * This ensures no guessed/invented TaxAct field names remain.
 */
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, doc } = require('firebase/firestore');

const firebaseConfig = require('./firebase-applet-config.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

async function patchTaxMappings() {
  console.log("Fetching all taxMappings...");
  const snapshot = await getDocs(collection(db, 'taxMappings'));

  if (snapshot.empty) {
    console.log("No tax mappings found. Nothing to patch.");
    return;
  }

  console.log(`Found ${snapshot.size} tax mapping(s). Patching...`);

  let updated = 0;
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const needsUpdate = data.taxActMapping || data.status === 'Verified' || data.status === 'Needs Review';

    if (needsUpdate) {
      await updateDoc(doc(db, 'taxMappings', docSnap.id), {
        taxActMapping: "",
        status: "Not Verified",
        lastUpdated: Date.now()
      });
      console.log(`  Patched: ${data.businessCategoryName || docSnap.id} (was: status="${data.status}", taxActMapping="${data.taxActMapping}")`);
      updated++;
    } else {
      console.log(`  Skipped (already clean): ${data.businessCategoryName || docSnap.id}`);
    }
  }

  console.log(`\nDone. ${updated} mapping(s) patched, ${snapshot.size - updated} already clean.`);
  process.exit(0);
}

patchTaxMappings().catch(err => {
  console.error("Error patching tax mappings:", err);
  process.exit(1);
});
