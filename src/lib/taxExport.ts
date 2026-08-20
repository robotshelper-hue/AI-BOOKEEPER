import { TaxMappingDocument } from '../types';

/**
 * The verification gate on tax export columns.
 *
 * The rule, unchanged since Module 3 and reaffirmed by Module 5:
 *   Not Verified -> tax fields blank
 *   Verified     -> tax fields included
 *
 * Extracted from TaxCenter's exportCSV so the guarantee can be tested directly
 * rather than only through a browser download. Behaviour is identical to the
 * inline version it replaces.
 */
export function taxColumnsFor(
  mapping: Partial<TaxMappingDocument> | undefined | null
): [string, string, string, string] {
  const isVerified = mapping?.status === 'Verified';
  return [
    isVerified ? (mapping?.taxCategory || '') : '',
    isVerified ? (mapping?.taxForm || '') : '',
    isVerified ? (mapping?.taxSection || '') : '',
    isVerified ? (mapping?.taxActMapping || '') : '',
  ];
}
