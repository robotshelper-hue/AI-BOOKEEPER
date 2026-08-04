const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const replacement = `if (name === 'recordTransactions' && args.transactions) {
        let count = 0;
        for (let tx of args.transactions) {
          // Normalize case
          tx.ledger = tx.ledger ? tx.ledger.charAt(0).toUpperCase() + tx.ledger.slice(1).toLowerCase() : 'Personal';
          tx.type = tx.type ? tx.type.charAt(0).toUpperCase() + tx.type.slice(1).toLowerCase() : 'Expense';
          tx.currency = tx.currency ? tx.currency.toUpperCase() : (tx.ledger === 'Personal' ? 'PHP' : 'USD');
          
          if (!['Personal', 'Business'].includes(tx.ledger)) {
            console.error('Invalid ledger', tx.ledger);
            continue;
          }
          if (!['Income', 'Expense'].includes(tx.type)) {
            console.error('Invalid type', tx.type);
            continue;
          }
          if (isNaN(Number(tx.amount))) {
            console.error('Invalid amount', tx.amount);
            continue;
          }
          if (!['PHP', 'USD'].includes(tx.currency)) {
            console.error('Invalid currency', tx.currency);
            continue;
          }
          if (!tx.category) {
            console.error('Invalid category, missing', tx);
            continue;
          }`;

code = code.replace(/if \(name === 'recordTransactions' && args\.transactions\) \{[\s\S]*?continue;\s*\}/, replacement);
fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
