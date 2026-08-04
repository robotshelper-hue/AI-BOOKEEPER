const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// I will just read lines and fix manually.
const lines = code.split('\n');
const startIdx = lines.findIndex(l => l.includes('if (call && ["recordTransactions", "updateTransaction", "deleteTransaction"].includes(call.name)) {'));
if (startIdx !== -1) {
  // We need to delete lines starting from line 464 (0-indexed 463) which are extraneous braces.
  // Let's just grab the whole file, locate the problem and fix it.
}
