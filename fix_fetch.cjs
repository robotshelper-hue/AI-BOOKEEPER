const fs = require('fs');
let code = fs.readFileSync('src/components/UnifiedAgentTab.tsx', 'utf8');

const replacement = `const fetchTransactions = useCallback(async () => {
    const q = query(
      collection(db, 'Transactions'),
      where('userId', '==', userId),
      where('ledger', '==', ledger === 'personal' ? 'Personal' : 'Business'),
      orderBy('timestamp', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const txs = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        date: data.date || new Date(data.timestamp).toISOString().split('T')[0],
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        vendor: data.vendor,
        client: data.client,
        description: data.description,
        notes: data.notes,
        timestamp: data.timestamp
      };
    });`;

code = code.replace(/const fetchTransactions = useCallback\(async \(\) => \{[\s\S]*?timestamp: data\.timestamp\n\s*\};\n\s*\}\);/, replacement);
fs.writeFileSync('src/components/UnifiedAgentTab.tsx', code);
