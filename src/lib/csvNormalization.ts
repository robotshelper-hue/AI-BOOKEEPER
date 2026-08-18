/**
 * Module 4 — Phase 3: CSV Data Normalization
 *
 * Provides:
 *  - AmountStrategyConfig (how to interpret single-amount columns)
 *  - NormalizedRow / NormalizationResult types
 *  - parseDate()   — robust multi-format date parser → 'YYYY-MM-DD'
 *  - parseAmount() — strips currency symbols, handles parenthetical negatives
 *  - normalizeCSV() — converts raw mapped rows to NormalizedRow[]
 */

import { BookkeepingField } from './csvAutoDetect';

// ─── Amount Strategy Types ─────────────────────────────────────────────────────

export type AmountPolarity =
  | 'pos-income'    // Positive → Income,  Negative → Expense  (most common)
  | 'pos-expense'   // Positive → Expense, Negative → Income   (credit cards)
  | 'all-income'    // Every row is Income regardless of sign
  | 'all-expense';  // Every row is Expense regardless of sign

export const POLARITY_META: Record<
  AmountPolarity,
  { label: string; hint: string }
> = {
  'pos-income':  { label: 'Positive = Income, Negative = Expense', hint: 'Bank accounts, savings — most common' },
  'pos-expense': { label: 'Positive = Expense, Negative = Income', hint: 'Credit card & loan statements' },
  'all-income':  { label: 'All amounts are Income',                hint: 'Revenue-only / invoice exports' },
  'all-expense': { label: 'All amounts are Expenses',              hint: 'Expense-only / receipt exports' },
};

export interface AmountStrategyConfig {
  polarity: AmountPolarity;
}

// ─── Normalized Row Types ──────────────────────────────────────────────────────

export interface NormalizedRow {
  date: string;                  // 'YYYY-MM-DD', or '' if date parsing failed
  amount: number;                // always positive
  type: 'Income' | 'Expense';
  vendor: string | null;
  category: string | null;
  description: string | null;
  notes: string | null;
  rawIndex: number;              // 0-based row index in the original CSV
  rawRow: Record<string, string>;
  errors: string[];              // fatal — this row will be excluded from import
  warnings: string[];            // non-fatal — row is importable but user should review
}

export interface NormalizationResult {
  rows: NormalizedRow[];
  validCount: number;
  errorCount: number;
  warningCount: number;          // rows that are valid but have at least one warning
}

// ─── Date Parsing ──────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function pad2(n: string | number): string {
  return String(n).padStart(2, '0');
}

function fixYear(y: string): string {
  // 2-digit → 4-digit: 00–49 = 2000s, 50–99 = 1900s
  if (y.length === 2) {
    return parseInt(y, 10) >= 50 ? `19${y}` : `20${y}`;
  }
  return y;
}

/**
 * Attempts to parse a date string in many common formats.
 * Returns 'YYYY-MM-DD' or null if no format matches.
 *
 * Supported patterns:
 *   YYYY-MM-DD, YYYY/MM/DD
 *   YYYYMMDD
 *   MM/DD/YYYY, MM-DD-YYYY, MM.DD.YYYY  (US)
 *   DD/MM/YYYY  (heuristic: first part > 12)
 *   MM/DD/YY    (short year)
 *   Jan 15, 2024 | 15 Jan 2024 | January 15 2024
 *   2024-Jan-15
 */
