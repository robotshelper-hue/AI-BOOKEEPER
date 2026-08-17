# AI Bookkeeper Module 2 - Intelligent Voice Bookkeeper

## 1. Natural-Language Transaction Recording
- Speak naturally to the Bookkeeper.
- AI should understand natural language and convert it into a structured transaction.

## 2. Determine the Correct Ledger
- Every transaction must belong to exactly one ledger: Personal or Business.
- Default to the currently selected ledger.
- If explicitly stated otherwise, use the specified ledger.
- If unsure, ask: "Is this Personal or Business?"

## 3. Currency
- Personal Finance uses PHP.
- Business Finance uses USD.
- Currency is normally determined by the selected ledger. Do not mix PHP and USD in one transaction.

## 4. Transaction Type
- Every transaction must be classified as Income or Expense.

## 5. Amount
- Extract the exact amount spoken.
- Do not convert currencies unless specifically asked.

## 6. Vendor and Client
- Expenses: Identify the vendor whenever possible.
- Business income: Identify the client whenever possible.
- If unknown, store as Unknown. Do not invent names.

## 7. Automatic Categorization
- Use existing category list in Firestore.
- If unsure between two categories, ask the user.

## 8. Date Recognition
- Understand natural-language dates (e.g., "Today", "Yesterday", "On July 15").
- Default to today's date if no date is provided.
- Store dates consistently.

## 9. Minimize Follow-Up Questions
- Ask as few questions as possible.
- If all required information is clear, save immediately.
- If information is missing, ask only for the missing information.

## 10. Confirmation
- Give a short confirmation after saving a transaction.

## 11. Correcting Transactions
- Allow natural language correction of the most recent relevant transaction.
- If asked to delete, ask for confirmation before deleting.

## 12. Multiple Transactions
- Enter multiple transactions in one statement.
- Create separate transactions for each and confirm the total.

## 13. Gemini Structured Output
- Return structured JSON (handled via function calling in our implementation).
- Validate before saving.

## 14. Security
- Enforce Firebase Security Rules (already deployed in Module 1).

## 15. Do Not Build TaxAct Export Yet
- Structure database to allow adding tax mapping later, but do not implement export yet.
