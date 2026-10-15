#!/usr/bin/env node
/**
 * validate-missions-demo-data.mjs — STATIC drift guard for the loyalty-missions DEMO dataset.
 * No network, no env writes. Run: npm run td:validate:missions-demo
 *
 *  [1] demoMissionProblems() — presentation + non-vacuity contract (every card state appears, every goal
 *      type, an ending-soon and an open-ended mission, a buyer with nothing, a buyer with two rewards).
 *  [2] No GUID literal in the fixture, the spec module or the seeder; the ledger never in the base aliases.json.
 *  [3] The ledger key and the order marker keep their shape (`_` prefix; DEMO-MSN, never AGENT-TEST).
 *  [4] seed-demo.mjs lists loyalty-missions AFTER returns (returns orders placed later would feed progress).
 *  [5] Every committed ledger order carries the marker.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_MSN_LEDGER_KEY, DEMO_MSN_MARKER_PREFIX, demoMissionProblems, isDemoMsnMarker } from './missions-demo-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');

console.log('loyalty-missions DEMO dataset — static drift guard\n');
console.log('[1] demoMissionProblems()');
const declared = demoMissionProblems();
if (declared.length) declared.forEach(fail); else ok('presentation + non-vacuity contract holds');

console.log('[2] no GUID literals; ledger only in per-env overlays');
for (const rel of ['test-data/loyalty/missions-demo/missions-demo.json', 'scripts/seed-data/loyalty/missions-demo-specs.mjs', 'scripts/seed-data/loyalty/seed-missions-demo.mjs']) {
  if (GUID_RE.test(src(rel))) fail(`${rel} contains a GUID literal`); else ok(`${rel} — none`);
}
if (DEMO_MSN_LEDGER_KEY in JSON.parse(src('test-data/aliases.json'))) fail(`${DEMO_MSN_LEDGER_KEY} is in the base aliases.json`); else ok('ledger absent from the base aliases.json');

console.log('[3] ledger key + marker');
if (!DEMO_MSN_LEDGER_KEY.startsWith('_')) fail(`${DEMO_MSN_LEDGER_KEY} lost its leading "_"`); else ok(DEMO_MSN_LEDGER_KEY);
if (/AGENT-TEST|DEMO-SR|DEMO-RET/.test(DEMO_MSN_MARKER_PREFIX)) fail(`marker ${DEMO_MSN_MARKER_PREFIX} would be claimed by another family's sweep`); else ok(DEMO_MSN_MARKER_PREFIX);

console.log('[4] seed-demo family order');
const demo = src('scripts/seed-data/seed-demo.mjs');
const iRet = demo.indexOf("name: 'returns'"); const iMsn = demo.indexOf("name: 'loyalty-missions'");
if (iRet < 0 || iMsn < 0 || iMsn < iRet) fail('seed-demo.mjs must list loyalty-missions after returns'); else ok('returns → loyalty-missions');

console.log('[5] committed ledgers');
for (const f of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\..+\.json$/.test(n))) {
  const ledger = JSON.parse(src(`test-data/${f}`))[DEMO_MSN_LEDGER_KEY];
  if (!ledger) continue;
  const bad = (ledger.entities || []).filter((e) => e.type === 'order' && !isDemoMsnMarker(e.marker));
  if (bad.length) fail(`${f}: ${bad.length} ledger order(s) without a DEMO-MSN marker`); else ok(`${f}: ${(ledger.entities || []).length} entities, markers intact`);
}

console.log(problems.length ? `\nFAIL — ${problems.length} problem(s).` : '\nOK');
process.exit(problems.length ? 1 : 0);
