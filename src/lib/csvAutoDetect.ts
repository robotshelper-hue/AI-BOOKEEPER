/**
 * Module 4 — Phase 2: CSV Auto-Detection & Field Types
 *
 * Provides:
 *  - BookkeepingField type + metadata
 *  - ParsedCSV interface
 *  - autoDetectMappings() — fuzzy header matching
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BookkeepingField =
  | 'date'
  | 'vendor'
  | 'category'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'type'
  | 'notes'
  | 'needs_mapping'
  | 'ignore';

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rawFile: File;
}

// ─── Field Metadata ────────────────────────────────────────────────────────────

export const FIELD_META: Record<
  BookkeepingField,
  { label: string; description: string; required: boolean; group: string }
> = {
  date: {
    label: 'Date',
    description: 'Transaction date (any common format)',
    required: true,
    group: 'required',
  },
  amount: {
    label: 'Amount (single column)',
    description: 'Positive = income, negative = expense',
    required: false,
    group: 'required',
  },
  debit: {
    label: 'Debit / Withdrawal',
    description: 'Expense amounts (money going out)',
    required: false,
    group: 'split',
  },
  credit: {
    label: 'Credit / Deposit',
    description: 'Income amounts (money coming in)',
    required: false,
    group: 'split',
  },
  type: {
    label: 'Type (Debit/Credit indicator)',
    description: 'Per-row label (e.g. "Debit"/"Credit") that decides Income vs Expense; pairs with a single Amount column',
    required: false,
    group: 'split',
  },
  vendor: {
    label: 'Vendor / Payee',
    description: 'Who you paid or received from',
    required: false,
    group: 'optional',
  },
  category: {
    label: 'Category',
    description: 'Pre-assigned transaction category',
    required: false,
    group: 'optional',
  },
  description: {
    label: 'Description / Memo',
    description: 'Transaction notes or narrative',
    required: false,
    group: 'optional',
  },
  notes: {
    label: 'Notes / Reference',
    description: 'Additional reference info',
    required: false,
    group: 'optional',
  },
  needs_mapping: {
    label: 'Needs Mapping',
    description: "We couldn't confidently match this column — please choose a field",
    required: false,
    group: 'other',
  },
  ignore: {
    label: 'Ignore this column',
    description: 'Skip — will not be imported',
    required: false,
    group: 'other',
  },
};

// ─── Auto-Detection Hints ──────────────────────────────────────────────────────

const HINTS: Record<BookkeepingField, string[]> = {
  date: [
    'date', 'transaction date', 'trans date', 'posting date', 'value date',
    'posted', 'post date', 'entry date', 'effective date', 'trans. date',
    'trx date', 'booking date', 'settlement date', 'created at', 'created date',
  ],
  vendor: [
    'vendor', 'payee', 'merchant', 'merchant name', 'counterpart',
    'beneficiary', 'party', 'payer', 'recipient', 'vendor/client', 'client',
  ],
  category: [
    'category', 'cat', 'categories', 'category name', 'expense category',
    'income category', 'classification',
  ],
  description: [
    'description', 'memo', 'narrative', 'details', 'transaction description',
    'particulars', 'remarks', 'narration', 'transaction details', 'purpose',
    'payment details', 'reference number', 'ref no', 'transaction memo',
  ],
  amount: [
    'amount', 'amt', 'transaction amount', 'value', 'net amount',
    'sum', 'transaction amt', 'net', 'total',
  ],
  debit: [
    'debit', 'withdrawal', 'debit amount', 'withdrawals', 'dr',
    'charges', 'payment', 'debit amt', 'money out', 'paid out',
    'debit (php)', 'debit (usd)', 'expense', 'expenses',
  ],
  credit: [
    'credit', 'deposit', 'credit amount', 'deposits', 'cr',
    'received', 'credit amt', 'money in', 'paid in',
    'credit (php)', 'credit (usd)', 'income', 'payment received',
  ],
  type: [
    'type', 'transaction type', 'trans type', 'dr/cr', 'debit/credit',
    'debit or credit', 'entry type',
  ],
  notes: [
    'notes', 'comments', 'comment', 'additional info', 'extra',
    'internal notes', 'annotation',
  ],
  needs_mapping: [],
  ignore: [],
};

// ─── Fuzzy Matching ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
}

function scoreMatch(header: string, hints: string[]): number {
  const h = normalize(header);
  const words = h.split(/\s+/);

  for (let i = 0; i < hints.length; i++) {
    const hint = normalize(hints[i]);

    // 1. Exact match gets highest score
    if (h === hint) return 1000 - i;

    // 2. Short abbreviations (<= 3 chars like 'cr', 'dr', 'amt') MUST match a whole word
    if (hint.length <= 3) {
      if (words.includes(hint)) return 850 - i;
      continue; // Skip substring search for short abbreviations
    }

    // 3. Multi-word phrase contained in header (e.g. "transaction date" in "bank transaction date")
    if (hint.includes(' ') && h.includes(hint)) return 800 - i;

    // 4. Single-word hint is an exact word in the header (e.g. "amount" in "total amount")
    if (!hint.includes(' ') && words.includes(hint)) return 750 - i;
  }
  return 0;
}

// ─── Main Auto-Detect Function ─────────────────────────────────────────────────

/**
 * Given a list of CSV column headers, returns a best-guess mapping
 * of each header → BookkeepingField using global optimal scoring.
 */
