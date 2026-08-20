import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Bot, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, addDoc } from 'firebase/firestore';
import { VoiceActivationBanner } from './VoiceActivationBanner';
import { useLiveBookkeeper } from '../hooks/useLiveBookkeeper';
import { generateOccurrencesForSchedule } from '../hooks/useRecurringTransactionGenerator';
import { nextOccurrenceOnOrAfter, todayDateString } from '../lib/recurrence';
import { RecurringScheduleDocument, TaxMappingDocument } from '../types';
import { convertPhpToUsd } from '../lib/exchangeRates';
import { runModule5Migration } from '../lib/module5Migration';
import {
  getReviewQueue,
  getUncategorizedTransactions,
  getPossibleDuplicates,
  getUnverifiedTaxMappings,
  explainTaxMapping,
  searchTransactions,
  getSpendingSummary,
  getExchangeRateInfo,
  describeForVoice,
  VoiceTransaction,
} from '../lib/voiceQueries';

interface UnifiedAgentProps {
  ledger: string;
  userId: string;
}

export default function UnifiedAgentTab({ ledger, userId }: UnifiedAgentProps) {
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [messages, setMessages] = useState<{ id?: string; role: 'user' | 'assistant', content: string, timestamp: number }[]>([]);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionsLoaded, setTransactionsLoaded] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);

  /**
   * Fast Review Mode cursor. Kept in a ref rather than Firestore because it is
   * conversation state, not data: which item we are on only has meaning inside
   * the current session. Holding it here (instead of asking the model to
   * remember its position) is what makes "next" / "go back" / "read that again"
   * deterministic.
   */
  const reviewSessionRef = useRef<{ items: VoiceTransaction[]; index: number } | null>(null);

  const fetchData = useCallback(async () => {
    const qTx = query(
      collection(db, 'Transactions'),
      where('userId', '==', userId),
      where('ledger', '==', ledger === 'personal' ? 'Personal' : 'Business'),
      orderBy('timestamp', 'desc')
    );
    const txSnapshot = await getDocs(qTx);
    const txs = txSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        date: data.date || new Date(data.timestamp).toISOString().split('T')[0],
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        vendor: data.vendor,
        client: data.client,
        description: data.description,
        notes: data.notes,
        timestamp: data.timestamp
      };
    });
    setTransactions(txs);

    const qCat = query(
      collection(db, 'categories'),
      where('userId', '==', userId),
      where('ledger', '==', ledger === 'personal' ? 'Personal' : 'Business'),
      where('active', '==', true)
    );
    try {
      let catSnapshot = await getDocs(qCat);
      
      if (catSnapshot.empty) {
        // No categories found, seed them
        const { seedCategoriesIfEmpty } = await import('../seedCategories');
        await seedCategoriesIfEmpty(userId);
        // Refetch after seeding
        catSnapshot = await getDocs(qCat);
      }

      const cats = catSnapshot.docs.map(doc => doc.data());
      
      const seenNames = new Set<string>();
      const deduplicatedCats = [];
      for (const cat of cats) {
        if (!seenNames.has(cat.name)) {
          seenNames.add(cat.name);
          deduplicatedCats.push(cat);
        }
      }
      setCategories(deduplicatedCats);
    } catch (e) {
      console.error("Error fetching categories", e);
    }

    setTransactionsLoaded(true);
  }, [ledger, userId]);

  // Module 5 consolidates "Virtual Assistants" into the single "Outsourcing"
  // category, adds "Business Funding", and seeds Outsourcing's proposed (Not
  // Verified) tax mapping. It runs once per user and before the first fetch, so
  // the assistant is never handed a stale category list.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (userId) {
        await runModule5Migration(userId);
      }
      if (!cancelled) await fetchData();
    }
    init();
    return () => { cancelled = true; };
  }, [fetchData, userId]);

  const [currentTurnCompleted, setCurrentTurnCompleted] = useState(false);

  const handleLiveMessage = useCallback(async (text: string, isUser: boolean) => {
    if (isUser) {
      const ts = Date.now();
      setMessages(prev => [...prev, { role: 'user', content: text, timestamp: ts }]);
      setCurrentTurnCompleted(false);
      try {
        await addDoc(collection(db, 'AI Conversations'), {
          userId,
          ledger: ledger === 'personal' ? 'Personal' : 'Business',
          role: 'user',
          content: text,
          timestamp: ts
        });
      } catch (e) {
        console.error('Failed to save user message', e);
      }
    } else {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (!currentTurnCompleted && last && last.role === 'assistant' && !last.id) {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            ...last,
            content: last.content + text
          };
          return newMessages;
        } else {
          return [...prev, { role: 'assistant', content: text, timestamp: Date.now() }];
        }
      });
      setCurrentTurnCompleted(false);
    }
  }, [currentTurnCompleted, userId, ledger]);

  const handleTurnComplete = useCallback(async () => {
    setCurrentTurnCompleted(true);
    const currentMessages = messagesRef.current;
    const lastMessage = currentMessages[currentMessages.length - 1];
    
    if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.id) {
      try {
        const docRef = await addDoc(collection(db, 'AI Conversations'), {
          userId,
          ledger: ledger === 'personal' ? 'Personal' : 'Business',
          role: 'assistant',
          content: lastMessage.content,
          timestamp: lastMessage.timestamp || Date.now()
        });
        
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages[newMessages.length - 1] === lastMessage) {
            newMessages[newMessages.length - 1] = { ...lastMessage, id: docRef.id };
          }
          return newMessages;
        });
      } catch (e) {
        console.error('Failed to save AI message', e);
      }
    }
  }, [userId, ledger]);

    const handleToolCall = useCallback(async (name: string, args: any) => {
    console.log("TOOL CALL RECEIVED:", name, args);
    if (!userId) return { error: "User not logged in" };
    try {
      setLoading(true);
      
      
      
      if (name === 'recordTransactions' && args.transactions) {
        // Validate all transactions first
        for (const tx of args.transactions) {
          tx.ledger = tx.ledger ? tx.ledger.charAt(0).toUpperCase() + tx.ledger.slice(1).toLowerCase() : (ledger === 'personal' ? 'Personal' : 'Business');
          tx.type = tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1).toLowerCase() : 'Expense';
          tx.currency = tx.currency ? tx.currency.toUpperCase() : (tx.ledger === 'Personal' ? 'PHP' : 'USD');

          if (!['Personal', 'Business'].includes(tx.ledger) ||
              !['Income', 'Expense'].includes(tx.type) ||
              isNaN(Number(tx.amount)) ||
              !['PHP', 'USD'].includes(tx.currency) ||
              !tx.category) {
            return { error: `Invalid transaction data provided: ${JSON.stringify(tx)}` };
          }

          // The Personal ledger is PHP-only and is never converted, so a USD
          // amount there is a mis-parse rather than something to silently store.
          if (tx.ledger === 'Personal' && tx.currency !== 'PHP') {
            return { error: `Personal transactions must be in PHP. Ask the user whether this ${tx.currency} amount belongs to the Business ledger instead.` };
          }

          const matchedCategory = categories.find(c => c.name.toLowerCase() === tx.category.toLowerCase());
          if (!matchedCategory) {
            return { error: `Category '${tx.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.` };
          }
          tx.category = matchedCategory.name; // enforce exact casing
        }

        let count = 0;
        const newTxIds = [];
        const conversions: string[] = [];
        for (const tx of args.transactions) {
          const date = tx.date || new Date().toISOString().split('T')[0];

          // A Business amount entered in pesos is converted to USD at that
          // date's published rate, keeping the original peso amount and the
          // rate's provenance. Everything downstream (Tax Center totals, the
          // Business Tax Preparation CSV) reads `amount`, so it stays USD.
          let amountFields: Record<string, any> = {
            amount: Number(tx.amount),
            currency: tx.currency,
          };

          if (tx.ledger === 'Business' && tx.currency === 'PHP') {
            try {
              const converted = await convertPhpToUsd(Number(tx.amount), date);
              amountFields = converted;
              conversions.push(
                `₱${Number(tx.amount).toFixed(2)} was converted to $${converted.amount.toFixed(2)} ` +
                `using the rate ${converted.exchangeRate} published for ${converted.exchangeRateDate} ` +
                `(${converted.exchangeRateSource}).`
              );
            } catch (conversionError: any) {
              // Never guess a rate — stop and let the user decide.
              return {
                error:
                  `Could not convert ₱${Number(tx.amount).toFixed(2)} to USD: ${conversionError.message} ` +
                  `Nothing was saved. Tell the user the exchange rate could not be retrieved and ask whether ` +
                  `they want to record the amount directly in USD instead.`
              };
            }
          }

          const docRef = await addDoc(collection(db, 'Transactions'), {
            userId,
            ledger: tx.ledger,
            type: tx.type,
            ...amountFields,
            category: tx.category,
            vendor: tx.vendor || null,
            client: tx.client || null,
            description: tx.description || null,
            notes: tx.notes || null,
            date,
            timestamp: Date.now()
          });
          newTxIds.push(docRef.id);
          count++;
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return {
          result: "Transactions created successfully",
          newTransactionIds: newTxIds,
          ...(conversions.length > 0 ? { currencyConversions: conversions } : {})
        };
      } else if (name === 'createRecurringSchedule') {
        // The AI is instructed (server.ts system prompt) to verbally confirm the
        // amount/category/day with the user and get an explicit yes before ever
        // calling this tool, so — unlike the old card-based flow — it creates
        // (and immediately catches up) the schedule directly, same as recordTransactions.
        const normalizedLedger = args.ledger ? args.ledger.charAt(0).toUpperCase() + args.ledger.slice(1).toLowerCase() : (ledger === 'personal' ? 'Personal' : 'Business');
        const normalizedType = args.type ? args.type.charAt(0).toUpperCase() + args.type.slice(1).toLowerCase() : 'Expense';
        const normalizedCurrency = args.currency ? args.currency.toUpperCase() : (normalizedLedger === 'Personal' ? 'PHP' : 'USD');
        const dayOfMonth = Number(args.dayOfMonth);

        if (!['Personal', 'Business'].includes(normalizedLedger) ||
            !['Income', 'Expense'].includes(normalizedType) ||
            isNaN(Number(args.amount)) ||
            !['PHP', 'USD'].includes(normalizedCurrency) ||
            !args.category ||
            isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
          return { error: `Invalid recurring schedule data provided: ${JSON.stringify(args)}` };
        }

        const matchedCategory = categories.find(c => c.name.toLowerCase() === args.category.toLowerCase());
        if (!matchedCategory) {
          return { error: `Category '${args.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.` };
        }

        const startDate = args.startDate && /^\d{4}-\d{2}-\d{2}$/.test(args.startDate)
          ? args.startDate
          : nextOccurrenceOnOrAfter(todayDateString(), dayOfMonth);

        const now = Date.now();
        const scheduleData: Omit<RecurringScheduleDocument, 'id'> = {
          userId,
          ledger: normalizedLedger,
          type: normalizedType,
          amount: Number(args.amount),
          currency: normalizedCurrency,
          category: matchedCategory.name,
          vendor: args.vendor || null,
          client: args.client || null,
          description: args.description || null,
          notes: args.notes || null,
          frequency: 'monthly',
          dayOfMonth,
          startDate,
          nextOccurrenceDate: startDate,
          lastGeneratedDate: null,
          active: true,
          createdBy: 'ai',
          createdAt: now,
          updatedAt: now
        };
        const docRef = await addDoc(collection(db, 'RecurringSchedules'), scheduleData);
        await generateOccurrencesForSchedule(docRef.id);

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Recurring schedule created successfully", scheduleId: docRef.id };
      } else if (name === 'updateTransaction' && args.id && args.updates) {
        if (args.updates.category) {
          const matchedCategory = categories.find(c => c.name.toLowerCase() === args.updates.category.toLowerCase());
          if (!matchedCategory) {
            return { error: `Category '${args.updates.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.` };
          }
          args.updates.category = matchedCategory.name;
        }
        const { doc, updateDoc, getDoc, deleteField } = await import('firebase/firestore');

        const txRef = doc(db, 'Transactions', args.id);

        // Editing the amount of a previously converted peso transaction would
        // leave the stored rate describing a figure that no longer exists, so
        // the conversion provenance is dropped rather than left misleading.
        if (args.updates.amount != null) {
          const snap = await getDoc(txRef);
          if (snap.exists() && snap.data()?.originalCurrency === 'PHP') {
            args.updates.originalAmount = deleteField();
            args.updates.originalCurrency = deleteField();
            args.updates.exchangeRate = deleteField();
            args.updates.exchangeRateDate = deleteField();
            args.updates.exchangeRateSource = deleteField();
          }
        }

        await updateDoc(txRef, args.updates);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Transaction updated successfully" };
      } else if (name === 'deleteTransaction' && args.id) {
        const { doc, deleteDoc, getDoc } = await import('firebase/firestore');
        const txRef = doc(db, 'Transactions', args.id);

        // Two-step delete: the first call only describes what would be removed.
        // Nothing is destroyed until the user has heard it back and said yes.
        if (args.confirmed !== true) {
          const snap = await getDoc(txRef);
          if (!snap.exists()) {
            return { error: "I can't find that transaction. It may already have been deleted." };
          }
          const data = snap.data();
          if (data?.userId !== userId) {
            return { error: "That transaction does not belong to this account." };
          }
          return {
            pendingConfirmation: true,
            transaction: describeForVoice({ id: args.id, ...data }),
            category: data?.category ?? null,
            instruction:
              'Nothing has been deleted yet. Read this transaction back to the user and ask whether to delete it. ' +
              'Only if they explicitly say yes, call deleteTransaction again with the same id and confirmed=true.'
          };
        }

        await deleteDoc(txRef);
        // Keep the review cursor honest if the deleted item was in the queue.
        if (reviewSessionRef.current) {
          const session = reviewSessionRef.current;
          const removedAt = session.items.findIndex(i => i.id === args.id);
          if (removedAt !== -1) {
            session.items.splice(removedAt, 1);
            if (session.index > removedAt) session.index--;
            if (session.index >= session.items.length) session.index = Math.max(0, session.items.length - 1);
          }
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Transaction deleted successfully" };

      // ── Read-only Firestore queries ─────────────────────────────────────────
      // Each computes its answer in code. The assistant reports these numbers
      // verbatim; it never derives its own.
      } else if (name === 'getReviewQueue') {
        return await getReviewQueue(userId, args.ledgerFilter);
      } else if (name === 'getUncategorizedTransactions') {
        return await getUncategorizedTransactions(userId, args.ledgerFilter);
      } else if (name === 'getPossibleDuplicates') {
        return await getPossibleDuplicates(userId, args.ledgerFilter);
      } else if (name === 'getUnverifiedTaxMappings') {
        return await getUnverifiedTaxMappings(userId);
      } else if (name === 'explainTaxMapping') {
        return await explainTaxMapping(userId, args.categoryName);
      } else if (name === 'searchTransactions') {
        return await searchTransactions(userId, args || {});
      } else if (name === 'getSpendingSummary') {
        return await getSpendingSummary(userId, args || {});
      } else if (name === 'getExchangeRateInfo') {
        return await getExchangeRateInfo(userId, args || {});

      // ── Fast review mode ────────────────────────────────────────────────────
      } else if (name === 'startReview') {
        const queue = await getReviewQueue(userId, args.ledgerFilter);
        if (queue.items.length === 0) {
          reviewSessionRef.current = null;
          return { totalItems: 0, summary: queue.summary, done: true };
        }
        reviewSessionRef.current = { items: queue.items, index: 0 };
        const first = queue.items[0];
        return {
          totalItems: queue.items.length,
          position: 1,
          transactionId: first.id,
          transaction: first.spoken,
          category: first.category || null,
          reviewReasons: first.reviewReasons,
          summary: `Reviewing ${queue.items.length} item${queue.items.length === 1 ? '' : 's'}. First: ${first.spoken}.`
        };
      } else if (name === 'navigateReview') {
        const session = reviewSessionRef.current;
        if (!session || session.items.length === 0) {
          return { error: 'No review session is active. Call startReview first.' };
        }

        const action = (args.action || 'next').toLowerCase();
        if (action === 'next') {
          if (session.index >= session.items.length - 1) {
            return {
              done: true,
              summary: 'That was the last item. The review queue is complete.'
            };
          }
          session.index++;
        } else if (action === 'previous') {
          if (session.index === 0) {
            return { atStart: true, summary: 'That is already the first item.' };
          }
          session.index--;
        } // 'repeat' leaves the index alone

        const item = session.items[session.index];
        return {
          position: session.index + 1,
          totalItems: session.items.length,
          transactionId: item.id,
          transaction: item.spoken,
          category: item.category || null,
          reviewReasons: item.reviewReasons,
          summary: `Item ${session.index + 1} of ${session.items.length}: ${item.spoken}.`
        };

      // ── Tax mapping verification (user-approved, two-step) ──────────────────
      } else if (name === 'verifyTaxMapping') {
        const { updateDoc, doc, getDocs, query, where, collection } = await import('firebase/firestore');

        if (!args.categoryName) {
          return { error: 'Tell me which category mapping you want to verify.' };
        }

        const snap = await getDocs(
          query(collection(db, 'taxMappings'), where('userId', '==', userId))
        );
        const target = String(args.categoryName).trim().toLowerCase();
        const found = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as TaxMappingDocument) }))
          .find(m => (m.businessCategoryName || '').trim().toLowerCase() === target);

        if (!found) {
          return { error: `I don't see a tax mapping for "${args.categoryName}".` };
        }
        if (found.status === 'Verified') {
          return { result: `${found.businessCategoryName} is already verified.`, status: 'Verified' };
        }

        const proposal =
          `${found.businessCategoryName} as ${found.taxCategory || 'an unspecified tax category'} ` +
          `on ${found.taxForm || 'an unspecified form'}` +
          `${found.taxSection ? `, ${found.taxSection}` : ''}` +
          `${found.taxActMapping ? `, ${found.taxActMapping}` : ''}`;

        // Step 1: describe only. Nothing is written.
        if (args.confirmed !== true) {
          if (!found.taxCategory && !found.taxForm && !found.taxActMapping) {
            return {
              error:
                `${found.businessCategoryName} has no proposed mapping yet, so there is nothing to verify. ` +
                `The user needs to fill it in on the Tax Mapping screen first. Do not suggest values yourself.`
            };
          }
          return {
            pendingConfirmation: true,
            proposal,
            status: found.status,
            instruction:
              `Nothing has been changed. Say: "You are verifying ${proposal}. Do you want me to mark this mapping as Verified?" ` +
              `Only if the user explicitly says yes, call verifyTaxMapping again with confirmed=true. If they say no, leave it Not Verified.`
          };
        }

        // Step 2: flip the status only. The mapping's tax content is never
        // written here, so the assistant cannot alter what is being verified.
        await updateDoc(doc(db, 'taxMappings', found.id!), {
          status: 'Verified',
          lastUpdated: Date.now(),
          updatedBy: userId,
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        return {
          result: `${found.businessCategoryName} is now verified.`,
          status: 'Verified',
          verifiedMapping: proposal
        };
      }

      return { error: "Unknown tool call or invalid arguments" };
    } catch (error: any) {
      console.error('Error handling tool call: ', error);
      alert('Failed to process AI request');
      return { error: error.message || "An error occurred during tool execution" };
    } finally {
      setLoading(false);
    }
  }, [userId, ledger, fetchData, categories]);

  const { isConnected, isConnecting, start, stop, error, sendText } = useLiveBookkeeper(
    ledger === 'personal' ? 'Personal' : 'Business',
    'unified',
    transactions,
    categories,
    messages,
    handleToolCall,
    handleLiveMessage,
    handleTurnComplete
  );

