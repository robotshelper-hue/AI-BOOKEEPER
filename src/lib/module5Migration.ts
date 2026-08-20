import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { CategoryDocument, TaxMappingDocument } from '../types';

/**
 * One-time per-user data migration for Module 5.
 *
 * Three things, all idempotent:
 *
 *   1. Consolidates the old `Virtual Assistants` Business expense category into
 *      the single `Outsourcing` category that now covers every kind of VA work
 *      (social media, video, automation, web design, appointment setting, lead
 *      gen). The category document is renamed *in place* so its id survives —
 *      that keeps any existing taxMappings.businessCategoryId link intact.
 *
 *   2. Adds the `Business Funding` income category if it is missing.
 *
 *   3. Seeds the *proposed* Schedule C tax mapping for Outsourcing as
 *      **Not Verified**. It is deliberately never written as Verified, and an
 *      existing mapping the user has already touched is never overwritten —
 *      verification is the user's decision alone.
 *
 * Guarded by localStorage the same way `seedCategoriesIfEmpty` is, but every
 * step re-checks Firestore state, so a re-run (new browser, cleared storage)
 * is harmless.
 */

const MIGRATION_KEY = (userId: string) => `module5_migration_${userId}`;

const OLD_VA_CATEGORY = 'Virtual Assistants';
const OUTSOURCING = 'Outsourcing';
const BUSINESS_FUNDING = 'Business Funding';

/**
 * The proposed mapping from the Module 5 spec. Seeded as Not Verified; the user
 * confirms it themselves (in the Tax Mapping screen or by voice).
 */
export const OUTSOURCING_TAX_MAPPING = {
  taxCategory: 'Contract Labor',
  taxForm: 'Schedule C',
  taxSection: 'Part II — Expenses',
  taxActMapping: 'Contract Labor — Line 11',
} as const;

export interface Module5MigrationResult {
  ran: boolean;
  categoryRenamed: boolean;
  outsourcingCreated: boolean;
  businessFundingCreated: boolean;
  transactionsRecategorized: number;
  taxMappingSeeded: boolean;
  notes: string[];
}

