export interface CategoryDocument {
  id?: string;
  userId: string;
  name: string;
  ledger: 'Personal' | 'Business';
  type: 'Income' | 'Expense';
  active: boolean;
  displayOrder: number;
}

export interface TaxMappingDocument {
  id?: string;
  userId: string;
  businessCategoryId: string;
  businessCategoryName: string;
  taxYear: string;
  taxForm: string;
  taxSection: string;
  taxCategory: string;
  taxActMapping: string;
  status: 'Not Verified' | 'Verified' | 'Needs Review';
  active: boolean;
  notes: string;
  lastUpdated: number;
  updatedBy: string;
}
