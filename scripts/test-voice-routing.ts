/**
 * Drives the real voice pipeline with the exact phrases from the Module 5 spec
 * and asserts the assistant calls the correct tool for each.
 *
 * This exercises the same WebSocket -> Gemini Live -> function-call path the
 * microphone uses; only the transport of the user's words differs (text instead
 * of audio), and the server treats both identically.
 *
 * Firestore is not involved: this harness answers each tool call with a canned
 * result, so what is being verified is intent routing and the confirmation
 * handshakes — not the query layer, which scripts/test-module5.ts covers.
 *
 * Requires the dev server to be running (npm run dev).
 * Run with:  npx tsx scripts/test-voice-routing.ts
 */

import WebSocket from 'ws';

const URL = process.env.APP_URL?.replace(/^http/, 'ws') || 'ws://localhost:3000';
const TURN_TIMEOUT_MS = 45000;

const categories = [
  { name: 'Outsourcing', type: 'Expense', ledger: 'Business' },
  { name: 'Hosting', type: 'Expense', ledger: 'Business' },
  { name: 'Business Funding', type: 'Income', ledger: 'Business' },
  { name: 'Software', type: 'Expense', ledger: 'Business' },
];

const transactions = [
  { id: 'tx-paypal', date: '2026-08-10', type: 'Expense', amount: 49, currency: 'USD', category: 'Uncategorized', vendor: 'PayPal', ledger: 'Business' },
  { id: 'tx-hetzner', date: '2026-08-12', type: 'Expense', amount: 37, currency: 'USD', category: 'Hosting', vendor: 'Hetzner', ledger: 'Business' },
];

/** Canned tool results, shaped like the real ones in voiceQueries.ts. */
const cannedResults: Record<string, any> = {
  getReviewQueue: {
    totalItems: 5,
    counts: { uncategorized: 2, missingDate: 0, missingAmount: 0, possibleDuplicate: 1, ambiguousType: 0, unverifiedTaxMapping: 2 },
    unverifiedTaxMappingCategories: ['Outsourcing', 'Software'],
    summary: '5 items need attention: 2 uncategorized, 1 possible duplicates, 2 categories with unverified tax mappings.',
  },
  getUncategorizedTransactions: {
    count: 1,
    transactions: [{ id: 'tx-paypal', spoken: 'August 10, $49.00, PayPal, Business', category: '' }],
    summary: 'Found 1 uncategorized transaction.',
  },
  getPossibleDuplicates: {
    groupCount: 1,
    groups: [{ reason: '2 transactions share the same date, amount, type and vendor: $37.00 to PlusVibe on August 12.', transactions: [] }],
    summary: 'Found 1 set of possible duplicates.',
    note: 'Duplicates are never deleted automatically.',
  },
  getUnverifiedTaxMappings: {
    count: 2,
    mappings: [
      { category: 'Outsourcing', status: 'Not Verified', taxCategory: 'Contract Labor', taxForm: 'Schedule C', taxSection: 'Part II — Expenses', taxActMapping: 'Contract Labor — Line 11', affectedTransactions: 3 },
      { category: 'Software', status: 'Not Verified', taxCategory: 'Other Expenses', taxForm: 'Schedule C', taxSection: 'Part II — Expenses', taxActMapping: 'Other — Line 27a', affectedTransactions: 1 },
    ],
    summary: 'You have 2 unverified tax mappings: Outsourcing, Software.',
  },
  explainTaxMapping: {
    found: true, category: 'Outsourcing', taxCategory: 'Contract Labor', taxForm: 'Schedule C',
    taxSection: 'Part II — Expenses', taxActMapping: 'Contract Labor — Line 11', status: 'Not Verified',
    summary: 'Outsourcing is mapped to Contract Labor on Schedule C, Part II — Expenses, TaxAct mapping Contract Labor — Line 11. It is not verified.',
  },
  searchTransactions: {
    count: 2,
    transactions: [
      { id: 'o1', spoken: 'August 10, $200.00, Rommel, Business' },
      { id: 'o2', spoken: 'August 15, $53.57, Ella, Business' },
    ],
    summary: 'Found 2 matching transactions.',
  },
  getSpendingSummary: {
    matchCount: 2,
    totals: [{ currency: 'USD', totalIncome: 0, totalExpense: 253.57, netProfit: -253.57, transactionCount: 2 }],
    summary: '2 transactions in USD: income $0.00, expenses $253.57, net -$253.57.',
  },
  getExchangeRateInfo: {
    count: 1,
    conversions: [{ vendor: 'Ella', originalAmount: 3000, exchangeRate: 0.01629, exchangeRateDate: '2026-08-14', exchangeRateSource: 'frankfurter.dev (ECB reference rate)' }],
    summary: '₱3000.00 converted to $48.87 at a rate of 0.01629 on 2026-08-14 (source: frankfurter.dev (ECB reference rate))',
  },
  startReview: {
    totalItems: 2, position: 1, transactionId: 'tx-paypal',
    transaction: 'August 10, $49.00, PayPal, Business', category: null,
    reviewReasons: ['Uncategorized'],
    summary: 'Reviewing 2 items. First: August 10, $49.00, PayPal, Business.',
  },
  navigateReview: {
    position: 2, totalItems: 2, transactionId: 'tx-navy',
    transaction: 'August 12, $125.00, Navy Federal, Business',
    summary: 'Item 2 of 2: August 12, $125.00, Navy Federal, Business.',
  },
  recordTransactions: { result: 'Transactions created successfully', newTransactionIds: ['new-1'] },
  updateTransaction: { result: 'Transaction updated successfully' },
};

