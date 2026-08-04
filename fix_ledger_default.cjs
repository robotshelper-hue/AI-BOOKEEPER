const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

code = code.replace(
  /tx\.ledger = tx\.ledger \? tx\.ledger\.charAt\(0\)\.toUpperCase\(\) \+ tx\.ledger\.slice\(1\)\.toLowerCase\(\) : 'Personal';/g,
  "tx.ledger = tx.ledger ? tx.ledger.charAt(0).toUpperCase() + tx.ledger.slice(1).toLowerCase() : (ledger === 'personal' ? 'Personal' : 'Business');"
);

fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
