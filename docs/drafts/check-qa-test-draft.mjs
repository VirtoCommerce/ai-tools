// Validates docs/drafts/qa-test.draft.md AS IF it were .claude/commands/qa-test.md
import fs from 'node:fs';
import path from 'node:path';

const DRAFT = 'docs/drafts/qa-test.draft.md';
const TARGET_DIR = '.claude/commands';           // where it will live after merge
const BASELINE = JSON.parse(fs.readFileSync('scripts/maintenance/.prompt-size-baseline.json', 'utf8'));
const CAP = BASELINE['.claude/commands/qa-test.md'];

const s = fs.readFileSync(DRAFT, 'utf8');
const lines = s.split('\n');
let fail = 0;
const bad = (code, msg) => { console.log(`  ✗ ${code}  ${msg}`); fail++; };
const ok = (code, msg) => console.log(`  ✓ ${code}  ${msg}`);

console.log(`\n=== draft check: ${DRAFT} (target ${TARGET_DIR}/qa-test.md) ===\n`);

// 1 — size against the ratchet it must re-enter
console.log('[1] BUDGET-004 ratchet');
s.length <= CAP
  ? ok('SIZE', `${s.length} <= baseline ${CAP} (headroom ${CAP - s.length})`)
  : bad('SIZE', `${s.length} > baseline ${CAP} — must shed ${s.length - CAP} chars before merge`);

// 2 — heading tree: no skipped levels, mode markers present
console.log('\n[2] heading tree + mode markers');
const heads = [];
lines.forEach((l, i) => { const m = l.match(/^(#{2,4}) (.+)$/); if (m) heads.push({ lvl: m[1].length, text: m[2], n: i + 1 }); });
let prev = 2;
for (const h of heads) {
  if (h.lvl > prev + 1) bad('LEVEL', `L${h.lvl} follows L${prev} at :${h.n} — "${h.text.slice(0, 50)}"`);
  prev = h.lvl;
}
const modeSection = heads.findIndex(h => /^The steps/.test(h.text));
if (modeSection < 0) bad('SECTION', 'no "## The steps" section found');
const stepHeads = heads.slice(modeSection + 1).filter(h => h.lvl <= 4 && !/^(Constraints)/.test(h.text));
const unmarked = stepHeads.filter(h => !/\*\([^)]*(?:both paths|FULL only)[^)]*\)\*/.test(h.text));
unmarked.length
  ? unmarked.forEach(h => bad('MODE', `unmarked heading :${h.n} — "${h.text.slice(0, 60)}"`))
  : ok('MODE', `all ${stepHeads.length} step headings carry a mode marker`);

// 3 — the three mode sections exist and are in order
console.log('\n[3] three-section shape');
const want = ['FAST mode', 'FULL mode', 'The steps'];
const idx = want.map(w => heads.findIndex(h => h.text.startsWith(w)));
idx.some(i => i < 0)
  ? bad('SHAPE', `missing: ${want.filter((w, i) => idx[i] < 0).join(', ')}`)
  : (idx[0] < idx[1] && idx[1] < idx[2]
      ? ok('SHAPE', `FAST mode (L${heads[idx[0]].lvl}) -> FULL mode (L${heads[idx[1]].lvl}) -> The steps (L${heads[idx[2]].lvl})`)
      : bad('SHAPE', 'mode sections out of order'));

// 4 — every label in the flow block resolves to a section or an anchor in the body
console.log('\n[4] flow labels resolve');
const flow = s.match(/```\nFAST {3}1a[\s\S]*?```/);
if (!flow) bad('FLOW', 'flow code block not found');
else {
  const labels = [...new Set((flow[0].match(/\b(1[abcer]|1c-map|1e-plan|2|2a|2-topup|2-load|3|3a|3x|3-exec|3-cases|4|4a|4c|4v|5[abcdefhk]|5h-map|A|B|C1)\b/g) || []))];
  const body = s.slice(s.indexOf('## The steps'));
  const missing = labels.filter(L => !new RegExp(`\`?${L.replace(/[-]/g, '\\-')}\`?`).test(body));
  missing.length ? bad('LABEL', `named in the flow, absent from §The steps: ${missing.join(', ')}`)
                 : ok('LABEL', `all ${labels.length} flow labels appear in §The steps`);
}

// 5 — relative links resolve FROM THE MERGE TARGET, not from docs/drafts/
console.log('\n[5] relative links (resolved from the merge target)');
const links = [...s.matchAll(/\]\((\.\.?\/[^)#]+)(#[^)]*)?\)/g)].map(m => m[1]);
const dangling = [...new Set(links)].filter(rel => !fs.existsSync(path.resolve(TARGET_DIR, rel)));
dangling.length ? dangling.forEach(d => bad('LINK', `dangling from ${TARGET_DIR}/: ${d}`))
                : ok('LINK', `all ${new Set(links).size} relative links resolve`);

// 6 — section weight, to aim any cuts
console.log('\n[6] heaviest sections');
const acc = {}; let cur = '(head)', n = 0;
for (const l of lines) { if (/^#{2,4} /.test(l)) { acc[cur] = (acc[cur] || 0) + n; cur = l.replace(/\*\([^)]*\)\*/, '').slice(0, 58); n = 0; } n += l.length + 1; }
acc[cur] = (acc[cur] || 0) + n;
Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, v]) => console.log(`      ${String(v).padStart(6)}  ${k}`));

console.log(`\n=== ${fail === 0 ? 'PASS' : `FAIL — ${fail} problem(s)`} ===\n`);
process.exit(fail === 0 ? 0 : 1);
