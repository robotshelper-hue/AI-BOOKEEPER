const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

code = code.replace(
  /  useEffect\(\(\) => \{\s*if \(\!transactionsLoaded\) return;\s*let mounted = true;\s*const timer = setTimeout\(\(\) => \{\s*if \(mounted && \!isConnected && \!error\) \{\s*start\(\);\s*\}\s*\}, 500\);\s*return \(\) => \{\s*mounted = false;\s*clearTimeout\(timer\);\s*\};\s*\}, \[start, isConnected, error, transactionsLoaded\]\);/,
  `// Removed auto-start to prevent AudioContext suspension issues`
);

fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
