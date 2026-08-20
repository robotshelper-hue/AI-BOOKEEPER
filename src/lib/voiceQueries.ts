import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { CategoryDocument, TaxMappingDocument, TransactionDocument } from '../types';
import { getTransactionEntity } from './transactionDisplay';
import { describeConversion } from './exchangeRates';

/**
 * Deterministic, Firestore-backed answers for the voice assistant (Module 5).
 *
 * Every number the assistant speaks must come from here. The assistant is not
 * permitted to add up transactions itself — the project rule is that totals are
 * computed programmatically, never by the model reading a JSON blob. These
 * functions are the only sanctioned source for counts, sums and lists.
 *
 * Two invariants hold in every function below:
 *   - the Firestore query is always scoped by `userId` first, so a bad or
 *     malicious `ledgerFilter` can never reach another user's data;
 *   - nothing is ever fabricated. Empty results come back as empty, with a
 *     `summary` that says so, so the assistant can report "I don't see any".
 *
 * Queries deliberately use `where` clauses only and sort in memory: that keeps
 * them free of new Firestore composite-index requirements.
 */

export type LedgerFilter = 'Business' | 'Personal' | 'both';

export interface VoiceTransaction {
  id: string;
  date: string;
  type: 'Income' | 'Expense';
  amount: number;
  currency: string;
  category: string;
  vendor: string | null;
  client: string | null;
  description: string | null;
  notes: string | null;
  ledger: string;
  timestamp: number;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
  /** Present only on review-queue results. */
  reviewReasons?: string[];
  /** Short spoken-form identification, e.g. "August 10, $49, PayPal, Business". */
  spoken?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeLedger(ledger: string | undefined): 'Business' | 'Personal' | null {
  if (!ledger) return null;
  const l = ledger.trim().toLowerCase();
  if (l === 'business') return 'Business';
  if (l === 'personal') return 'Personal';
  return null;
}

function resolveLedgerFilter(filter: string | undefined): LedgerFilter {
  const l = (filter || 'both').trim().toLowerCase();
  if (l === 'business') return 'Business';
  if (l === 'personal') return 'Personal';
  return 'both';
}

function txDate(tx: any): string {
  return tx.date || (tx.timestamp ? new Date(tx.timestamp).toISOString().split('T')[0] : '');
}

function symbolFor(currency: string | undefined): string {
  return currency === 'PHP' ? '₱' : '$';
}

export function formatAmount(amount: number, currency: string | undefined): string {
  return `${symbolFor(currency)}${Number(amount || 0).toFixed(2)}`;
}

/** Spoken-form date: '2026-08-10' -> 'August 10'. Falls back to the raw value. */
function spokenDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date || 'no date';
  const [y, m, d] = date.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const name = months[m - 1] ?? date;
  const currentYear = new Date().getFullYear();
  return y === currentYear ? `${name} ${d}` : `${name} ${d}, ${y}`;
}

/**
 * The one-line identification the spec asks for: date, amount, vendor/client,
 * ledger — enough to know which transaction is being discussed, no more.
 */
export function describeForVoice(tx: any): string {
  const parts = [
    spokenDate(txDate(tx)),
    formatAmount(tx.amount, tx.currency),
    getTransactionEntity(tx) || 'no vendor',
    tx.ledger,
  ];
  return parts.filter(Boolean).join(', ');
}

function toVoiceTransaction(tx: any): VoiceTransaction {
  return {
    id: tx.id,
    date: txDate(tx),
    type: tx.type,
    amount: Number(tx.amount || 0),
    currency: tx.currency,
    category: tx.category || '',
    vendor: tx.vendor ?? null,
    client: tx.client ?? null,
    description: tx.description ?? null,
    notes: tx.notes ?? null,
    ledger: tx.ledger,
    timestamp: tx.timestamp || 0,
    originalAmount: tx.originalAmount,
    originalCurrency: tx.originalCurrency,
    exchangeRate: tx.exchangeRate,
    exchangeRateDate: tx.exchangeRateDate,
    exchangeRateSource: tx.exchangeRateSource,
    spoken: describeForVoice(tx),
  };
}

