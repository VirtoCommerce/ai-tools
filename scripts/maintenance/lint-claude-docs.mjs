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
 *   DOC-006     a DERIVED count (suites / test cases / selection groups) transcribed into the
 *               always-loaded set, where it silently rots                                        (ratchet)
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
// All three baselines were non-zero until 2026-09-08, and none of the three numbers meant what it said.
// Each rule was comparing a citation against the wrong thing, so each carried a mix of phantom findings
// and real ones — and the phantoms are what pinned the baseline, which in turn hid the real ones.
//   DOC-002 (4)  — every finding was a line SAYING the script does not exist ("`npm run model:lint` is
//                  not implemented, do not cite it as a gate"). Now declared with `doclint:may-not-exist`.
//   DOC-003 (43) — checked the backticked LABEL against the repo root instead of the link TARGET
//                  relative to the citing file. 30 were `reports/` artifacts that are ephemeral by
//                  policy (now DOC-003E, informational); 3 real broken links had been passing.
//   DOC-004 (18) — matched the first 25 characters of a citation that runs on into the sentence around
//                  it, so `§Effort routing records that the…` missed "## Effort routing, and why…".
//                  9 were phantom, 9 were genuinely stale citations and were repointed.
// 0 is the real number for all three, and a ratchet at 0 is the only one that catches the next one.
export const BASELINE = { 'DOC-002': 0, 'DOC-003': 0, 'DOC-004': 0, 'DOC-006': 0 };

/** Codes reported for information but never ratcheted — see DOC-003E on `isEphemeralPath`. */
export const INFORMATIONAL = new Set(['DOC-003E']);

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

/**
 * A citation under `reports/` is EPHEMERAL by the repo's own retention policy
 * (`.claude/rules/reports.md` §9 — run folders are gitignored and pruned), and the reports tree was
 * pruned at HEAD. So "reports/regression/REG-2026-07-24-2121/ does not exist" is not a broken
 * reference the way a missing script is: it is a run id cited as PROVENANCE, and the reader is meant
 * to recognise it, not open it. Reported as DOC-003E (informational) rather than counted against the
 * DOC-003 ratchet — 30 of these were masking 13 real dangling paths and pinning the baseline at a
 * number no amount of fixing could reduce.
 */
export const isEphemeralPath = (p) => /^reports\//.test(p);

/**
 * Marker declaring that the paths and `npm run` scripts here name things that DO NOT EXIST YET.
 *
 * Some of this corpus is deliberately about absent artifacts — TIER.md's "Tier D — What's Missing"
 * table and its migration checklist, and the three places that say in as many words *"`npm run
 * model:lint` is not implemented, do not cite it as a gate"*. Every one of those was a DOC-002/003
 * finding, so the gate was reporting the corpus's most careful sentences as defects while the real
 * broken links sat under the same number. The prose already says it; this lets the linter read it.
 *
 * On a line: exempts that line. On its own line (a standalone HTML comment): exempts to the next
 * `## ` heading. Deliberately narrow — it suppresses existence checks only, never § or budget rules.
 */
export const MAY_NOT_EXIST = 'doclint:may-not-exist';

/**
 * A count that `config/test-suites.json` already knows, written into prose instead.
 *
 * `CLAUDE.md` §Where the rules live is explicit — *"Counts (suites, cases, agents…) are never
 * transcribed into prose — run the script that prints them"* — and the reason is measured: every
 * contradiction the 2026-09-07 audit found was in a fact that had been restated. The always-loaded
 * set is the worst place for one, because a wrong number there reaches every agent on every dispatch.
 *
 * Checked 2026-09-09, `.claude/rules/regression.md` claimed 126 suites (135), 4,155 test cases
 * (4,503) and 37 selection groups — three numbers, all stale, in the tier that costs the most, in a
 * file that told the reader two paragraphs later that the manifest was the source of truth. Prose
 * cannot be trusted to stay right; only a gate can.
 *
 * Deliberately narrow: it fires on a NUMBER adjacent to one of these nouns, not on every digit. A
 * count that happens to be correct today still fails — the defect is the transcription, not the
 * arithmetic, and a correct number is simply a stale one that has not rotted yet.
 *
 * Two exemptions, because a gate that cries wolf gets its baseline raised, which is the failure this
 * rule exists to prevent. Both describe a measurement of a PAST event, which cannot drift:
 *   - the line carries a date (`2026-09-09`) — that is this corpus's convention for a measured fact
 *   - the count is the M of an "N of M" proportion ("5 of 34 cases lost") — an outcome, not a size
 */
