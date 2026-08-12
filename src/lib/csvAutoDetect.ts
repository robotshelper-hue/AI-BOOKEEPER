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
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'notes'
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
  vendor: {
    label: 'Vendor / Payee',
    description: 'Who you paid or received from',
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
    'beneficiary', 'party', 'payer', 'recipient',
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
    'debit (php)', 'debit (usd)',
  ],
  credit: [
    'credit', 'deposit', 'credit amount', 'deposits', 'cr',
    'received', 'credit amt', 'money in', 'paid in',
    'credit (php)', 'credit (usd)',
  ],
  notes: [
    'notes', 'comments', 'comment', 'additional info', 'extra',
    'internal notes', 'annotation',
  ],
  ignore: [],
};

// ─── Fuzzy Matching ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-\.]/g, ' ');
}

function scoreMatch(header: string, hints: string[]): number {
  const h = normalize(header);
  for (let i = 0; i < hints.length; i++) {
    if (h === hints[i]) return 100 - i;          // exact match → highest score
    if (h.includes(hints[i])) return 70 - i;     // header contains hint
    if (hints[i].includes(h)) return 55 - i;     // hint contains header
  }
  return 0;
}

// ─── Main Auto-Detect Function ─────────────────────────────────────────────────

/**
 * Given a list of CSV column headers, returns a best-guess mapping
 * of each header → BookkeepingField.
 *
 * Priority order ensures that split Debit/Credit columns are preferred
 * over a single Amount column when both are present.
 */
export function autoDetectMappings(headers: string[]): Record<string, BookkeepingField> {
  const mapping: Record<string, BookkeepingField> = {};
  const usedHeaders = new Set<string>();

  // Detection priority: date → debit → credit → amount → vendor → description → notes
  const DETECTION_ORDER: BookkeepingField[] = [
    'date', 'debit', 'credit', 'amount', 'vendor', 'description', 'notes',
  ];

  for (const field of DETECTION_ORDER) {
    const hints = HINTS[field];
    let bestScore = 0;
    let bestHeader = '';

    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const score = scoreMatch(header, hints);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    }

    if (bestScore > 0 && bestHeader) {
      mapping[bestHeader] = field;
      usedHeaders.add(bestHeader);
    }
  }

  // Unmapped columns → ignore
  for (const header of headers) {
    if (!(header in mapping)) {
      mapping[header] = 'ignore';
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

  if (!values.includes('vendor') && !values.includes('description')) {
    warnings.push('No Vendor or Description mapped — transactions will have minimal detail.');
  }

  return { isValid: errors.length === 0, errors, warnings };
}
