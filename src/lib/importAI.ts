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
 * Checks a batch of rows against Firestore to find potential duplicates.
 * A row is considered a potential duplicate if a transaction in the SAME ledger
 * has the exact same date and amount.
 */
export async function detectDuplicates(
  rows: NormalizedRow[],
  ledger: string
): Promise<Set<number>> {
  const duplicates = new Set<number>();
  
  // To avoid hitting Firebase for every row, we can query recent transactions or do it in batches.
  // For simplicity and safety in this implementation, we query by date.
  // We'll collect all unique dates from the import.
  const uniqueDates = Array.from(new Set(rows.map((r) => r.date).filter(Boolean)));
  
  if (uniqueDates.length === 0) return duplicates;

  // Since we can't 'in' query more than 10 dates easily, we'll fetch them individually or all transactions for this ledger if it's small.
  // For now, let's fetch all transactions for this ledger and do client-side filtering. 
  // (In a massive production app, we would query by date chunks).
  // Normalize: URL param 'business' → Firestore value 'Business'
  const normalizedLedger = ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase();
  const q = query(collection(db, 'Transactions'), where('ledger', '==', normalizedLedger));
  const snapshot = await getDocs(q);
  const existingTransactions = snapshot.docs.map(doc => doc.data() as TransactionDocument);

  for (const row of rows) {
    if (row.errors.length > 0) continue;

    const isDup = existingTransactions.some((t) => 
      t.date === row.date && 
      Math.abs(t.amount - row.amount) < 0.01 && 
      t.type === row.type
    );

    if (isDup) {
      duplicates.add(row.rawIndex);
    }
  }

  return duplicates;
}
