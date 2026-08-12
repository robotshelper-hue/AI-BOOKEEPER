/**
 * Module 4 — Phase 2: Column Mapping Step
 *
 * Presents each CSV column as a card with:
 *  - Column header name + sample values
 *  - A dropdown to assign a BookkeepingField
 *  - Color-coded status based on assigned field
 * Validates that at minimum Date + an amount strategy are mapped.
 */

import React, { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import {
  BookkeepingField,
  ParsedCSV,
  FIELD_META,
  validateMapping,
  MappingValidation,
} from '../../lib/csvAutoDetect';
import {
  AmountStrategyConfig,
  AmountPolarity,
  POLARITY_META,
} from '../../lib/csvNormalization';

// ─── Field Styling ─────────────────────────────────────────────────────────────

const FIELD_STYLES: Record<
  BookkeepingField,
  { border: string; bg: string; badge: string; dot: string }
> = {
  date: {
    border: 'border-l-indigo-500',
    bg: 'bg-indigo-50/60',
    badge: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  vendor: {
    border: 'border-l-sky-500',
    bg: 'bg-sky-50/60',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
  },
  description: {
    border: 'border-l-violet-500',
    bg: 'bg-violet-50/60',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    dot: 'bg-violet-500',
  },
  amount: {
    border: 'border-l-green-500',
    bg: 'bg-green-50/60',
    badge: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
  },
  debit: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-50/60',
    badge: 'bg-orange-100 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  credit: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/60',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  notes: {
    border: 'border-l-gray-400',
    bg: 'bg-gray-50/40',
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    dot: 'bg-gray-400',
  },
  ignore: {
    border: 'border-l-gray-200',
    bg: 'bg-white',
    badge: '',
    dot: 'bg-gray-300',
  },
};

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({
  headers,
  mapping,
}: {
  headers: string[];
  mapping: Record<string, BookkeepingField>;
}) {
  const values = Object.values(mapping);
  const mapped = values.filter((v) => v !== 'ignore').length;
  const ignored = values.filter((v) => v === 'ignore').length;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
        <Info className="w-3 h-3" />
        {headers.length} columns detected
      </span>
      <span className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-200">
        <span className="w-2 h-2 rounded-full bg-indigo-500" />
        {mapped} auto-mapped
      </span>
      {ignored > 0 && (
        <span className="flex items-center gap-1.5 bg-gray-50 text-gray-500 px-2.5 py-1 rounded-full border border-gray-200">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          {ignored} ignored
        </span>
      )}
    </div>
  );
}

// ─── Column Card ───────────────────────────────────────────────────────────────

interface ColumnCardProps {
  header: string;
  samples: string[];
  field: BookkeepingField;
  usedFields: Set<BookkeepingField>;
  onChange: (field: BookkeepingField) => void;
}

function ColumnCard({ header, samples, field, usedFields, onChange }: ColumnCardProps) {
  const styles = FIELD_STYLES[field];
  const isIgnored = field === 'ignore';
  const meta = FIELD_META[field];

  return (
    <div
      className={`border-l-4 rounded-xl border border-gray-200 transition-all duration-200 overflow-hidden ${styles.border} ${styles.bg} ${
        isIgnored ? 'opacity-55 hover:opacity-80' : ''
      }`}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide leading-tight break-all">
            {header}
          </span>
          {!isIgnored && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 whitespace-nowrap ${styles.badge}`}
            >
              {meta.label}
            </span>
          )}
        </div>

        {/* Sample values */}
        <div className="mb-3 space-y-0.5 min-h-[44px]">
          {samples.length > 0 ? (
            samples.slice(0, 3).map((s, i) => (
              <p key={i} className="text-[11px] text-gray-500 font-mono truncate leading-relaxed">
                {s || <span className="text-gray-300 italic">empty</span>}
              </p>
            ))
          ) : (
            <p className="text-[11px] text-gray-400 italic">No sample data</p>
          )}
        </div>

        {/* Dropdown */}
        <select
          value={field}
          onChange={(e) => onChange(e.target.value as BookkeepingField)}
          className="w-full text-xs border border-gray-300 rounded-lg px-2.5 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer font-medium text-gray-700 transition-colors"
        >
          <optgroup label="── Required ──">
            <option value="date">
              Date{usedFields.has('date') && field !== 'date' ? ' (already mapped)' : ''}
            </option>
            <option value="amount">
              Amount — single column{usedFields.has('amount') && field !== 'amount' ? ' (already mapped)' : ''}
            </option>
          </optgroup>
          <optgroup label="── Split Columns ──">
            <option value="debit">
              Debit / Withdrawal{usedFields.has('debit') && field !== 'debit' ? ' (already mapped)' : ''}
            </option>
            <option value="credit">
              Credit / Deposit{usedFields.has('credit') && field !== 'credit' ? ' (already mapped)' : ''}
            </option>
          </optgroup>
          <optgroup label="── Optional ──">
            <option value="vendor">
              Vendor / Payee{usedFields.has('vendor') && field !== 'vendor' ? ' (already mapped)' : ''}
            </option>
            <option value="description">
              Description / Memo{usedFields.has('description') && field !== 'description' ? ' (already mapped)' : ''}
            </option>
            <option value="notes">
              Notes / Reference{usedFields.has('notes') && field !== 'notes' ? ' (already mapped)' : ''}
            </option>
          </optgroup>
          <optgroup label="──────────────">
            <option value="ignore">Ignore this column</option>
          </optgroup>
        </select>
      </div>
    </div>
  );
}

// ─── Validation Banner ─────────────────────────────────────────────────────────

function ValidationBanner({ validation }: { validation: MappingValidation }) {
  const { isValid, errors, warnings } = validation;

  if (isValid && warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">Mapping looks great!</p>
          <p className="text-xs text-green-700 mt-0.5">All required fields are mapped. Click Continue to review your data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${!isValid ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center gap-2">
        {!isValid ? (
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        )}
        <p className={`text-sm font-semibold ${!isValid ? 'text-red-800' : 'text-amber-800'}`}>
          {!isValid ? 'Required fields missing' : 'Mapping complete with warnings'}
        </p>
      </div>
      {errors.map((e, i) => (
        <p key={`e-${i}`} className="text-sm text-red-700 ml-7">
          • {e}
        </p>
      ))}
      {warnings.map((w, i) => (
        <p key={`w-${i}`} className="text-sm text-amber-700 ml-7">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}

// ─── Amount Strategy Panel ────────────────────────────────────────────────────

function AmountStrategyPanel({
  strategy,
  onChange,
}: {
  strategy: AmountStrategyConfig;
  onChange: (s: AmountStrategyConfig) => void;
}) {
  const polarities = Object.entries(POLARITY_META) as [AmountPolarity, { label: string; hint: string }][];

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
        <h4 className="text-sm font-semibold text-green-900">Single Amount Column — Interpretation</h4>
      </div>
      <p className="text-xs text-green-700 ml-4">
        How should positive and negative values in your Amount column be treated?
      </p>
      <div className="space-y-2 ml-4">
        {polarities.map(([polarity, { label, hint }]) => (
          <label key={polarity} className="flex items-start gap-3 cursor-pointer group">
            <input
              type="radio"
              name="amount-polarity"
              value={polarity}
              checked={strategy.polarity === polarity}
              onChange={() => onChange({ polarity })}
              className="mt-0.5 accent-indigo-600 flex-shrink-0 cursor-pointer"
            />
            <div>
              <span className="text-xs font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                {label}
              </span>
              <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Main MappingStep Component ────────────────────────────────────────────────

interface MappingStepProps {
  csvData: ParsedCSV;
  mapping: Record<string, BookkeepingField>;
  onMappingChange: (mapping: Record<string, BookkeepingField>) => void;
  amountStrategy: AmountStrategyConfig;
  onAmountStrategyChange: (s: AmountStrategyConfig) => void;
}

export default function MappingStep({
  csvData,
  mapping,
  onMappingChange,
  amountStrategy,
  onAmountStrategyChange,
}: MappingStepProps) {
  const { headers, rows } = csvData;

  const validation = useMemo(() => validateMapping(mapping), [mapping]);

  // Get sample values for a given column header
  const getSamples = (header: string): string[] =>
    rows
      .slice(0, 4)
      .map((row) => (row[header] ?? '').trim())
      .filter((v) => v !== '');

  // Compute which fields are already used by other columns
  const getUsedFields = (excludeHeader: string): Set<BookkeepingField> => {
    const used = new Set<BookkeepingField>();
    for (const [h, f] of Object.entries(mapping)) {
      if (h !== excludeHeader && f !== 'ignore') {
        used.add(f);
      }
    }
    return used;
  };

  const handleChange = (header: string, field: BookkeepingField) => {
    onMappingChange({ ...mapping, [header]: field });
  };

  return (
    <div className="space-y-5">
      {/* Instruction + stats */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Map your CSV columns to bookkeeping fields</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            We've auto-detected mappings based on your column headers. Review and adjust as needed.
          </p>
        </div>
        <StatsBar headers={headers} mapping={mapping} />
      </div>

      {/* Column Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {headers.map((header) => (
          <ColumnCard
            key={header}
            header={header}
            samples={getSamples(header)}
            field={mapping[header] ?? 'ignore'}
            usedFields={getUsedFields(header)}
            onChange={(f) => handleChange(header, f)}
          />
        ))}
      </div>

      {/* Validation Status */}
      <ValidationBanner validation={validation} />

      {/* Amount strategy panel — shown when single Amount column is mapped */}
      {Object.values(mapping).includes('amount') && (
        <AmountStrategyPanel
          strategy={amountStrategy}
          onChange={onAmountStrategyChange}
        />
      )}
    </div>
  );
}
