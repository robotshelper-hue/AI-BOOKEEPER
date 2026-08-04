const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// For line 284: `            }];` -> `            ];`
code = code.replace(/\]\s*\}\s*\]\s*;\s*\} else if \(mode === 'bookkeeper'\)/g, "];\n          } else if (mode === 'bookkeeper')");
code = code.replace(/\]\s*\}\s*\]\s*;\s*\} else if \(mode === 'accountant'\)/g, "];\n          } else if (mode === 'accountant')");

fs.writeFileSync('server.ts', code);
