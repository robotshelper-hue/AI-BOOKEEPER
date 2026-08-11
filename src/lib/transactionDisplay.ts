import { TransactionDocument } from '../types';

type TxLike = Partial<TransactionDocument> & Record<string, any>;

/** Trim and treat whitespace-only / null / undefined as absent. */
const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The vendor (expense) or client (income) already stored on the transaction.
 * Falls back to the other field so a mistyped `type` never hides real data.
 */
export function getTransactionEntity(tx: TxLike): string {
  const primary = tx.type === 'Income' ? clean(tx.client) : clean(tx.vendor);
  return primary || clean(tx.vendor) || clean(tx.client);
}

/** Label for the entity, for use next to the value. */
export function getTransactionEntityLabel(tx: TxLike): 'Client' | 'Vendor' {
  return tx.type === 'Income' ? 'Client' : 'Vendor';
}

/**
 * Display priority: description -> vendor/client -> notes -> 'No Description'.
 * Never fabricates text; only surfaces fields already stored on the document.
 */
export function getTransactionLabel(tx: TxLike): string {
  return clean(tx.description) || getTransactionEntity(tx) || clean(tx.notes) || 'No Description';
}

/**
 * Description cell for tables that already show Vendor/Client in their own
 * column, so the entity is not repeated here.
 */
export function getTransactionDescriptionCell(tx: TxLike): string {
  return clean(tx.description) || clean(tx.notes) || '—';
}