/** Fetches this user's transactions, optionally narrowed to one ledger. */
async function fetchTransactions(
  userId: string,
  ledgerFilter: LedgerFilter
): Promise<any[]> {
  const constraints: any[] = [where('userId', '==', userId)];
  if (ledgerFilter !== 'both') {
    constraints.push(where('ledger', '==', ledgerFilter));
  }
  const snap = await getDocs(query(collection(db, 'Transactions'), ...constraints));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function fetchCategories(userId: string): Promise<CategoryDocument[]> {
  const snap = await getDocs(
    query(collection(db, 'categories'), where('userId', '==', userId))
  );
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as CategoryDocument) }));
}

async function fetchTaxMappings(userId: string): Promise<TaxMappingDocument[]> {
  const snap = await getDocs(
    query(collection(db, 'taxMappings'), where('userId', '==', userId))
  );
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as TaxMappingDocument) }));
}

function isUncategorized(tx: any): boolean {
  const c = (tx.category || '').trim();
  return !c || c.toLowerCase() === 'uncategorized';
}

/**
 * Duplicate-matching key. Mirrors `findDuplicateIndices` in ./importAI (date +
 * amount + type + counterpart), including its rule that Income stores the
 * counterpart in `client` while Expense uses `vendor`. Kept consistent so a
 * pair flagged at import time is the same pair flagged here.
 */
function duplicateKey(tx: any): string {
  const counterpart = (tx.type === 'Income' ? tx.client : tx.vendor) || '';
  return [
    txDate(tx),
    Number(tx.amount || 0).toFixed(2),
    tx.type,
    counterpart.trim().toLowerCase(),
    tx.ledger,
  ].join('_');
}

/**
 * Two empty stubs would otherwise look identical to each other and be reported
 * as duplicates, which is noise — they are already flagged for the real problem
 * (uncategorized / missing amount). Applied by both duplicate paths so the
 * review queue and "show me duplicates" always agree.
 */
function isTooEmptyForDuplicateCheck(tx: any): boolean {
  return isUncategorized(tx) && !tx.amount;
}

// ─── Review queue ─────────────────────────────────────────────────────────────

export interface ReviewQueueResult {
  totalItems: number;
  counts: {
    uncategorized: number;
    missingDate: number;
    missingAmount: number;
    possibleDuplicate: number;
    ambiguousType: number;
    unverifiedTaxMapping: number;
  };
  items: VoiceTransaction[];
  unverifiedTaxMappingCategories: string[];
  summary: string;
}

/**
 * The unified "what needs my attention" queue, spanning both ledgers.
 *
 * Generalizes the Business-only check that TaxCenter already renders, and adds
 * duplicate / ambiguous-type detection. An item leaves the queue automatically
 * once the underlying problem is fixed, because nothing is stored — the queue is
 * derived from current data every time it is asked for.
 */
export async function getReviewQueue(
  userId: string,
  ledgerFilterInput: string = 'both'
): Promise<ReviewQueueResult> {
  const ledgerFilter = resolveLedgerFilter(ledgerFilterInput);
  const [transactions, categories, mappings] = await Promise.all([
    fetchTransactions(userId, ledgerFilter),
    fetchCategories(userId),
    fetchTaxMappings(userId),
  ]);
  return computeReviewQueue(transactions, categories, mappings);
}

/**
 * Pure review-queue logic, kept free of Firestore I/O so it can be exercised
 * directly in tests — the same split `findDuplicateIndices`/`detectDuplicates`
 * already uses in ./importAI.
 */
