import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  collection, query, where, getDocs, orderBy,
  addDoc, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { Repeat, Plus, Pause, Play, Edit2, Trash2, Save, X } from 'lucide-react';
import { RecurringScheduleDocument, CategoryDocument } from '../types';
import { nextOccurrenceOnOrAfter, todayDateString } from '../lib/recurrence';
import { generateOccurrencesForSchedule } from '../hooks/useRecurringTransactionGenerator';

export default function RecurringTransactions() {
  const { ledger } = useParams<{ ledger: string }>();
  const { currentUser } = useAuth();
  const normalizedLedger: 'Personal' | 'Business' = ledger === 'business' ? 'Business' : 'Personal';
  const currency = normalizedLedger === 'Personal' ? 'PHP' : 'USD';
  const currencySymbol = currency === 'PHP' ? '₱' : '$';

  const [schedules, setSchedules] = useState<RecurringScheduleDocument[]>([]);
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'RecurringSchedules'),
      where('userId', '==', currentUser.uid),
      where('ledger', '==', normalizedLedger),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    setSchedules(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecurringScheduleDocument)));
  }, [currentUser, normalizedLedger]);

  const fetchCategories = useCallback(async () => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'categories'),
      where('userId', '==', currentUser.uid),
      where('ledger', '==', normalizedLedger),
      where('active', '==', true)
    );
    const snapshot = await getDocs(q);
    setCategories(snapshot.docs.map(d => d.data() as CategoryDocument));
  }, [currentUser, normalizedLedger]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSchedules(), fetchCategories()]).finally(() => setLoading(false));
  }, [fetchSchedules, fetchCategories]);

  async function handleCreate(data: Omit<RecurringScheduleDocument, 'id' | 'userId' | 'ledger' | 'currency' | 'nextOccurrenceDate' | 'lastGeneratedDate' | 'active' | 'createdBy' | 'createdAt' | 'updatedAt' | 'startDate'> & { dayOfMonth: number }) {
    if (!currentUser) return;
    const now = Date.now();
    const startDate = nextOccurrenceOnOrAfter(todayDateString(), data.dayOfMonth);
    const scheduleData: Omit<RecurringScheduleDocument, 'id'> = {
      userId: currentUser.uid,
      ledger: normalizedLedger,
      currency,
      type: data.type,
      amount: data.amount,
      category: data.category,
      vendor: data.vendor,
      client: data.client,
      description: data.description,
      notes: data.notes,
      frequency: 'monthly',
      dayOfMonth: data.dayOfMonth,
      startDate,
      nextOccurrenceDate: startDate,
      lastGeneratedDate: null,
      active: true,
      createdBy: 'user',
      createdAt: now,
      updatedAt: now
    };
    const docRef = await addDoc(collection(db, 'RecurringSchedules'), scheduleData);
    await generateOccurrencesForSchedule(docRef.id);
    await fetchSchedules();
  }

  async function handleToggleActive(schedule: RecurringScheduleDocument) {
    if (!schedule.id) return;
    const updates: Partial<RecurringScheduleDocument> = { updatedAt: Date.now() };
    if (schedule.active) {
      updates.active = false;
    } else {
      // Clean resume: don't backfill the gap while it was stopped, start fresh from today.
      updates.active = true;
      updates.nextOccurrenceDate = nextOccurrenceOnOrAfter(todayDateString(), schedule.dayOfMonth);
    }
    await updateDoc(doc(db, 'RecurringSchedules', schedule.id), updates);
    setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, ...updates } : s));
  }

  async function handleUpdate(schedule: RecurringScheduleDocument, updates: Partial<RecurringScheduleDocument>) {
    if (!schedule.id) return;
    const finalUpdates: Partial<RecurringScheduleDocument> = { ...updates, updatedAt: Date.now() };
    if (typeof updates.dayOfMonth === 'number' && updates.dayOfMonth !== schedule.dayOfMonth && schedule.active) {
      finalUpdates.nextOccurrenceDate = nextOccurrenceOnOrAfter(todayDateString(), updates.dayOfMonth);
    }
    await updateDoc(doc(db, 'RecurringSchedules', schedule.id), finalUpdates);
    setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, ...finalUpdates } : s));
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    await deleteDoc(doc(db, 'RecurringSchedules', id));
    setSchedules(prev => prev.filter(s => s.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div className="max-w-6xl w-full mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Repeat className="w-8 h-8 mr-3 text-indigo-600" />
            Recurring Transactions
          </h1>
          <p className="text-gray-500 mt-1">
            Manage recurring income and expenses for your {ledger} ledger. Due transactions are created automatically when you open the app.
          </p>
        </div>
      </div>

      <NewScheduleForm categories={categories} currencySymbol={currencySymbol} onCreate={handleCreate} />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No recurring transactions set up yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Recurs</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Next / Last</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {schedules.map((schedule) => (
                  editingId === schedule.id ? (
                    <EditScheduleRow
                      key={schedule.id}
                      schedule={schedule}
                      categories={categories}
                      currencySymbol={currencySymbol}
                      onSave={(updates) => handleUpdate(schedule, updates)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={schedule.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${schedule.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {schedule.active ? 'Active' : 'Stopped'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${schedule.type === 'Income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {schedule.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {schedule.category}
                        {(schedule.vendor || schedule.client) && <span className="text-gray-500 ml-2 font-normal">({schedule.vendor || schedule.client})</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        Monthly, day {schedule.dayOfMonth}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {schedule.active ? `Next: ${schedule.nextOccurrenceDate}` : `Stopped (last: ${schedule.lastGeneratedDate || '—'})`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        {currencySymbol}{schedule.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleToggleActive(schedule)}
                            className="text-gray-400 hover:text-indigo-600 p-1"
                            title={schedule.active ? 'Stop' : 'Resume'}
                          >
                            {schedule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setEditingId(schedule.id!)}
                            className="text-gray-400 hover:text-indigo-600 p-1"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!schedule.lastGeneratedDate && (
                            confirmDeleteId === schedule.id ? (
                              <span className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">Sure?</span>
                                <button onClick={() => handleDelete(schedule.id!)} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Yes</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">No</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(schedule.id!)}
                                className="text-gray-400 hover:text-red-600 p-1"
                                title="Delete (only available before it has ever run)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NewScheduleForm({
  categories,
  currencySymbol,
  onCreate
}: {
  categories: CategoryDocument[];
  currencySymbol: string;
  onCreate: (data: { type: 'Income' | 'Expense'; amount: number; category: string; vendor: string | null; client: string | null; description: string | null; notes: string | null; dayOfMonth: number; frequency: 'monthly' }) => Promise<void>;
}) {
  const [type, setType] = useState<'Income' | 'Expense'>('Expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  const filteredCategories = categories.filter(c => c.type === type);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = Number(amount);
    const dayNum = Number(dayOfMonth);
    if (!category || isNaN(amountNum) || amountNum <= 0 || isNaN(dayNum) || dayNum < 1 || dayNum > 31) return;

    setSubmitting(true);
    try {
      await onCreate({
        type,
        amount: amountNum,
        category,
        vendor: vendor || null,
        client: null,
        description: null,
        notes: null,
        dayOfMonth: dayNum,
        frequency: 'monthly'
      });
      setAmount('');
      setVendor('');
      setCategory('');
      setDayOfMonth('1');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
        <Plus className="w-4 h-4 mr-2 text-indigo-600" />
        New Recurring Transaction
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={e => { setType(e.target.value as 'Income' | 'Expense'); setCategory(''); }}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          >
            <option value="Expense">Expense</option>
            <option value="Income">Income</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Amount ({currencySymbol})</label>
          <input
            type="number" min="0" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          >
            <option value="">Select...</option>
            {filteredCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Vendor/Client</label>
          <input
            type="text" value={vendor}
            onChange={e => setVendor(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Day of month</label>
          <input
            type="number" min="1" max="31" value={dayOfMonth}
            onChange={e => setDayOfMonth(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting || !category || !amount}
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center justify-center disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </button>
        </div>
      </div>
    </form>
  );
}

function EditScheduleRow({
  schedule,
  categories,
  currencySymbol,
  onSave,
  onCancel
}: {
  schedule: RecurringScheduleDocument;
  categories: CategoryDocument[];
  currencySymbol: string;
  onSave: (updates: Partial<RecurringScheduleDocument>) => Promise<void>;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(schedule.amount));
  const [category, setCategory] = useState(schedule.category);
  const [dayOfMonth, setDayOfMonth] = useState(String(schedule.dayOfMonth));
  const [saving, setSaving] = useState(false);

  const filteredCategories = categories.filter(c => c.type === schedule.type);

  async function handleSave() {
    const amountNum = Number(amount);
    const dayNum = Number(dayOfMonth);
    if (isNaN(amountNum) || amountNum <= 0 || isNaN(dayNum) || dayNum < 1 || dayNum > 31 || !category) return;
    setSaving(true);
    try {
      await onSave({ amount: amountNum, category, dayOfMonth: dayNum });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={7} className="px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount ({currencySymbol})</label>
            <input
              type="number" min="0" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border w-32"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
            >
              {filteredCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Day of month</label>
            <input
              type="number" min="1" max="31" value={dayOfMonth}
              onChange={e => setDayOfMonth(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border w-24"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-green-600 hover:text-green-900 p-2 disabled:opacity-50"
            title="Save"
          >
            <Save className="w-4 h-4" />
          </button>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-2" title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Changes only affect future occurrences — past transactions are untouched.</p>
      </td>
    </tr>
  );
}
