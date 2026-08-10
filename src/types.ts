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

export interface TransactionDocument {
  id?: string;
  userId: string;
  ledger: 'Personal' | 'Business';
  type: 'Income' | 'Expense';
  amount: number;
  currency: 'PHP' | 'USD';
  category: string;
  vendor: string | null;
  client: string | null;
  description: string | null;
  notes: string | null;
  date: string; // 'YYYY-MM-DD'
  timestamp: number;
  sourceRecurringScheduleId?: string | null;
}

export interface RecurringScheduleDocument {
  id?: string;
  userId: string;
  ledger: 'Personal' | 'Business';
  type: 'Income' | 'Expense';
  amount: number;
  currency: 'PHP' | 'USD';
  category: string;
  vendor: string | null;
  client: string | null;
  description: string | null;
  notes: string | null;
  frequency: 'monthly';
  dayOfMonth: number; // 1-31, clamped to the last day of shorter months
  startDate: string; // 'YYYY-MM-DD', first occurrence
  nextOccurrenceDate: string; // 'YYYY-MM-DD', next date to generate
  lastGeneratedDate: string | null;
  active: boolean;
  createdBy: 'user' | 'ai';
  createdAt: number;
  updatedAt: number;
}