export function computeReviewQueue(
  transactions: any[],
  categories: CategoryDocument[],
  mappings: TaxMappingDocument[]
): ReviewQueueResult {
  const catByName = new Map<string, CategoryDocument>();
  categories.forEach(c => {
    if (c.name) catByName.set(c.name.trim().toLowerCase(), c);
  });

  const mappingByCategory = new Map<string, TaxMappingDocument>();
  mappings.forEach(m => {
    if (m.businessCategoryName) {
      mappingByCategory.set(m.businessCategoryName.trim().toLowerCase(), m);
    }
  });

  // Group once so each member of a duplicate pair can be flagged.
  const keyCounts = new Map<string, number>();
  transactions.forEach(tx => {
    if (isTooEmptyForDuplicateCheck(tx)) return;
    const k = duplicateKey(tx);
    keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
  });

  const counts = {
    uncategorized: 0,
    missingDate: 0,
    missingAmount: 0,
    possibleDuplicate: 0,
    ambiguousType: 0,
    unverifiedTaxMapping: 0,
  };

  const unverifiedCategories = new Set<string>();
  const items: VoiceTransaction[] = [];

  for (const tx of transactions) {
    const reasons: string[] = [];

    if (isUncategorized(tx)) {
      reasons.push('Uncategorized');
      counts.uncategorized++;
    }
    if (!tx.date && !tx.timestamp) {
      reasons.push('Missing date');
      counts.missingDate++;
    }
    if (tx.amount == null || tx.amount === '' || Number.isNaN(Number(tx.amount))) {
      reasons.push('Missing amount');
      counts.missingAmount++;
    }
    if ((keyCounts.get(duplicateKey(tx)) || 0) > 1) {
      reasons.push('Possible duplicate');
      counts.possibleDuplicate++;
    }

    // Ambiguous Income/Expense: the transaction's type contradicts the type its
    // own category is registered as.
    const cat = catByName.get((tx.category || '').trim().toLowerCase());
    if (cat && tx.type && cat.type && cat.type !== tx.type) {
      reasons.push(`Ambiguous type — recorded as ${tx.type} but "${tx.category}" is an ${cat.type} category`);
      counts.ambiguousType++;
    }

    // Unverified tax mapping applies to Business expenses only — that is what
    // flows onto Schedule C.
    if (tx.ledger === 'Business' && !isUncategorized(tx)) {
      const mapping = mappingByCategory.get((tx.category || '').trim().toLowerCase());
      if (!mapping || mapping.status !== 'Verified') {
        reasons.push('Unverified tax mapping');
        counts.unverifiedTaxMapping++;
        unverifiedCategories.add(tx.category);
      }
    }

    if (reasons.length > 0) {
      items.push({ ...toVoiceTransaction(tx), reviewReasons: reasons });
    }
  }

  const parts: string[] = [];
  if (counts.uncategorized) parts.push(`${counts.uncategorized} uncategorized`);
  if (counts.missingDate) parts.push(`${counts.missingDate} missing a date`);
  if (counts.missingAmount) parts.push(`${counts.missingAmount} missing an amount`);
  if (counts.possibleDuplicate) parts.push(`${counts.possibleDuplicate} possible duplicates`);
  if (counts.ambiguousType) parts.push(`${counts.ambiguousType} with an ambiguous income or expense type`);
  if (unverifiedCategories.size) {
    parts.push(`${unverifiedCategories.size} categories with unverified tax mappings`);
  }

  const summary = items.length === 0
    ? 'Nothing needs your attention right now.'
    : `${items.length} item${items.length === 1 ? '' : 's'} need attention: ${parts.join(', ')}.`;

  return {
    totalItems: items.length,
    counts,
    items,
    unverifiedTaxMappingCategories: Array.from(unverifiedCategories).sort(),
    summary,
  };
}

// ─── Focused lookups ──────────────────────────────────────────────────────────

