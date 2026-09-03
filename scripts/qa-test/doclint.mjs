#!/usr/bin/env node
/**
 * qa-test:doclint — check the `/qa-test` process surface for the defect classes a manual audit
 * found by hand, so the next one is caught by a script instead.
 *
 * Every check below corresponds to a real, measured defect in that audit:
 *
 *   DOC-001  a phase/step count that disagrees with the table right below it
 *            ("Eight ordered phases" over a nine-row table)
 *   DOC-002  an `npm run <script>` reference with no matching script in package.json
 *            (`model:lint` — known and already flagged in prose)
 *   DOC-003  a cited repo path that does not exist on disk
 *   DOC-004  a cited `§Section` that does not appear as a heading in the file it is cited from
 *   DOC-005  a `summary.json.<field>` named one way in the command and another in a skill
 *   DOC-006  a step label used at two nesting levels (`2a` as both a 1b sub-item and a top-level Step)
 *
 * Usage:
 *   node scripts/qa-test/doclint.mjs [--json] [--warn-only]
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const COMMAND = '.claude/commands/qa-test.md';
const SKILL_DIR = '.claude/skills/qa-test';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const warnOnly = argv.includes('--warn-only');

const files = [COMMAND, ...fs.readdirSync(SKILL_DIR).filter((f) => f.endsWith('.md')).map((f) => SKILL_DIR + '/' + f)];
const read = (p) => fs.readFileSync(p, 'utf8');
const findings = [];
const add = (code, file, line, detail) => findings.push({ code, file, line, detail });

const WORD_NUM = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/* ---------- DOC-001: a stated count vs the table that follows ---------- */
for (const f of files) {
  const lines = read(f).split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/^#{1,6}\s/.test(l)) return;   // a heading is a title, not a count claim over a table
    const m = l.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:ordered\s+)?(phases|steps|artifacts|gates|clauses|axes|sources|dispositions|outputs|dispatches)\b/i);
    if (!m) return;
    const claimed = WORD_NUM[m[1].toLowerCase()];
    // Only compare against a table that IMMEDIATELY follows (<=3 lines), then count every
    // contiguous data row. A table further down is a different subject, not this claim's evidence.
    let head = -1;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (lines[j].trim().startsWith('|')) { head = j; break; }
    }
    if (head === -1) return;
    let rows = 0, seenSep = false;
    for (let j = head; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t.startsWith('|')) break;
      if (/^\|[\s:|-]+\|$/.test(t)) { seenSep = true; continue; }
      if (seenSep) rows++;
    }
    if (seenSep && rows > 0 && rows !== claimed) {
      add('DOC-001', f, i + 1, `claims ${m[1]} ${m[2]} (${claimed}) but the table below has ${rows} rows`);
    }
  });
}

/* ---------- DOC-002: npm scripts ---------- */
const pkg = JSON.parse(read('package.json')).scripts || {};
for (const f of files) {
  read(f).split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
      if (!pkg[m[1]]) add('DOC-002', f, i + 1, `npm run ${m[1]} — no such script in package.json`);
    }
  });
}

/* ---------- DOC-003: cited repo paths ---------- */
const PATH_RE = /`((?:\.claude|scripts|ci|config|docs|regression|reports|test-data)\/[A-Za-z0-9._/\-*]+)`/g;
for (const f of files) {
  read(f).split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(PATH_RE)) {
      const p = m[1];
      if (p.includes('*') || p.includes('<')) continue;          // globs and placeholders
      if (/\/$/.test(p)) continue;                                // bare directories
      if (p.startsWith('reports/')) continue;                     // run outputs; may not exist yet
      if (!fs.existsSync(path.join(ROOT, p))) {
        add('DOC-003', f, i + 1, `cited path does not exist: ${p}`);
      }
    }
  });
}

