import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Settings as SettingsIcon, Plus, Save, X, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CategoryDocument } from '../types';
import TaxMappingManager from '../components/TaxMappingManager';
import TaxCenter from '../components/TaxCenter';

export default function Settings() {
  const { ledger } = useParams<{ ledger: string }>();
  const isBusiness = ledger === 'business';
  const [activeTab, setActiveTab] = useState<'categories' | 'clients' | 'ai settings' | 'tax center' | 'tax mapping'>('categories');

  const tabs = isBusiness 
    ? ['Categories', 'Clients', 'AI Settings', 'Tax Center', 'Tax Mapping']
    : ['Categories', 'AI Settings'];

  return (
    <div className="max-w-4xl w-full mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <SettingsIcon className="w-8 h-8 mr-3 text-indigo-600" />
            Settings
          </h1>
          <p className="text-gray-500 mt-1">
            Manage preferences for your {ledger} ledger.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            {tabs.map((tab) => {
              const tabId = tab.toLowerCase() as typeof activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tabId)}
                  className={`
                    flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm
                    ${activeTab === tabId
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'categories' && <CategoryManager ledger={ledger as string} />}
          {activeTab === 'clients' && <div className="text-gray-500 text-center py-8">Clients Manager Coming Soon</div>}
          {activeTab === 'ai settings' && <div className="text-gray-500 text-center py-8">AI Settings Coming Soon</div>}
          {activeTab === 'tax center' && <TaxCenter />}
          {activeTab === 'tax mapping' && <TaxMappingManager />}
        </div>
      </div>
    </div>
  );
}

function CategoryManager({ ledger }: { ledger: string }) {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  const [newCategory, setNewCategory] = useState<Partial<CategoryDocument>>({
    name: '',
    type: 'Expense',
    active: true,
    displayOrder: 0
  });

  useEffect(() => {
    fetchCategories();
  }, [ledger, currentUser]);

  async function fetchCategories() {
    if (!currentUser) return;
    try {
      const normalizedLedger = ledger ? ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase() : 'Personal';
      const q = query(
        collection(db, 'categories'),
        where('userId', '==', currentUser.uid),
        where('ledger', '==', normalizedLedger),
        orderBy('displayOrder', 'asc')
      );
      let snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        const { seedCategoriesIfEmpty } = await import('../seedCategories');
        await seedCategoriesIfEmpty(currentUser.uid);
        snapshot = await getDocs(q);
      }
      
      const allCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CategoryDocument));
      
      // Deduplicate by name + type (a name like "Business Funding" can legitimately
      // exist once as Income and once as Expense — only an exact name+type repeat
      // is a real duplicate).
      const seenKeys = new Set<string>();
      const deduplicatedCats: CategoryDocument[] = [];
      const duplicatesToDelete: string[] = [];

      for (const cat of allCats) {
        const key = `${cat.name.trim().toLowerCase()}::${cat.type}`;
        if (seenKeys.has(key)) {
          if (cat.id) duplicatesToDelete.push(cat.id);
        } else {
          seenKeys.add(key);
          deduplicatedCats.push(cat);
        }
      }

      setCategories(deduplicatedCats);

      // Async delete duplicates in background
      if (duplicatesToDelete.length > 0) {
        console.log(`Deleting ${duplicatesToDelete.length} duplicate categories...`);
        duplicatesToDelete.forEach(id => {
          deleteDoc(doc(db, 'categories', id)).catch(console.error);
        });
      }

    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!currentUser || !newCategory.name) return;
    try {
      const normalizedLedger = ledger ? ledger.charAt(0).toUpperCase() + ledger.slice(1).toLowerCase() : 'Personal';
      const cat: Omit<CategoryDocument, 'id'> = {
        userId: currentUser.uid,
        name: newCategory.name,
        ledger: normalizedLedger as any,
        type: newCategory.type as any,
        active: newCategory.active ?? true,
        displayOrder: newCategory.displayOrder ?? categories.length,
      };
      const docRef = await addDoc(collection(db, 'categories'), cat);
      setCategories([...categories, { id: docRef.id, ...cat }]);
      setNewCategory({ name: '', type: 'Expense', active: true, displayOrder: categories.length + 1 });
    } catch (error) {
      console.error("Error adding category", error);
    }
  }

  async function handleUpdate(id: string, updates: Partial<CategoryDocument>) {
    try {
      await updateDoc(doc(db, 'categories', id), updates);
      setCategories(categories.map(c => c.id === id ? { ...c, ...updates } : c));
      setIsEditing(null);
    } catch (error) {
      console.error("Error updating category", error);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
      setCategories(categories.filter(c => c.id !== id));
    } catch (error) {
      console.error("Error deleting category", error);
    }
  }

  if (loading) return <div className="text-center py-8">Loading categories...</div>;

  const incomeCategories = categories.filter(c => c.type === 'Income');
  const expenseCategories = categories.filter(c => c.type === 'Expense');

  return (
    <div className="space-y-8">
      <div className="flex gap-4 items-end bg-gray-50 p-4 rounded-lg">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">New Category Name</label>
          <input 
            type="text" 
            value={newCategory.name}
            onChange={e => setNewCategory({...newCategory, name: e.target.value})}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            placeholder="e.g. Groceries"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={newCategory.type}
            onChange={e => setNewCategory({...newCategory, type: e.target.value as any})}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          >
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
          </select>
        </div>
        <button 
          onClick={handleAdd}
          disabled={!newCategory.name}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center disabled:opacity-50"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            Income Categories
            <span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">{incomeCategories.length}</span>
          </h3>
          <CategoryList 
            items={incomeCategories} 
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            Expense Categories
            <span className="ml-2 bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">{expenseCategories.length}</span>
          </h3>
          <CategoryList 
            items={expenseCategories} 
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}

function CategoryList({ 
  items, 
  isEditing, 
  setIsEditing, 
  onUpdate, 
  onDelete 
}: { 
  items: CategoryDocument[], 
  isEditing: string | null,
  setIsEditing: (id: string | null) => void,
  onUpdate: (id: string, updates: Partial<CategoryDocument>) => void,
  onDelete: (id: string) => void
}) {
  if (items.length === 0) {
    return <div className="text-gray-500 text-sm border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">No categories yet.</div>;
  }

  return (
    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
      {items.map(category => (
        <li key={category.id} className="bg-white">
          {isEditing === category.id ? (
            <div className="flex items-center p-3 gap-3">
              <input 
                type="text" 
                defaultValue={category.name}
                id={`edit-name-${category.id}`}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1 border"
              />
              <button 
                onClick={() => {
                  const val = (document.getElementById(`edit-name-${category.id}`) as HTMLInputElement).value;
                  onUpdate(category.id!, { name: val });
                }}
                className="text-green-600 hover:text-green-900"
              >
                <Save className="w-4 h-4" />
              </button>
              <button onClick={() => setIsEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3">
              <span className={`text-sm font-medium ${!category.active ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {category.name}
              </span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onUpdate(category.id!, { active: !category.active })}
                  className={`text-xs px-2 py-1 rounded-full ${category.active ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {category.active ? 'Active' : 'Hidden'}
                </button>
                <button onClick={() => setIsEditing(category.id!)} className="text-gray-400 hover:text-indigo-600 p-1">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => onDelete(category.id!)} className="text-gray-400 hover:text-red-600 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