export function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // ── ISO: YYYY-MM-DD or YYYY/MM/DD ──
  const iso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;

  // ── Compact: YYYYMMDD ──
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

  // ── Numeric separators: MM/DD/YYYY or DD/MM/YYYY (heuristic) ──
  const numeric = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (numeric) {
    const [, a, b, c] = numeric;
    const year = fixYear(c);
    // If first segment > 12 it must be DD → DD/MM/YYYY
    if (parseInt(a, 10) > 12) return `${year}-${pad2(b)}-${pad2(a)}`;
    return `${year}-${pad2(a)}-${pad2(b)}`; // default US: MM/DD/YYYY
  }

  // ── Text month: "15 Jan 2024" or "Jan 15, 2024" or "January 15 2024" ──
  const textMonth = s.match(
    /^(\d{1,2})\s+([a-zA-Z]+)[,\s]+(\d{2,4})$|^([a-zA-Z]+)\s+(\d{1,2})[,\s]+(\d{2,4})$/
  );
  if (textMonth) {
    const day = textMonth[1] || textMonth[5];
    const monthStr = (textMonth[2] || textMonth[4]).toLowerCase().substring(0, 3);
    const year = fixYear(textMonth[3] || textMonth[6]);
    const month = MONTH_NAMES[monthStr];
    if (month && day) return `${year}-${month}-${pad2(day)}`;
  }

  // ── ISO with text month: "2024-Jan-15" ──
  const isoText = s.match(/^(\d{4})-([a-zA-Z]+)-(\d{1,2})$/);
  if (isoText) {
    const month = MONTH_NAMES[isoText[2].toLowerCase().substring(0, 3)];
    if (month) return `${isoText[1]}-${month}-${pad2(isoText[3])}`;
  }

  return null;
}

// ─── Amount Parsing ────────────────────────────────────────────────────────────

/**
 * Strips currency symbols, thousands separators and whitespace, then parses
 * the resulting string as a float.
 *
 * Parenthetical negatives are supported: (1,234.56) → -1234.56
 * Returns null for blank/un-parseable strings.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a') return null;

  // Parenthetical negative: (123.45)
  const isParens = s.startsWith('(') && s.endsWith(')');

  // Strip: currency symbols $₱€£¥, commas, spaces, parentheses
  s = s.replace(/[\(\)$₱€£¥,\s]/g, '');

  const n = parseFloat(s);
  if (isNaN(n)) return null;

  return isParens ? -Math.abs(n) : n;
}

// ─── Internal Helpers ──────────────────────────────────────────────────────────

function resolveType(
  rawAmount: number,
  polarity: AmountPolarity
): 'Income' | 'Expense' {
  if (polarity === 'all-income') return 'Income';
  if (polarity === 'all-expense') return 'Expense';
  if (polarity === 'pos-income') return rawAmount >= 0 ? 'Income' : 'Expense';
  // pos-expense
  return rawAmount >= 0 ? 'Expense' : 'Income';
}

const EXPENSE_TYPE_WORDS = ['debit', 'withdrawal', 'expense', 'dr', 'charge', 'payment', 'spend', 'purchase', 'sent'];
const INCOME_TYPE_WORDS = ['credit', 'deposit', 'income', 'cr', 'received', 'receive', 'incoming'];

/**
 * Classifies a "Type" column's raw value (e.g. "Debit", "Credit") into Income/Expense.
 * Returns null if the value doesn't match any known word, so callers can fall back safely.
 */
function classifyTypeValue(raw: string): 'Income' | 'Expense' | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (EXPENSE_TYPE_WORDS.some((w) => v === w || v.includes(w))) return 'Expense';
  if (INCOME_TYPE_WORDS.some((w) => v === w || v.includes(w))) return 'Income';
  return null;
}

/** Returns the raw string value for a given BookkeepingField from a CSV row. */
function fieldValue(
  row: Record<string, string>,
  mapping: Record<string, BookkeepingField>,
  field: BookkeepingField
): string {
  const header = Object.keys(mapping).find((h) => mapping[h] === field);
  return header ? (row[header] ?? '').trim() : '';
}

// ─── Single Row Normalizer ─────────────────────────────────────────────────────

