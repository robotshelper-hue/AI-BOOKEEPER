import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CategoryDocument, TaxMappingDocument } from '../types';
import { AlertCircle, CheckCircle2, Download, Filter, ChevronRight, FileText } from 'lucide-react';

export default function TaxCenter() {
  const { currentUser } = useAuth();
  const [taxYear, setTaxYear] = useState<string>(new Date().getFullYear().toString());
  const [transactions, setTransactions] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, TaxMappingDocument>>({});
  const [categories, setCategories] = useState<Record<string, CategoryDocument>>({});
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'dashboard' | 'income' | 'expenses' | 'export'>('dashboard');

  // Filters for reports
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');

  // Filters for export
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportCategory, setExportCategory] = useState<string>('');
  const [exportType, setExportType] = useState<'All' | 'Income' | 'Expenses'>('All');

  const availableYears = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - 2 + i).toString());

  useEffect(() => {
    async function fetchData() {
      if (!currentUser) return;
      setLoading(true);
      try {
        // Fetch all business transactions
        const txQ = query(
          collection(db, 'Transactions'),
          where('userId', '==', currentUser.uid),
          where('ledger', '==', 'Business')
        );
        const txSnap = await getDocs(txQ);
        const allTx = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Fetch tax mappings
        const mapQ = query(collection(db, 'taxMappings'), where('userId', '==', currentUser.uid));
        const mapSnap = await getDocs(mapQ);
        const mapDict: Record<string, TaxMappingDocument> = {};
        mapSnap.docs.forEach(d => {
          const m = d.data() as TaxMappingDocument;
          mapDict[m.businessCategoryId] = { id: d.id, ...m };
          mapDict[m.businessCategoryName] = { id: d.id, ...m }; // allow lookup by name for old txs without cat ID
        });
        setMappings(mapDict);

        // Fetch categories
        const catQ = query(collection(db, 'categories'), where('userId', '==', currentUser.uid), where('ledger', '==', 'Business'));
        const catSnap = await getDocs(catQ);
        const catDict: Record<string, CategoryDocument> = {};
        catSnap.docs.forEach(d => {
          const c = d.data() as CategoryDocument;
          catDict[d.id] = { id: d.id, ...c };
          catDict[c.name] = { id: d.id, ...c };
        });
        setCategories(catDict);

        setTransactions(allTx);
      } catch (error) {
        console.error("Error fetching tax data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentUser]);

  // Filter transactions by tax year
  const yearTxs = transactions.filter(tx => {
    const txYear = tx.date ? tx.date.substring(0, 4) : new Date(tx.timestamp).getFullYear().toString();
    return txYear === taxYear;
  });

  const incomeTxs = yearTxs.filter(tx => tx.type === 'Income');
  const expenseTxs = yearTxs.filter(tx => tx.type === 'Expense');

  const totalIncome = incomeTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalExpense = expenseTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const applyFilters = (txs: any[]) => {
    return txs.filter(tx => {
      const txDate = tx.date || new Date(tx.timestamp).toISOString().split('T')[0];
      if (filterCategory && tx.category !== filterCategory && tx.categoryId !== filterCategory) return false;
      if (filterStartDate && txDate < filterStartDate) return false;
      if (filterEndDate && txDate > filterEndDate) return false;
      if (filterEntity) {
        const entity = (tx.vendor || tx.client || '').toLowerCase();
        if (!entity.includes(filterEntity.toLowerCase())) return false;
      }
      return true;
    });
  };

  const filteredIncomeTxs = applyFilters(incomeTxs);
  const filteredExpenseTxs = applyFilters(expenseTxs);

  // Find transactions needing review
  const needsReview = yearTxs.filter(tx => {
    if (!tx.category) return true; // Uncategorized
    if (!tx.date && !tx.timestamp) return true; // Missing date
    if (!tx.amount && tx.amount !== 0) return true; // Missing amount
    const cat = categories[tx.category] || categories[tx.categoryId];
    if (cat && !cat.active) return true; // Inactive category
    
    const mapping = mappings[tx.category] || mappings[tx.categoryId];
    if (!mapping) return true; // No tax mapping
    if (mapping.status !== 'Verified') return true; // Unverified mapping
    
    return false;
  });

  const exportCSV = () => {
    // CSV Export logic
    const headers = [
      'Date', 'Tax Year', 'Transaction Type', 'Amount', 'Currency', 
      'Vendor/Client', 'Description', 'Category', 'Tax Category', 
      'Tax Form', 'Tax Section', 'TaxAct Mapping', 'Notes'
    ].join(',');

    const txsToExport = yearTxs.filter(tx => {
      const txDate = tx.date || new Date(tx.timestamp).toISOString().split('T')[0];
      if (exportType === 'Income' && tx.type !== 'Income') return false;
      if (exportType === 'Expenses' && tx.type !== 'Expense') return false;
      if (exportCategory && tx.category !== exportCategory && tx.categoryId !== exportCategory) return false;
      if (exportStartDate && txDate < exportStartDate) return false;
      if (exportEndDate && txDate > exportEndDate) return false;
      return true;
    });

    const rows = txsToExport.map(tx => {
      const txYear = tx.date ? tx.date.substring(0, 4) : new Date(tx.timestamp).getFullYear().toString();
      const mapping = mappings[tx.category] || mappings[tx.categoryId] || {} as Partial<TaxMappingDocument>;
      // Priority 8: Only include tax mapping fields if the mapping is Verified
      const isVerified = mapping.status === 'Verified';
      
      const cols = [
        tx.date || new Date(tx.timestamp).toISOString().split('T')[0],
        txYear,
        tx.type,
        tx.amount,
        tx.currency || 'USD',
        (tx.type === 'Income' ? tx.client : tx.vendor) || '',
        `"${(tx.description || '').replace(/"/g, '""')}"`,
        `"${tx.category || ''}"`,
        `"${isVerified ? (mapping.taxCategory || '') : ''}"`,
        `"${isVerified ? (mapping.taxForm || '') : ''}"`,
        `"${isVerified ? (mapping.taxSection || '') : ''}"`,
        `"${isVerified ? (mapping.taxActMapping || '') : ''}"`,
        `"${tx.notes || ''}"`
      ];
      return cols.join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Business_Tax_Preparation_${taxYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div className="text-center py-8">Loading tax data...</div>;

  const FilterBar = () => (
    <div className="p-4 bg-white border-b border-gray-200 flex flex-wrap gap-4 items-end">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Date Range</label>
        <div className="flex items-center gap-2">
          <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500" />
          <span className="text-gray-400">-</span>
          <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 min-w-[150px]">
          <option value="">All Categories</option>
          {Object.values(categories)
            .filter(c => c.active && (activeView === 'income' ? c.type === 'Income' : c.type === 'Expense'))
            .map(c => <option key={c.id} value={c.name}>{c.name}</option>)
          }
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{activeView === 'income' ? 'Client' : 'Vendor'}</label>
        <input type="text" placeholder="Search..." value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 w-40" />
      </div>
      {(filterCategory || filterStartDate || filterEndDate || filterEntity) && (
        <button onClick={() => {
          setFilterCategory('');
          setFilterStartDate('');
          setFilterEndDate('');
          setFilterEntity('');
        }} className="text-sm text-gray-500 hover:text-gray-700 underline mb-1.5">Clear Filters</button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex gap-2">
          {['dashboard', 'income', 'expenses', 'export'].map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeView === view ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Tax Year:</label>
          <select
            value={taxYear}
            onChange={e => setTaxYear(e.target.value)}
            className="rounded-lg border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:ring-indigo-500 focus:border-indigo-500 border shadow-sm"
          >
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {activeView === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Total Business Income</h3>
              <p className="text-3xl font-bold text-gray-900">${totalIncome.toFixed(2)}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Total Business Expenses</h3>
              <p className="text-3xl font-bold text-gray-900">${totalExpense.toFixed(2)}</p>
            </div>
            <div className={`p-6 rounded-xl border shadow-sm ${netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <h3 className={`text-sm font-medium mb-1 ${netProfit >= 0 ? 'text-green-800' : 'text-red-800'}`}>Net Business Profit</h3>
              <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                ${netProfit.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-yellow-500" />
                Tax Review Dashboard
              </h3>
              <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {needsReview.length} Items Require Review
              </span>
            </div>
            {needsReview.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                <p className="font-medium text-gray-900">All clear!</p>
                <p>No unmapped or unverified transactions for {taxYear}.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {needsReview.map(tx => {
                  const mapping = mappings[tx.category] || mappings[tx.categoryId];
                  let issue = "Missing Category";
                  if (!tx.date && !tx.timestamp) {
                    issue = "Missing Date";
                  } else if (!tx.amount && tx.amount !== 0) {
                    issue = "Missing Amount";
                  } else if (!tx.category) {
                    issue = "Missing Category";
                  } else if (tx.category && (!mapping || mapping.status !== 'Verified')) {
                    issue = mapping ? "Tax Mapping Not Verified" : "Missing Tax Mapping";
                  }
                  
                  return (
                    <li key={tx.id} className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="font-medium text-gray-900">{tx.description || 'No Description'}</div>
                        <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-4">
                          <span>{tx.date || (tx.timestamp ? new Date(tx.timestamp).toISOString().split('T')[0] : 'No Date')}</span>
                          <span className="font-medium text-gray-700">${tx.amount != null ? Number(tx.amount).toFixed(2) : 'N/A'}</span>
                          <span className="text-red-600 font-medium text-xs bg-red-50 px-2 py-0.5 rounded-md border border-red-100">{issue}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-md text-gray-600 border border-gray-200">
                            Category: {tx.category || 'None'}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-sm flex items-center gap-2">
                         {!tx.category ? (
                           <select 
                             className="rounded-lg border-gray-300 py-1 pl-2 pr-6 text-xs focus:ring-indigo-500 focus:border-indigo-500 border shadow-sm"
                             onChange={async (e) => {
                               const catName = e.target.value;
                               if (!catName) return;
                               await updateDoc(doc(db, 'Transactions', tx.id), { category: catName });
                               setTransactions(transactions.map(t => t.id === tx.id ? { ...t, category: catName } : t));
                             }}
                             value=""
                           >
                             <option value="">Assign Category...</option>
                             {Object.values(categories).filter(c => c.type === tx.type && c.active).map(c => (
                               <option key={c.id} value={c.name}>{c.name}</option>
                             ))}
                           </select>
                         ) : (
                           <span className="text-gray-500 italic text-xs">
                             Update mapping in Tax Mapping tab
                           </span>
                         )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeView === 'income' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Business Income ({taxYear})</h3>
          </div>
          <FilterBar />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIncomeTxs.map(tx => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{tx.date || new Date(tx.timestamp).toISOString().split('T')[0]}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{tx.client || '-'}</td>
                    <td className="px-4 py-3">{tx.description}</td>
                    <td className="px-4 py-3 text-gray-600">{tx.category}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">${Number(tx.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'expenses' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Business Expenses ({taxYear})</h3>
          </div>
          <FilterBar />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Tax Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenseTxs.map(tx => {
                  const mapping = mappings[tx.category] || mappings[tx.categoryId];
                  return (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{tx.date || new Date(tx.timestamp).toISOString().split('T')[0]}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{tx.vendor || '-'}</td>
                      <td className="px-4 py-3">{tx.description}</td>
                      <td className="px-4 py-3 text-gray-600">{tx.category}</td>
                      <td className="px-4 py-3 text-indigo-600">{mapping?.taxCategory || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">${Number(tx.amount).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'export' && (
        <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm text-center max-w-2xl mx-auto mt-8">
          <FileText className="w-16 h-16 text-indigo-200 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Business Tax Preparation CSV</h2>
          <p className="text-gray-500 mb-8">
            Generate a comprehensive CSV report for the {taxYear} tax year containing business transactions,
            complete with mapped tax categories and TaxAct forms.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto mb-8 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Export Type</label>
              <select value={exportType} onChange={e => setExportType(e.target.value as any)} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="All">All Transactions</option>
                <option value="Income">Income Only</option>
                <option value="Expenses">Expenses Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={exportCategory} onChange={e => setExportCategory(e.target.value)} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">All Categories</option>
                {Object.values(categories).filter(c => c.active).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (Optional)</label>
              <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date (Optional)</label>
              <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border bg-white" />
            </div>
          </div>
          
          {needsReview.length > 0 && (
            <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left text-sm text-yellow-800 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Validation Warning</p>
                <p>
                  You have {needsReview.length} transactions that need review (missing categories or unverified mappings).
                  It is highly recommended to fix these in the Dashboard before exporting.
                </p>
              </div>
            </div>
          )}

          <button
            onClick={exportCSV}
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            Download {taxYear} Business Tax Preparation CSV
          </button>
          
          <p className="text-xs text-gray-400 mt-6 max-w-md mx-auto">
            This export contains structured data designed for tax preparation. 
            It strictly excludes all personal ledger transactions.
          </p>
        </div>
      )}
    </div>
  );
}