export async function getUncategorizedTransactions(
  userId: string,
  ledgerFilterInput: string = 'both'
) {
  const ledgerFilter = resolveLedgerFilter(ledgerFilterInput);
  const transactions = await fetchTransactions(userId, ledgerFilter);
  const items = transactions.filter(isUncategorized).map(toVoiceTransaction);

  return {
    count: items.length,
    transactions: items,
    summary: items.length === 0
      ? `I don't see any uncategorized ${ledgerFilter === 'both' ? '' : ledgerFilter.toLowerCase() + ' '}transactions.`
      : `Found ${items.length} uncategorized transaction${items.length === 1 ? '' : 's'}.`,
  };
}

export interface DuplicateGroup {
  reason: string;
  transactions: VoiceTransaction[];
}

export async function getPossibleDuplicates(
  userId: string,
  ledgerFilterInput: string = 'both'
) {
  const ledgerFilter = resolveLedgerFilter(ledgerFilterInput);
  const transactions = await fetchTransactions(userId, ledgerFilter);
  return computeDuplicateGroups(transactions);
}

/** Pure duplicate grouping, kept free of Firestore I/O so it can be tested. */
export function computeDuplicateGroups(transactions: any[]) {
  const groups = new Map<string, any[]>();
  transactions.forEach(tx => {
    if (isTooEmptyForDuplicateCheck(tx)) return;
    const k = duplicateKey(tx);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(tx);
  });

  const duplicateGroups: DuplicateGroup[] = [];
  groups.forEach(group => {
    if (group.length < 2) return;
    const first = group[0];
    const entity = getTransactionEntity(first) || 'an unnamed vendor';
    duplicateGroups.push({
      reason:
        `${group.length} transactions share the same date, amount, type and vendor: ` +
        `${formatAmount(first.amount, first.currency)} to ${entity} on ${spokenDate(txDate(first))}.`,
      transactions: group.map(toVoiceTransaction),
    });
  });

  return {
    groupCount: duplicateGroups.length,
    groups: duplicateGroups,
    summary: duplicateGroups.length === 0
      ? "I don't see any possible duplicates."
      : `Found ${duplicateGroups.length} set${duplicateGroups.length === 1 ? '' : 's'} of possible duplicates.`,
    // Stated explicitly so the assistant never assumes it may clean these up.
    note: 'Duplicates are never deleted automatically. The user must choose which to delete, and confirm it.',
  };
}

// ─── Tax mappings (read-only) ─────────────────────────────────────────────────

export async function getUnverifiedTaxMappings(userId: string) {
  const [mappings, transactions] = await Promise.all([
    fetchTaxMappings(userId),
    fetchTransactions(userId, 'Business'),
  ]);

  const txCountByCategory = new Map<string, number>();
  transactions.forEach(tx => {
    const key = (tx.category || '').trim().toLowerCase();
    if (!key) return;
    txCountByCategory.set(key, (txCountByCategory.get(key) || 0) + 1);
  });

  const unverified = mappings
    .filter(m => m.status !== 'Verified')
    .map(m => ({
      category: m.businessCategoryName,
      status: m.status,
      taxCategory: m.taxCategory || null,
      taxForm: m.taxForm || null,
      taxSection: m.taxSection || null,
      taxActMapping: m.taxActMapping || null,
      affectedTransactions:
        txCountByCategory.get((m.businessCategoryName || '').trim().toLowerCase()) || 0,
    }))
    .sort((a, b) => (a.category || '').localeCompare(b.category || ''));

  const names = unverified.map(m => m.category).filter(Boolean);

  return {
    count: unverified.length,
    mappings: unverified,
    summary: unverified.length === 0
      ? 'All of your tax mappings are verified.'
      : `You have ${unverified.length} unverified tax mapping${unverified.length === 1 ? '' : 's'}: ${names.join(', ')}.`,
  };
}

