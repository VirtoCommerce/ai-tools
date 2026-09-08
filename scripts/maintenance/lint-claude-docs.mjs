#!/usr/bin/env node
/**
 * lint-claude-docs — the context-budget gate + the generalised doc-integrity ratchet.
 *
 *   npm run context:check        exit 1 on a budget breach or a ratchet regression, 2 if a source is unreadable
 *   npm run context:report       --json
 *
 * WHY. The 2026-09-07 audit measured 432K chars (~114K tokens) of always-loaded instructions, re-paid on
 * every turn AND every subagent dispatch, growing +59K chars/week with a deletion rate of ~0. PR 2 cut it to
 * ~110K. Nothing stops it growing back except this file. `.claude/rules/` is auto-loaded by the harness, so
 * the loading tier IS the directory — which is what makes the budget measurable.
 *
 * CHECKS
 *   BUDGET-001  CLAUDE.md + .claude/rules/*.md total chars  >  BUDGET.alwaysLoadedChars          (hard)
 *   BUDGET-002  any single line in those files              >  BUDGET.longestLineChars           (hard —
 *               a 30,459-char bullet is how CLAUDE.md hid 8K tokens in one "line")
 *   BUDGET-003  a SKILL.md body over ~5k tokens (Anthropic's verified Level-2 guidance)           (informational)
 *   DOC-002     `npm run <script>` with no such script in package.json                             (ratchet)
 *   DOC-003     a cited repo path that does not exist                                              (ratchet)
 *   DOC-004     a cited `file.md` … §Section with no such heading in that file                    (ratchet)
 *
 * DOC-002/003/004 generalise `scripts/qa-test/doclint.mjs` (which stays scoped to /qa-test and owns the
 * qa-test-specific DOC-001/005/006) to CLAUDE.md + every .claude/**\/*.md. They are RATCHETS, same shape as
 * CSV_LINT_BASELINE / XREF_BASELINE: the count may never GROW past BASELINE; shrinking it and lowering the
 * number is the burn-down. Exclusions are structural, not a hand list: a gitignored path (runtime artifact),
 * a placeholder (`SprintXX-XX`, `<slug>`, `*`), a prefix family (`npm run seed:`), a generic script name
 * that belongs to ANOTHER repo (`build`, `dev` in vc-frontend prose).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BUDGET = { alwaysLoadedChars: 80_000, longestLineChars: 2_500, skillBodyWarnChars: 19_000 };

// Ratchet baseline — measured 2026-09-08 right after PR 2. Lower a number when you fix findings; never raise one.
export const BASELINE = { 'DOC-002': 4, 'DOC-003': 45, 'DOC-004': 22 };

export const GENERIC_SCRIPTS = new Set(['build', 'dev', 'lint', 'test', 'start', 'typecheck', 'storybook', 'preview', 'format', 'install', 'serve', 'watch']);
export const PLACEHOLDER_RE = /XX|YYYY|NNN|<[^>]*>|\*|\{|Sprint-current|\.\.\.|…/;

export const posix = (p) => p.split(path.sep).join('/');

export function alwaysLoadedFiles(root = '.') {
  const rules = path.join(root, '.claude', 'rules');
  const list = ['CLAUDE.md'];
  if (fs.existsSync(rules)) for (const f of fs.readdirSync(rules).sort()) if (f.endsWith('.md')) list.push(`.claude/rules/${f}`);
  return list;
}

export function measureBudget(files, read = (f) => fs.readFileSync(f, 'utf8')) {
  const perFile = files.map((file) => {
    const s = read(file);
    let longest = 0;
    for (const l of s.split(/\r?\n/)) if (l.length > longest) longest = l.length;
    return { file, chars: s.length, longestLine: longest };
  });
  return { total: perFile.reduce((a, r) => a + r.chars, 0), longestLine: Math.max(0, ...perFile.map((r) => r.longestLine)), perFile };
}

export function isPlaceholderPath(p) { return PLACEHOLDER_RE.test(p); }

export function classifyScript(name, scripts) {
  if (scripts[name]) return 'ok';
  if (name.endsWith(':')) return 'prefix-family';
  if (GENERIC_SCRIPTS.has(name)) return 'generic-other-repo';
  return 'missing';
}

export function isGitIgnored(p, root = '.') {
  try { execFileSync('git', ['check-ignore', '-q', p], { cwd: root, stdio: 'ignore' }); return true; }
  catch (e) { return false; }   // status 1 = not ignored; git absent = treat as not ignored (finding stands)
}

export function ratchet(counts, baseline) {
  const over = Object.entries(counts).filter(([k, n]) => n > (baseline[k] ?? 0)).map(([k, n]) => ({ code: k, count: n, baseline: baseline[k] ?? 0 }));
  return { ok: over.length === 0, over };
}

export const norm = (s) => s.toLowerCase().replace(/[`*_]/g, '').trim();

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(p)); else if (e.name.endsWith('.md')) out.push(posix(p));
  }
  return out;
}

export function lint(root = '.') {
  const cwd = process.cwd(); process.chdir(root);
  try {
    const files = ['CLAUDE.md', ...walkMd('.claude')].filter((f) => fs.existsSync(f));
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts || {};
    const findings = [];
    const add = (code, file, line, detail) => findings.push({ code, file, line, detail });
    const PATH_RE = /`((?:\.claude|scripts|ci|config|docs|regression|reports|test-data|templates|plugins)\/[A-Za-z0-9._/\-*]+)`/g;
    const SEC_RE = /`((?:\.\.\/)*[A-Za-z0-9._/\-]+\.md)`[^§\n]{0,14}§ ?([^`.,;)|\n]{3,60})/g;
    const headings = new Map();
    const headsOf = (f) => {
      if (!headings.has(f)) {
        try { headings.set(f, fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => /^#{1,6} /.test(l)).map((l) => norm(l.replace(/^#+ /, '')))); }
        catch { headings.set(f, null); }
      }
      return headings.get(f);
    };
    const ignoredCache = new Map();
    const ignored = (p) => { if (!ignoredCache.has(p)) ignoredCache.set(p, isGitIgnored(p)); return ignoredCache.get(p); };

    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => {
        for (const m of l.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) if (classifyScript(m[1], pkg) === 'missing') add('DOC-002', f, i + 1, `npm run ${m[1]} — no such script`);
        for (const m of l.matchAll(PATH_RE)) {
          const p = m[1].replace(/\/$/, '');
          if (isPlaceholderPath(p) || fs.existsSync(p) || ignored(p) || ignored(p + '/')) continue;
          add('DOC-003', f, i + 1, `cited path does not exist: ${m[1]}`);
        }
        for (const m of l.matchAll(SEC_RE)) {
          let t = m[1];
          if (!/^(\.claude|docs|scripts|ci|config)\//.test(t)) t = posix(path.normalize(path.join(path.dirname(f), t)));
          const hs = headsOf(t);
          if (!hs) continue;                                      // DOC-003 owns a missing file
          const q = norm(m[2]).slice(0, 25);
          if (q.length < 3 || /^\d/.test(q)) continue;            // numbered anchors (§1a, §5.0) are checked by doclint's stricter form
          if (!hs.some((h) => h.startsWith(q) || h.includes(q))) add('DOC-004', f, i + 1, `§${m[2].trim()} not found as a heading in ${t}`);
        }
      });
    }
    const budget = measureBudget(alwaysLoadedFiles('.'));
    const skillsOver = walkMd('.claude/skills').filter((p) => path.basename(p) === 'SKILL.md')
      .map((p) => ({ file: p, chars: fs.readFileSync(p, 'utf8').length })).filter((r) => r.chars > BUDGET.skillBodyWarnChars).sort((a, b) => b.chars - a.chars);
    const counts = {}; for (const x of findings) counts[x.code] = (counts[x.code] || 0) + 1;
    for (const k of Object.keys(BASELINE)) counts[k] = counts[k] || 0;
    return { files: files.length, budget, skillsOver, findings, counts, ratchet: ratchet(counts, BASELINE) };
  } finally { process.chdir(cwd); }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json'), warnOnly = argv.includes('--warn-only');
  let r;
  try { r = lint('.'); } catch (e) { console.error(`context:check — cannot read a source: ${e.message}`); process.exit(2); }
  const budgetBreach = [];
  if (r.budget.total > BUDGET.alwaysLoadedChars) budgetBreach.push(`BUDGET-001 always-loaded set is ${r.budget.total.toLocaleString()} chars > ${BUDGET.alwaysLoadedChars.toLocaleString()}`);
  if (r.budget.longestLine > BUDGET.longestLineChars) budgetBreach.push(`BUDGET-002 longest line is ${r.budget.longestLine.toLocaleString()} chars > ${BUDGET.longestLineChars.toLocaleString()}`);
  if (asJson) { console.log(JSON.stringify({ ...r, budgetBreach, BUDGET, BASELINE }, null, 2)); }
  else {
    console.log(`context:check — always-loaded set ${r.budget.total.toLocaleString()} / ${BUDGET.alwaysLoadedChars.toLocaleString()} chars (~${Math.round(r.budget.total / 3.8).toLocaleString()} tokens per turn and per dispatch); longest line ${r.budget.longestLine.toLocaleString()} / ${BUDGET.longestLineChars.toLocaleString()}`);
    for (const p of r.budget.perFile) console.log(`   ${String(p.chars).padStart(7)}  ${p.file}`);
    if (r.skillsOver.length) console.log(`   [Informational] BUDGET-003 ${r.skillsOver.length} SKILL.md bodies over ~5k tokens: ${r.skillsOver.map((s) => `${path.basename(path.dirname(s.file))} (${(s.chars / 3800).toFixed(1)}k)`).join(', ')}`);
    for (const b of budgetBreach) console.error(`   ** ${b} **`);
    for (const k of Object.keys(r.counts).sort()) console.log(`   ${k}: ${r.counts[k]} (baseline ${BASELINE[k] ?? 0})${r.counts[k] > (BASELINE[k] ?? 0) ? '  ** OVER BASELINE **' : ''}`);
    for (const o of r.ratchet.over) for (const x of r.findings.filter((y) => y.code === o.code).slice(0, 12)) console.log(`      ${x.file}:${x.line}  ${x.detail}`);
    if (r.ratchet.over.length) console.log(`   (showing up to 12 per code; run with --json for all)`);
  }
  const red = budgetBreach.length > 0 || !r.ratchet.ok;
  process.exit(red && !warnOnly ? 1 : 0);
}
