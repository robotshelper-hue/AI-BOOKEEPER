# Module 4 — Manual Testing Checklist

This walks through the parts of the "Module 4 Final Testing & Corrections" review that require your live, logged-in app (real Firestore + real login), which I can't drive myself. Everything that could be tested without touching your production database — the CSV column-detection, amount-sign/debit-credit conversion, and duplicate-matching logic — has already been verified locally; see `scripts/dev/verify-csv-import.ts` (run with `npx tsx scripts/dev/verify-csv-import.ts`) and the sample files in `test-data/csv-samples/`.

Fixes applied before this checklist: literal "Expense"/"Income" column headers are now recognized; a new "Needs Mapping" state distinguishes unrecognized columns from deliberately-ignored ones; a `Date,Payee,Type,Amount,Notes` format (a `Type` column carrying "Debit"/"Credit" per row) is now supported; CSV-imported transactions now correctly get `currency: 'USD'` (Business) or `'PHP'` (Personal); Income-type duplicate matching now compares the right stored field; and uncategorized rows get a visible "Needs Review" badge during import review.

## Sample files to use

All in `test-data/csv-samples/`:

| File | Format | Use for |
|---|---|---|
| `test-1-simple-amount.csv` | `Date,Description,Amount` | Part 1 #1 |
| `test-2-debit-credit.csv` | `Transaction Date,Description,Debit,Credit` | Part 1 #2 |
| `test-3-merchant-withdrawal-deposit.csv` | `Posting Date,Merchant,Withdrawal,Deposit,Memo` | Part 1 #3 |
| `test-4-payee-type-amount.csv` | `Date,Payee,Type,Amount,Notes` | Part 1 #4 |
| `test-5-personal.csv` | `Date,Description,Debit,Credit` | Part 1 #5 (Personal ledger) |
| `test-6-unknown-vendor.csv` | one unrecognizable vendor | Part 4 |
| `test-7-duplicate-within-file.csv` | same row twice | Part 5 Test B |
| `test-8-literal-synonyms.csv` | `Posted Date,Payee,Expense,Income` | Part 2 literal-header stress test |

## Walkthrough

**Part 3 — Column mapping screen**
1. Upload `test-3-merchant-withdrawal-deposit.csv` into Business. Confirm the mapping screen shows: Posting Date→Date, Merchant→Vendor/Client, Withdrawal→Expense, Deposit→Income, Memo→Description.
2. Confirm you can change any mapping manually via the dropdown.
3. Upload `test-8-literal-synonyms.csv`. Confirm `Expense`→Expense and `Income`→Income map correctly (this exercises the fix — previously these literal headers fell through unmapped).
4. Rename a column in any test CSV to something nonsensical (e.g. `Column7`) and re-upload. Confirm it shows an amber "Needs Mapping" badge, distinct from the greyed-out "Ignore this column" state, and a "X need mapping" counter appears in the stats bar.

**Part 4 — Unknown transaction**
1. Upload `test-6-unknown-vendor.csv` into Business.
2. On the review screen, confirm the row imports with category "Uncategorized" and shows an orange "Needs Review" badge (not a guessed category), and a "Needs Review" scorecard tile appears.
3. Manually pick a real category from the dropdown, then finish the import. Confirm it saves with your chosen category.

**Part 5 — Duplicates (Tests A, B, C)**
1. **Test A**: import `test-1-simple-amount.csv` into Business. Then re-upload the same file. Confirm every row shows "Possible Duplicate" and is unchecked by default, and no new documents are created unless you manually re-check a box.
2. **Test B**: upload `test-7-duplicate-within-file.csv`. Confirm the second row is flagged "Possible Duplicate" even though nothing has been imported yet.
3. **Test C**: already covered by Test A's second upload — confirm the transaction count in your ledger doesn't double.

**Part 6 — Verified vs. Unverified TaxAct export**
1. Go to Settings → Tax Mapping. Pick (or create) one Business category, fill in Tax Form/Section/TaxAct Mapping, and set Status → Verified.
2. Import a transaction using that category (any test CSV, then pick the category during review).
3. Go to Tax Center → export the Business Tax Preparation CSV. Confirm the verified category's row has the tax fields populated.
4. Set a different category's mapping to "Not Verified" (or leave a mapping's status as such) and confirm its transactions export with blank tax fields.

**Part 7 — Module 3 safety rules**
Confirm none of the following ever happen automatically during the above: a TaxAct field getting filled in without you typing it, a Schedule A/C line being assigned by the app, or a mapping's status flipping to Verified without you choosing it from the dropdown.

**Part 8 — Business/Personal separation**
1. Import `test-5-personal.csv` into the Personal ledger.
2. Confirm those transactions appear only in Personal, never in Business, the Business Tax Center, or the Business Tax Preparation CSV export.
3. Confirm Business-imported transactions show/export as USD and Personal-imported ones as PHP.

**Part 9 — Full end-to-end**
Run through Upload → Column Detection → Mapping → Preview → Duplicate Detection → Category Detection/Review → Import → Tax Mapping → Verification → Tax Center → CSV export once, start to finish, using any one sample file, to confirm nothing breaks between steps.

## Assembling the Part 10 report

While going through the above, note down: total CSV formats tested, rows imported, duplicates detected, rows requiring review, rows auto-categorized vs. manually categorized, verified mappings tested/exported, and take the screenshots listed in the original PDF (Upload, Column Detection, Column Mapping, Import Preview, Duplicate Detection, Imported Transactions, Tax Review, Tax Mapping, Verified Tax Mapping, Tax Center, Business Tax Preparation CSV).
