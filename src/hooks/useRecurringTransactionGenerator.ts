import { useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { RecurringScheduleDocument, TransactionDocument } from '../types';
import { advanceOneMonth, todayDateString, MAX_BACKFILL_OCCURRENCES } from '../lib/recurrence';

/**
 * Client-side "check on load" engine for recurring transactions: there is no
 * server-side scheduler in this app, so due occurrences are generated the next
 * time any authenticated session runs this hook. Runs once per userId per app load.
 */
export function useRecurringTransactionGenerator(userId: string | null | undefined) {
  const ranForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || ranForUserRef.current === userId) return;
    ranForUserRef.current = userId;
    generateDueTransactionsForUser(userId).catch(err => {
      console.error('Recurring transaction generation failed', err);
    });
  }, [userId]);
}

export async function generateDueTransactionsForUser(userId: string): Promise<void> {
  const today = todayDateString();
  const q = query(
    collection(db, 'RecurringSchedules'),
    where('userId', '==', userId),
    where('active', '==', true)
  );
  const snapshot = await getDocs(q);
  const dueScheduleIds = snapshot.docs
    .filter(d => (d.data() as RecurringScheduleDocument).nextOccurrenceDate <= today)
    .map(d => d.id);

  for (const scheduleId of dueScheduleIds) {
    try {
      await generateOccurrencesForSchedule(scheduleId, today);
    } catch (err) {
      console.error(`Failed to generate occurrences for recurring schedule ${scheduleId}`, err);
    }
  }
}

/**
 * Generates due occurrences one at a time via an atomic Firestore transaction
 * (read schedule -> check still due -> write transaction + advance schedule).
 * That atomicity is what guarantees the same occurrence is never created twice,
 * even with multiple tabs/devices open concurrently.
 *
 * Capped at MAX_BACKFILL_OCCURRENCES per call so a very long-abandoned schedule
 * doesn't generate an unbounded burst in one go; any remainder simply stays due
 * and continues catching up on the next session, never skipped.
 */
export async function generateOccurrencesForSchedule(scheduleId: string, today: string = todayDateString()): Promise<void> {
  const scheduleRef = doc(db, 'RecurringSchedules', scheduleId);

  for (let i = 0; i < MAX_BACKFILL_OCCURRENCES; i++) {
    const shouldContinue = await runTransaction(db, async (t) => {
      const snap = await t.get(scheduleRef);
      if (!snap.exists()) return false;

      const schedule = snap.data() as RecurringScheduleDocument;
      if (!schedule.active) return false;
      if (schedule.nextOccurrenceDate > today) return false;

      const occurrenceDate = schedule.nextOccurrenceDate;
      const newTransactionRef = doc(collection(db, 'Transactions'));
      const newTransaction: Omit<TransactionDocument, 'id'> = {
        userId: schedule.userId,
        ledger: schedule.ledger,
        type: schedule.type,
        amount: schedule.amount,
        currency: schedule.currency,
        category: schedule.category,
        vendor: schedule.vendor,
        client: schedule.client,
        description: schedule.description,
        notes: schedule.notes,
        date: occurrenceDate,
        timestamp: Date.now(),
        sourceRecurringScheduleId: scheduleId
      };
      t.set(newTransactionRef, newTransaction);

      const nextOccurrenceDate = advanceOneMonth(occurrenceDate, schedule.dayOfMonth);
      t.update(scheduleRef, {
        nextOccurrenceDate,
        lastGeneratedDate: occurrenceDate,
        updatedAt: Date.now()
      });

      return nextOccurrenceDate <= today;
    });

    if (!shouldContinue) break;
  }
}
