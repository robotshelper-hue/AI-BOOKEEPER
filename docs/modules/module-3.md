# **Robots Helper AI Bookkeeper**

## **Module 3 — Tax Center, Tax Mapping & Tax-Ready Export**

Hi Romel,

Module 1 and Module 2 are complete.

We are now beginning **Module 3**.

The purpose of Module 3 is to turn the bookkeeping data we've been collecting into a clean, organized tax-preparation system.

**Do not rebuild Modules 1 or 2.**

Use the existing:
* Firebase project
* Firestore database
* Authentication
* Voice AI
* Gemini integration
* Transaction system
* Category Manager
* Business and Personal ledgers

---

# **IMPORTANT — TAX MAPPING RULE**

Do NOT guess or invent TaxAct field names.
Do NOT assume that a TaxAct field or Schedule C line is correct simply because a category sounds similar.
For now, build the tax-mapping architecture so that the exact mappings can be entered and verified later.
The tax mappings must be editable by the administrator.

---

# **1. Create the Tax Center**

Add a new section to the application:
⚙️ Settings
├── Categories
├── Clients
├── AI Settings
├── Tax Center
└── Tax Mapping

The Tax Center should only deal with the Business ledger.
Personal transactions should not be included in business tax reports.

---

# **2. Tax Year**

Create a tax-year system.
Every business transaction must belong to a tax year based on its transaction date.
For example:
2026
2027
2028

Do not manually assign the year if it can be calculated from the transaction date.
The Tax Center should allow me to select:
Tax Year: 2026
and later select other years.

---

# **3. Tax Mapping Database**

Create a Firestore collection for tax mappings.
Suggested collection:
taxMappings

Each mapping should contain:
* Mapping ID
* Business Category ID
* Business Category Name
* Tax Year
* Tax Form
* Tax Section
* Tax Category
* TaxAct Mapping
* Active
* Notes
* Last Updated
* Updated By

The TaxAct Mapping field should initially be blank unless we have specifically verified the correct mapping.

---

# **4. Connect Business Categories to Tax Mappings**

The existing Business Categories already contain:
* Category Name
* Ledger
* Income/Expense
* Active
* Display Order
* Hidden Tax Mapping
* Notes

Do not duplicate unnecessary category information.
Instead, connect each business category to its tax mapping.

Example:
Business Category: Hosting
Tax Mapping: [To be verified]

This allows the tax mapping to be changed later without changing the transaction itself.

---

# **5. Tax Mapping Administration Screen**

Create:
Settings → Tax Center → Tax Mapping

Display a table containing:
Business Category
Income/Expense
Tax Form
Tax Section
Tax Category
TaxAct Mapping
Status

Allow the administrator to edit the mapping.

---

# **6. Mapping Status**

Each mapping should have a status:
Not Verified
Verified
Needs Review

Do not allow the AI to mark a tax mapping as Verified.
Only the administrator can mark a mapping as Verified.

---

# **7. Business Income**

Create a separate tax report for business income.
The report should show: Date, Client, Description, Category, Amount, Tax Year.
Do not combine business income with personal income.

---

# **8. Business Expense Report**

Create a business expense report showing: Date, Vendor, Description, Category, Tax Category, Amount, Tax Year.
Allow filtering by Category, Date range, Tax Year, Vendor.

---

# **9. Profit & Loss**

Create a Profit & Loss report.
For the selected tax year: Total Business Income minus Total Business Expenses equals Net Business Profit.
Make sure all calculations come directly from Firestore transactions. Do not ask Gemini to calculate the totals.

---

# **10. Tax Review Dashboard**

Create a Tax Review dashboard.
This should allow me to identify problems before tax time (e.g., Uncategorized Transactions, Unverified Tax Mappings).

---

# **11. Uncategorized Transactions**

Create a report showing transactions that have no category, inactive category, no tax mapping, or unverified tax mapping.

---

# **12. Tax Review Workflow**

I should be able to go through each problem transaction, select a category/mapping, and have it disappear from the "Needs Review" list once corrected.

---

# **13. CSV Export**

Create a CSV Export function.
Location: Tax Center → Export
Allow selection of: Tax Year, Ledger, Date Range, Category, Export Type.
Main export: Business Tax CSV.

---

# **14. CSV Columns**

Date, Tax Year, Transaction Type, Amount, Currency, Vendor, Client, Description, Category, Tax Category, Tax Form, Tax Section, TaxAct Mapping, Notes.

---

# **15. CSV Rules**

One transaction per row. Preserve original amounts/dates. NEVER mix Personal transactions. The export NEVER converts currency at export time — it writes the stored `amount`/`currency` as-is. (A Business expense paid in pesos was already converted to USD when it was recorded, at that date's rate; the export simply uses that stored USD figure and never recalculates it.)

---

# **16. Separate Internal Data From Export Data**

Do not change the original transaction when generating the CSV. The CSV is generated from stored transaction and tax-mapping data.

---

# **17. Tax Year Locking**

Do not allow transactions from one tax year to accidentally appear in another.

---

# **18. Tax Export Validation**

Before generating the CSV, run validation. Show warnings for uncategorized transactions or missing tax mappings and allow fixing before export.

---

# **19. Do Not Give Tax Advice**

The software is organizing data, not replacing a tax professional.

---

# **20. AI Tax Assistant**

Gemini must not calculate totals. Actual totals must come from programmatic calculations.

---

# **21. Tax Center Voice Questions**

The AI can answer natural-language questions, but underlying numbers must come from Firestore.

---

# **22. Personal Finance Exclusion**

The Tax Center must ONLY use Ledger = Business.

---

# **23. Future-Proof the Architecture**

Do not hard-code tax mappings. Store them in Firestore.

---

# **24. Security**

Only the authenticated owner/admin should be able to change tax mappings, mark mappings as verified, export tax data, or view the Tax Center.

---

# **25. Testing**

9 specific test scenarios covering income, expenses, personal exclusion, tax years, categorization, mappings, P&L math, CSV structure, and security.

---

# **26. Important: Do NOT Finalize TaxAct Mappings Yet**

Leave actual TaxAct mapping values as Not Verified. Do not guess or invent.