export async function runModule5Migration(
  userId: string,
  options: { force?: boolean } = {}
): Promise<Module5MigrationResult> {
  const result: Module5MigrationResult = {
    ran: false,
    categoryRenamed: false,
    outsourcingCreated: false,
    businessFundingCreated: false,
    transactionsRecategorized: 0,
    taxMappingSeeded: false,
    notes: [],
  };

  if (!userId) return result;
  if (!options.force && localStorage.getItem(MIGRATION_KEY(userId))) {
    return result;
  }

  result.ran = true;

  try {
    // ── 1. Business categories ───────────────────────────────────────────────
    const catQ = query(
      collection(db, 'categories'),
      where('userId', '==', userId),
      where('ledger', '==', 'Business')
    );
    const catSnap = await getDocs(catQ);
    const businessCats = catSnap.docs.map(d => ({ id: d.id, ...(d.data() as CategoryDocument) }));

    const existingOutsourcing = businessCats.find(
      c => c.name?.trim().toLowerCase() === OUTSOURCING.toLowerCase()
    );
    const legacyVa = businessCats.find(
      c => c.name?.trim().toLowerCase() === OLD_VA_CATEGORY.toLowerCase()
    );

    let outsourcingId: string | undefined = existingOutsourcing?.id;

    if (legacyVa && !existingOutsourcing) {
      // Rename in place: same doc id keeps the tax mapping link alive.
      await updateDoc(doc(db, 'categories', legacyVa.id!), { name: OUTSOURCING });
      outsourcingId = legacyVa.id;
      result.categoryRenamed = true;
    } else if (legacyVa && existingOutsourcing) {
      // Both exist (e.g. migration partially ran before). Retire the legacy one
      // rather than deleting it, so nothing referencing it breaks.
      await updateDoc(doc(db, 'categories', legacyVa.id!), { active: false });
      result.notes.push(
        `Both "${OLD_VA_CATEGORY}" and "${OUTSOURCING}" existed; deactivated the legacy one.`
      );
    } else if (!existingOutsourcing) {
      const created = await addDoc(collection(db, 'categories'), {
        userId,
        name: OUTSOURCING,
        ledger: 'Business',
        type: 'Expense',
        active: true,
        displayOrder: businessCats.length,
      } as Omit<CategoryDocument, 'id'>);
      outsourcingId = created.id;
      result.outsourcingCreated = true;
    }

    // Make sure the surviving Outsourcing category is active.
    if (outsourcingId) {
      const surviving = businessCats.find(c => c.id === outsourcingId);
      if (surviving && surviving.active === false) {
        await updateDoc(doc(db, 'categories', outsourcingId), { active: true });
      }
    }

    // ── 2. Business Funding income category ──────────────────────────────────
    const hasBusinessFunding = businessCats.some(
      c => c.name?.trim().toLowerCase() === BUSINESS_FUNDING.toLowerCase() && c.type === 'Income'
    );
    if (!hasBusinessFunding) {
      await addDoc(collection(db, 'categories'), {
        userId,
        name: BUSINESS_FUNDING,
        ledger: 'Business',
        type: 'Income',
        active: true,
        displayOrder: businessCats.length + 1,
      } as Omit<CategoryDocument, 'id'>);
      result.businessFundingCreated = true;
    }

    // ── 3. Re-point existing transactions ────────────────────────────────────
    const txQ = query(
      collection(db, 'Transactions'),
      where('userId', '==', userId),
      where('category', '==', OLD_VA_CATEGORY)
    );
    const txSnap = await getDocs(txQ);
    if (!txSnap.empty) {
      // Firestore caps a batch at 500 writes.
      const docsToUpdate = txSnap.docs;
      for (let i = 0; i < docsToUpdate.length; i += 400) {
        const batch = writeBatch(db);
        docsToUpdate.slice(i, i + 400).forEach(d => {
          batch.update(doc(db, 'Transactions', d.id), { category: OUTSOURCING });
        });
        await batch.commit();
      }
      result.transactionsRecategorized = docsToUpdate.length;
    }

    // ── 4. Proposed tax mapping — seeded as NOT VERIFIED ─────────────────────
    if (outsourcingId) {
      const mapQ = query(collection(db, 'taxMappings'), where('userId', '==', userId));
      const mapSnap = await getDocs(mapQ);
      const existing = mapSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as TaxMappingDocument) }))
        .find(
          m =>
            m.businessCategoryId === outsourcingId ||
            m.businessCategoryName?.trim().toLowerCase() === OUTSOURCING.toLowerCase() ||
            m.businessCategoryName?.trim().toLowerCase() === OLD_VA_CATEGORY.toLowerCase()
        );

      if (!existing) {
        const mapping: Omit<TaxMappingDocument, 'id'> = {
          userId,
          businessCategoryId: outsourcingId,
          businessCategoryName: OUTSOURCING,
          taxYear: new Date().getFullYear().toString(),
          ...OUTSOURCING_TAX_MAPPING,
          status: 'Not Verified',
          active: true,
          notes: '',
          lastUpdated: Date.now(),
          updatedBy: userId,
        };
        await addDoc(collection(db, 'taxMappings'), mapping);
        result.taxMappingSeeded = true;
      } else if (existing.status === 'Verified') {
        // Never touch a mapping the user has already approved.
        result.notes.push('Outsourcing tax mapping is already Verified; left untouched.');
      } else {
        // Fill in only the fields that are still blank, and keep it Not Verified.
        const updates: Partial<TaxMappingDocument> = {};
        if (!existing.taxCategory?.trim()) updates.taxCategory = OUTSOURCING_TAX_MAPPING.taxCategory;
        if (!existing.taxForm?.trim()) updates.taxForm = OUTSOURCING_TAX_MAPPING.taxForm;
        if (!existing.taxSection?.trim()) updates.taxSection = OUTSOURCING_TAX_MAPPING.taxSection;
        if (!existing.taxActMapping?.trim()) updates.taxActMapping = OUTSOURCING_TAX_MAPPING.taxActMapping;
        if (existing.businessCategoryName !== OUTSOURCING) updates.businessCategoryName = OUTSOURCING;
        if (existing.businessCategoryId !== outsourcingId) updates.businessCategoryId = outsourcingId;

        if (Object.keys(updates).length > 0) {
          updates.lastUpdated = Date.now();
          await updateDoc(doc(db, 'taxMappings', existing.id!), updates);
          result.taxMappingSeeded = true;
        }
      }
    }

    localStorage.setItem(MIGRATION_KEY(userId), 'true');
  } catch (error) {
    console.error('Module 5 migration failed:', error);
    result.notes.push(
      `Migration error: ${error instanceof Error ? error.message : String(error)}`
    );
    // Deliberately not setting the localStorage guard, so it retries next load.
  }

  return result;
}
