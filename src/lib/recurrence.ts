// Date-string helpers for the Recurring Transactions engine.
// Dates are 'YYYY-MM-DD' strings computed in UTC, matching the convention
// already used everywhere else in the app (new Date().toISOString().split('T')[0]).

export const MAX_BACKFILL_OCCURRENCES = 24;

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month: month - 1, day }; // month is 0-indexed internally
}

function formatDateString(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().split('T')[0];
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of `month`.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function clampDayToMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month));
}

function buildOccurrenceDate(year: number, month: number, dayOfMonth: number): string {
  return formatDateString(year, month, clampDayToMonth(year, month, dayOfMonth));
}

/** Advances one calendar month from `currentDateStr`, landing on `dayOfMonth` (clamped to the new month's length). */
export function advanceOneMonth(currentDateStr: string, dayOfMonth: number): string {
  const { year, month } = parseDateString(currentDateStr);
  const nextMonthIndex = month + 1;
  const nextYear = year + Math.floor(nextMonthIndex / 12);
  const normalizedMonth = ((nextMonthIndex % 12) + 12) % 12;
  return buildOccurrenceDate(nextYear, normalizedMonth, dayOfMonth);
}

/**
 * Given a reference date and a target day-of-month, returns the next occurrence
 * on or after that reference date — this month if the day hasn't passed yet,
 * otherwise next month. Used when a schedule's dayOfMonth is edited or resumed.
 */
export function nextOccurrenceOnOrAfter(fromDateStr: string, dayOfMonth: number): string {
  const { year, month } = parseDateString(fromDateStr);
  const thisMonthOccurrence = buildOccurrenceDate(year, month, dayOfMonth);
  if (thisMonthOccurrence >= fromDateStr) {
    return thisMonthOccurrence;
  }
  return advanceOneMonth(fromDateStr, dayOfMonth);
}
