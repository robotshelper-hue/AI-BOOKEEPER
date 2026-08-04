import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { CategoryDocument } from './types';

export const defaultCategories = [
  // Personal Expenses (PHP)
  { name: 'Groceries', ledger: 'Personal', type: 'Expense' },
  { name: 'Market', ledger: 'Personal', type: 'Expense' },
  { name: 'Restaurants', ledger: 'Personal', type: 'Expense' },
  { name: 'Transportation', ledger: 'Personal', type: 'Expense' },
  { name: 'Fuel', ledger: 'Personal', type: 'Expense' },
  { name: 'Electricity', ledger: 'Personal', type: 'Expense' },
  { name: 'Water', ledger: 'Personal', type: 'Expense' },
  { name: 'Internet', ledger: 'Personal', type: 'Expense' },
  { name: 'Mobile Phone', ledger: 'Personal', type: 'Expense' },
  { name: 'Rent', ledger: 'Personal', type: 'Expense' },
  { name: 'Medical', ledger: 'Personal', type: 'Expense' },
  { name: 'Pharmacy', ledger: 'Personal', type: 'Expense' },
  { name: 'Clothing', ledger: 'Personal', type: 'Expense' },
  { name: 'Household Supplies', ledger: 'Personal', type: 'Expense' },
  { name: 'Entertainment', ledger: 'Personal', type: 'Expense' },
  { name: 'Gifts', ledger: 'Personal', type: 'Expense' },
  { name: 'Education', ledger: 'Personal', type: 'Expense' },
  { name: 'Savings', ledger: 'Personal', type: 'Expense' },
  { name: 'Miscellaneous', ledger: 'Personal', type: 'Expense' },

  // Business Income (USD)
  { name: 'AI Appointment Setting', ledger: 'Business', type: 'Income' },
  { name: 'Social Media Video Services', ledger: 'Business', type: 'Income' },
  { name: 'AI Automation', ledger: 'Business', type: 'Income' },
  { name: 'Consulting', ledger: 'Business', type: 'Income' },
  { name: 'Affiliate Income', ledger: 'Business', type: 'Income' },
  { name: 'Other Business Income', ledger: 'Business', type: 'Income' },

  // Business Expenses (USD)
  { name: 'Software', ledger: 'Business', type: 'Expense' },
  { name: 'AI Services', ledger: 'Business', type: 'Expense' },
  { name: 'Hosting', ledger: 'Business', type: 'Expense' },
  { name: 'Domains', ledger: 'Business', type: 'Expense' },
  { name: 'Email Services', ledger: 'Business', type: 'Expense' },
  { name: 'Automation Tools', ledger: 'Business', type: 'Expense' },
  { name: 'Advertising', ledger: 'Business', type: 'Expense' },
  { name: 'Marketing', ledger: 'Business', type: 'Expense' },
  { name: 'Developers', ledger: 'Business', type: 'Expense' },
  { name: 'Virtual Assistants', ledger: 'Business', type: 'Expense' },
  { name: 'Office Supplies', ledger: 'Business', type: 'Expense' },
  { name: 'Computer Equipment', ledger: 'Business', type: 'Expense' },
  { name: 'Internet', ledger: 'Business', type: 'Expense' },
  { name: 'Phone', ledger: 'Business', type: 'Expense' },
  { name: 'Travel', ledger: 'Business', type: 'Expense' },
  { name: 'Meals', ledger: 'Business', type: 'Expense' },
  { name: 'Bank Fees', ledger: 'Business', type: 'Expense' },
  { name: 'Legal', ledger: 'Business', type: 'Expense' },
  { name: 'Accounting', ledger: 'Business', type: 'Expense' },
  { name: 'Insurance', ledger: 'Business', type: 'Expense' },
  { name: 'Miscellaneous', ledger: 'Business', type: 'Expense' }
];

export async function seedCategoriesIfEmpty(userId: string) {
  if (localStorage.getItem(`seeded_categories_${userId}`)) {
    return;
  }
  localStorage.setItem(`seeded_categories_${userId}`, 'true');
  
  try {
    const batch = writeBatch(db);
    defaultCategories.forEach((cat, index) => {
      const docRef = doc(collection(db, 'categories'));
      const catDoc: Omit<CategoryDocument, 'id'> = {
        userId,
        name: cat.name,
        ledger: cat.ledger as any,
        type: cat.type as any,
        active: true,
        displayOrder: index
      };
      batch.set(docRef, catDoc);
    });
    await batch.commit();
    console.log("Categories seeded successfully.");
  } catch (error) {
    console.error("Error seeding categories:", error);
  }
}