// Removed auto-start to prevent AudioContext suspension issues

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userQuery.trim()) return;
    
    const userMessage = userQuery.trim();
    setUserQuery('');
    
    if (isConnected) {
      sendText(userMessage);
      setCurrentTurnCompleted(true);
      return;
    }
    
    // In case disconnected, mock response or handle gracefully
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: Date.now() }]);
    setMessages(prev => [...prev, { role: 'assistant', content: 'Live session is disconnected. Please refresh or turn on the microphone.', timestamp: Date.now() }]);
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]">
      <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center">
          <Bot className="w-6 h-6 text-indigo-600 mr-3" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">AI Finance Partner</h2>
            <p className="text-sm text-gray-500">I can record transactions, answer questions, and give advice.</p>
          </div>
        </div>
      </div>
      
      {success && (
        <div className="bg-green-50 text-green-700 p-3 flex items-center justify-center text-sm font-medium border-b border-green-100">
          <CheckCircle2 className="w-4 h-4 mr-2" />
          Transaction Saved Successfully
        </div>
      )}

      <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-white">
        <VoiceActivationBanner
          isConnected={isConnected}
          isConnecting={isConnecting}
          onStart={start}
          onStop={stop}
          title="AI Finance Partner"
          description="Speak naturally. I'm listening."
          error={error}
        />

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[80%] rounded-2xl px-5 py-3 whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-sm' 
                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100 bg-gray-50">
        <div className="flex relative">
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            disabled={loading}
            placeholder={isConnected ? "Speak or type your message..." : "Connecting..."}
            className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || !userQuery.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
