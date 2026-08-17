const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const replacement1 = `7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded ₱1,500 for Groceries as a Personal expense.").`;
const replacement2 = `7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded $37 for Hosting as a Business expense.").`;

content = content.replace(/7\. \*\*Confirmation\*\*: Keep confirmations short \(e\.g\., "Done\. I recorded ₱1,500 for Groceries as a Personal expense\."\)\./g, replacement1);
content = content.replace(/7\. \*\*Confirmation\*\*: Keep confirmations short \(e\.g\., "Done\. I recorded \$37 for Hosting as a Business expense\."\)\./g, replacement2);

fs.writeFileSync('server.ts', content);