/** Mirrors the real two-step guards so the handshake itself is under test. */
function respondTo(name: string, args: any): any {
  if (name === 'verifyTaxMapping') {
    if (args?.confirmed !== true) {
      return {
        pendingConfirmation: true,
        proposal: 'Outsourcing as Contract Labor on Schedule C, Part II — Expenses, Contract Labor — Line 11',
        status: 'Not Verified',
        instruction: 'Nothing has been changed. Ask the user whether to mark this mapping as Verified, then call again with confirmed=true only if they say yes.',
      };
    }
    return { result: 'Outsourcing is now verified.', status: 'Verified' };
  }
  if (name === 'deleteTransaction') {
    if (args?.confirmed !== true) {
      return {
        pendingConfirmation: true,
        transaction: 'August 12, $37.00, Hetzner, Business',
        instruction: 'Nothing has been deleted yet. Read it back and ask for confirmation, then call again with confirmed=true only if they say yes.',
      };
    }
    return { result: 'Transaction deleted successfully' };
  }
  return cannedResults[name] ?? { result: 'ok' };
}

interface Turn {
  say: string;
  expectTool?: string;
  /** Extra assertion on the captured tool args. */
  expectArgs?: (args: any) => string | null;
  /** True when this turn should NOT produce a write. */
  expectNoTool?: boolean;
}

interface TurnOutcome {
  say: string;
  toolsCalled: { name: string; args: any }[];
  text: string;
}

class Session {
  private ws: WebSocket;
  private ready = false;
  private toolsThisTurn: { name: string; args: any }[] = [];
  private textThisTurn = '';
  private turnResolve: (() => void) | null = null;
  private introDone = false;

  constructor(private mode = 'unified') {
    this.ws = new WebSocket(`${URL}/live`);
  }

  /**
   * Resolves only once the assistant's scripted intro turn has fully completed.
   * Waiting for that `turnComplete` (rather than a fixed delay) is what keeps
   * each later turn aligned with the utterance that caused it.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 60000);
      this.introResolve = () => { clearTimeout(timer); resolve(); };

      this.ws.on('open', () => {
        this.ws.send(JSON.stringify({
          init: { ledger: 'Business', mode: this.mode, transactions, categories, history: [] }
        }));
      });
      this.ws.on('error', err => { clearTimeout(timer); reject(err); });
      this.ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        if (msg.error) { clearTimeout(timer); reject(new Error(msg.error)); return; }
        if (msg.ready) { this.ready = true; return; }
        this.handle(msg);
      });
    });
  }

  private introResolve: (() => void) | null = null;

  private quietTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * A turn can span several server messages — a tool call, our tool response,
   * then the spoken result and its own turnComplete. Rather than guess which
   * turnComplete is the last, settle a turn once the stream has been quiet for
   * a moment. Audio chunks keep arriving while the model talks, so silence is a
   * reliable end-of-turn signal.
   */
  private bump(quietMs: number) {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    this.quietTimer = setTimeout(() => {
      if (!this.introDone) {
        this.introDone = true;
        this.textThisTurn = '';
        const r = this.introResolve;
        this.introResolve = null;
        if (r) r();
        return;
      }
      if (this.turnResolve) { const r = this.turnResolve; this.turnResolve = null; r(); }
    }, quietMs);
  }