export function autoDetectMappings(headers: string[]): Record<string, BookkeepingField> {
  const mapping: Record<string, BookkeepingField> = {};
  const ALL_FIELDS: BookkeepingField[] = [
    'date', 'debit', 'credit', 'amount', 'type', 'vendor', 'category', 'description', 'notes',
  ];

  // Calculate all (header, field, score) tuples
  interface Candidate {
    header: string;
    field: BookkeepingField;
    score: number;
  }

  const candidates: Candidate[] = [];

  for (const header of headers) {
    for (const field of ALL_FIELDS) {
      const score = scoreMatch(header, HINTS[field]);
      if (score > 0) {
        candidates.push({ header, field, score });
      }
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const usedHeaders = new Set<string>();
  const usedFields = new Set<BookkeepingField>();

  for (const { header, field, score } of candidates) {
    if (usedHeaders.has(header) || usedFields.has(field)) continue;

    // If score is high enough (confident), map it
    if (score >= 700) {
      mapping[header] = field;
      usedHeaders.add(header);
      usedFields.add(field);
    }
  }

  // Unmapped columns → flagged as "Needs Mapping" rather than silently ignored
  for (const header of headers) {
    if (!(header in mapping)) {
      mapping[header] = 'needs_mapping';
    }
  }

  return mapping;
}

// ─── Validation ────────────────────────────────────────────────────────────────

export interface MappingValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMapping(mapping: Record<string, BookkeepingField>): MappingValidation {
  const values = Object.values(mapping);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!values.includes('date')) {
    errors.push('A "Date" column is required.');
  }

  const hasAmount = values.includes('amount');
  const hasDebit = values.includes('debit');
  const hasCredit = values.includes('credit');

  if (!hasAmount && !hasDebit && !hasCredit) {
    errors.push('Map at least one amount column: Amount, Debit, or Credit.');
  }

  if (hasDebit && !hasCredit) {
    warnings.push('"Debit" mapped but not "Credit" — income rows will be skipped.');
  }
  if (hasCredit && !hasDebit) {
    warnings.push('"Credit" mapped but not "Debit" — expense rows will be skipped.');
  }

  if (values.includes('type') && !hasAmount) {
    warnings.push('"Type" (Debit/Credit indicator) is mapped but no "Amount" column is mapped — it will be ignored.');
  }

  if (!values.includes('vendor') && !values.includes('description')) {
    warnings.push('No Vendor or Description mapped — transactions will have minimal detail.');
  }

  const needsMappingCount = values.filter((v) => v === 'needs_mapping').length;
  if (needsMappingCount > 0) {
    warnings.push(
      `${needsMappingCount} column${needsMappingCount > 1 ? 's' : ''} could not be confidently auto-detected — please map or ignore ${needsMappingCount > 1 ? 'them' : 'it'} manually.`
    );
  }

  return { isValid: errors.length === 0, errors, warnings };
}
