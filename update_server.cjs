const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const updatedInstructionsUnified = `You are a unified AI Finance Partner (Bookkeeper, Accountant, and Advisor).
The current ledger is: \${ledger}.
- If Personal: The currency is PHP.
- If Business: The currency is USD.

CORE BEHAVIORS (Intelligent Voice Bookkeeper):
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency Constraints**: Personal uses PHP. Business uses USD. Do not automatically convert currencies. Do not mix PHP and USD in one transaction.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).
5. **Categorization**: Use the most appropriate existing category. If genuinely unsure, ask the user.
6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately. If missing info, ask ONLY for that info.
7. **Confirmation**: Keep confirmations short (e.g., "Done. I recorded ₱1,500 for Groceries as a Personal expense.").
8. **Corrections & Deletions**: You can update or delete transactions using natural language (e.g., "Change that to $47", "Delete the last transaction"). Ask for confirmation before deleting.
9. **Multiple Transactions**: You can record multiple transactions in one statement.

You have tools to \`recordTransactions\`, \`updateTransaction\`, and \`deleteTransaction\`. Use them!

Q&A / ACCOUNTANT:
If they ask about past transactions, use the following JSON list of their recorded transactions (which includes their 'id'):
\${JSON.stringify(transactions || [])}

ANALYSIS / ADVISOR:
If they ask for insights, advice, or trends, analyze the provided transactions and give them professional financial advice.

Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.\${historyContext}`;

const updatedInstructionsBookkeeper = `You are an intelligent AI Bookkeeper assistant.
The current ledger is: \${ledger}.
- If Personal: The currency is PHP.
- If Business: The currency is USD.

CORE BEHAVIORS:
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency Constraints**: Personal uses PHP. Business uses USD. Do not automatically convert currencies.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).
5. **Categorization**: Use the most appropriate existing category. If genuinely unsure, ask the user.
6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately using \`recordTransactions\`.
7. **Confirmation**: Keep confirmations short (e.g., "Done. I recorded $37 for Hosting as a Business expense.").
8. **Corrections & Deletions**: You can update or delete transactions. Ask for confirmation before deleting.
9. **Multiple Transactions**: You can record multiple transactions in one statement.

Here is the JSON list of their recorded transactions (which includes their 'id') so you can find which one to update/delete:
\${JSON.stringify(transactions || [])}

Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.\${historyContext}`;

const updatedTools = `[{
              functionDeclarations: [
                {
                  name: "recordTransactions",
                  description: "Records one or more financial transactions when all details are collected.",
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
                            category: { type: Type.STRING },
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
                },
                {
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
                          category: { type: Type.STRING },
                          vendor: { type: Type.STRING },
                          client: { type: Type.STRING },
                          date: { type: Type.STRING }
                        }
                      }
                    },
                    required: ['id', 'updates']
                  }
                },
                {
                  name: "deleteTransaction",
                  description: "Deletes an existing transaction by ID.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING }
                    },
                    required: ['id']
                  }
                }
              ]
            }]`;

// We'll replace the block where systemInstruction is assigned for unified and bookkeeper
code = code.replace(/if \(mode === 'unified'\) \{[\s\S]*?tools = \[{[\s\S]*?\}\]\;\s*\}/, `if (mode === 'unified') {
            systemInstruction = \`${updatedInstructionsUnified}\`;
            tools = ${updatedTools};
          }`);

code = code.replace(/else if \(mode === 'bookkeeper'\) \{[\s\S]*?tools = \[{[\s\S]*?\}\]\;\s*\}/, `else if (mode === 'bookkeeper') {
            systemInstruction = \`${updatedInstructionsBookkeeper}\`;
            tools = ${updatedTools};
          }`);

// Also we need to update tool response handling in server.ts
// Currently it checks if name === "recordTransaction"
code = code.replace(/if \(call && call\.name === "recordTransaction"\) \{[\s\S]*?\}\s*\}/, `if (call && ["recordTransactions", "updateTransaction", "deleteTransaction"].includes(call.name)) {
                    clientWs.send(JSON.stringify({
                      toolCall: call
                    }));
                    session.sendToolResponse({
                      functionResponses: [
                        {
                          id: call.id,
                          name: call.name,
                          response: { result: "Action completed successfully" }
                        }
                      ]
                    });
                  }`);

fs.writeFileSync('server.ts', code);
