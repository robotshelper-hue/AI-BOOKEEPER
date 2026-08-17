# AI Bookkeeper - Project Rules & Guidelines

## 1. Core Architecture & Stack
- **Frontend:** React + Vite, clean & responsive design.
- **Backend/Database:** Firebase (Authentication, Firestore).
- **AI Integration:** Gemini API (connected via secure server-side endpoint/functions to protect API keys).
- **Voice:** Web Speech API for voice-to-text input.

## 2. Ledger System (Strict Rule)
- **Personal Finance:** Uses Philippine Peso (PHP) ONLY.
- **Business Finance:** Uses US Dollars (USD) ONLY.
- **CRITICAL:** Currencies and ledgers must NEVER mix.

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
