import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, LiveServerMessage, Modality } from '@google/genai';
import { WebSocketServer } from 'ws';

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}


async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // --- API Routes ---
  
  app.post('/api/gemini/parse-transaction', async (req, res) => {
    try {
      const { text, ledger } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Missing text in request body' });
      }
      if (!ledger) {
        return res.status(400).json({ error: 'Missing ledger in request body' });
      }

      if (!process.env.GEMINI_API_KEY) {
         return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing.' });
      }

      const prompt = `You are an AI Bookkeeper. Parse the following transcription into a structured financial transaction.
      The current ledger is: ${ledger}.
      - If Personal: The currency is PHP.
      - If Business: The currency is USD.
      
      Determine if it's an Income or Expense.
      Extract the amount, category, client (if applicable), and notes.
      If information is missing, use sensible defaults (e.g. 'Uncategorized') or leave it null, but capture what you can.
      
      Transcription: "${text}"`;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['Income', 'Expense'], description: 'Whether this is money coming in (Income) or going out (Expense)' },
              amount: { type: Type.NUMBER, description: 'The numeric amount' },
              currency: { type: Type.STRING, enum: ['PHP', 'USD'], description: 'PHP for Personal, USD for Business' },
              category: { type: Type.STRING, description: 'Category of the transaction' },
              client: { type: Type.STRING, nullable: true, description: 'The client name, if applicable (usually Business only)' },
              notes: { type: Type.STRING, description: 'A brief description of the transaction' },
              isComplete: { type: Type.BOOLEAN, description: 'True if you have all necessary info (amount, type, category). False if something critical is missing and you need to ask the user for it.' },
              followUpQuestion: { type: Type.STRING, nullable: true, description: 'If isComplete is false, what should the bot ask the user to clarify?' }
            },
            required: ['type', 'amount', 'currency', 'category', 'notes', 'isComplete'],
          },
          temperature: 0.2, // Low temperature for more deterministic parsing
        }
      });

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('No text returned from Gemini');
      }

      const parsedData = JSON.parse(jsonText);
      res.json(parsedData);
      
    } catch (error: any) {
      console.error('Error parsing transaction with Gemini:', error);
      res.status(500).json({ error: error.message || 'Failed to process transaction' });
    }
  });

  // --- Vite Middleware ---
  // --- Batch Category Suggestions (Module 4) ---
  app.post('/api/gemini/suggest-categories', async (req, res) => {
    try {
      const { rows, categories, ledger } = req.body;

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Missing or empty rows array' });
      }
      if (!categories || !Array.isArray(categories)) {
        return res.status(400).json({ error: 'Missing categories array' });
      }

      if (!process.env.GEMINI_API_KEY) {
         return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing.' });
      }

      const prompt = `You are an AI Bookkeeper categorizing a batch of imported CSV transactions for a ${ledger} ledger.
      
      Here are the available bookkeeping categories:
      ${categories.map((c: any) => `- ${c.name} (${c.type})`).join('\n')}
      
      CRITICAL CONSTRAINT: You must ONLY suggest categories from the list above. DO NOT suggest Tax mappings or tax-related codes. If you are not highly confident, return null for the category.
      
      Here are the transactions to categorize:
      ${rows.map((r: any, i: number) => `[ID: ${i}] Date: ${r.date}, Type: ${r.type}, Amount: ${r.amount}, Vendor: ${r.vendor}, Desc: ${r.description}`).join('\n')}
      
      Return a JSON array of objects, where each object has:
      - "index": the ID of the transaction
      - "category": the exact name of the suggested category (or null if uncertain)
      - "confidence": a number from 0 to 1 indicating your confidence
      `;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                index: { type: 'INTEGER' },
                category: { type: 'STRING', nullable: true },
                confidence: { type: 'NUMBER' },
              },
              required: ['index', 'category', 'confidence'],
            }
          }
        }
      });

      if (!response.text) {
        throw new Error('No text returned from Gemini');
      }

      const suggestions = JSON.parse(response.text);
      res.json({ suggestions });
    } catch (error: any) {
      console.error('Error suggesting categories:', error);
      res.status(500).json({ error: 'Failed to generate category suggestions' });
    }
  });

  app.post('/api/gemini/accountant', async (req, res) => {
    try {
      const { query, ledger, transactions } = req.body;
      const ai = getAiClient();

      const systemInstruction = `You are a professional Accountant AI.
The user is asking a question about their ${ledger} finance data.
Here is the JSON list of their recorded transactions:
${JSON.stringify(transactions)}

Answer the user's question accurately based ONLY on the data provided above.
If the data does not contain the answer, say you don't know based on the available data.
Be concise, clear, and professional.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash',
        contents: query,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2
        }
      });

      res.json({ answer: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/advisor', async (req, res) => {
    try {
      const { ledger, transactions } = req.body;
      const ai = getAiClient();

      const systemInstruction = `You are a professional Financial Advisor AI.
You are analyzing the user's ${ledger} finance data.
Here is the JSON list of their recorded transactions:
${JSON.stringify(transactions)}

Analyze the historical data, identify spending/income trends, and suggest concrete financial improvements.
Never modify or invent any records. Output your analysis in Markdown format, using headings and bullet points for readability. Be encouraging but professional.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro',
        contents: "Please analyze my transactions.",
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.4
        }
      });

      res.json({ analysis: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/live' });
  wss.on('error', (e) => console.error("WSS error:", e));

  wss.on("connection", (clientWs, req) => {
    clientWs.on("error", (e) => console.error("Client WS error:", e));
    let session: any = null;
    let isConnectedToLive = false;

    clientWs.on("message", async (data) => {
      console.log("WS Message received");
      try {
        const parsed = JSON.parse(data.toString());
        
        if (parsed.init) {
          const { ledger, mode, transactions, categories, history } = parsed.init;
          
          let systemInstruction = "";
          let tools: any[] = [];

          const validCategories = categories && categories.length > 0 ? Array.from(new Set(categories.map((c: any) => c.name))) : ["Uncategorized"];
          const recordTransactionsTool = {
            name: "recordTransactions",
            description: "Records one or more financial transactions. You MUST use one of the existing valid categories. If none fit, you MUST ask the user which to use. The tool returns the IDs of the new transactions. Keep track of these IDs so you can update them if the user corrects you later.",
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

          const createRecurringScheduleTool = {
            name: "createRecurringSchedule",
            description: "Creates a recurring transaction schedule (e.g. a monthly subscription or rent) that will keep generating transactions every month until stopped. Use this instead of recordTransactions whenever the user's language implies recurrence (e.g. 'every month', 'monthly', 'each month on the 15th', 'my rent is $500 a month', 'I have a subscription for X'). You MUST verbally confirm the exact amount, category, and day of month with the user and get their explicit yes BEFORE calling this tool — do not call it on the first mention. You MUST use one of the existing valid categories, same as recordTransactions.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                ledger: { type: Type.STRING, enum: ['Personal', 'Business'] },
                type: { type: Type.STRING, enum: ['Income', 'Expense'] },
                amount: { type: Type.NUMBER },
                currency: { type: Type.STRING, enum: ['PHP', 'USD'] },
                category: { type: Type.STRING, enum: validCategories },
                vendor: { type: Type.STRING },
                client: { type: Type.STRING },
                description: { type: Type.STRING },
                notes: { type: Type.STRING },
                dayOfMonth: { type: Type.NUMBER, description: 'The day of the month (1-31) this recurs on. If the day mentioned does not exist in a shorter month (e.g. 31 in February), it will automatically fall on that month\'s last day.' },
                startDate: { type: Type.STRING, description: 'YYYY-MM-DD format. The date of the first occurrence. If the user does not specify, use the next upcoming occurrence of dayOfMonth from today.' }
              },
              required: ['ledger', 'type', 'amount', 'currency', 'category', 'dayOfMonth', 'startDate']
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
            description: "Deletes an existing transaction by ID. This is a two-step tool and you MUST use both steps. Step 1: call it with confirmed=false to look up the transaction; it deletes nothing and returns the transaction's details. Read those details back to the user and ask if you should delete it. Step 2: only after the user explicitly says yes, call it again with confirmed=true to actually delete. Never call it with confirmed=true on the first attempt.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                confirmed: { type: Type.BOOLEAN, description: 'False to look up and describe the transaction, true only after the user has explicitly approved the deletion.' }
              },
              required: ['id']
            }
          };

          const endSessionTool = {
            name: "endSession",
            description: "Ends the conversation and disconnects the microphone. Call this when the user says goodbye, or when they indicate they have no further questions or tasks.",
            parameters: {
              type: Type.OBJECT,
              properties: {}
            }
          };

          // ── Read-only data tools (Module 5) ────────────────────────────────
          // These query Firestore and compute their own results. The model must
          // use them for any count, list or total instead of doing arithmetic
          // over the transaction JSON in its context.
          const ledgerFilterParam = {
            type: Type.STRING,
            enum: ['Business', 'Personal', 'both'],
            description: "Which ledger to look at. Use 'Business' or 'Personal' when the user names one, otherwise 'both'."
          };

          const getReviewQueueTool = {
            name: "getReviewQueue",
            description: "Returns everything that needs the user's attention: uncategorized transactions, missing dates or amounts, possible duplicates, ambiguous income/expense types, and unverified tax mappings — with exact counts. Use this for questions like 'what needs my attention?' or 'what do I need to review?'. Always use these counts verbatim; never estimate them.",
            parameters: {
              type: Type.OBJECT,
              properties: { ledgerFilter: ledgerFilterParam }
            }
          };

          const getUncategorizedTransactionsTool = {
            name: "getUncategorizedTransactions",
            description: "Returns the actual uncategorized transactions, each with date, amount, vendor/client, ledger and currency. Use for 'show me my uncategorized transactions' or 'which transactions are uncategorized'.",
            parameters: {
              type: Type.OBJECT,
              properties: { ledgerFilter: ledgerFilterParam }
            }
          };

          const getPossibleDuplicatesTool = {
            name: "getPossibleDuplicates",
            description: "Returns groups of transactions that look like duplicates (same date, amount, type and vendor), with the reason each group was flagged. Never delete any of them without the user explicitly choosing which one and confirming.",
            parameters: {
              type: Type.OBJECT,
              properties: { ledgerFilter: ledgerFilterParam }
            }
          };

          const getUnverifiedTaxMappingsTool = {
            name: "getUnverifiedTaxMappings",
            description: "Returns the tax mappings that still need the user's verification, with each category name, its proposed mapping, verification status, and how many transactions it affects. Use for 'what tax mappings need verification' or 'show me my unverified tax mappings'.",
            parameters: { type: Type.OBJECT, properties: {} }
          };

          const explainTaxMappingTool = {
            name: "explainTaxMapping",
            description: "Explains the proposed tax mapping for one business category (tax category, tax form, tax section, TaxAct mapping, and whether it is verified). Use for 'tell me about Outsourcing' or 'what is the proposed mapping for Hosting'. This is read-only — it never changes anything.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                categoryName: { type: Type.STRING, description: 'The business category name, e.g. "Outsourcing".' }
              },
              required: ['categoryName']
            }
          };

          const searchTransactionsTool = {
            name: "searchTransactions",
            description: "Finds actual transactions by vendor/client name, category, type and/or date range. Use for 'show me everything from Hetzner', 'find my PayPal transactions', 'show me all my outsourcing expenses'. Returns real stored records only.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                vendor: { type: Type.STRING, description: 'Vendor or client name to match (partial matches allowed).' },
                category: { type: Type.STRING, description: 'Category name to match, e.g. "Outsourcing".' },
                type: { type: Type.STRING, enum: ['Income', 'Expense'] },
                dateFrom: { type: Type.STRING, description: 'YYYY-MM-DD inclusive lower bound.' },
                dateTo: { type: Type.STRING, description: 'YYYY-MM-DD inclusive upper bound.' },
                ledgerFilter: ledgerFilterParam
              }
            }
          };

          const getSpendingSummaryTool = {
            name: "getSpendingSummary",
            description: "Computes real totals (income, expenses, net profit, transaction count) from Firestore for an optional category, vendor, type and date range. You MUST use this for every 'how much did I spend/earn' or 'what is my profit' question. Do not add up amounts yourself. For Business, amounts are already in USD, including transactions originally paid in pesos.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                vendor: { type: Type.STRING },
                category: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['Income', 'Expense'] },
                dateFrom: { type: Type.STRING, description: 'YYYY-MM-DD. For "this year" use January 1st of the current year.' },
                dateTo: { type: Type.STRING, description: 'YYYY-MM-DD.' },
                ledgerFilter: ledgerFilterParam
              }
            }
          };

          const getExchangeRateInfoTool = {
            name: "getExchangeRateInfo",
            description: "Returns the exchange rate that was actually stored on a converted peso transaction, including the rate, the rate's date and its source. Use for 'what exchange rate did you use for Ella's payment'. This reports the historical stored rate — never a fresh or current rate.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                vendor: { type: Type.STRING, description: 'Vendor or client name, e.g. "Ella".' },
                dateFrom: { type: Type.STRING },
                dateTo: { type: Type.STRING }
              }
            }
          };

          // ── Fast review mode cursor ────────────────────────────────────────
          const startReviewTool = {
            name: "startReview",
            description: "Begins a step-by-step review session over the items needing attention, and returns the first item plus the total count. Use when the user agrees to review their transactions one at a time.",
            parameters: {
              type: Type.OBJECT,
              properties: { ledgerFilter: ledgerFilterParam }
            }
          };

          const reviewNavigationTool = {
            name: "navigateReview",
            description: "Moves through the review session started by startReview. action='next' for 'next' or 'skip this one', 'previous' for 'go back', 'repeat' for 'read that again'. Returns the item now being reviewed, or tells you the review is complete.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING, enum: ['next', 'previous', 'repeat'] }
              },
              required: ['action']
            }
          };

          // ── Tax mapping verification (two-step, user-approved only) ────────
          const verifyTaxMappingTool = {
            name: "verifyTaxMapping",
            description: "Marks a tax mapping as Verified. This is a two-step tool and you MUST use both steps. Step 1: call with confirmed=false — this changes nothing and returns the proposed mapping. Read it back and ask, for example: 'You are verifying Outsourcing as Contract Labor on Schedule C, Line 11. Do you want me to mark this mapping as Verified?'. Step 2: only after the user explicitly says yes, call again with confirmed=true. If the user says no, do not call it again and leave the mapping Not Verified. You can only change the verification status — you can never create, guess or edit the mapping's tax category, form, section or TaxAct line.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                categoryName: { type: Type.STRING, description: 'The business category whose mapping is being verified, e.g. "Outsourcing".' },
                confirmed: { type: Type.BOOLEAN, description: 'False to preview the mapping, true only after the user explicitly approved it.' }
              },
              required: ['categoryName']
            }
          };

          const readOnlyDataTools = [
            getReviewQueueTool,
            getUncategorizedTransactionsTool,
            getPossibleDuplicatesTool,
            getUnverifiedTaxMappingsTool,
            explainTaxMappingTool,
            searchTransactionsTool,
            getSpendingSummaryTool,
            getExchangeRateInfoTool
          ];

          const reviewTools = [startReviewTool, reviewNavigationTool];

          
          const historyContext = history && history.length > 0 
            ? `\n\nHere is the recent conversation history for context:\n${history.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}` 
            : '';

          const categoriesContext = categories && categories.length > 0
            ? `\n\nHere is the list of active categories you MUST use:\n${JSON.stringify(categories.map((c: any) => ({ name: c.name, type: c.type, ledger: c.ledger })))}\nDo not invent new categories. If you are unsure which category to use, ask the user.`
            : `\n\nNo predefined categories found. Use your best judgment to categorize.`;

          if (mode === 'unified') {
            systemInstruction = `You are a unified AI Finance Partner (Bookkeeper, Accountant, and Advisor).
The current ledger is: ${ledger}.

CORE BEHAVIORS (Intelligent Voice Bookkeeper):
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency**: Personal transactions are always PHP and are never converted. Business transactions are reported in USD, but the user may state the amount in pesos — if they say a Business amount in pesos (e.g. "I paid Ella 3,000 pesos for outsourcing"), record it with currency 'PHP' and the system will automatically convert it to USD at the exchange rate for that transaction's date, keeping the original peso amount. Do not do the conversion arithmetic yourself and do not state a converted figure you have not been given: the tool result tells you the USD amount and the rate used, so record first, then report what it returned.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).

5. **Categorization**: Use the most appropriate existing category.${categoriesContext}
CRITICAL: You MUST verify the category against the provided list BEFORE calling any tool. If the user mentions a category (like "Subscriptions") that is NOT in the active categories list (for example, if only "Software" exists), you MUST NOT call the recordTransactions tool. Instead, stop and ask the user which existing category to use, or suggest a close match. Do NOT invent new categories. Do NOT call the tool with a made-up category.
All outsourced VA work — social media, video creation, automation, web design, appointment setting, lead generation and other general VA work — belongs to the single "Outsourcing" category. Never split those into separate categories.

6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately. If missing info, ask ONLY for that info.
7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded ₱1,500 for Groceries as a Personal expense.").
8. **Corrections & Deletions**: You can update or delete transactions using natural language (e.g., "Change that to $47", "Delete the last transaction"). Deletion is a two-step tool: call deleteTransaction with confirmed=false, read back what it returns, ask the user to confirm, and only call it again with confirmed=true after they say yes. Never delete silently.
9. **Multiple Transactions**: You can record multiple transactions in one statement.
10. **Ending the Session**: When the user says goodbye, or if you ask if they need anything else and they say no, you MUST call the 'endSession' tool to gracefully end the conversation.
11. **Recurring Transactions**: If the user's language implies this transaction repeats (e.g. "every month", "monthly", "each month on the 15th", "my rent is $500 a month", "I have a subscription for..."), do NOT call recordTransactions. First, verbally confirm the exact amount, category, and day of month it recurs on (e.g., "Just to confirm, that's $50 for Hosting, every month on the 15th — should I set that up?"). Only after the user explicitly confirms (e.g. "yes", "correct"), call 'createRecurringSchedule'. Do not say it has been set up until AFTER you call the tool.

DATA QUESTIONS — THIS IS CRITICAL:
You must NEVER invent, estimate or calculate transactions, amounts, dates, categories, vendors, tax mappings or totals. Every factual answer comes from a tool result.
- "What needs my attention?" / "What do I need to review?" -> call getReviewQueue and report its counts exactly as given.
- "Show me my uncategorized transactions" -> call getUncategorizedTransactions and read them back.
- "How much did I spend on X?" / "What's my profit?" -> call getSpendingSummary. NEVER add up amounts yourself, even if you can see the transactions.
- "Show me everything from Hetzner" / "Show me my outsourcing expenses" -> call searchTransactions.
- "Show me possible duplicates" -> call getPossibleDuplicates. Never delete a duplicate on your own; the user chooses which one, and must confirm.
- "What exchange rate did you use for Ella's payment?" -> call getExchangeRateInfo. It returns the rate stored on that transaction; never quote a current rate for a past payment.
If a tool returns nothing, say so plainly — for example "I don't see any uncategorized transactions" — rather than guessing.

LEDGER SAFETY:
If the user names a ledger ("my business transactions", "my personal transactions"), pass that exact ledgerFilter and report only that ledger. If they don't name one, use 'both'. Never mix results from the other ledger into an answer that asked for one.

READING TRANSACTIONS ALOUD:
The user has limited vision, so speak clearly and briefly. For each transaction give date, amount, vendor or client, and whether it is Business or Personal — for example "Number one: August 10, $49, PayPal, Business." Number them. Don't read out internal IDs.

FAST REVIEW MODE:
When the user wants to work through their review queue, call startReview and then walk them through it one at a time: read the item, ask what category to use, confirm the change ("PayPal, $49, Business Funding. Save?"), save it with updateTransaction after they say yes, then call navigateReview with action 'next'. Handle "next" and "skip this one" as action 'next', "go back" as 'previous', and "read that again" as 'repeat'.

TAX CENTER BY VOICE:
- "What tax mappings are unverified?" -> call getUnverifiedTaxMappings.
- "Tell me about Outsourcing" -> call explainTaxMapping.
- "Verify the Outsourcing mapping" -> call verifyTaxMapping with confirmed=false, read back the proposed mapping, and ask whether to mark it Verified. Only after the user explicitly says yes, call it again with confirmed=true. If they say no, leave it Not Verified and say so.
You must NEVER create, guess or change a TaxAct mapping's tax category, form, section or line. You may only relay what is already stored, and flip the verification status after the user's explicit approval. The user is the only one who approves a tax mapping.

CONTEXT:
Here is the user's transaction list for reference when resolving which transaction they mean ("that one", "the PayPal transaction"). Use it to identify records and their 'id' — but never to compute totals, which must always come from getSpendingSummary:
${JSON.stringify(transactions || [])}

ANALYSIS / ADVISOR:
If they ask for insights, advice, or trends, base your analysis on tool results and give professional financial advice.
Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.
${historyContext}`;
            tools = [{ functionDeclarations: [recordTransactionsTool, createRecurringScheduleTool, updateTransactionTool, deleteTransactionTool, verifyTaxMappingTool, ...readOnlyDataTools, ...reviewTools, endSessionTool] }];
          } else if (mode === 'bookkeeper') {
            systemInstruction = `You are an intelligent AI Bookkeeper assistant.
The current ledger is: ${ledger}.

CORE BEHAVIORS:
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency**: Personal transactions are always PHP and are never converted. Business transactions are reported in USD, but the user may state the amount in pesos — if they say a Business amount in pesos, record it with currency 'PHP' and the system automatically converts it to USD at that transaction date's exchange rate, keeping the original peso amount. Do not do the conversion arithmetic yourself; the tool result gives you the USD amount and the rate used.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).

5. **Categorization**: Use the most appropriate existing category.${categoriesContext}
CRITICAL: You MUST verify the category against the provided list BEFORE calling any tool. If the user mentions a category (like "Subscriptions") that is NOT in the active categories list (for example, if only "Software" exists), you MUST NOT call the recordTransactions tool. Instead, stop and ask the user which existing category to use, or suggest a close match. Do NOT invent new categories. Do NOT call the tool with a made-up category.
All outsourced VA work — social media, video creation, automation, web design, appointment setting, lead generation and other general VA work — belongs to the single "Outsourcing" category. Never split those into separate categories.

6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately using 'recordTransactions'.
7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded $37 for Hosting as a Business expense.").
8. **Corrections & Deletions**: You can update or delete transactions. Deletion is a two-step tool: call deleteTransaction with confirmed=false, read back what it returns, ask the user to confirm, and only call it again with confirmed=true after they say yes. Never delete silently.
9. **Multiple Transactions**: You can record multiple transactions in one statement.
10. **Ending the Session**: When the user says goodbye, or if you ask if they need anything else and they say no, you MUST call the 'endSession' tool to gracefully end the conversation.
11. **Recurring Transactions**: If the user's language implies this transaction repeats (e.g. "every month", "monthly", "each month on the 15th", "my rent is $500 a month", "I have a subscription for..."), do NOT call recordTransactions. First, verbally confirm the exact amount, category, and day of month it recurs on (e.g., "Just to confirm, that's $50 for Hosting, every month on the 15th — should I set that up?"). Only after the user explicitly confirms (e.g. "yes", "correct"), call 'createRecurringSchedule'. Do not say it has been set up until AFTER you call the tool.

DATA QUESTIONS — THIS IS CRITICAL:
Never invent or calculate transactions, amounts, categories, vendors, tax mappings or totals. Use getReviewQueue for "what needs my attention", getUncategorizedTransactions to read uncategorized items, getSpendingSummary for any total (never add amounts up yourself), searchTransactions to find records, getPossibleDuplicates for duplicates, and getExchangeRateInfo for the stored rate on a converted peso payment. If a tool returns nothing, say so rather than guessing.
When the user names a ledger, pass that ledgerFilter and report only that ledger; otherwise use 'both'.
The user has limited vision — read each transaction back briefly as date, amount, vendor, and Business or Personal, and number them.

FAST REVIEW MODE:
When the user wants to work through their queue, call startReview, then for each item read it, ask for the category, confirm before saving, save with updateTransaction, and call navigateReview with 'next'. "Skip this one" is also 'next'; "go back" is 'previous'; "read that again" is 'repeat'.

TAX MAPPINGS:
Use getUnverifiedTaxMappings and explainTaxMapping to report status. To verify, call verifyTaxMapping with confirmed=false, read back the proposed mapping, ask for approval, and only call again with confirmed=true after an explicit yes. You may never create, guess or edit a TaxAct mapping's contents — only the user approves mappings.

Here is the JSON list of their recorded transactions (which includes their 'id') so you can identify which one to update/delete — not for computing totals:
${JSON.stringify(transactions || [])}

Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.${historyContext}`;
            tools = [{ functionDeclarations: [recordTransactionsTool, createRecurringScheduleTool, updateTransactionTool, deleteTransactionTool, verifyTaxMappingTool, ...readOnlyDataTools, ...reviewTools, endSessionTool] }];
          } else if (mode === 'accountant') {
            systemInstruction = `You are a professional Accountant AI.
The user is asking questions about their ${ledger} finance data via voice.

ANSWERING WITH REAL NUMBERS — THIS IS CRITICAL:
Every figure you state must come from a tool result, never from your own arithmetic and never from memory.
- Any "how much did I spend/earn", "what's my profit" question -> call getSpendingSummary with the relevant category, vendor, type and/or date range. Do NOT add up transactions yourself.
- "Show me transactions from X" / "show me my outsourcing expenses" -> call searchTransactions.
- "What needs my attention" -> call getReviewQueue. "Show me uncategorized" -> getUncategorizedTransactions. "Possible duplicates" -> getPossibleDuplicates.
- Tax mapping questions -> getUnverifiedTaxMappings and explainTaxMapping.
- "What exchange rate was used for X" -> getExchangeRateInfo, which returns the rate stored on that transaction. Never quote today's rate for a past payment.
If a tool returns no results, say so plainly instead of guessing. Never invent transactions, amounts, dates, categories, vendors, tax mappings or totals.

You may report what a tax mapping says, but you must never create, guess, edit or verify one.

LEDGER SAFETY: if the user names a ledger, pass that ledgerFilter and report only that ledger; otherwise use 'both'.

The user has limited vision, so keep answers clear, concise and sequential.
Here is their transaction list for identifying which record they mean — not for computing totals:
${JSON.stringify(transactions || [])}

If the user says goodbye, or indicates they have no further questions, you MUST call the 'endSession' tool to end the conversation.${historyContext}`;
            tools = [{ functionDeclarations: [...readOnlyDataTools, endSessionTool] }];
          } else if (mode === 'advisor') {
            systemInstruction = `You are a professional Financial Advisor AI.
You are analyzing the user's ${ledger} finance data via voice.

GROUNDING — THIS IS CRITICAL:
Advice may be your own, but every figure behind it must come from a tool result. Call getSpendingSummary for totals and trends (never add transactions up yourself) and searchTransactions to look at specific vendors or categories. Never invent or estimate transactions, amounts, dates, categories, vendors, tax mappings or totals. If the data isn't there, say so.
You may report what a tax mapping says, but never create, guess, edit or verify one.

LEDGER SAFETY: if the user names a ledger, pass that ledgerFilter and report only that ledger; otherwise use 'both'.

Here is their transaction list for context — not for computing totals:
${JSON.stringify(transactions || [])}

The user will ask for advice or insights on their spending/income trends. The user has limited vision, so keep responses clear and concise.
Keep your responses conversational and engaging. Do not use markdown since this is a voice conversation.
If the user says goodbye, or indicates they have no further questions, you MUST call the 'endSession' tool to end the conversation.${historyContext}`;
            tools = [{ functionDeclarations: [...readOnlyDataTools, endSessionTool] }];
          }

          let voiceName = "Aoede";
          if (mode === 'accountant') {
            voiceName = "Charon"; // boy
          } else if (mode === 'advisor') {
            voiceName = "Kore"; // another girl voice
          }

          const ai = getAiClient();
          console.log("Connecting to live API with mode:", mode, "ledger:", ledger);
          session = await ai.live.connect({
            model: "gemini-3.1-flash-live-preview",
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
              },
              systemInstruction: systemInstruction,
              tools: tools.length > 0 ? tools : undefined,
              inputAudioTranscription: {},
              outputAudioTranscription: {}
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                const parts = message.serverContent?.modelTurn?.parts;
                if (parts) {
                  for (const p of parts) {
                    if (p.inlineData?.data) {
                      clientWs.send(JSON.stringify({ audio: p.inlineData.data }));
                    }
                    if (p.text) {
                      clientWs.send(JSON.stringify({ text: p.text }));
                    }
                  }
                }
                
                // Also forward transcriptions as text
                if (message.serverContent?.outputTranscription) {
                  const text = message.serverContent.outputTranscription.text;
                  if (text) {
                    clientWs.send(JSON.stringify({ text: text }));
                  }
                }
                
                // Forward input transcription for when the user speaks
                if (message.serverContent?.interimInputTranscription) {
                  // Ignore interim for now or send as interim
                }
                if (message.serverContent?.inputTranscription) {
                  const text = message.serverContent.inputTranscription.text;
                  if (text) {
                    clientWs.send(JSON.stringify({ userText: text }));
                  }
                }
                
                if (message.serverContent?.interrupted) {
                  clientWs.send(JSON.stringify({ interrupted: true }));
                }
                if (message.serverContent?.turnComplete) {
                  clientWs.send(JSON.stringify({ turnComplete: true }));
                }
                if (message.toolCall) {
                  const call = message.toolCall.functionCalls?.[0];
                  if (call && [
                    "recordTransactions",
                    "createRecurringSchedule",
                    "updateTransaction",
                    "deleteTransaction",
                    "verifyTaxMapping",
                    // Read-only Firestore queries (Module 5)
                    "getReviewQueue",
                    "getUncategorizedTransactions",
                    "getPossibleDuplicates",
                    "getUnverifiedTaxMappings",
                    "explainTaxMapping",
                    "searchTransactions",
                    "getSpendingSummary",
                    "getExchangeRateInfo",
                    // Fast review mode cursor
                    "startReview",
                    "navigateReview",
                    "endSession"
                  ].includes(call.name)) {
                    if (call.name === "endSession") {
                      clientWs.send(JSON.stringify({ endSession: true }));
                      // We must also send a tool response so the model knows the tool succeeded
                      session.sendToolResponse({
                        functionResponses: [{
                          id: call.id,
                          name: call.name,
                          response: { result: "Session ended." }
                        }]
                      });
                    } else {
                      clientWs.send(JSON.stringify({
                        toolCall: call
                      }));
                    }
                  }
                }
              },
              onclose: (event) => {
                console.log("Live session closed", event);
              }
            }
          });
          isConnectedToLive = true;
          clientWs.send(JSON.stringify({ ready: true }));
          
          let introText = "";
          if (mode === 'unified') {
            introText = "Hi, I am your AI Finance Partner. Whether you need to record a transaction, ask about your past spending, or get financial advice, I'm here to help. What can I do for you today?";
          } else if (mode === 'bookkeeper') {
            introText = "Hi, I am your AI Bookkeeper. I am here to help you with your finances. Tell me what you bought or earned, and I will record the transaction for you.";
          } else if (mode === 'accountant') {
            introText = "Hi, I am your AI Accountant. How can I help you with your finances today? You can ask me questions about your recorded transactions, and I'll find the answers for you.";
          } else if (mode === 'advisor') {
            introText = "Hi, I am your AI Advisor. I can analyze your financial data and provide personalized insights and recommendations to help you reach your goals.";
          }

          if (introText) {
            session.sendClientContent({
              turns: [{
                role: "user",
                parts: [{ text: `The user has just opened the tab. Please introduce yourself exactly as follows: "${introText}"` }]
              }],
              turnComplete: true
            });
          }
          
        } else if (parsed.audio && isConnectedToLive && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
          });
        } else if (parsed.text && isConnectedToLive && session) {
          session.sendClientContent({
            turns: [{
              role: "user",
              parts: [{ text: parsed.text }]
            }],
            turnComplete: true
          });
        } else if (parsed.toolResponse && isConnectedToLive && session) {
          session.sendToolResponse({
            functionResponses: [parsed.toolResponse]
          });
        }
      } catch (e: any) {
        console.error('Error handling live session message', e);
        clientWs.send(JSON.stringify({ error: e.message || "Failed to start live session" }));
      }
    });

    clientWs.on("close", () => {
      if (session) {
        session.close();
      }
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

