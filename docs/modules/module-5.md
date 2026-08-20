# Module 5 — Voice-Controlled Review, Correction & Bookkeeper Assistant

Adds voice-driven review, correction, tax verification and PHP→USD conversion on top of the
existing Gemini Live voice pipeline. Modules 3 and 4 (Tax Center, CSV import/export, duplicate
detection, ledger separation) were not rewritten.

---

## 1. Answers come from Firestore, not from the model

Before Module 5 the assistant answered questions by reading a JSON dump of transactions in its
prompt and doing its own arithmetic. That conflicted with the standing rule in module-3 §9 that
totals must be computed programmatically.

`src/lib/voiceQueries.ts` now provides deterministic, Firestore-backed answers, exposed to the
model as function-calling tools. The model reports what a tool returns; it never adds anything up.

| Tool | Answers |
|---|---|
| `getReviewQueue` | "What needs my attention?" — counts by issue type |
| `getUncategorizedTransactions` | "Show me my uncategorized transactions" |
| `getPossibleDuplicates` | "Show me possible duplicates" |
| `getUnverifiedTaxMappings` | "What tax mappings need verification?" |
| `explainTaxMapping` | "Tell me about Outsourcing" |
| `searchTransactions` | "Show me everything from Hetzner" |
| `getSpendingSummary` | "How much did I spend on outsourcing this year?" |
| `getExchangeRateInfo` | "What exchange rate did you use for Ella's payment?" |
| `startReview` / `navigateReview` | Fast review mode: next / skip / go back / read again |
| `verifyTaxMapping` | Two-step, user-approved verification |

Every query is scoped by `userId` first, so the `ledgerFilter` argument can never widen access
beyond the signed-in user. Firestore security rules were not changed.

The pure computation in each is separated from Firestore I/O (`computeReviewQueue`,
`computeDuplicateGroups`, `computeSpendingSummary`), following the existing
`findDuplicateIndices`/`detectDuplicates` split in `src/lib/importAI.ts`, so the logic is testable.

## 2. Review queue

Derived on demand rather than stored, so an item leaves the queue as soon as the underlying problem
is fixed. Covers both ledgers. Flags: uncategorized, missing date, missing amount, possible
duplicate, ambiguous income/expense (the transaction's type contradicts its category's type), and
unverified tax mapping (Business only).

Duplicate matching uses the same key as import-time detection — date + amount + type + counterpart,
with Income comparing `client` and Expense comparing `vendor` — so a pair flagged at import is the
same pair flagged here. **Duplicates are never deleted automatically.**

## 3. Destructive actions require confirmation

Both `deleteTransaction` and `verifyTaxMapping` are two-step tools, enforced in code rather than by
prompt wording alone. The first call (`confirmed` absent/false) writes nothing and returns a
description for the assistant to read back; only a second call with `confirmed: true` commits.

`verifyTaxMapping` can only write `status`, `lastUpdated` and `updatedBy` — never the mapping's tax
category, form, section or TaxAct line. The AI therefore cannot create, guess or alter a TaxAct
mapping; it can only flip verification after the user's explicit yes. Verifying a mapping with no
proposed content is refused. The Tax Mapping screen has the same confirmation on its status dropdown.

## 4. Outsourcing category

A single `Outsourcing` Business expense category covers all outsourced VA work — social media, video,
automation, web design, appointment setting, lead generation and general VA work. No per-service
categories.

`src/lib/module5Migration.ts` runs once per user and is idempotent:
- renames the legacy `Virtual Assistants` category **in place** (keeping its document id, so any
  existing tax mapping link survives) and re-points its transactions to `Outsourcing`;
- adds the `Business Funding` income category if missing;
- seeds Outsourcing's proposed mapping — Contract Labor, Schedule C, Part II — Expenses,
  Contract Labor — Line 11 — as **Not Verified**.

It never overwrites a mapping the user has already verified or filled in.

## 5. PHP → USD conversion for Business

A Business transaction may be entered in pesos. `src/lib/exchangeRates.ts` converts it using the
rate published for that transaction's date and stores both sides:

| Field | Meaning |
|---|---|
| `amount` / `currency` | USD — what every report, total and CSV reads |
| `originalAmount` / `originalCurrency` | the peso amount actually paid |
| `exchangeRate` | rate applied |
| `exchangeRateDate` | date the rate was published for |
| `exchangeRateSource` | `frankfurter.dev (ECB reference rate)` |

Because the rate is stored on the transaction, a historical entry always reports the rate it was
booked at — today's rate is never used to recalculate a past payment.

Rates come from [Frankfurter](https://frankfurter.dev) (ECB reference rates; free, no API key, CORS
enabled). The ECB publishes on business days only, so a weekend or holiday date resolves to the most
recent published rate and `exchangeRateDate` records which one was used (verified: Sat 2026-08-15 →
2026-08-14; 2026-01-01 → 2025-12-31). Rates are never hard-coded or guessed: if one cannot be
retrieved, **nothing is saved** and the assistant says so.

Personal transactions remain PHP and are never converted. Editing the amount of a converted
transaction clears its now-stale rate provenance. CSV import is unchanged — it still forces the
ledger-native currency.

## 6. Testing

```bash
npx tsx scripts/test-module5.ts       # 50 checks: queue, duplicates, totals, tax-export gate, live rates
npm run dev                           # required for the two below
npx tsx scripts/test-live-tools.ts    # all tool schemas accepted by Gemini Live, all 4 modes
npx tsx scripts/test-voice-routing.ts # 21 spec phrases routed to the right tool, incl. confirmations
```

`test-voice-routing.ts` drives the real WebSocket → Gemini Live → function-call path using text
input, which the server handles identically to speech; only the transport differs. Actual microphone
audio still needs a human to verify.
