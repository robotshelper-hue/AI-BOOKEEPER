# Module 2 Checklist Insights & System Comparison

Based on the provided `module-2-checklist.pdf`, here is a breakdown of the requested requirements compared to our current system implementation.

## 1. Categories Collection in Firestore
**Requirement:** 
- Create a `Categories` collection in Firestore with fields: Category ID, Name, Ledger (Personal/Business), Active, Sort Order, Hidden Tax Mapping (Module 3).
- The AI should read this list dynamically before categorizing a transaction.
- If it cannot confidently match an existing category, it should ask the user instead of inventing a new one.

**Current Status in System:**
- **Partially Built.** We currently have categorization, but we might be relying on predefined types or Gemini's own categorization rather than dynamically pulling a custom `Categories` collection from Firestore and injecting it into the AI prompt. We also need to build the `Settings -> Categories` UI to manage these.

## 2. Voice AI & Natural Conversation
**Requirement:** 
- Voice starts/stops correctly.
- Speech-to-text accuracy.
- Gemini receives text, returns structured data, saves the transaction, and gives spoken confirmation.
- AI must ask clarifying questions (e.g., if only "$50" is said, it asks "What was the $50 for?").
- Contextual updates: "That was yesterday", "Change that to $47", "Delete that transaction" (asks for confirmation).

**Current Status in System:**
- **Mostly Complete.** The Voice AI, speech-to-text, and Gemini integration are implemented. The AI can parse structured data and save transactions.
- **Needs Verification:** We need to thoroughly test if the conversational memory is robust enough to handle "Change that to $47" or "Delete that transaction" perfectly according to the checklist.

## 3. Multiple Transactions & Ledger Routing
**Requirement:** 
- Process multiple transactions in one sentence (e.g., "I spent $37 on hosting, $11 on Pezner, and $5 on GetScreenshot").
- Automatic Ledger Routing: If the user is on the Business tab but says "I bought groceries for ₱1,500", it should route to Personal (PHP). If on the Personal tab and says "$500 from XYZ", it routes to Business (USD).

**Current Status in System:**
- **Mostly Complete.** Our function calling schema supports saving multiple transactions, and we have instructions/logic to differentiate Personal (PHP) and Business (USD). 

## 4. Accountant Mode
**Requirement:** 
- Answer questions like "How much did I spend this month?" using actual Firestore data. No invented numbers.

**Current Status in System:**
- **Complete.** We have the `Accountant` mode which retrieves transactions from Firestore to answer analytical queries accurately.

## 5. Firestore Structure & Security
**Requirement:** 
- Transactions must contain: User ID, Ledger, Income/Expense, Currency, Amount, Category, Vendor, Client, Date, Notes, Timestamp.
- User A cannot see User B's data (Firebase Security Rules).

**Current Status in System:**
- **Complete.** Our Firestore schema includes these fields, and we have deployed security rules enforcing `request.auth.uid == resource.data.userId`.

## Recommendations for Next Steps (Before Module 3)
1. **Dynamic Category Loading:** Modify the AI prompt context to fetch and inject the active categories from Firestore so the AI only uses predefined categories.
2. **Category Manager UI:** Build the `Settings -> Categories` interface with tabs for Personal (PHP) and Business (USD) as outlined in the document.
3. **Conversational Edge Cases:** Test and refine the AI's ability to update or delete the *immediately preceding* transaction based on conversational context.
