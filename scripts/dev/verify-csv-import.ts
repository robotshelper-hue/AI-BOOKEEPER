/**
 * Module 4 — Local CSV import verification.
 *
 * Exercises the pure column-detection / normalization / duplicate-matching logic
 * against the sample bank CSVs in test-data/csv-samples/, entirely offline.
 * Does NOT touch Firestore, the Gemini API, or any network — it only proves the
 * logic in src/lib/csvAutoDetect.ts, src/lib/csvNormalization.ts, and
 * src/lib/importAI.ts behaves as the Module 4 spec expects.
 *
 * Run with: npx tsx scripts/dev/verify-csv-import.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { autoDetectMappings, validateMapping, BookkeepingField } from '../../src/lib/csvAutoDetect';
import { normalizeCSV, AmountStrategyConfig } from '../../src/lib/csvNormalization';
import { findDuplicateIndices } from '../../src/lib/importAI';
import { TransactionDocument } from '../../src/types';

const SAMPLES_DIR = join(process.cwd(), 'test-data', 'csv-samples');
const DEFAULT_STRATEGY: AmountStrategyConfig = { polarity: 'pos-income' };

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) failures++;
}

function parseCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = readFileSync(filePath, 'utf8');
  const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  return { headers: result.meta.fields || [], rows: result.data };
}

// ─── Part 1/2/3 — column auto-detection across all sample formats ────────────

console.log('\n=== PART 1/2/3 — Column Auto-Detection ===\n');

const files = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.csv')).sort();
let totalFormatsTested = 0;
let totalRowsParsed = 0;

for (const file of files) {
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, file));
  const mapping = autoDetectMappings(headers);
  const validation = validateMapping(mapping);
  totalFormatsTested++;
  totalRowsParsed += rows.length;

  console.log(`--- ${file} ---`);
  console.log(`  headers: ${headers.join(', ')}`);
  for (const h of headers) {
    console.log(`    "${h}" -> ${mapping[h]}`);
  }
  console.log(`  valid: ${validation.isValid}${validation.warnings.length ? `, warnings: ${validation.warnings.join(' | ')}` : ''}`);

  check(`${file}: date column detected`, Object.values(mapping).includes('date'));
  console.log('');
}

// Literal-synonym stress file must map Expense->debit and Income->credit explicitly
{
  const { headers } = parseCsv(join(SAMPLES_DIR, 'test-8-literal-synonyms.csv'));
  const mapping = autoDetectMappings(headers);
  check('test-8: "Expense" header maps to debit field', mapping['Expense'] === 'debit');
  check('test-8: "Income" header maps to credit field', mapping['Income'] === 'credit');
}

// Type-indicator format (Test CSV #4) must route through the type-column branch
{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-4-payee-type-amount.csv'));
  const mapping = autoDetectMappings(headers);
  check('test-4: "Type" header maps to type field', mapping['Type'] === 'type');
  const result = normalizeCSV(rows, mapping, DEFAULT_STRATEGY);
  check('test-4: PLUSVIBE (Debit) resolves to Expense', result.rows[0].type === 'Expense' && result.rows[0].amount === 37);
  check('test-4: XYZ Solar Company (Credit) resolves to Income', result.rows[1].type === 'Income' && result.rows[1].amount === 500);
}

// ─── Part 1 — amount sign / debit-credit normalization for every format ──────

console.log('\n=== PART 1 — Amount Normalization ===\n');

function expectRow(file: string, mapping: Record<string, BookkeepingField>, rows: Record<string, string>[]) {
  const result = normalizeCSV(rows, mapping, DEFAULT_STRATEGY);
  console.log(`--- ${file} ---`);
  for (const r of result.rows) {
    console.log(`  ${r.date} | ${r.type.padEnd(7)} | $${r.amount.toFixed(2)} | ${r.vendor || r.description || '(no vendor)'}`);
  }
  return result;
}

{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-1-simple-amount.csv'));
  const mapping = autoDetectMappings(headers);
  const result = expectRow('test-1-simple-amount.csv', mapping, rows);
  check('test-1: negative amount -> Expense', result.rows[0].type === 'Expense');
  check('test-1: positive amount -> Income', result.rows[1].type === 'Income');
}

{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-2-debit-credit.csv'));
  const mapping = autoDetectMappings(headers);
  const result = expectRow('test-2-debit-credit.csv', mapping, rows);
  check('test-2: Debit column -> Expense', result.rows[0].type === 'Expense');
  check('test-2: Credit column -> Income', result.rows[1].type === 'Income');
}

{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-3-merchant-withdrawal-deposit.csv'));
  const mapping = autoDetectMappings(headers);
  const result = expectRow('test-3-merchant-withdrawal-deposit.csv', mapping, rows);
  check('test-3: Withdrawal -> Expense', result.rows[0].type === 'Expense');
  check('test-3: Deposit -> Income', result.rows[1].type === 'Income');
  check('test-3: Memo mapped to description', result.rows[0].description === 'Screenshot software');
}

// ─── Part 5 — duplicate detection (Tests A, B, C) ─────────────────────────────

console.log('\n=== PART 5 — Duplicate Detection ===\n');

// Test B: duplicate inside the same CSV batch
{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-7-duplicate-within-file.csv'));
  const mapping = autoDetectMappings(headers);
  const result = normalizeCSV(rows, mapping, DEFAULT_STRATEGY);
  const dupes = findDuplicateIndices(result.rows, []);
  console.log(`Test B (intra-CSV duplicate): flagged rawIndex(es) = [${[...dupes].join(', ')}]`);
  check('Test B: second identical row flagged as duplicate', dupes.has(1));
}

// Test A + C: row already exists in "Firestore" (simulated) / re-importing the same file
{
  const { headers, rows } = parseCsv(join(SAMPLES_DIR, 'test-1-simple-amount.csv'));
  const mapping = autoDetectMappings(headers);
  const result = normalizeCSV(rows, mapping, DEFAULT_STRATEGY);

  // Simulate: this batch was already imported once, so "existing" now mirrors it exactly
  // the way ImportTransactions.tsx's ResultStep actually writes documents.
  const existing: TransactionDocument[] = result.rows.map((r) => ({
    userId: 'test-user',
    ledger: 'Business',
    currency: 'USD',
    date: r.date,
    type: r.type,
    amount: r.amount,
    category: 'Test',
    client: r.type === 'Income' ? (r.vendor || r.description || null) : null,
    vendor: r.type === 'Expense' ? (r.vendor || r.description || null) : null,
    description: r.description,
    notes: null,
    timestamp: Date.now(),
  }));

  const dupesOnReimport = findDuplicateIndices(result.rows, existing);
  console.log(`Test A/C (re-import same file): flagged rawIndex(es) = [${[...dupesOnReimport].join(', ')}] out of ${result.rows.length} rows`);
  check('Test A/C: every row flagged when re-importing an already-imported file', dupesOnReimport.size === result.rows.length);
}

// Income-vendor bug regression check (fix #4): two DIFFERENT Income counterparties on the
// same date/amount must NOT be flagged as duplicates of each other.
{
  const rowA = {
    date: '2026-08-16', amount: 500, type: 'Income' as const, vendor: 'Client B', category: null,
    description: null, notes: null, rawIndex: 0, rawRow: {}, errors: [], warnings: [],
  };
  const existingIncome: TransactionDocument[] = [{
    userId: 'test-user', ledger: 'Business', currency: 'USD',
    date: '2026-08-16', type: 'Income', amount: 500, category: 'Test',
    client: 'Client A', vendor: null, description: null, notes: null, timestamp: Date.now(),
  }];
  const dupes = findDuplicateIndices([rowA], existingIncome);
  check('Fix #4: different Income counterparties on same date/amount are NOT falsely flagged', !dupes.has(0));

  const rowSameClient = { ...rowA, vendor: 'Client A' };
  const dupesSame = findDuplicateIndices([rowSameClient], existingIncome);
  check('Fix #4: same Income counterparty on same date/amount IS flagged as duplicate', dupesSame.has(0));
}

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== Summary ===');
console.log(`CSV formats tested: ${totalFormatsTested}`);
console.log(`Total rows parsed across all samples: ${totalRowsParsed}`);
console.log(`Checks: ${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);

if (failures > 0) process.exit(1);
