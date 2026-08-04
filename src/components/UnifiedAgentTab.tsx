import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Bot, CheckCircle2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, addDoc } from 'firebase/firestore';
import { VoiceActivationBanner } from './VoiceActivationBanner';
import { useLiveBookkeeper } from '../hooks/useLiveBookkeeper';

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
          
          const matchedCategory = categories.find(c => c.name.toLowerCase() === tx.category.toLowerCase());
          if (!matchedCategory) {
            return { error: `Category '${tx.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.` };
          }
          tx.category = matchedCategory.name; // enforce exact casing
        }

        let count = 0;
        const newTxIds = [];
        for (const tx of args.transactions) {
          const docRef = await addDoc(collection(db, 'Transactions'), {
            userId,
            ledger: tx.ledger,
            type: tx.type,
            amount: Number(tx.amount),
            currency: tx.currency,
            category: tx.category,
            vendor: tx.vendor || null,
            client: tx.client || null,
            description: tx.description || null,
            notes: tx.notes || null,
            date: tx.date || new Date().toISOString().split('T')[0],
            timestamp: Date.now()
          });
          newTxIds.push(docRef.id);
          count++;
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Transactions created successfully", newTransactionIds: newTxIds };
      } else if (name === 'updateTransaction' && args.id && args.updates) {
        if (args.updates.category) {
          const matchedCategory = categories.find(c => c.name.toLowerCase() === args.updates.category.toLowerCase());
          if (!matchedCategory) {
            return { error: `Category '${args.updates.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.` };
          }
          args.updates.category = matchedCategory.name;
        }
        const { doc, updateDoc } = await import('firebase/firestore');


        const txRef = doc(db, 'Transactions', args.id);
        await updateDoc(txRef, args.updates);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Transaction updated successfully" };
      } else if (name === 'deleteTransaction' && args.id) {
        const { doc, deleteDoc } = await import('firebase/firestore');
        const txRef = doc(db, 'Transactions', args.id);
        await deleteDoc(txRef);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchData();
        return { result: "Transaction deleted successfully" };
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

  const { isConnected, start, stop, error, sendText } = useLiveBookkeeper(
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
