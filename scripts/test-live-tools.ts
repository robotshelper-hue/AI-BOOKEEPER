/**
 * Validates that the Gemini Live API accepts every tool declaration the server
 * sends, for each voice mode. A malformed schema is rejected at session setup,
 * so reaching `ready: true` proves the whole tool set is well-formed.
 *
 * Requires the dev server to be running (npm run dev).
 * Run with:  npx tsx scripts/test-live-tools.ts
 */

import WebSocket from 'ws';

const URL = process.env.APP_URL?.replace(/^http/, 'ws') || 'ws://localhost:3000';

const categories = [
  { name: 'Outsourcing', type: 'Expense', ledger: 'Business' },
  { name: 'Hosting', type: 'Expense', ledger: 'Business' },
  { name: 'Business Funding', type: 'Income', ledger: 'Business' },
];

const transactions = [
  { id: 't1', date: '2026-08-10', type: 'Expense', amount: 49, currency: 'USD', category: 'Uncategorized', vendor: 'PayPal' },
];

function testMode(mode: string): Promise<{ mode: string; ok: boolean; detail: string }> {
  return new Promise(resolve => {
    const ws = new WebSocket(`${URL}/live`);
    let settled = false;

    const finish = (ok: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* already closing */ }
      resolve({ mode, ok, detail });
    };

    const timer = setTimeout(() => finish(false, 'timed out after 30s'), 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        init: { ledger: 'Business', mode, transactions, categories, history: [] }
      }));
    });

    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.ready) {
        clearTimeout(timer);
        finish(true, 'session established — all tool declarations accepted');
      }
      if (msg.error) {
        clearTimeout(timer);
        finish(false, msg.error);
      }
    });

    ws.on('error', err => {
      clearTimeout(timer);
      finish(false, `websocket error: ${err.message}`);
    });
  });
}

(async () => {
  console.log(`Validating tool schemas against Gemini Live via ${URL}/live\n`);
  let failures = 0;

  for (const mode of ['unified', 'bookkeeper', 'accountant', 'advisor']) {
    const result = await testMode(mode);
    console.log(`  ${result.ok ? 'PASS' : 'FAIL'}  ${mode.padEnd(11)} ${result.detail}`);
    if (!result.ok) failures++;
  }

  console.log(`\n${failures === 0 ? 'All modes accepted.' : `${failures} mode(s) rejected.`}`);
  process.exit(failures > 0 ? 1 : 0);
})();
