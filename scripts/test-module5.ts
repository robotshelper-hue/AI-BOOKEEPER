/**
 * Module 5 verification harness.
 *
 * Exercises the deterministic logic the voice assistant depends on, using
 * synthetic transactions with known answers, plus a live exchange-rate lookup.
 *
 * Run with:  npx tsx scripts/test-module5.ts
 */

import {
  computeReviewQueue,
  computeDuplicateGroups,
  computeSpendingSummary,
  describeForVoice,
  formatAmount,
  currentYearRange,
} from '../src/lib/voiceQueries';
import { getUsdPhpRate, convertPhpToUsd, toUsdCents, describeConversion } from '../src/lib/exchangeRates';
import { taxColumnsFor } from '../src/lib/taxExport';
import { CategoryDocument, TaxMappingDocument } from '../src/types';

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}\n          expected: ${e}\n          actual:   ${a}`);
  }
}

function checkTrue(label: string, actual: boolean) {
  check(label, actual, true);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const categories: CategoryDocument[] = [
  { id: 'c1', userId: 'u1', name: 'Outsourcing', ledger: 'Business', type: 'Expense', active: true, displayOrder: 1 },
  { id: 'c2', userId: 'u1', name: 'Hosting', ledger: 'Business', type: 'Expense', active: true, displayOrder: 2 },
  { id: 'c3', userId: 'u1', name: 'Business Funding', ledger: 'Business', type: 'Income', active: true, displayOrder: 3 },
  { id: 'c4', userId: 'u1', name: 'Groceries', ledger: 'Personal', type: 'Expense', active: true, displayOrder: 4 },
];

const mappings: TaxMappingDocument[] = [
  {
    id: 'm1', userId: 'u1', businessCategoryId: 'c1', businessCategoryName: 'Outsourcing',
    taxYear: '2026', taxForm: 'Schedule C', taxSection: 'Part II — Expenses',
    taxCategory: 'Contract Labor', taxActMapping: 'Contract Labor — Line 11',
    status: 'Not Verified', active: true, notes: '', lastUpdated: 0, updatedBy: 'u1',
  },
  {
    id: 'm2', userId: 'u1', businessCategoryId: 'c2', businessCategoryName: 'Hosting',
    taxYear: '2026', taxForm: 'Schedule C', taxSection: 'Part II — Expenses',
    taxCategory: 'Other Expenses', taxActMapping: 'Other — Line 27a',
    status: 'Verified', active: true, notes: '', lastUpdated: 0, updatedBy: 'u1',
  },
];

const transactions: any[] = [
  // Clean, fully verified Business expense -> should NOT be in the queue.
  { id: 't1', ledger: 'Business', type: 'Expense', amount: 37, currency: 'USD', category: 'Hosting', vendor: 'Hetzner', client: null, date: '2026-08-12', timestamp: 5 },
  // Outsourcing: mapping exists but is Not Verified -> queue (unverified mapping).
  { id: 't2', ledger: 'Business', type: 'Expense', amount: 200, currency: 'USD', category: 'Outsourcing', vendor: 'Rommel', client: null, date: '2026-08-10', timestamp: 4, description: 'VA services' },
  // Uncategorized Business -> queue (uncategorized).
  { id: 't3', ledger: 'Business', type: 'Expense', amount: 49, currency: 'USD', category: 'Uncategorized', vendor: 'PayPal', client: null, date: '2026-08-10', timestamp: 3 },
  // Duplicate pair to PlusVibe -> both flagged.
  { id: 't4', ledger: 'Business', type: 'Expense', amount: 37, currency: 'USD', category: 'Hosting', vendor: 'PlusVibe', client: null, date: '2026-08-12', timestamp: 2 },
  { id: 't5', ledger: 'Business', type: 'Expense', amount: 37, currency: 'USD', category: 'Hosting', vendor: 'PlusVibe', client: null, date: '2026-08-12', timestamp: 1 },
  // Personal, clean -> not in queue (tax mappings don't apply to Personal).
  { id: 't6', ledger: 'Personal', type: 'Expense', amount: 1500, currency: 'PHP', category: 'Groceries', vendor: 'Market', client: null, date: '2026-08-15', timestamp: 0 },
  // Ambiguous: recorded as Expense but "Business Funding" is an Income category.
  { id: 't7', ledger: 'Business', type: 'Expense', amount: 500, currency: 'USD', category: 'Business Funding', vendor: 'Navy Federal', client: null, date: '2026-08-14', timestamp: 6 },
  // Converted peso payment, retains provenance.
  { id: 't8', ledger: 'Business', type: 'Expense', amount: 53.57, currency: 'USD', category: 'Outsourcing', vendor: 'Ella', client: null, date: '2026-08-15', timestamp: 7,
    originalAmount: 3000, originalCurrency: 'PHP', exchangeRate: 0.01785, exchangeRateDate: '2026-08-14', exchangeRateSource: 'frankfurter.dev (ECB reference rate)' },
];

// ─── 1. Review queue ──────────────────────────────────────────────────────────

console.log('\n1. REVIEW QUEUE');
const queue = computeReviewQueue(transactions, categories, mappings);

check('t1 (verified Hosting, no issues) is not queued', queue.items.some(i => i.id === 't1'), false);
check('t6 (clean Personal) is not queued', queue.items.some(i => i.id === 't6'), false);
check('uncategorized count', queue.counts.uncategorized, 1);
check('possible duplicate count (both members flagged)', queue.counts.possibleDuplicate, 2);
check('ambiguous type count', queue.counts.ambiguousType, 1);
checkTrue('t3 flagged Uncategorized',
  queue.items.find(i => i.id === 't3')!.reviewReasons!.includes('Uncategorized'));
checkTrue('t2 flagged for unverified tax mapping',
  queue.items.find(i => i.id === 't2')!.reviewReasons!.includes('Unverified tax mapping'));
checkTrue('t4 flagged Possible duplicate',
  queue.items.find(i => i.id === 't4')!.reviewReasons!.includes('Possible duplicate'));
checkTrue('t7 flagged as ambiguous income/expense',
  queue.items.find(i => i.id === 't7')!.reviewReasons!.some(r => r.startsWith('Ambiguous type')));
check('unverified mapping categories listed', queue.unverifiedTaxMappingCategories, ['Business Funding', 'Outsourcing']);
console.log(`  summary: "${queue.summary}"`);

// Ledger isolation: Personal-only view must contain no Business rows.
const personalOnly = computeReviewQueue(
  transactions.filter(t => t.ledger === 'Personal'), categories, mappings);
check('Personal-only queue has no Business items', personalOnly.items.every(i => i.ledger === 'Personal'), true);
check('Personal-only queue raises no tax-mapping flags', personalOnly.counts.unverifiedTaxMapping, 0);

// Resolution: once categorized and its mapping verified, an item leaves the queue.
const resolved = computeReviewQueue(
  [{ ...transactions[2], category: 'Hosting' }],
  categories,
  mappings
);
check('resolved item disappears from the queue', resolved.totalItems, 0);

// ─── 2. Duplicates ────────────────────────────────────────────────────────────

console.log('\n2. POSSIBLE DUPLICATES');
const dupes = computeDuplicateGroups(transactions);
check('one duplicate group found', dupes.groupCount, 1);
check('group contains both PlusVibe rows', dupes.groups[0].transactions.map(t => t.id).sort(), ['t4', 't5']);
checkTrue('group explains why it was flagged', dupes.groups[0].reason.includes('PlusVibe'));
checkTrue('never auto-deletes', dupes.note.includes('never deleted automatically'));
console.log(`  reason: "${dupes.groups[0].reason}"`);

const noDupes = computeDuplicateGroups([transactions[0]]);
check('single transaction yields no duplicates', noDupes.groupCount, 0);
check('empty duplicate result says so', noDupes.summary, "I don't see any possible duplicates.");

// Empty stubs are flagged for their real problem, not reported as duplicates of
// each other — and both duplicate paths must agree on that.
const stubs = [
  { id: 's1', ledger: 'Business', type: 'Expense', amount: 0, currency: 'USD', category: 'Uncategorized', vendor: null, client: null, date: '', timestamp: 0 },
  { id: 's2', ledger: 'Business', type: 'Expense', amount: 0, currency: 'USD', category: 'Uncategorized', vendor: null, client: null, date: '', timestamp: 0 },
];
check('empty stubs are not reported as duplicates', computeDuplicateGroups(stubs).groupCount, 0);
check('review queue agrees they are not duplicates',
  computeReviewQueue(stubs, categories, mappings).counts.possibleDuplicate, 0);
checkTrue('but they are still flagged as uncategorized',
  computeReviewQueue(stubs, categories, mappings).counts.uncategorized === 2);

// ─── 3. Totals ────────────────────────────────────────────────────────────────

console.log('\n3. SPENDING SUMMARY (programmatic totals)');
const outsourcing = computeSpendingSummary(transactions, { category: 'Outsourcing', ledgerFilter: 'Business' });
// 200 (t2) + 53.57 (t8, stored USD equivalent) = 253.57
check('outsourcing total uses stored USD equivalents', outsourcing.totals[0].totalExpense, 253.57);
check('outsourcing transaction count', outsourcing.matchCount, 2);

const businessAll = computeSpendingSummary(transactions, { ledgerFilter: 'Business' });
check('business totals are USD only', businessAll.totals.map(t => t.currency), ['USD']);

const personalAll = computeSpendingSummary(transactions, { ledgerFilter: 'Personal' });
check('personal totals are PHP only', personalAll.totals.map(t => t.currency), ['PHP']);
check('personal expense total', personalAll.totals[0].totalExpense, 1500);

const vendorSearch = computeSpendingSummary(transactions, { vendor: 'hetzner' });
check('vendor search is case-insensitive', vendorSearch.matchCount, 1);

const empty = computeSpendingSummary(transactions, { category: 'Nonexistent' });
check('no matches reports zero, not a guess', empty.matchCount, 0);
checkTrue('empty summary says there is nothing', empty.summary.includes("don't have any transactions"));

const yr = currentYearRange();
checkTrue('current year range is well formed', /^\d{4}-01-01$/.test(yr.dateFrom));

// ─── 4. Voice formatting ──────────────────────────────────────────────────────

console.log('\n4. VOICE FORMATTING');
check('spoken transaction line', describeForVoice(transactions[2]), 'August 10, $49.00, PayPal, Business');
check('peso formatting', formatAmount(1500, 'PHP'), '₱1500.00');
checkTrue('conversion is described from stored values',
  describeConversion(transactions[7])!.includes('0.01785'));

// ─── 5. Tax export gate ───────────────────────────────────────────────────────

console.log('\n5. TAX CSV — blank until verified');
const outsourcingMapping = mappings[0]; // Not Verified
const hostingMapping = mappings[1];     // Verified

check('Not Verified -> all four tax fields blank',
  taxColumnsFor(outsourcingMapping), ['', '', '', '']);
check('Verified -> tax fields included',
  taxColumnsFor(hostingMapping),
  ['Other Expenses', 'Schedule C', 'Part II — Expenses', 'Other — Line 27a']);
check('a missing mapping exports blanks rather than failing',
  taxColumnsFor(undefined), ['', '', '', '']);
check('"Needs Review" is not treated as verified',
  taxColumnsFor({ ...outsourcingMapping, status: 'Needs Review' }), ['', '', '', '']);

// The Outsourcing round trip the Add-On spec asks for (steps 13-15).
const outsourcingVerified = { ...outsourcingMapping, status: 'Verified' as const };
check('once Outsourcing is verified, Schedule C Line 11 appears',
  taxColumnsFor(outsourcingVerified),
  ['Contract Labor', 'Schedule C', 'Part II — Expenses', 'Contract Labor — Line 11']);
check('resetting it to Not Verified blanks the fields again',
  taxColumnsFor({ ...outsourcingVerified, status: 'Not Verified' }), ['', '', '', '']);

// ─── 6. Exchange rates (live) ─────────────────────────────────────────────────

console.log('\n5. EXCHANGE RATES (live Frankfurter lookups)');
check('rounds to cents', toUsdCents(3000, 0.017851), 53.55);

(async () => {
  try {
    const weekday = await getUsdPhpRate('2026-08-14'); // a Friday
    check('weekday rate resolves to the same date', weekday.rateDate, '2026-08-14');
    checkTrue('weekday rate is a positive number', weekday.rate > 0);
    console.log(`  2026-08-14 -> ${weekday.rate} (${weekday.source})`);

    const saturday = await getUsdPhpRate('2026-08-15'); // Saturday: no ECB rate
    check('weekend falls back to the preceding published rate', saturday.rateDate, '2026-08-14');
    check('and records the date actually requested', saturday.requestedDate, '2026-08-15');
    console.log(`  2026-08-15 (Sat) -> used rate from ${saturday.rateDate}`);

    const holiday = await getUsdPhpRate('2026-01-01'); // New Year's Day
    checkTrue('holiday falls back to an earlier date', holiday.rateDate < '2026-01-01');
    console.log(`  2026-01-01 (holiday) -> used rate from ${holiday.rateDate}`);

    const converted = await convertPhpToUsd(3000, '2026-08-15');
    check('original peso amount is preserved', converted.originalAmount, 3000);
    check('original currency is preserved', converted.originalCurrency, 'PHP');
    check('converted currency is USD', converted.currency, 'USD');
    checkTrue('USD equivalent is plausible for ₱3,000', converted.amount > 20 && converted.amount < 200);
    checkTrue('rate provenance is recorded', Boolean(converted.exchangeRateDate && converted.exchangeRateSource));
    console.log(`  ₱3,000 on 2026-08-15 -> $${converted.amount} @ ${converted.exchangeRate} (${converted.exchangeRateDate})`);

    // Historical rates must differ from today's — the whole point of storing them.
    const older = await getUsdPhpRate('2026-02-02');
    checkTrue('a historical rate is fetched independently of today', older.rateDate.startsWith('2026-02'));
    console.log(`  2026-02-02 -> ${older.rate} (vs ${weekday.rate} in August)`);

    let threw = false;
    try {
      await getUsdPhpRate('not-a-date');
    } catch { threw = true; }
    checkTrue('an invalid date throws instead of guessing a rate', threw);
  } catch (error: any) {
    failed++;
    console.log(`  FAIL  exchange rate suite errored: ${error.message}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
})();
