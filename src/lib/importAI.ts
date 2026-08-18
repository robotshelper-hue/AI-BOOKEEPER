/**
 * Module 4 — Phase 4: Import AI & Duplicate Detection
 */

import { NormalizedRow } from './csvNormalization';
import { TransactionDocument, CategoryDocument } from '../types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface CategorySuggestion {
  index: number;
  category: string | null;
  confidence: number;
}

export interface ImportRowWithAI extends NormalizedRow {
  suggestedCategory: string | null;
  confidence: number;
  isDuplicate: boolean;
  selectedCategory: string; // The category the user actually chooses (defaults to suggested or 'Uncategorized')
  import: boolean; // Whether the user wants to import this row
}

/**
 * Calls the Gemini backend to suggest categories for a batch of rows.
 */
export async function suggestCategories(
  rows: NormalizedRow[],
  categories: CategoryDocument[],
  ledger: string
): Promise<CategorySuggestion[]> {
  // Only send rows that don't have errors to save tokens/time
  const validRows = rows.filter((r) => r.errors.length === 0);
  
  if (validRows.length === 0) return [];

  const response = await fetch('/api/gemini/suggest-categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: validRows.map((r) => ({
        index: r.rawIndex,
        date: r.date,
        type: r.type,
        amount: r.amount,
        vendor: r.vendor,
        description: r.description,
      })),
      categories: categories.map((c) => ({ name: c.name, type: c.type })),
      ledger,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch AI suggestions');
  }

  const data = await response.json();
  return data.suggestions || [];
}

/**
 * Pure matching logic: given the rows being imported and a list of already-stored
 * transactions, returns the set of rawIndex values considered possible duplicates
 * (either against `existingTransactions` or against another row earlier in the same batch).
 * Kept free of any Firestore I/O so it can be exercised directly in tests/scripts.
 */
export function findDuplicateIndices(
  rows: NormalizedRow[],
  existingTransactions: TransactionDocument[]
): Set<number> {
  const duplicates = new Set<number>();

  // Track occurrences within this import batch and match against existing DB transactions
  const seenInBatch = new Map<string, number>();

  for (const row of rows) {
    if (row.errors.length > 0) continue;

    const rowKey = `${row.date}_${row.amount.toFixed(2)}_${row.type}_${(row.vendor || '').trim().toLowerCase()}`;
    const batchCount = seenInBatch.get(rowKey) || 0;
    seenInBatch.set(rowKey, batchCount + 1);

    const isIntraBatchDuplicate = batchCount > 0;

    const isDbDuplicate = existingTransactions.some((t) => {
      // Income transactions store the counterpart in `client`, not `vendor` — compare the field
      // that's actually populated for that type, or duplicate matching silently degrades to
      // date+amount+type for every Income row.
      const tCounterpart = t.type === 'Income' ? t.client : t.vendor;
      return (
        t.date === row.date &&
        Math.abs(t.amount - row.amount) < 0.01 &&
        t.type === row.type &&
        (!row.vendor || !tCounterpart || tCounterpart.trim().toLowerCase() === row.vendor.trim().toLowerCase())
      );
    });

    if (isIntraBatchDuplicate || isDbDuplicate) {
      duplicates.add(row.rawIndex);
    }
  }

  return duplicates;
}

/**
 * Checks a batch of rows against Firestore to find potential duplicates.
 * A row is considered a potential duplicate if a transaction in the SAME ledger
 * has the exact same date and amount.
 */
export async function detectDuplicates(
  rows: NormalizedRow[],
  ledger: string,
  userId?: string
): Promise<Set<number>> {
  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) return new Set<number>();

  let existingTransactions: TransactionDocument[] = [];
  try {
    const normalizedLedger = ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase();
    const constraints: any[] = [where('ledger', '==', normalizedLedger)];
    if (userId) {
      constraints.push(where('userId', '==', userId));
    }
    const q = query(collection(db, 'Transactions'), ...constraints);
    const snapshot = await getDocs(q);
    existingTransactions = snapshot.docs.map((doc) => doc.data() as TransactionDocument);
  } catch (e) {
    console.error('Failed to fetch existing transactions for duplicate check:', e);
  }

  return findDuplicateIndices(rows, existingTransactions);
}
