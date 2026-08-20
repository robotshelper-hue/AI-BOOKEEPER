# AI Bookkeeper - Project Rules & Guidelines

## 1. Core Architecture & Stack
- **Frontend:** React + Vite, clean & responsive design.
- **Backend/Database:** Firebase (Authentication, Firestore).
- **AI Integration:** Gemini API (connected via secure server-side endpoint/functions to protect API keys).
- **Voice:** Gemini Live API — the browser streams microphone PCM over a WebSocket (`/live`) and Gemini
  handles speech-to-text, the conversation and text-to-speech. (Not the Web Speech API.)

## 2. Ledger System (Strict Rule)
- **Personal Finance:** Uses Philippine Peso (PHP) ONLY. Personal amounts are never converted.
- **Business Finance:** Reported in US Dollars (USD) ONLY.
- **CRITICAL:** The two ledgers must NEVER mix, and a ledger's reported currency never changes.
- **PHP-paid business expenses (Module 5):** A Business transaction may be *entered* in pesos. It is
  automatically converted to USD at the exchange rate published for that transaction's date, and stored
  with `amount`/`currency` in USD plus the original peso amount, the rate, the rate's date and its source.
  Reports, the Tax Center and the tax CSV always read the USD `amount`, so Business stays USD-only.
  A historical transaction always keeps the rate it was booked at — it is never re-converted at today's rate.
  Source: Frankfurter (ECB reference rates). Rates are never hard-coded or guessed; if a rate cannot be
  retrieved, the transaction is not saved. See `src/lib/exchangeRates.ts`.

## 3. Firestore Collections
- `Users`
- `Transactions`
- `Clients`
- `Categories` (Business categories MUST be TaxAct-compatible)
- `Settings`
- `AI Conversations`

## 4. AI Assistant Modes
- **Bookkeeper (Data Entry):** Converts natural language into structured JSON transactions. Asks for missing info (Ledger, Type, Amount, Vendor, Client, Category, Description, Date).
- **Accountant (Query):** Answers questions using only stored financial data. Never invents data.
- **Advisor (Analysis):** Analyzes historical data, identifies trends, and suggests improvements. Never modifies records.

## 5. Development Workflow
- **One Module at a Time:** Build, test, and verify each module before moving to the next.
- Do not attempt to build the entire application in a single prompt.