function normalizeRow(
  raw: Record<string, string>,
  index: number,
  mapping: Record<string, BookkeepingField>,
  strategy: AmountStrategyConfig
): NormalizedRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Date ───────────────────────────────────────────────────────────────────
  const rawDate = fieldValue(raw, mapping, 'date');
  const date = parseDate(rawDate);
  if (!date) {
    errors.push(`Cannot parse date: "${rawDate || '(empty)'}"`);
  }

  // ── Amount ─────────────────────────────────────────────────────────────────
  let amount = 0;
  let type: 'Income' | 'Expense' = 'Expense';
  const mappedFields = Object.values(mapping);

  if (mappedFields.includes('amount') && mappedFields.includes('type')) {
    // Single amount column + a per-row Type indicator (e.g. "Debit"/"Credit") that decides polarity
    const rawAmt = fieldValue(raw, mapping, 'amount');
    const parsed = parseAmount(rawAmt);
    if (parsed === null) {
      errors.push(`Cannot parse amount: "${rawAmt || '(empty)'}"`);
    } else {
      const rawType = fieldValue(raw, mapping, 'type');
      const classified = classifyTypeValue(rawType);
      if (classified === null) {
        errors.push(`Cannot classify Type value: "${rawType || '(empty)'}" as Debit/Credit.`);
      } else {
        type = classified;
        amount = Math.abs(parsed);
        if (amount === 0) warnings.push('Amount is zero — please verify this row.');
      }
    }
  } else if (mappedFields.includes('amount')) {
    // Single amount column, sign decides polarity
    const rawAmt = fieldValue(raw, mapping, 'amount');
    const parsed = parseAmount(rawAmt);
    if (parsed === null) {
      errors.push(`Cannot parse amount: "${rawAmt || '(empty)'}"`);
    } else {
      type = resolveType(parsed, strategy.polarity);
      amount = Math.abs(parsed);
      if (amount === 0) warnings.push('Amount is zero — please verify this row.');
    }
  } else {
    // Split debit / credit columns
    const rawDebit = fieldValue(raw, mapping, 'debit');
    const rawCredit = fieldValue(raw, mapping, 'credit');
    const debit = rawDebit ? parseAmount(rawDebit) : null;
    const credit = rawCredit ? parseAmount(rawCredit) : null;
    const hasDebit = debit !== null && Math.abs(debit) > 0;
    const hasCredit = credit !== null && Math.abs(credit) > 0;

    if (hasDebit && hasCredit) {
      warnings.push('Both debit and credit columns have values; using the larger one.');
      if (Math.abs(debit!) >= Math.abs(credit!)) {
        amount = Math.abs(debit!); type = 'Expense';
      } else {
        amount = Math.abs(credit!); type = 'Income';
      }
    } else if (hasDebit) {
      amount = Math.abs(debit!); type = 'Expense';
    } else if (hasCredit) {
      amount = Math.abs(credit!); type = 'Income';
    } else {
      errors.push('No valid debit or credit amount found for this row.');
    }
  }

  // ── Optional fields ────────────────────────────────────────────────────────
  const vendor      = fieldValue(raw, mapping, 'vendor') || null;
  const category    = fieldValue(raw, mapping, 'category') || null;
  const description = fieldValue(raw, mapping, 'description') || null;
  const notes       = fieldValue(raw, mapping, 'notes') || null;

  return {
    date: date ?? '',
    amount,
    type,
    vendor,
    category,
    description,
    notes,
    rawIndex: index,
    rawRow: raw,
    errors,
    warnings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalizes all CSV rows using the provided column mapping and amount strategy.
 * Ledger / currency are enforced by the caller (ImportTransactions), not here.
 */
export function normalizeCSV(
  rows: Record<string, string>[],
  mapping: Record<string, BookkeepingField>,
  strategy: AmountStrategyConfig
): NormalizationResult {
  const normalized = rows.map((row, i) => normalizeRow(row, i, mapping, strategy));

  return {
    rows: normalized,
    validCount:   normalized.filter((r) => r.errors.length === 0).length,
    errorCount:   normalized.filter((r) => r.errors.length > 0).length,
    warningCount: normalized.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
  };
}
