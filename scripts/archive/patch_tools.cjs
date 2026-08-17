const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `
          const validCategories = categories && categories.length > 0 ? Array.from(new Set(categories.map((c: any) => c.name))) : ["Uncategorized"];
          const recordTransactionsTool = {
            name: "recordTransactions",
            description: "Records one or more financial transactions. You MUST use one of the existing valid categories. If none fit, you MUST ask the user which to use.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                transactions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ledger: { type: Type.STRING, enum: ['Personal', 'Business'] },
                      type: { type: Type.STRING, enum: ['Income', 'Expense'] },
                      amount: { type: Type.NUMBER },
                      currency: { type: Type.STRING, enum: ['PHP', 'USD'] },
                      date: { type: Type.STRING, description: 'YYYY-MM-DD format' },
                      category: { type: Type.STRING, enum: validCategories },
                      vendor: { type: Type.STRING },
                      client: { type: Type.STRING },
                      description: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ['ledger', 'type', 'amount', 'currency', 'date', 'category']
                  }
                }
              },
              required: ['transactions']
            }
          };

          const updateTransactionTool = {
            name: "updateTransaction",
            description: "Updates an existing transaction by ID. Only update the fields that are provided.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                updates: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['Income', 'Expense'] },
                    amount: { type: Type.NUMBER },
                    category: { type: Type.STRING, enum: validCategories },
                    vendor: { type: Type.STRING },
                    client: { type: Type.STRING },
                    date: { type: Type.STRING }
                  }
                }
              },
              required: ['id', 'updates']
            }
          };

          const deleteTransactionTool = {
            name: "deleteTransaction",
            description: "Deletes an existing transaction by ID.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING }
              },
              required: ['id']
            }
          };
`;

content = content.replace(/tools = \[\{ functionDeclarations: \[.*?\}\s*\]\}\];/gs, (match, p1) => {
  return "tools = [{ functionDeclarations: [recordTransactionsTool, updateTransactionTool, deleteTransactionTool] }];";
});

content = content.replace(/let tools: any\[\] = \[\];/, "let tools: any[] = [];\n" + replacement);

fs.writeFileSync('server.ts', content);
