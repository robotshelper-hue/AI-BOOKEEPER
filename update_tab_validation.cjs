const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const replacement = `if (name === 'recordTransactions' && args.transactions) {
        let count = 0;
        for (const tx of args.transactions) {
          if (!tx.ledger || !['Personal', 'Business'].includes(tx.ledger) ||
              !tx.type || !['Income', 'Expense'].includes(tx.type) ||
              isNaN(Number(tx.amount)) ||
              !tx.currency || !['PHP', 'USD'].includes(tx.currency) ||
              !tx.category) {
            console.error('Invalid transaction data', tx);
            continue; // Skip invalid transaction
          }
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
        }`;

code = code.replace(/if \(name === 'recordTransactions' && args\.transactions\) \{[\s\S]*?count\+\+;\s*\}/, replacement);
fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
