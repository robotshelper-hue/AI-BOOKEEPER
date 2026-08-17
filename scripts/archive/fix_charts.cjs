const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardCharts.tsx', 'utf8');

const replacement = `    transactions.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'Income') tInc += amt;
      else if (tx.type === 'Expense') tExp += amt;
      
      let txDate = new Date();
      if (tx.date) {
        // If we have a string date like YYYY-MM-DD
        txDate = new Date(tx.date);
      } else if (tx.timestamp) {
        txDate = new Date(tx.timestamp);
      }
      
      const mStr = format(txDate, 'MMM yyyy');`;

code = code.replace(/transactions\.forEach\(tx => \{[\s\S]*?const mStr = format\(txDate, 'MMM yyyy'\);/, replacement);
fs.writeFileSync('src/components/DashboardCharts.tsx', code);
