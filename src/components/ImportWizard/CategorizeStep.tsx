/**
 * Module 4 — Phase 4/5: Categorization & Duplicate Review Step
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  RefreshCw,
  Copy,
  Info,
} from 'lucide-react';
import { NormalizationResult } from '../../lib/csvNormalization';
import {
  suggestCategories,
  detectDuplicates,
  ImportRowWithAI,
  CategorySuggestion,
} from '../../lib/importAI';
import { CategoryDocument } from '../../types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';

interface CategorizeStepProps {
  ledger: string;
  normalizationResult: NormalizationResult;
  onComplete: (finalRows: ImportRowWithAI[]) => void;
  onCancel: () => void;
}

export default function CategorizeStep({
  ledger,
  normalizationResult,
  onComplete,
  onCancel,
}: CategorizeStepProps) {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const [rows, setRows] = useState<ImportRowWithAI[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressText, setProgressText] = useState('Loading categories...');
  const categoriesLoadedRef = useRef(false);
  const processedRef = useRef(false);

  // Normalize: URL param 'business' → Firestore value 'Business'
  const normalizedLedger = ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase();

  // Load categories
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'categories'),
      where('userId', '==', currentUser.uid),
      where('ledger', '==', normalizedLedger)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as CategoryDocument));
      setCategories(cats);
      categoriesLoadedRef.current = true;
    });
    return () => unsubscribe();
  }, [normalizedLedger, currentUser]);

  // Run AI and duplicates logic once categories query has returned (even if empty)
  useEffect(() => {
    let isMounted = true;
    if (!categoriesLoadedRef.current) return; // Wait for initial load
    if (processedRef.current) return; // Don't re-process

    async function processRows() {
      try {
        setLoading(true);
        
        setProgressText('Detecting duplicates...');
        const duplicates = await detectDuplicates(normalizationResult.rows, ledger);

        setProgressText('AI Bookkeeper is categorizing transactions...');
        const suggestions = await suggestCategories(normalizationResult.rows, categories, ledger);
        
        const suggestionMap = new Map<number, CategorySuggestion>();
        suggestions.forEach((s) => suggestionMap.set(s.index, s));

        const enriched: ImportRowWithAI[] = normalizationResult.rows.map((row) => {
          const sug = suggestionMap.get(row.rawIndex);
          const isDup = duplicates.has(row.rawIndex);
          const hasError = row.errors.length > 0;
          
          let selectedCat = sug?.category || 'Uncategorized';
          if (!categories.find(c => c.name === selectedCat && c.type === row.type)) {
             selectedCat = 'Uncategorized';
          }

          return {
            ...row,
            suggestedCategory: sug?.category || null,
            confidence: sug?.confidence || 0,
            isDuplicate: isDup,
            selectedCategory: selectedCat,
            import: !isDup && !hasError, // Auto-uncheck errors and duplicates
          };
        });

        if (isMounted) {
          setRows(enriched);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          // Fallback if AI fails: just load rows without AI
          const enriched: ImportRowWithAI[] = normalizationResult.rows.map((row) => ({
            ...row,
            suggestedCategory: null,
            confidence: 0,
            isDuplicate: false, // We skip duplicate detection on error for safety, or we could keep it.
            selectedCategory: 'Uncategorized',
            import: row.errors.length === 0,
          }));
          setRows(enriched);
          setLoading(false);
        }
      }
    }

    if (!processedRef.current) {
      processedRef.current = true;
      processRows();
    }
  }, [categories, normalizationResult.rows, ledger, rows.length]);

  const toggleImport = (rawIndex: number) => {
    setRows(rows.map(r => r.rawIndex === rawIndex ? { ...r, import: !r.import } : r));
  };

  const changeCategory = (rawIndex: number, category: string) => {
    setRows(rows.map(r => r.rawIndex === rawIndex ? { ...r, selectedCategory: category } : r));
  };

  const handleFinish = () => {
    onComplete(rows.filter(r => r.import));
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
        <p className="text-gray-700 font-medium">{progressText}</p>
        <p className="text-xs text-gray-400 mt-2">This may take a few moments for large files.</p>
      </div>
    );
  }

  const validCount = rows.filter(r => r.errors.length === 0).length;
  const duplicateCount = rows.filter(r => r.isDuplicate).length;
  const importCount = rows.filter(r => r.import).length;
  const errorCount = rows.filter(r => r.errors.length > 0).length;

  return (
    <div className="space-y-5">
      {/* Scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{importCount}</p>
          <p className="text-xs text-green-600 mt-0.5">Selected to Import</p>
        </div>
        {duplicateCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{duplicateCount}</p>
            <p className="text-xs text-amber-600 mt-0.5">Duplicates Skipped</p>
          </div>
        )}
        {errorCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{errorCount}</p>
            <p className="text-xs text-red-600 mt-0.5">Errors</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
        <span>Review & Adjust</span>
        {duplicateCount > 0 && (
          <span className="text-amber-600 flex items-center gap-1 normal-case">
            <Copy className="w-3.5 h-3.5" /> Duplicates unchecked by default
          </span>
        )}
      </div>

      {/* Review Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-3 py-2 text-center w-10">
                {/* Import Checkbox Header */}
              </th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Details</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.map((row, i) => {
              const hasError = row.errors.length > 0;
              const opacity = hasError ? 'opacity-50' : !row.import ? 'opacity-70' : '';
              const bg = row.isDuplicate && !row.import ? 'bg-amber-50/30' : hasError ? 'bg-red-50/30' : 'hover:bg-gray-50';

              return (
                <tr key={i} className={`transition-colors ${opacity} ${bg}`}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.import}
                      disabled={hasError}
                      onChange={() => toggleImport(row.rawIndex)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600">
                    {row.date}
                    {hasError && <div className="text-[10px] text-red-600 font-sans mt-0.5">{row.errors[0]}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 truncate max-w-[150px]">
                      {row.vendor || row.description || <span className="text-gray-400 italic">—</span>}
                    </div>
                    {row.isDuplicate && (
                      <div className="text-[10px] text-amber-600 font-semibold flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3" /> Possible Duplicate
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="font-semibold text-gray-900">
                      ${row.amount.toFixed(2)}
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-full font-semibold text-[10px] inline-block mt-0.5 ${
                      row.type === 'Income'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={row.selectedCategory}
                        onChange={(e) => changeCategory(row.rawIndex, e.target.value)}
                        disabled={hasError || !row.import}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 w-full focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="Uncategorized">Uncategorized</option>
                        {categories
                          .filter(c => c.type === row.type)
                          .map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                          ))
                        }
                      </select>
                      {row.suggestedCategory && row.suggestedCategory === row.selectedCategory && (
                        <span title={`AI Suggestion (${Math.round(row.confidence * 100)}% confidence)`} className="flex flex-shrink-0">
                          <Sparkles className="w-4 h-4 text-indigo-500" />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-6">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleFinish}
          disabled={importCount === 0}
          className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <CheckCircle2 className="w-4 h-4" />
          Import {importCount} Transactions
        </button>
      </div>
    </div>
  );
}
