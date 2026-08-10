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
            description: "Deletes an existing transaction by ID.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING }
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

          
          const historyContext = history && history.length > 0 
            ? `\n\nHere is the recent conversation history for context:\n${history.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}` 
            : '';

          const categoriesContext = categories && categories.length > 0
            ? `\n\nHere is the list of active categories you MUST use:\n${JSON.stringify(categories.map((c: any) => ({ name: c.name, type: c.type, ledger: c.ledger })))}\nDo not invent new categories. If you are unsure which category to use, ask the user.`
            : `\n\nNo predefined categories found. Use your best judgment to categorize.`;

          if (mode === 'unified') {
            systemInstruction = `You are a unified AI Finance Partner (Bookkeeper, Accountant, and Advisor).
The current ledger is: ${ledger}.
- If Personal: The currency is PHP.
- If Business: The currency is USD.

CORE BEHAVIORS (Intelligent Voice Bookkeeper):
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency Constraints**: Personal uses PHP. Business uses USD. Do not automatically convert currencies. Do not mix PHP and USD in one transaction.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).

5. **Categorization**: Use the most appropriate existing category.${categoriesContext} 
CRITICAL: You MUST verify the category against the provided list BEFORE calling any tool. If the user mentions a category (like "Subscriptions") that is NOT in the active categories list (for example, if only "Software" exists), you MUST NOT call the recordTransactions tool. Instead, stop and ask the user which existing category to use, or suggest a close match. Do NOT invent new categories. Do NOT call the tool with a made-up category.

6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately. If missing info, ask ONLY for that info.
7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded ₱1,500 for Groceries as a Personal expense.").
8. **Corrections & Deletions**: You can update or delete transactions using natural language (e.g., "Change that to $47", "Delete the last transaction"). Ask for confirmation before deleting.
9. **Multiple Transactions**: You can record multiple transactions in one statement.
10. **Ending the Session**: When the user says goodbye, or if you ask if they need anything else and they say no, you MUST call the 'endSession' tool to gracefully end the conversation.
11. **Recurring Transactions**: If the user's language implies this transaction repeats (e.g. "every month", "monthly", "each month on the 15th", "my rent is $500 a month", "I have a subscription for..."), do NOT call recordTransactions. First, verbally confirm the exact amount, category, and day of month it recurs on (e.g., "Just to confirm, that's $50 for Hosting, every month on the 15th — should I set that up?"). Only after the user explicitly confirms (e.g. "yes", "correct"), call 'createRecurringSchedule'. Do not say it has been set up until AFTER you call the tool.

You have tools to 'recordTransactions', 'createRecurringSchedule', 'updateTransaction', 'deleteTransaction', and 'endSession'. Use them!

Q&A / ACCOUNTANT:
If they ask about past transactions, use the following JSON list of their recorded transactions (which includes their 'id'):
${JSON.stringify(transactions || [])}

ANALYSIS / ADVISOR:
If they ask for insights, advice, or trends, analyze the provided transactions and give them professional financial advice.
Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.
${historyContext}`;
            tools = [{ functionDeclarations: [recordTransactionsTool, createRecurringScheduleTool, updateTransactionTool, deleteTransactionTool, endSessionTool] }];
          } else if (mode === 'bookkeeper') {
            systemInstruction = `You are an intelligent AI Bookkeeper assistant.
The current ledger is: ${ledger}.
- If Personal: The currency is PHP.
- If Business: The currency is USD.

CORE BEHAVIORS:
1. **Natural Language Recording**: Extract the correct ledger, transaction type (Income/Expense), amount, currency, date, category, and vendor/client from the user's speech.
2. **Determine Ledger**: Default to the current ledger. If the user explicitly states otherwise, use the specified ledger. If unclear, ask: "Is this Personal or Business?" Do not guess.
3. **Currency Constraints**: Personal uses PHP. Business uses USD. Do not automatically convert currencies.
4. **Dates**: Understand natural dates. If no date is provided, use today's date (YYYY-MM-DD).

5. **Categorization**: Use the most appropriate existing category.${categoriesContext} 
CRITICAL: You MUST verify the category against the provided list BEFORE calling any tool. If the user mentions a category (like "Subscriptions") that is NOT in the active categories list (for example, if only "Software" exists), you MUST NOT call the recordTransactions tool. Instead, stop and ask the user which existing category to use, or suggest a close match. Do NOT invent new categories. Do NOT call the tool with a made-up category.

6. **Efficiency**: Ask as few questions as possible. If all info is clear, save immediately using 'recordTransactions'.
7. **Confirmation**: Do NOT say you have saved or recorded the transaction until AFTER you call the tool. Call the tool first. Keep confirmations short (e.g., "Done. I recorded $37 for Hosting as a Business expense.").
8. **Corrections & Deletions**: You can update or delete transactions. Ask for confirmation before deleting.
9. **Multiple Transactions**: You can record multiple transactions in one statement.
10. **Ending the Session**: When the user says goodbye, or if you ask if they need anything else and they say no, you MUST call the 'endSession' tool to gracefully end the conversation.
11. **Recurring Transactions**: If the user's language implies this transaction repeats (e.g. "every month", "monthly", "each month on the 15th", "my rent is $500 a month", "I have a subscription for..."), do NOT call recordTransactions. First, verbally confirm the exact amount, category, and day of month it recurs on (e.g., "Just to confirm, that's $50 for Hosting, every month on the 15th — should I set that up?"). Only after the user explicitly confirms (e.g. "yes", "correct"), call 'createRecurringSchedule'. Do not say it has been set up until AFTER you call the tool.

Here is the JSON list of their recorded transactions (which includes their 'id') so you can find which one to update/delete:
${JSON.stringify(transactions || [])}

Keep your responses conversational and engaging, as they are spoken out loud. Do not use markdown formatting.${historyContext}`;
            tools = [{ functionDeclarations: [recordTransactionsTool, createRecurringScheduleTool, updateTransactionTool, deleteTransactionTool, endSessionTool] }];
          } else if (mode === 'accountant') {
            systemInstruction = `You are a professional Accountant AI.
The user is asking questions about their ${ledger} finance data via voice.
Here is the JSON list of their recorded transactions:
${JSON.stringify(transactions || [])}

Answer the user's question accurately based ONLY on the data provided above.
Keep your responses concise and conversational since they are spoken out loud.
If the user says goodbye, or indicates they have no further questions, you MUST call the 'endSession' tool to end the conversation.${historyContext}`;
            tools = [{ functionDeclarations: [endSessionTool] }];
          } else if (mode === 'advisor') {
            systemInstruction = `You are a professional Financial Advisor AI.
You are analyzing the user's ${ledger} finance data via voice.
Here is the JSON list of their recorded transactions:
${JSON.stringify(transactions || [])}

The user will ask for advice or insights on their spending/income trends.
Keep your responses conversational and engaging. Do not use markdown since this is a voice conversation.
If the user says goodbye, or indicates they have no further questions, you MUST call the 'endSession' tool to end the conversation.${historyContext}`;
            tools = [{ functionDeclarations: [endSessionTool] }];
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
                  if (call && ["recordTransactions", "createRecurringSchedule", "updateTransaction", "deleteTransaction", "endSession"].includes(call.name)) {
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

