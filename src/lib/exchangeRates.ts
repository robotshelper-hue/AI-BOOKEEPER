/**
 * PHP → USD exchange rates for Business transactions (Module 5).
 *
 * Source: Frankfurter (https://frankfurter.dev), which republishes the European
 * Central Bank's daily reference rates. Chosen because it is free, needs no API
 * key, serves CORS headers for direct browser use, and — the reason that matters
 * here — serves *historical* rates. A transaction is booked at the rate that
 * applied on the day it was paid, never at today's rate.
 *
 * Two rules this module exists to enforce:
 *
 *   1. Never invent a rate. If the rate cannot be fetched we throw, and the
 *      caller surfaces that error. Nothing is guessed, defaulted or hard-coded.
 *
 *   2. Provenance is recorded truthfully. The ECB publishes on business days
 *      only; asking Frankfurter for a weekend or holiday makes it resolve back
 *      to the most recent published rate and echo that date in its response
 *      (verified: 2026-08-15 Sat -> 2026-08-14, 2026-01-01 -> 2025-12-31).
 *      We store the echoed date, not the date we asked for, so a transaction
 *      always says which rate it actually used.
 */

export interface ExchangeRateResult {
  /** Multiply a PHP amount by this to get USD. */
  rate: number;
  /** The date the returned rate was actually published for ('YYYY-MM-DD'). */
  rateDate: string;
  /** The date requested — differs from rateDate on weekends/holidays. */
  requestedDate: string;
  source: string;
}

export const EXCHANGE_RATE_SOURCE = 'frankfurter.dev (ECB reference rate)';

/**
 * Canonical host. The older api.frankfurter.app answers with a 301 to this
 * endpoint; addressing it directly avoids a redirect hop on every lookup.
 */
const API_BASE = 'https://api.frankfurter.dev/v1';

/** Transient-failure retries. Not a date walk — the API does date fallback itself. */
const MAX_ATTEMPTS = 3;

/**
 * Session cache keyed by requested date. A past date's rate never changes, and
 * one voice session can easily book several transactions on the same date.
 */
const rateCache = new Map<string, ExchangeRateResult>();

function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

/** Frankfurter 404s on future dates, so clamp rather than fail on clock skew. */
function clampToToday(date: string): string {
  const today = new Date().toISOString().split('T')[0];
  return date > today ? today : date;
}

/**
 * Fetches the PHP→USD rate applicable to `dateISO`.
 *
 * Weekend/holiday dates resolve to the preceding published rate automatically
 * (see module note above); the returned `rateDate` reports which one was used.
 *
 * @throws if no rate can be retrieved — callers must not substitute a guess.
 */
export async function getUsdPhpRate(dateISO: string): Promise<ExchangeRateResult> {
  if (!isValidDateString(dateISO)) {
    throw new Error(`Invalid date for exchange rate lookup: "${dateISO}". Expected YYYY-MM-DD.`);
  }

  const requestedDate = clampToToday(dateISO);

  const cached = rateCache.get(requestedDate);
  if (cached) return cached;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/${requestedDate}?base=PHP&symbols=USD`);

      if (!response.ok) {
        // 4xx means the date itself is unusable (e.g. before the dataset began);
        // retrying will not change that, so fail immediately rather than stall.
        if (response.status >= 400 && response.status < 500) {
          throw new Error(
            `Exchange rate API has no data for ${requestedDate} (HTTP ${response.status}).`
          );
        }
        lastError = new Error(`Exchange rate API returned HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rate = data?.rates?.USD;

      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new Error(`Exchange rate API response for ${requestedDate} contained no usable USD rate.`);
      }

      const result: ExchangeRateResult = {
        rate,
        // Trust the API's echoed date over the requested one — on a weekend or
        // holiday they differ, and the echoed one is the rate we actually used.
        rateDate: typeof data?.date === 'string' ? data.date : requestedDate,
        requestedDate,
        source: EXCHANGE_RATE_SOURCE,
      };
      rateCache.set(requestedDate, result);
      return result;
    } catch (error) {
      lastError = error;
      // A thrown Error here is either a hard "no data" case (rethrown below on
      // the final attempt) or a network fault worth one more try.
      if (attempt === MAX_ATTEMPTS) break;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(`Could not retrieve a PHP to USD exchange rate for ${requestedDate}. ${detail}`);
}

/** Rounds to cents, the precision every amount is stored and reported at. */
export function toUsdCents(phpAmount: number, rate: number): number {
  return Math.round(phpAmount * rate * 100) / 100;
}

/**
 * Converts a PHP amount into the full set of USD fields a Business transaction
 * stores, so the caller can spread the result straight onto the document.
 */
export async function convertPhpToUsd(phpAmount: number, dateISO: string) {
  const { rate, rateDate, source } = await getUsdPhpRate(dateISO);
  return {
    amount: toUsdCents(phpAmount, rate),
    currency: 'USD' as const,
    originalAmount: phpAmount,
    originalCurrency: 'PHP' as const,
    exchangeRate: rate,
    exchangeRateDate: rateDate,
    exchangeRateSource: source,
  };
}

/** Human-readable provenance, for voice answers and table rows. */
export function describeConversion(tx: {
  originalAmount?: number;
  originalCurrency?: string;
  amount?: number;
  exchangeRate?: number;
  exchangeRateDate?: string;
  exchangeRateSource?: string;
}): string | null {
  if (!tx.originalCurrency || tx.originalCurrency === 'USD' || tx.originalAmount == null) {
    return null;
  }
  return (
    `₱${tx.originalAmount.toFixed(2)} converted to $${Number(tx.amount ?? 0).toFixed(2)} ` +
    `at a rate of ${tx.exchangeRate ?? 0} on ${tx.exchangeRateDate ?? 'an unrecorded date'} ` +
    `(source: ${tx.exchangeRateSource ?? 'unrecorded'})`
  );
}
