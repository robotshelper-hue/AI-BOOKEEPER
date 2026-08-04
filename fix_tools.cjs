const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// For unified
code = code.replace(
  /tools = \[\s*\{\s*type: "function",\s*name: "recordTransactions",/g,
  `tools = [{ functionDeclarations: [
                {
                  name: "recordTransactions",`
);

// We also need to fix updateTransaction and deleteTransaction
code = code.replace(/\{\s*type: "function",\s*name: "updateTransaction",/g, '{\n                  name: "updateTransaction",');
code = code.replace(/\{\s*type: "function",\s*name: "deleteTransaction",/g, '{\n                  name: "deleteTransaction",');

// Fix the ending array brackets for unified and bookkeeper
// Previously we did: `];\n          } else if (mode === 'bookkeeper')`
// It should be: `]}];\n          } else if (mode === 'bookkeeper')`
code = code.replace(/\]\s*;\s*\} else if \(mode === 'bookkeeper'\)/g, "]}];\n          } else if (mode === 'bookkeeper')");
code = code.replace(/\]\s*;\s*\} else if \(mode === 'accountant'\)/g, "]}];\n          } else if (mode === 'accountant')");

fs.writeFileSync('server.ts', code);