export async function explainTaxMapping(userId: string, categoryName: string) {
  if (!categoryName || !categoryName.trim()) {
    return { found: false, summary: 'Please tell me which category you want to know about.' };
  }

  const mappings = await fetchTaxMappings(userId);
  const target = categoryName.trim().toLowerCase();
  const mapping =
    mappings.find(m => (m.businessCategoryName || '').trim().toLowerCase() === target) ||
    mappings.find(m => (m.businessCategoryName || '').trim().toLowerCase().includes(target));

  if (!mapping) {
    return {
      found: false,
      summary: `I don't see a tax mapping for "${categoryName}".`,
      availableCategories: mappings.map(m => m.businessCategoryName).filter(Boolean),
    };
  }

  const hasProposal = Boolean(mapping.taxCategory || mapping.taxForm || mapping.taxActMapping);
  const summary = hasProposal
    ? `${mapping.businessCategoryName} is mapped to ${mapping.taxCategory || 'an unspecified tax category'} ` +
      `on ${mapping.taxForm || 'an unspecified form'}` +
      `${mapping.taxSection ? `, ${mapping.taxSection}` : ''}` +
      `${mapping.taxActMapping ? `, TaxAct mapping ${mapping.taxActMapping}` : ''}. ` +
      `It is ${mapping.status === 'Verified' ? 'verified' : 'not verified'}.`
    : `${mapping.businessCategoryName} has no proposed tax mapping yet. It is ${mapping.status === 'Verified' ? 'verified' : 'not verified'}.`;

  return {
    found: true,
    category: mapping.businessCategoryName,
    taxCategory: mapping.taxCategory || null,
    taxForm: mapping.taxForm || null,
    taxSection: mapping.taxSection || null,
    taxActMapping: mapping.taxActMapping || null,
    status: mapping.status,
    summary,
  };
}

// ─── Search & reporting ───────────────────────────────────────────────────────

export interface SearchParams {
  vendor?: string;
  category?: string;
  type?: 'Income' | 'Expense';
  dateFrom?: string;
  dateTo?: string;
  ledgerFilter?: string;
}

