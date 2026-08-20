import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CategoryDocument, TaxMappingDocument } from '../types';
import { Save, Check, AlertCircle, RotateCcw } from 'lucide-react';

export default function TaxMappingManager() {
  const { currentUser } = useAuth();
  const [mappings, setMappings] = useState<TaxMappingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const resetAllMappings = async () => {
    if (!currentUser) return;
    if (!window.confirm('This will reset ALL tax mappings to "Not Verified" and clear all TaxAct Mapping values. Are you sure?')) return;
    setResetting(true);
    try {
      const mapQ = query(collection(db, 'taxMappings'), where('userId', '==', currentUser.uid));
      const mapSnap = await getDocs(mapQ);
      for (const docSnap of mapSnap.docs) {
        await updateDoc(doc(db, 'taxMappings', docSnap.id), {
          taxActMapping: '',
          status: 'Not Verified',
          lastUpdated: Date.now()
        });
      }
      // Refresh the list
      setMappings(prev => prev.map(m => ({ ...m, taxActMapping: '', status: 'Not Verified' as const })));
      alert(`Done! ${mapSnap.size} mapping(s) reset to Not Verified.`);
    } catch (error) {
      console.error('Error resetting mappings:', error);
      alert('Failed to reset mappings. Check console for details.');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    async function fetchMappings() {
      if (!currentUser) return;
      try {
        // Fetch all business categories
        const catQ = query(collection(db, 'categories'), where('userId', '==', currentUser.uid), where('ledger', '==', 'Business'));
        const catSnap = await getDocs(catQ);
        const categories = catSnap.docs.map(d => ({ id: d.id, ...d.data() } as CategoryDocument));

        // Fetch existing mappings
        const mapQ = query(collection(db, 'taxMappings'), where('userId', '==', currentUser.uid));
        const mapSnap = await getDocs(mapQ);
        const existingMappings = mapSnap.docs.map(d => ({ id: d.id, ...d.data() } as TaxMappingDocument));

        const mergedMappings: TaxMappingDocument[] = [];
        const currentYear = new Date().getFullYear().toString();

        for (const cat of categories) {
          let mapping = existingMappings.find(m => m.businessCategoryId === cat.id);
          if (!mapping) {
            // Create a stub for new mapping (will be saved when edited)
            mapping = {
              userId: currentUser.uid,
              businessCategoryId: cat.id!,
              businessCategoryName: cat.name,
              taxYear: currentYear,
              taxForm: '',
              taxSection: '',
              taxCategory: '',
              taxActMapping: '',
              status: 'Not Verified',
              active: true,
              notes: '',
              lastUpdated: Date.now(),
              updatedBy: currentUser.uid
            };
          }
          mergedMappings.push(mapping);
        }

        setMappings(mergedMappings);
      } catch (error) {
        console.error("Error fetching tax mappings:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchMappings();
  }, [currentUser]);

  /**
   * Marking a mapping Verified is what releases its tax fields into the tax
   * export, so it gets an explicit confirmation showing exactly what is being
   * approved. Every other status change saves immediately, as before.
   */
  const handleStatusChange = (mapping: TaxMappingDocument, nextStatus: TaxMappingDocument['status']) => {
    if (nextStatus === 'Verified' && mapping.status !== 'Verified') {
      const proposal =
        `${mapping.businessCategoryName} as ${mapping.taxCategory || 'an unspecified tax category'} ` +
        `on ${mapping.taxForm || 'an unspecified form'}` +
        `${mapping.taxSection ? `, ${mapping.taxSection}` : ''}` +
        `${mapping.taxActMapping ? `, ${mapping.taxActMapping}` : ''}`;
      if (!window.confirm(
        `You are verifying ${proposal}.\n\n` +
        `Once verified, these tax fields will be included in your Business Tax Preparation CSV.\n\n` +
        `Mark this mapping as Verified?`
      )) {
        return;
      }
    }
    handleUpdate(mapping, { status: nextStatus });
  };

  const handleUpdate = async (mapping: TaxMappingDocument, updates: Partial<TaxMappingDocument>) => {
    if (!currentUser) return;
    setSaving(mapping.businessCategoryId);
    try {
      const newMapping = { ...mapping, ...updates, lastUpdated: Date.now() };
      if (mapping.id) {
        await updateDoc(doc(db, 'taxMappings', mapping.id), updates);
        setMappings(mappings.map(m => m.id === mapping.id ? newMapping : m));
      } else {
        const docRef = await addDoc(collection(db, 'taxMappings'), newMapping);
        setMappings(mappings.map(m => m.businessCategoryId === mapping.businessCategoryId ? { ...newMapping, id: docRef.id } : m));
      }
    } catch (error) {
      console.error("Error updating mapping:", error);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="text-center py-8">Loading tax mappings...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold mb-1">Tax Mapping Rules</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Do NOT guess or invent TaxAct field names.</li>
            <li>Leave TaxAct Mapping blank unless specifically verified.</li>
            <li>Only Administrator can mark as Verified.</li>
          </ul>
        </div>
        <button
          onClick={resetAllMappings}
          disabled={resetting}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
          {resetting ? 'Resetting...' : 'Reset All Mappings'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 font-medium">Business Category</th>
              <th className="px-4 py-3 font-medium">Tax Category</th>
              <th className="px-4 py-3 font-medium">TaxAct Mapping</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 border border-gray-200">
            {mappings.map((mapping) => (
              <tr key={mapping.businessCategoryId} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {mapping.businessCategoryName}
                  <div className="flex gap-1.5 mt-1.5">
                    <input
                      type="text"
                      value={mapping.taxForm}
                      onChange={(e) => setMappings(mappings.map(m => m.businessCategoryId === mapping.businessCategoryId ? { ...m, taxForm: e.target.value } : m))}
                      onBlur={(e) => handleUpdate(mapping, { taxForm: e.target.value })}
                      placeholder="Tax Form (e.g. Schedule C)"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs font-normal px-2 py-1 border"
                    />
                    <input
                      type="text"
                      value={mapping.taxSection}
                      onChange={(e) => setMappings(mappings.map(m => m.businessCategoryId === mapping.businessCategoryId ? { ...m, taxSection: e.target.value } : m))}
                      onBlur={(e) => handleUpdate(mapping, { taxSection: e.target.value })}
                      placeholder="Tax Section"
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs font-normal px-2 py-1 border"
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={mapping.taxCategory}
                    onChange={(e) => setMappings(mappings.map(m => m.businessCategoryId === mapping.businessCategoryId ? { ...m, taxCategory: e.target.value } : m))}
                    onBlur={(e) => handleUpdate(mapping, { taxCategory: e.target.value })}
                    placeholder="e.g. Advertising"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1.5 border"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={mapping.taxActMapping}
                    onChange={(e) => setMappings(mappings.map(m => m.businessCategoryId === mapping.businessCategoryId ? { ...m, taxActMapping: e.target.value } : m))}
                    onBlur={(e) => handleUpdate(mapping, { taxActMapping: e.target.value })}
                    placeholder="e.g. Schedule C Line 8"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-2 py-1.5 border"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <select
                      value={mapping.status}
                      onChange={(e) => handleStatusChange(mapping, e.target.value as TaxMappingDocument['status'])}
                      className={`text-xs rounded-full border px-2 py-1 focus:ring-1 focus:ring-indigo-500 cursor-pointer ${
                        mapping.status === 'Verified' ? 'bg-green-50 border-green-200 text-green-700' :
                        mapping.status === 'Needs Review' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                        'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      <option value="Not Verified">Not Verified</option>
                      <option value="Needs Review">Needs Review</option>
                      <option value="Verified">Verified</option>
                    </select>
                    {saving === mapping.businessCategoryId && <div className="w-3 h-3 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
