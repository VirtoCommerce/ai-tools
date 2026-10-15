#!/usr/bin/env node
/**
 * validate-returns-demo-data.mjs — STATIC drift guard for the returns DEMO dataset.
 * No network, no env writes. Run: npm run td:validate:returns-demo
 *
 * The demo drops the `AGENT-TEST` prefix on purpose, so what replaces it as the delete handle — the
 * `DEMO-RET:` outerId marker and the `_`-prefixed ledger — fails SILENTLY when broken. These checks
 * are the ones nothing else runs.
 *
 *  [1] demoReturnProblems() — the spec module's own presentation + non-vacuity contract, called, not
 *      reimplemented.
 *  [2] No GUID literal in the fixture, the spec module or the seeder; the ledger never lands in the base aliases.json.
 *  [3] The buyer password is the `{{SR_DEMO_BUYER_PASSWORD}}` token, never a literal.
 *  [4] The ledger key starts with `_` (keeps td:reconcile check [11] from probing its GUIDs).
 *  [5] seed-demo.mjs orders the returns family AFTER the sales-rep family it reads orgs and buyers from.
 *  [6] Every committed ledger names only orders that carry the marker.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_RET_LEDGER_KEY, demoReturnProblems, isDemoRetMarker } from './returns-demo-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');

console.log('returns DEMO dataset — static drift guard\n');

console.log('[1] demoReturnProblems()');
const declared = demoReturnProblems();
if (declared.length) declared.forEach(fail); else ok('presentation + non-vacuity contract holds');

console.log('[2] no GUID literals; ledger only in per-env overlays');
for (const rel of ['test-data/orders/returns-demo/returns-demo.json', 'scripts/seed-data/orders/returns-demo-specs.mjs', 'scripts/seed-data/orders/seed-returns-demo.mjs']) {
  if (GUID_RE.test(src(rel))) fail(`${rel} contains a GUID literal`); else ok(`${rel} — none`);
}
if (DEMO_RET_LEDGER_KEY in JSON.parse(src('test-data/aliases.json'))) fail(`${DEMO_RET_LEDGER_KEY} is in the base aliases.json — it would resolve on every env`);
else ok('ledger absent from the base aliases.json');

console.log('[3] buyer password is a {{VAR}} token');
const seeder = src('scripts/seed-data/orders/seed-returns-demo.mjs');
if (!seeder.includes("resolvePassword('{{SR_DEMO_BUYER_PASSWORD}}')")) fail('seed-returns-demo.mjs no longer resolves SR_DEMO_BUYER_PASSWORD through resolvePassword()');
else ok('SR_DEMO_BUYER_PASSWORD via resolvePassword()');

console.log('[4] ledger key');
if (!DEMO_RET_LEDGER_KEY.startsWith('_')) fail(`${DEMO_RET_LEDGER_KEY} lost its leading "_"`); else ok(DEMO_RET_LEDGER_KEY);

console.log('[5] seed-demo family order');
const demo = src('scripts/seed-data/seed-demo.mjs');
const iSr = demo.indexOf("name: 'sales-rep'"); const iRet = demo.indexOf("name: 'returns'");
if (iSr < 0 || iRet < 0 || iRet < iSr) fail('seed-demo.mjs must list sales-rep before returns'); else ok('sales-rep → returns');

console.log('[6] committed ledgers');
for (const f of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\..+\.json$/.test(n))) {
  const ledger = JSON.parse(src(`test-data/${f}`))[DEMO_RET_LEDGER_KEY];
  if (!ledger) continue;
  const bad = (ledger.entities || []).filter((e) => e.type === 'order' && !isDemoRetMarker(e.marker));
  if (bad.length) fail(`${f}: ${bad.length} ledger order(s) without a DEMO-RET marker`); else ok(`${f}: ${(ledger.entities || []).length} entities, markers intact`);
}

console.log(problems.length ? `\nFAIL — ${problems.length} problem(s).` : '\nOK');
process.exit(problems.length ? 1 : 0);
