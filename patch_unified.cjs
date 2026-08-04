const fs = require('fs');
let content = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const replacement = `
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
            return { error: \`Invalid transaction data provided: \${JSON.stringify(tx)}\` };
          }
          
          const matchedCategory = categories.find(c => c.name.toLowerCase() === tx.category.toLowerCase());
          if (!matchedCategory) {
            return { error: \`Category '\${tx.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.\` };
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
            return { error: \`Category '\${args.updates.category}' does not exist in your settings. You MUST ask the user which existing category to use instead. Do NOT guess.\` };
          }
          args.updates.category = matchedCategory.name;
        }
        const { doc, updateDoc } = await import('firebase/firestore');
`;

content = content.replace(/if \(name === 'recordTransactions' && args\.transactions\) \{.*?const \{ doc, updateDoc \} = await import\('firebase\/firestore'\);/s, replacement);

fs.writeFileSync('src/components/UnifiedAgentTab.tsx', content);