export const DERIVED_COUNT_RE =
  /\b(\d(?:[\d,]*\d)?)\s+(suites?|test cases?|selection groups?|groups?|agents?|skills?|commands?|cases?\b(?!\s*(?:sensitive|study)))/gi;
const PROPORTION_RE = /\d+\s+of\s+$/;
/** "up to 3 suites in parallel", "max 3 concurrent" — a BOUND on concurrency, not an inventory. */
const BOUND_RE = /(?:up to|at most|max(?:imum)?(?: of)?)\s+$/i;

/**
 * Is this DERIVED_COUNT_RE hit a live corpus claim, or the M of an "N of M" proportion?
 *
 * Two exemptions, both structural rather than guesses, and both about what the number DENOTES:
 * "5 of 34 cases lost" measures an outcome, and "up to 3 suites in parallel" is a bound on
 * concurrency. Neither is an inventory of the corpus, which is the only thing that drifts as suites
 * and agents are added.
 *
 * A date exemption was tried first and removed. Paragraphs here are single lines of up to 2,500
 * characters, so "there is a date somewhere on this line" let one dated clause exempt every count in
 * the paragraph — `126 suites (measured 2026-09-09) and 4,155 test cases` passed whole — and no
 * proximity window separates that from a genuinely dated measurement, because in both the date sits a
 * few characters from the number. The right answer was not a cleverer heuristic: prose in this tier
 * should not be writing counts at all, so the one sentence of mine that needed the exemption was
 * rewritten instead. `doclint:may-not-exist` remains the escape hatch for a real exception.
 */
export function isTranscribedCount(line, matchIndex) {
  const before = line.slice(0, matchIndex);
  return !PROPORTION_RE.test(before) && !BOUND_RE.test(before);
}

/** A markdown link target immediately following a backticked label: `` `label` ``](target). */
const LINK_RE = /^\]\(([^)\s]*)\)/;

/** A link target that leaves the repository: any URI scheme (`https:`, `mailto:`, and a Windows
 *  `C:` drive too) or a protocol-relative `//host/…`. */
const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * What a citation actually points at.
 *
 * A backticked path inside a markdown link is a LABEL, and the link TARGET is what a reader follows.
 * `[`templates/test-model.md`](../templates/test-model.md)` in `.claude/commands/` resolves to
 * `.claude/templates/test-model.md` and is perfectly fine — checking the label against the repo root
 * reported it as dangling for as long as this rule existed. Returns `null` for a bare `#anchor` link,
 * which targets the citing file itself and names no path.
 */
export function citationTarget(label, rest) {
  const link = LINK_RE.exec(rest);
  // A citation linked to a URL makes no claim about a path in THIS repo — the backticked text is a
  // display label (`[`config/test-suites.json`](https://github.com/…/test-suites.json)`), and the
  // target is somewhere else entirely. Neither is checkable here, so check neither. Without this the
  // first external link added to `.claude/**` fails a gate now pinned at zero, which is precisely the
  // phantom-finding class this rule was rewritten to remove.
  if (link && (EXTERNAL_RE.test(link[1]) || link[1].startsWith('#'))) return null;
  const cited = (link ? link[1].split('#')[0] : label).replace(/\/$/, '');
  return cited || null;
}

/**
 * The citation as a path from the repo ROOT, whichever way it was written.
 *
 * Classification must not depend on that choice: `reports/regression/REG-…` and
 * `../../reports/regression/REG-…` name the same pruned run folder, and only the first was being
 * recognised as ephemeral — so the same citation counted against the zeroed DOC-003 ratchet or not
 * depending on how the author happened to write the link.
 */
export function citedFromRoot(file, cited) {
  if (!cited.startsWith('.')) return cited;
  return posix(path.normalize(path.join(path.dirname(file), cited)));
}