function matchesSearch(tx: any, params: SearchParams): boolean {
  // Redundant when the caller already narrowed the Firestore query by ledger,
  // but it keeps the pure compute* functions correct on their own.
  const ledgerFilter = resolveLedgerFilter(params.ledgerFilter);
  if (ledgerFilter !== 'both' && tx.ledger !== ledgerFilter) return false;

  if (params.vendor) {
    const needle = params.vendor.trim().toLowerCase();
    const haystack = `${tx.vendor || ''} ${tx.client || ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  if (params.category) {
    const needle = params.category.trim().toLowerCase();
    if (!(tx.category || '').toLowerCase().includes(needle)) return false;
  }
  if (params.type && tx.type !== params.type) return false;

  const date = txDate(tx);
  if (params.dateFrom && date && date < params.dateFrom) return false;
  if (params.dateTo && date && date > params.dateTo) return false;

  return true;
}

export async function searchTransactions(userId: string, params: SearchParams) {
  const ledgerFilter = resolveLedgerFilter(params.ledgerFilter);
  const transactions = await fetchTransactions(userId, ledgerFilter);
  const matches = transactions.filter(tx => matchesSearch(tx, params));

  return {
    count: matches.length,
    transactions: matches.map(toVoiceTransaction),
    summary: matches.length === 0
      ? "I don't see any transactions matching that."
      : `Found ${matches.length} matching transaction${matches.length === 1 ? '' : 's'}.`,
  };
}

/**
 * Programmatic totals — the only sanctioned way for the assistant to answer
 * "how much did I spend on X".
 *
 * Business figures are USD because a PHP-entered Business transaction is stored
 * already converted (with its original PHP amount kept alongside), so summing
 * `amount` is correct and never re-converts a historical transaction at today's
 * rate. Mixed-currency results are reported per currency rather than summed
 * across currencies.
 */
export async function getSpendingSummary(userId: string, params: SearchParams = {}) {
  const ledgerFilter = resolveLedgerFilter(params.ledgerFilter);
  const transactions = await fetchTransactions(userId, ledgerFilter);
  return computeSpendingSummary(transactions, params);
}

/** Pure totalling logic, kept free of Firestore I/O so it can be tested. */
export function computeSpendingSummary(transactions: any[], params: SearchParams = {}) {
  const matches = transactions.filter(tx => matchesSearch(tx, params));

  const byCurrency = new Map<string, { income: number; expense: number; count: number }>();
  for (const tx of matches) {
    const cur = tx.currency || (tx.ledger === 'Personal' ? 'PHP' : 'USD');
    if (!byCurrency.has(cur)) byCurrency.set(cur, { income: 0, expense: 0, count: 0 });
    const bucket = byCurrency.get(cur)!;
    const amt = Number(tx.amount || 0);
    if (tx.type === 'Income') bucket.income += amt;
    else bucket.expense += amt;
    bucket.count++;
  }

  const totals = Array.from(byCurrency.entries()).map(([currency, b]) => ({
    currency,
    totalIncome: Math.round(b.income * 100) / 100,
    totalExpense: Math.round(b.expense * 100) / 100,
    netProfit: Math.round((b.income - b.expense) * 100) / 100,
    transactionCount: b.count,
  }));

  const summary = matches.length === 0
    ? "I don't have any transactions matching that, so there's nothing to total."
    : totals
        .map(t =>
          `${t.transactionCount} transaction${t.transactionCount === 1 ? '' : 's'} in ${t.currency}: ` +
          `income ${formatAmount(t.totalIncome, t.currency)}, ` +
          `expenses ${formatAmount(t.totalExpense, t.currency)}, ` +
          `net ${formatAmount(t.netProfit, t.currency)}.`
        )
        .join(' ');

  return { matchCount: matches.length, totals, summary };
}

/**
 * Answers "what exchange rate did you use for X" from the rate stored on the
 * transaction — never by looking up a fresh rate.
 */
export async function getExchangeRateInfo(
  userId: string,
  params: { transactionId?: string; vendor?: string; dateFrom?: string; dateTo?: string }
) {
  const transactions = await fetchTransactions(userId, 'Business');

  let candidates = transactions.filter(tx => tx.originalCurrency === 'PHP');
  if (params.transactionId) {
    candidates = candidates.filter(tx => tx.id === params.transactionId);
  }
  if (params.vendor) {
    const needle = params.vendor.trim().toLowerCase();
    candidates = candidates.filter(tx =>
      `${tx.vendor || ''} ${tx.client || ''}`.toLowerCase().includes(needle)
    );
  }
  if (params.dateFrom) candidates = candidates.filter(tx => txDate(tx) >= params.dateFrom!);
  if (params.dateTo) candidates = candidates.filter(tx => txDate(tx) <= params.dateTo!);

  if (candidates.length === 0) {
    return {
      count: 0,
      conversions: [],
      summary: "I don't see any converted peso transactions matching that.",
    };
  }

  const conversions = candidates.map(tx => ({
    id: tx.id,
    date: txDate(tx),
    vendor: getTransactionEntity(tx),
    originalAmount: tx.originalAmount,
    originalCurrency: tx.originalCurrency,
    usdAmount: tx.amount,
    exchangeRate: tx.exchangeRate,
    exchangeRateDate: tx.exchangeRateDate,
    exchangeRateSource: tx.exchangeRateSource,
    spoken: describeConversion(tx),
  }));

  return {
    count: conversions.length,
    conversions,
    summary: conversions.length === 1
      ? conversions[0].spoken || 'Conversion details are recorded on that transaction.'
      : `Found ${conversions.length} converted transactions.`,
  };
}

// ─── Date helpers for relative ranges the assistant may ask for ───────────────

export function currentYearRange() {
  const y = new Date().getFullYear();
  return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
}

export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}