/* ---------- DOC-004: cited §Sections ---------- */
const headingCache = new Map();
function headings(p) {
  if (!headingCache.has(p)) {
    const h = fs.existsSync(p)
      ? read(p).split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, '').toLowerCase())
      : null;
    headingCache.set(p, h);
  }
  return headingCache.get(p);
}
const norm = (s) => s.toLowerCase().replace(/[`*_]/g, '').trim();
for (const f of files) {
  read(f).split(/\r?\n/).forEach((l, i) => {
    // `<file>.md` … §Section  — only when the file is named on the same line
    const fileRef = l.match(/`?([A-Za-z0-9._/-]+\.md)`?/);
    if (!fileRef) return;
    for (const m of l.matchAll(/§([A-Z][A-Za-z0-9 '-]{3,40})/g)) {
      const want = norm(m[1]);
      if (/^\d/.test(want)) continue;                    // §1a, §9.1 — numeric, checked by eye
      const candidates = [
        path.join(path.dirname(f), fileRef[1]),
        path.join(ROOT, '.claude', fileRef[1]),
        path.join(ROOT, fileRef[1]),
      ];
      const target = candidates.find((c) => fs.existsSync(c));
      if (!target) continue;                              // DOC-003 owns a missing file
      const hs = headings(target);
      if (!hs) continue;
      // A citation may trail into prose ("§Artifact A says ..."), so a match on the first two
      // words of the cited name counts — the point is that the section EXISTS, not that the
      // sentence stopped at the right word.
      const prefix = want.split(/\s+/).slice(0, 2).join(' ');
      if (!hs.some((h) => {
        const n = norm(h);
        return n.includes(want) || want.includes(n) || n.includes(prefix);
      })) {
        add('DOC-004', f, i + 1, `§${m[1].trim()} not found as a heading in ${fileRef[1]}`);
      }
    }
  });
}

/* ---------- DOC-005: summary.json field spelling drift ---------- */
const fieldSites = new Map();   // field -> Set("file:line")
for (const f of files) {
  read(f).split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(/summary\.json\.([A-Za-z0-9_.]+)/g)) {
      const key = m[1].replace(/\.$/, '');
      if (!fieldSites.has(key)) fieldSites.set(key, new Set());
      fieldSites.get(key).add(`${f}:${i + 1}`);
    }
  });
}
// two fields that differ only by `.` vs `_` are the same field spelled two ways
const flat = [...fieldSites.keys()];
for (const a of flat) {
  for (const b of flat) {
    if (a >= b) continue;
    if (a.replace(/[._]/g, '') === b.replace(/[._]/g, '')) {
      add('DOC-005', COMMAND, 0, `summary.json field spelled two ways: \`${a}\` (${[...fieldSites.get(a)][0]}) vs \`${b}\` (${[...fieldSites.get(b)][0]})`);
    }
  }
}

/* ---------- DOC-006: a step label used at two nesting levels ---------- */
const topLevel = new Set();
for (const l of read(COMMAND).split(/\r?\n/)) {
  const m = l.match(/^#{2,4}\s+(?:Step\s+)?([0-9][a-z]?(?:-[a-z]+)?)\b/);
  if (m) topLevel.add(m[1]);
}
const subItems = new Map();
read(COMMAND).split(/\r?\n/).forEach((l, i) => {
  // Only a LETTER-SUFFIXED label is the citable form (`2a`, `1b`). A bare ordered-list numeral
  // inside a step is conventional markdown, and nothing cites "Step 4 item 3".
  const m = l.match(/^\s*([0-9][a-z]+)\.\s+\*\*/);
  if (m && topLevel.has(m[1])) subItems.set(m[1], i + 1);
});
for (const [label, line] of subItems) {
  add('DOC-006', COMMAND, line, `label \`${label}\` is used BOTH as a top-level step and as a sub-item — a citation to it is ambiguous`);
}

/* ---------- ratchet ----------
 * Same shape as CSV_LINT_BASELINE / XREF_BASELINE: a known, deliberately-deferred finding does not
 * block, but the count may never grow. Each entry says WHY it is accepted, so a reader can tell a
 * deferred decision from an unnoticed defect.
 */
const BASELINE = {
  'DOC-002': { count: 1, why: 'model:lint is documented as not implemented; the docs already say so rather than citing it as a live gate' },
  'DOC-006': { count: 0, why: 'both citable collisions were renamed in Phase 2 (1b item `2a` → `2-release`; Step 4 item `1b` → `4v`); any new one is a regression' },
};
const counts = {};
for (const f of findings) counts[f.code] = (counts[f.code] || 0) + 1;
const regressions = [];
for (const [code, n] of Object.entries(counts)) {
  const allowed = BASELINE[code]?.count ?? 0;
  if (n > allowed) regressions.push(`${code}: ${n} finding(s), baseline ${allowed}`);
}

/* ---------- report ---------- */
if (asJson) {
  console.log(JSON.stringify({ total: findings.length, counts, regressions, findings }, null, 2));
  process.exit(regressions.length && !warnOnly ? 1 : 0);
}

const byCode = {};
for (const f of findings) (byCode[f.code] ||= []).push(f);

console.log(`qa-test:doclint — ${files.length} file(s)\n`);
if (!findings.length) console.log('  clean\n');
for (const code of Object.keys(byCode).sort()) {
  const base = BASELINE[code];
  const over = byCode[code].length > (base?.count ?? 0);
  console.log(`${code}  (${byCode[code].length})${base ? `  [baseline ${base.count} — ${base.why}]` : ''}${over ? '  ** OVER BASELINE **' : ''}`);
  for (const f of byCode[code]) {
    console.log(`   ${f.file}${f.line ? ':' + f.line : ''}  ${f.detail}`);
  }
  console.log('');
}
console.log(`${findings.length} finding(s); ${regressions.length} code(s) over baseline.`);
for (const r of regressions) console.log('  OVER  ' + r);
process.exit(regressions.length && !warnOnly ? 1 : 0);
