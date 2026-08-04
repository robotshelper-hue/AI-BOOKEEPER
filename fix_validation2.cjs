const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const target = `      if (name === 'recordTransactions' && args.transactions) {
        let count = 0;
        for (const tx of args.transactions) {
          if (!tx.ledger || !['Personal', 'Business'].includes(tx.ledger) ||
              !tx.type || !['Income', 'Expense'].includes(tx.type) ||
              isNaN(Number(tx.amount)) ||
              !tx.currency || !['PHP', 'USD'].includes(tx.currency) ||
              !tx.category) {
            console.error('Invalid transaction data', tx);
            continue; // Skip invalid transaction
          }`;

const replacement = `      if (name === 'recordTransactions' && args.transactions) {
        let count = 0;
        for (const tx of args.transactions) {
          // Normalize case
          tx.ledger = tx.ledger ? tx.ledger.charAt(0).toUpperCase() + tx.ledger.slice(1).toLowerCase() : 'Personal';
          tx.type = tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1).toLowerCase() : 'Expense';
          tx.currency = tx.currency ? tx.currency.toUpperCase() : (tx.ledger === 'Personal' ? 'PHP' : 'USD');
          
          if (!['Personal', 'Business'].includes(tx.ledger) ||
              !['Income', 'Expense'].includes(tx.type) ||
              isNaN(Number(tx.amount)) ||
              !['PHP', 'USD'].includes(tx.currency) ||
              !tx.category) {
            console.error('Invalid transaction data', tx);
            continue; // Skip invalid transaction
          }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