  private handle(msg: any) {
    if (msg.toolCall) {
      this.toolsThisTurn.push({ name: msg.toolCall.name, args: msg.toolCall.args });
      this.ws.send(JSON.stringify({
        toolResponse: {
          id: msg.toolCall.id,
          name: msg.toolCall.name,
          response: respondTo(msg.toolCall.name, msg.toolCall.args),
        }
      }));
    }
    if (msg.text) this.textThisTurn += msg.text;
    if (msg.toolCall || msg.text || msg.audio || msg.turnComplete) {
      this.bump(this.introDone ? 2500 : 3000);
    }
  }

  /** Sends one user utterance and waits for the assistant to finish replying. */
  say(text: string): Promise<TurnOutcome> {
    this.toolsThisTurn = [];
    this.textThisTurn = '';
    return new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        this.turnResolve = null;
        resolve({ say: text, toolsCalled: [...this.toolsThisTurn], text: this.textThisTurn });
      };
      this.turnResolve = done;
      setTimeout(done, TURN_TIMEOUT_MS);
      this.ws.send(JSON.stringify({ text }));
      this.bump(2500);
    });
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

const scenarios: { title: string; turns: Turn[] }[] = [
  {
    title: 'Spec Tests 1-2 — attention summary, then read uncategorized',
    turns: [
      { say: 'What needs my attention?', expectTool: 'getReviewQueue' },
      { say: 'Show me all my uncategorized transactions.', expectTool: 'getUncategorizedTransactions' },
    ],
  },
  {
    title: 'Spec Tests 7-8 — duplicates and unverified mappings',
    turns: [
      { say: 'Show me possible duplicates.', expectTool: 'getPossibleDuplicates' },
      { say: 'Show me tax mappings that still need verification.', expectTool: 'getUnverifiedTaxMappings' },
    ],
  },
  {
    title: 'Spec Tests 9-10 — ledger isolation',
    turns: [
      {
        say: 'Show me all my business transactions that need review.',
        expectTool: 'getReviewQueue',
        expectArgs: a => a?.ledgerFilter === 'Business' ? null : `expected ledgerFilter "Business", got "${a?.ledgerFilter}"`,
      },
      {
        say: 'Show me my personal transactions that need review.',
        expectTool: 'getReviewQueue',
        expectArgs: a => a?.ledgerFilter === 'Personal' ? null : `expected ledgerFilter "Personal", got "${a?.ledgerFilter}"`,
      },
    ],
  },
  {
    title: 'Add-On 4 — outsourcing search and totals from Firestore',
    turns: [
      { say: 'Show me all my outsourcing expenses.', expectTool: 'searchTransactions' },
      { say: 'How much did I spend on outsourcing this year?', expectTool: 'getSpendingSummary' },
    ],
  },
  {
    title: 'Add-On 5-6 — explain a mapping, then verify it with confirmation',
    turns: [
      { say: 'Show me my unverified tax mappings.', expectTool: 'getUnverifiedTaxMappings' },
      { say: 'Tell me about Outsourcing.', expectTool: 'explainTaxMapping' },
      {
        say: 'Verify the Outsourcing tax mapping.',
        expectTool: 'verifyTaxMapping',
        expectArgs: a => a?.confirmed === true ? 'verified immediately without asking first' : null,
      },
      {
        say: 'Yes.',
        expectTool: 'verifyTaxMapping',
        expectArgs: a => a?.confirmed === true ? null : 'did not commit the verification after the user said yes',
      },
    ],
  },
  {
    title: 'Add-On 6 — saying No must leave the mapping Not Verified',
    turns: [
      { say: 'Verify the Outsourcing tax mapping.', expectTool: 'verifyTaxMapping' },
      { say: 'No, leave it.', expectNoTool: true },
    ],
  },
  {
    title: 'Spec 7 — deletion requires confirmation',
    turns: [
      {
        say: 'Delete the Hetzner transaction.',
        expectTool: 'deleteTransaction',
        expectArgs: a => a?.confirmed === true ? 'deleted immediately without asking first' : null,
      },
      {
        say: 'Yes, delete it.',
        expectTool: 'deleteTransaction',
        expectArgs: a => a?.confirmed === true ? null : 'did not commit the deletion after the user said yes',
      },
    ],
  },
  {
    title: 'Spec 5 — fast review mode with next',
    turns: [
      { say: 'I want to review my transactions one at a time.', expectTool: 'startReview' },
      { say: 'Next.', expectTool: 'navigateReview' },
    ],
  },
  {
    title: 'Add-On 3 + PHP conversion — peso amount recorded as Outsourcing',
    turns: [
      {
        say: 'I paid Ella 3000 pesos last Saturday for outsourcing.',
        expectTool: 'recordTransactions',
        expectArgs: a => {
          const tx = a?.transactions?.[0];
          if (!tx) return 'no transaction in the call';
          if (tx.currency !== 'PHP') return `expected currency PHP, got ${tx.currency}`;
          if (tx.category !== 'Outsourcing') return `expected category Outsourcing, got ${tx.category}`;
          if (Number(tx.amount) !== 3000) return `expected amount 3000, got ${tx.amount}`;
          if (tx.ledger !== 'Business') return `expected Business ledger, got ${tx.ledger}`;
          return null;
        },
      },
    ],
  },
  {
    title: 'Add-On — VA work of several kinds still uses one category',
    turns: [
      {
        // Date included so the assistant records rather than (correctly) asking
        // for it — what is under test here is that several kinds of VA work
        // still collapse into the one Outsourcing category.
        say: 'Today I paid my VA team 500 dollars for social media, automation and web work.',
        expectTool: 'recordTransactions',
        expectArgs: a => {
          const txs = a?.transactions ?? [];
          if (txs.length !== 1) return `expected 1 transaction, got ${txs.length}`;
          if (txs[0].category !== 'Outsourcing') return `expected Outsourcing, got ${txs[0].category}`;
          return null;
        },
      },
    ],
  },
  {
    title: 'Add-On 8 — stored exchange rate is reported, not recalculated',
    turns: [
      { say: "What exchange rate did you use for Ella's payment?", expectTool: 'getExchangeRateInfo' },
    ],
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Driving the live voice pipeline at ${URL}/live\n`);
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n${scenario.title}`);
    const session = new Session('unified');
    try {
      await session.connect();
      for (const turn of scenario.turns) {
        const outcome = await session.say(turn.say);
        const names = outcome.toolsCalled.map(t => t.name);
        const label = `"${turn.say}"`;

        if (turn.expectNoTool) {
          const wrote = outcome.toolsCalled.filter(t =>
            ['verifyTaxMapping', 'deleteTransaction', 'recordTransactions', 'updateTransaction'].includes(t.name)
          );
          if (wrote.length === 0) { passed++; console.log(`  PASS  ${label} -> no write performed`); }
          else { failed++; console.log(`  FAIL  ${label} -> unexpectedly called ${wrote.map(w => w.name).join(', ')}`); }
          continue;
        }

        const match = outcome.toolsCalled.find(t => t.name === turn.expectTool);
        if (!match) {
          failed++;
          console.log(`  FAIL  ${label} -> expected ${turn.expectTool}, got [${names.join(', ') || 'no tool call'}]`);
          if (outcome.text) console.log(`          said: "${outcome.text.trim().slice(0, 140)}"`);
          continue;
        }

        const argError = turn.expectArgs ? turn.expectArgs(match.args) : null;
        if (argError) {
          failed++;
          console.log(`  FAIL  ${label} -> ${turn.expectTool} called but ${argError}`);
        } else {
          passed++;
          console.log(`  PASS  ${label} -> ${turn.expectTool}`);
          if (turn.expectArgs) console.log(`          args: ${JSON.stringify(match.args).slice(0, 160)}`);
        }
      }
    } catch (error: any) {
      failed++;
      console.log(`  FAIL  scenario errored: ${error.message}`);
    } finally {
      session.close();
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
})();
