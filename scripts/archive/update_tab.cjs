const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const newFunc = `  const handleToolCall = useCallback(async (name: string, args: any) => {
    if (!userId) return;
    try {
      setLoading(true);
      
      if (name === 'recordTransactions' && args.transactions) {
        let count = 0;
        for (const tx of args.transactions) {
          await addDoc(collection(db, 'Transactions'), {
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
          count++;
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchTransactions();
      } else if (name === 'updateTransaction' && args.id && args.updates) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const txRef = doc(db, 'Transactions', args.id);
        await updateDoc(txRef, args.updates);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchTransactions();
      } else if (name === 'deleteTransaction' && args.id) {
        const { doc, deleteDoc } = await import('firebase/firestore');
        const txRef = doc(db, 'Transactions', args.id);
        await deleteDoc(txRef);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        fetchTransactions();
      }
      
    } catch (error) {
      console.error('Error handling tool call: ', error);
      alert('Failed to process AI request');
    } finally {
      setLoading(false);
    }
  }, [userId, ledger, fetchTransactions]);`;

code = code.replace(/const handleTransactionRecorded = useCallback\(async \(txArgs: any\) => \{[\s\S]*?\}, \[userId, ledger, fetchTransactions\]\);/m, newFunc);
code = code.replace(/handleTransactionRecorded,/g, 'handleToolCall,');

fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
