/**
 * Module 4 — Phase 2: CSV Import Wizard (wired)
 *
 * Steps: Upload → Map Columns → Preview → Result
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  UploadCloud,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Columns,
  Eye,
  PartyPopper,
  X,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  ParsedCSV,
  BookkeepingField,
  autoDetectMappings,
  validateMapping,
} from '../lib/csvAutoDetect';
import {
  AmountStrategyConfig,
  NormalizationResult,
  normalizeCSV,
} from '../lib/csvNormalization';
import { ImportRowWithAI } from '../lib/importAI';
import MappingStep from '../components/ImportWizard/MappingStep';
import CategorizeStep from '../components/ImportWizard/CategorizeStep';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

// ─── Wizard Step Config ────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'map' | 'preview' | 'result';

const STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: 'upload', label: 'Upload', icon: <UploadCloud className="w-4 h-4" /> },
  { key: 'map', label: 'Map Columns', icon: <Columns className="w-4 h-4" /> },
  { key: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" /> },
  { key: 'result', label: 'Done', icon: <CheckCircle2 className="w-4 h-4" /> },
];

// ─── Step Progress Indicator ───────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;

        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isDone
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : isActive
                    ? 'bg-white border-indigo-600 text-indigo-600'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
              </div>
              <span
                className={`mt-1.5 text-xs font-medium whitespace-nowrap ${
                  isActive ? 'text-indigo-600' : isDone ? 'text-indigo-500' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mb-5 transition-colors duration-300 ${
                  i < currentIndex ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Upload Step ───────────────────────────────────────────────────────────────

function UploadStep({ onParsed }: { onParsed: (data: ParsedCSV) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        setError('Please upload a valid .csv file.');
        return;
      }
      setFileName(file.name);
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data.length) {
            setError('The CSV file appears to be empty.');
            return;
          }
          onParsed({
            headers: results.meta.fields || [],
            rows: results.data,
            rawFile: file,
          });
        },
        error: (err) => {
          setError(`Parsing error: ${err.message}`);
        },
      });
    },
    [onParsed]
  );

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) processFile(file);
        }}
        className={`relative w-full max-w-lg border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 transition-all duration-200 cursor-pointer ${
          isDragging
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'
        }`}
        onClick={() => document.getElementById('csv-file-input')?.click()}
      >
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
        />
        <div
          className={`p-4 rounded-full transition-colors ${
            isDragging ? 'bg-indigo-100' : 'bg-white border border-gray-200'
          }`}
        >
          <FileSpreadsheet
            className={`w-10 h-10 transition-colors ${
              isDragging ? 'text-indigo-600' : 'text-gray-400'
            }`}
          />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-700">
            {fileName ? fileName : 'Drop your CSV here, or click to browse'}
          </p>
          <p className="text-sm text-gray-400 mt-1">Supports any bank-exported .csv file</p>
        </div>
        {fileName && !error && (
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
            <CheckCircle2 className="w-4 h-4" />
            File loaded — proceeding to column mapping…
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 px-4 py-2 rounded-lg border border-red-200">
          <X className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6 max-w-sm text-center">
        Your data is processed locally. AI assistance only applies during the categorization step.
      </p>
    </div>
  );
}

// ─── Result Step (Phase 5 — Executes the import) ──────────────────────────────────

function ResultStep({
  ledger,
  rows,
  onReset,
}: {
  ledger: string;
  rows: ImportRowWithAI[];
  onReset: () => void;
}) {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<'importing' | 'success' | 'error'>('importing');
  const [error, setError] = useState<string | null>(null);
  const hasImportedRef = React.useRef(false);

  // Normalize: URL param 'business' → Firestore value 'Business'
  const normalizedLedger = ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase();

  useEffect(() => {
    if (!currentUser) return;
    if (hasImportedRef.current) return;
    hasImportedRef.current = true;

    async function performImport() {
      try {
        const transactionsRef = collection(db, 'Transactions');
        
        await Promise.all(
          rows.map((row) =>
            addDoc(transactionsRef, {
              userId: currentUser!.uid,
              ledger: normalizedLedger,
              date: row.date,
              type: row.type,
              amount: row.amount,
              category: row.selectedCategory,
              client: row.type === 'Income' ? row.vendor : null,
              vendor: row.type === 'Expense' ? row.vendor : null,
              notes: row.notes || row.description || '',
              timestamp: Date.now(),
              // No tax mappings are set here, strictly bookkeeping
            })
          )
        );

        setStatus('success');
      } catch (err: any) {
        console.error('Import error:', err);
        setStatus('error');
        setError(err.message || 'Failed to write to database.');
      }
    }

    performImport();
  }, [ledger, rows, currentUser, normalizedLedger]);

  if (status === 'importing') {
    return (
      <div className="py-12 text-center text-gray-500">
        <RefreshCw className="w-10 h-10 mx-auto mb-4 text-indigo-500 animate-spin" />
        <p className="font-semibold text-gray-700 text-base">Importing Transactions...</p>
        <p className="text-xs text-gray-400 mt-1">Saving {rows.length} rows to your {ledger} ledger.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="py-12 text-center text-red-500">
        <XCircle className="w-10 h-10 mx-auto mb-4 text-red-500" />
        <p className="font-semibold text-red-800 text-base">Import Failed</p>
        <p className="text-xs text-red-600 mt-1">{error}</p>
        <button
          onClick={onReset}
          className="mt-6 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Start Over
        </button>
      </div>
    );
  }

  return (
    <div className="py-12 text-center text-green-600">
      <PartyPopper className="w-10 h-10 mx-auto mb-4 text-green-500" />
      <p className="font-semibold text-green-800 text-base">Import Complete!</p>
      <p className="text-sm text-green-700 mt-1">
        Successfully imported {rows.length} transactions.
      </p>
      <div className="mt-8">
        <button
          onClick={onReset}
          className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Import Another File
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────────

export default function ImportTransactions() {
  const { ledger } = useParams<{ ledger: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<WizardStep>('upload');
  const [csvData, setCsvData] = useState<ParsedCSV | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, BookkeepingField> | null>(null);
  const [amountStrategy, setAmountStrategy] = useState<AmountStrategyConfig>({ polarity: 'pos-income' });
  const [normalizationResult, setNormalizationResult] = useState<NormalizationResult | null>(null);
  const [finalRows, setFinalRows] = useState<ImportRowWithAI[]>([]);

  const isPersonal = ledger === 'personal';
  const ledgerLabel = isPersonal ? 'Personal (PHP)' : 'Business (USD)';
  const ledgerColor = isPersonal ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700';

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  // File parsed → auto-detect mappings and advance to map step
  const handleParsed = (data: ParsedCSV) => {
    setCsvData(data);
    setColumnMapping(autoDetectMappings(data.headers));
    setStep('map');
  };

  // "Continue" is enabled only when the current step's requirements are met
  const canContinue =
    (step === 'map' && columnMapping !== null && validateMapping(columnMapping).isValid) ||
    step === 'preview';

  const handleReset = () => {
    setCsvData(null);
    setColumnMapping(null);
    setNormalizationResult(null);
    setFinalRows([]);
    setStep('upload');
  };

  const goNext = () => {
    if (step === 'map' && csvData && columnMapping) {
      // Run normalization before entering preview
      const result = normalizeCSV(csvData.rows, columnMapping, amountStrategy);
      setNormalizationResult(result);
    }
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.key);
  };

  const goPrev = () => {
    if (step === 'map') {
      handleReset();
    } else {
      const prev = STEPS[stepIndex - 1];
      if (prev) setStep(prev.key);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <button
          onClick={() => navigate(`/ledger/${ledger}/transactions`)}
          className="flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors mb-2 gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <FileSpreadsheet className="w-7 h-7 text-indigo-600" />
          Import CSV
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Import bank transactions into your{' '}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ledgerColor}`}>
            {ledgerLabel}
          </span>{' '}
          ledger.
        </p>
      </div>

      {/* Wizard Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Step Progress */}
        <div className="px-8 pt-7 pb-4 border-b border-gray-100">
          <StepIndicator current={step} />
        </div>

        {/* Step Content */}
        <div className="px-8 py-6 min-h-[320px]">
          {step === 'upload' && <UploadStep onParsed={handleParsed} />}

          {step === 'map' && csvData && columnMapping && (
            <MappingStep
              csvData={csvData}
              mapping={columnMapping}
              onMappingChange={setColumnMapping}
              amountStrategy={amountStrategy}
              onAmountStrategyChange={setAmountStrategy}
            />
          )}

          {step === 'preview' && normalizationResult && (
            <CategorizeStep
              ledger={ledger || ''}
              normalizationResult={normalizationResult}
              onComplete={(rows) => {
                setFinalRows(rows);
                setStep('result');
              }}
              onCancel={goPrev}
            />
          )}
          {step === 'result' && (
            <ResultStep ledger={ledger || ''} rows={finalRows} onReset={handleReset} />
          )}
        </div>

        {/* Footer Navigation */}
        {step !== 'upload' && step !== 'result' && step !== 'preview' && (
          <div className="px-8 pb-7 flex justify-between items-center border-t border-gray-100 pt-4">
            <button
              onClick={goPrev}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-3">
              {!canContinue && step === 'map' && (
                <span className="text-xs text-gray-400">Map required fields to continue</span>
              )}
              <button
                onClick={goNext}
                disabled={!canContinue}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ledger Safety Notice */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <span className="text-lg leading-none">🔒</span>
        <div>
          <strong>Ledger Safety:</strong> All imported transactions will be locked to your{' '}
          <strong>{ledgerLabel}</strong> ledger. You cannot mix Personal and Business transactions
          during import.
        </div>
      </div>
    </div>
  );
}