/** Does a citation resolve — from the repo root, or relative to the file it is written in? Both are
 *  legitimate ways to write one, and DOC-004 has always accepted both. */
export function pathResolves(file, cited, exists = fs.existsSync) {
  return exists(cited) || exists(posix(path.normalize(path.join(path.dirname(file), cited))));
}

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

export const norm = (s) => s.toLowerCase().replace(/[`*_"]/g, '').trim();

/**
 * Does a `file.md §Heading` citation name one of that file's headings?
 *
 * A citation is written INSIDE a sentence, so the text after `§` runs on into prose the author never
 * meant as part of the heading: *"`SKILL.md` §Effort routing records that the…"* names the heading
 * "Effort routing, and why the FAST/FULL line sits where it does". The old rule compared the first 25
 * characters of the whole run-on against each heading, which failed on every citation of that shape —
 * 9 of the 18 findings this rule carried were the corpus's own correct citations.
 *
 * So: match the citation's leading WORDS against a heading, longest first, and stop at two. The floor
 * is what keeps the rule honest — truncating further would let `§Atlassian / Admin SSO` match the
 * heading "Atlassian / JIRA setup" on the word "Atlassian" alone, hiding a citation that really is
 * stale. Punctuation does not count toward those two words for the same reason ("Atlassian /" is one
 * word, not two). A single-word citation is matched whole: it was never truncated, so nothing is lost.
 *
 * The match must land on a word boundary, so `§Assertion STRENGTH` cannot pass on the heading
 * "Assertions". Returns the prefix that matched, or null.
 */
export function headingMatch(headings, cited) {
  // `§Assertions + §Measurable UI vocabulary` names TWO headings, so verify both — a compound citation
  // whose second half is stale is exactly as broken as one whose first half is.
  const parts = String(cited).split(/\s*\+\s*§/);
  if (parts.length > 1) {
    const hit = parts.map((p) => headingMatchOne(headings, p));
    return hit.every(Boolean) ? hit.join(' + ') : null;
  }
  return headingMatchOne(headings, cited);
}

function headingMatchOne(headings, cited) {
  const toks = norm(cited).split(/\s+/).filter(Boolean);
  const isWord = (w) => /[a-z0-9]/.test(w);
  const boundary = (h, c) => h.startsWith(c) && (h.length === c.length || !/[a-z0-9]/.test(h[c.length]));
  const floor = toks.length === 1 ? 1 : 2;
  for (let n = toks.length; n >= floor; n--) {
    const cand = toks.slice(0, n).join(' ').replace(/[^a-z0-9)\]]+$/, '');
    if (cand.length < 3 || toks.slice(0, n).filter(isWord).length < floor) continue;
    if (headings.some((h) => boundary(h, cand))) return cand;
  }
  return null;
}

// A nested git worktree (`.claude/worktrees/<name>/`, created by EnterWorktree) is a full second
// checkout of this repo at another revision. Its docs are NOT this tree's docs: linting them reports
// findings nobody can act on here — they belong to that branch — and one abandoned worktree can put
// every ratchet over baseline and hold the gate red for everyone. Skip them structurally.
const SKIP_DIRS = new Set(['worktrees', 'node_modules']);

function walkMd(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...walkMd(p));
    } else if (e.name.endsWith('.md')) out.push(posix(p));
  }
  return out;
}

export function lint(root = '.') {
  const cwd = process.cwd(); process.chdir(root);
  try {
    const files = ['CLAUDE.md', ...walkMd('.claude')].filter((f) => fs.existsSync(f));
    // DOC-006 applies to the ALWAYS-LOADED tier only. A count in a knowledge file is read by the one
    // step that needs it and can be corrected there; the same count in `.claude/rules/` is paid, and
    // believed, by every agent on every dispatch.
    const alwaysLoaded = new Set(alwaysLoadedFiles('.'));
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
      let sectionExempt = false;
      lines.forEach((l, i) => {
        const marked = l.includes(MAY_NOT_EXIST);
        if (marked && /^\s*<!--/.test(l)) sectionExempt = true;
        else if (/^## /.test(l)) sectionExempt = false;
        const exempt = marked || sectionExempt;
        if (!exempt) for (const m of l.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) if (classifyScript(m[1], pkg) === 'missing') add('DOC-002', f, i + 1, `npm run ${m[1]} — no such script`);
        // After `exempt`, so `doclint:may-not-exist` is an escape hatch here too. On a ratchet pinned
        // at zero, a rule with no way out turns one unusual-but-correct sentence into a blocked PR.
        if (!exempt && alwaysLoaded.has(f)) {
          for (const m of l.matchAll(DERIVED_COUNT_RE)) {
            if (!isTranscribedCount(l, m.index)) continue;
            add('DOC-006', f, i + 1, `derived count transcribed: "${m[1]} ${m[2]}" — print it with the script that derives it (npm run suites:lint, or ls .claude/{agents,skills,commands})`);
          }
        }
        for (const m of l.matchAll(PATH_RE)) {
          if (exempt) break;
          const label = m[1].replace(/\/$/, '');
          const cited = citationTarget(label, l.slice(m.index + m[0].length));
          if (!cited) continue;
          if (isPlaceholderPath(label) || pathResolves(f, cited) || ignored(cited) || ignored(cited + '/')) continue;
          const detail = `cited path does not exist: ${cited === label ? label : `${label} → ${cited}`}`;
          add(isEphemeralPath(citedFromRoot(f, cited)) ? 'DOC-003E' : 'DOC-003', f, i + 1, detail);
        }
        for (const m of l.matchAll(SEC_RE)) {
          let t = m[1];
          if (!/^(\.claude|docs|scripts|ci|config)\//.test(t)) t = posix(path.normalize(path.join(path.dirname(f), t)));
          const hs = headsOf(t);
          if (!hs) continue;                                      // DOC-003 owns a missing file
          const q = norm(m[2]);
          if (q.length < 3 || /^\d/.test(q)) continue;            // numbered anchors (§1a, §5.0) are checked by doclint's stricter form
          if (!headingMatch(hs, m[2])) add('DOC-004', f, i + 1, `§${m[2].trim()} not found as a heading in ${t}`);
        }
      });
    }
    const budget = measureBudget(alwaysLoadedFiles('.'));
    const skillsOver = walkMd('.claude/skills').filter((p) => path.basename(p) === 'SKILL.md')
      .map((p) => ({ file: p, chars: fs.readFileSync(p, 'utf8').length })).filter((r) => r.chars > BUDGET.skillBodyWarnChars).sort((a, b) => b.chars - a.chars);
    const counts = {}; for (const x of findings) counts[x.code] = (counts[x.code] || 0) + 1;
    for (const k of Object.keys(BASELINE)) counts[k] = counts[k] || 0;
    // DOC-003E is reported, never ratcheted: report artifacts are ephemeral BY POLICY, so its count
    // moves with what has been pruned rather than with anything an author did wrong.
    const ratcheted = Object.fromEntries(Object.entries(counts).filter(([k]) => !INFORMATIONAL.has(k)));
    return { files: files.length, budget, skillsOver, findings, counts, ratchet: ratchet(ratcheted, BASELINE) };
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
    for (const k of Object.keys(r.counts).sort()) {
      if (INFORMATIONAL.has(k)) { console.log(`   [Informational] ${k}: ${r.counts[k]} — ephemeral report artifacts cited as provenance (pruned by policy, not broken references)`); continue; }
      console.log(`   ${k}: ${r.counts[k]} (baseline ${BASELINE[k] ?? 0})${r.counts[k] > (BASELINE[k] ?? 0) ? '  ** OVER BASELINE **' : ''}`);
    }
    for (const o of r.ratchet.over) for (const x of r.findings.filter((y) => y.code === o.code).slice(0, 12)) console.log(`      ${x.file}:${x.line}  ${x.detail}`);
    if (r.ratchet.over.length) console.log(`   (showing up to 12 per code; run with --json for all)`);
  }
  const red = budgetBreach.length > 0 || !r.ratchet.ok;
  process.exit(red && !warnOnly ? 1 : 0);
}
