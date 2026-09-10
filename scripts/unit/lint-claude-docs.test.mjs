// Pins the context-budget gate (scripts/maintenance/lint-claude-docs.mjs). Two layers: pure-function
// contracts, and an integration run over THIS checkout — so `npm test` (already on every PR via
// unit-tests.yml) fails the moment the always-loaded set breaches its budget or a ratchet grows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET, BASELINE, alwaysLoadedFiles, measureBudget, isPlaceholderPath, isEphemeralPath, citationTarget, citedFromRoot, pathResolves, headingMatch, DERIVED_COUNT_RE, isTranscribedCount, MAY_NOT_EXIST, classifyScript, ratchet, lint, isGitIgnored } from '../maintenance/lint-claude-docs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('measureBudget sums chars and finds the longest line across files', () => {
  const src = { a: 'x'.repeat(10) + '\n' + 'y'.repeat(30), b: 'z'.repeat(5) };
  const r = measureBudget(['a', 'b'], (f) => src[f]);
  assert.equal(r.total, 41 + 5);
  assert.equal(r.longestLine, 30);
  assert.deepEqual(r.perFile.map((p) => p.file), ['a', 'b']);
});

test('alwaysLoadedFiles = CLAUDE.md + every .claude/rules/*.md, nothing else', () => {
  const files = alwaysLoadedFiles(ROOT);
  assert.equal(files[0], 'CLAUDE.md');
  assert.ok(files.slice(1).every((f) => f.startsWith('.claude/rules/') && f.endsWith('.md')));
  assert.ok(!files.includes('.claude/rules/skills-commands.md'), 'deleted in PR 1 — must not resurrect');
  assert.ok(!files.includes('.claude/rules/quality-gates.md'), 'moved to knowledge/execution in PR 2');
});

test('placeholders are not dangling paths', () => {
  for (const p of ['reports/tickets/SprintXX-XX/VCST-XXXX/', 'reports/bugs/<slug>.md', 'regression/suites/**/*.csv', 'reports/tickets/Sprint-current', 'reports/regression/REG-YYYY-MM-DD/'])
    assert.ok(isPlaceholderPath(p), p);
  assert.ok(!isPlaceholderPath('.claude/rules/agents.md'));
});

test('classifyScript: exact / prefix family / generic other-repo / missing', () => {
  const scripts = { 'suites:lint': 'x', 'seed:b2b': 'y' };
  assert.equal(classifyScript('suites:lint', scripts), 'ok');
  assert.equal(classifyScript('seed:', scripts), 'prefix-family');
  assert.equal(classifyScript('build', scripts), 'generic-other-repo');
  assert.equal(classifyScript('model:lint', scripts), 'missing');
});

test('ratchet fails only on GROWTH past the baseline', () => {
  assert.equal(ratchet({ 'DOC-003': 5 }, { 'DOC-003': 5 }).ok, true);
  assert.equal(ratchet({ 'DOC-003': 4 }, { 'DOC-003': 5 }).ok, true);
  const r = ratchet({ 'DOC-003': 6, 'DOC-002': 0 }, { 'DOC-003': 5 });
  assert.equal(r.ok, false);
  assert.deepEqual(r.over, [{ code: 'DOC-003', count: 6, baseline: 5 }]);
});

test('THIS checkout: always-loaded set within budget, no line over the cap, no ratchet regression', () => {
  const r = lint(ROOT);
  assert.ok(r.budget.total <= BUDGET.alwaysLoadedChars,
    `always-loaded set is ${r.budget.total} chars > ${BUDGET.alwaysLoadedChars}. Move task-conditional prose to .claude/knowledge/ (see CLAUDE.md §Where the rules live).`);
  assert.ok(r.budget.longestLine <= BUDGET.longestLineChars,
    `a line of ${r.budget.longestLine} chars exceeds ${BUDGET.longestLineChars} — split the paragraph`);
  assert.ok(r.ratchet.ok, `doc-integrity ratchet regressed: ${JSON.stringify(r.ratchet.over)} — fix the new findings (npm run context:check) or, if deliberate, explain and raise BASELINE`);
  for (const k of Object.keys(BASELINE)) assert.ok(r.counts[k] <= BASELINE[k], k);
});

test('every path the linter emits is posix — no path.sep leaks (the 2026-09-08 windows-latest red leg)', () => {
  const r = lint(ROOT);
  const all = [...alwaysLoadedFiles(ROOT), ...r.budget.perFile.map((p) => p.file), ...r.skillsOver.map((s) => s.file), ...r.findings.map((x) => x.file)];
  assert.ok(all.length > 0);
  for (const p of all) assert.ok(!p.includes('\\'), `backslash in emitted path: ${p}`);
  assert.ok(alwaysLoadedFiles(ROOT).slice(1).every((f) => f.startsWith('.claude/rules/')));
});

// --- what a citation POINTS AT -------------------------------------------------------------------
//
// DOC-003 spent its life checking the backticked LABEL against the repo root. That is not what a
// reader follows, and the gap ran both ways: `[`templates/test-model.md`](../templates/test-model.md)`
// in .claude/commands/ was reported as dangling although it resolves, while three genuinely broken
// relative links (one ../ short, or ../../.claude/ from inside .claude/) passed because their labels
// happened to resolve from the root. 43 was never the real number in either direction.

test('citationTarget prefers the link target over the label', () => {
  assert.equal(
    citationTarget('templates/test-model.md', '](../templates/test-model.md) and more prose'),
    '../templates/test-model.md',
  );
});

test('citationTarget falls back to the label when the path is not a link', () => {
  assert.equal(citationTarget('scripts/lib/live-discover.ts', ' — typed xAPI primitives'), 'scripts/lib/live-discover.ts');
});

// Both of these were regressions introduced by checking the link TARGET instead of the label: the old
// rule checked `config/test-suites.json` (which exists) and passed, the new one checked the URL and
// filed a dangling path. With the baseline at zero, the first external link added to `.claude/**`
// would have failed the gate as exactly the phantom finding this rule was rewritten to remove.
test('a citation linked to a URL makes no claim about a repo path, so it is not checked', () => {
  assert.equal(citationTarget('config/test-suites.json', '](https://github.com/VirtoCommerce/x/blob/main/config/test-suites.json)'), null);
  assert.equal(citationTarget('docs/onboarding.md', '](http://example.com/x)'), null);
  assert.equal(citationTarget('docs/onboarding.md', '](mailto:qa@example.com)'), null);
  assert.equal(citationTarget('docs/onboarding.md', '](//cdn.example.com/x.md)'), null, 'protocol-relative is external too');
  assert.equal(citationTarget('scripts/lib/x.ts', '](../scripts/lib/x.ts)'), '../scripts/lib/x.ts', 'a repo-relative target is still checked');
});

test('ephemerality is decided on the path from the ROOT, however the link was written', () => {
  // The same pruned run folder, written two ways. Only the first was recognised, so whether a citation
  // counted against the zeroed DOC-003 ratchet depended on the author's choice of relative or absolute.
  assert.ok(isEphemeralPath(citedFromRoot('.claude/rules/reports.md', 'reports/regression/REG-2026-07-24-2121')));
  assert.ok(isEphemeralPath(citedFromRoot('.claude/skills/qa-test/SKILL.md', '../../../reports/regression/REG-2026-07-24-2121')));
  assert.ok(!isEphemeralPath(citedFromRoot('.claude/skills/qa-test/SKILL.md', '../../rules/reports.md')), 'a rules file is durable');
  assert.equal(citedFromRoot('.claude/rules/x.md', 'scripts/lib/y.ts'), 'scripts/lib/y.ts', 'a root-relative citation is returned unchanged');
});

test('citationTarget drops a #fragment, and yields null for an anchor-only link', () => {
  assert.equal(citationTarget('docs/onboarding.md', '](../docs/onboarding.md#serena)'), '../docs/onboarding.md');
  assert.equal(citationTarget('docs/onboarding.md', '](#serena)'), null, 'a bare anchor targets this file and names no path');
});

test('citationTarget strips a trailing slash so a directory citation compares equal', () => {
  assert.equal(citationTarget('reports/ba/', ' holds the deliverables'), 'reports/ba');
});

test('pathResolves accepts root-relative AND citing-file-relative, which is how both are written', () => {
  const have = new Set(['.claude/templates/test-model.md', 'scripts/lib/seed-common.mjs']);
  const exists = (p) => have.has(p);
  assert.ok(pathResolves('.claude/commands/qa-test.md', '../templates/test-model.md', exists), 'relative to the citing file');
  assert.ok(pathResolves('.claude/rules/test-data.md', 'scripts/lib/seed-common.mjs', exists), 'relative to the repo root');
  // The exact defect this found: from .claude/knowledge/execution/, ../../ is .claude/, not the root.
  assert.ok(!pathResolves('.claude/knowledge/execution/test-data-authoring.md', '../../scripts/lib/seed-common.mjs', exists));
  assert.ok(pathResolves('.claude/knowledge/execution/test-data-authoring.md', '../../../scripts/lib/seed-common.mjs', exists));
});

test('isGitIgnored: an EMPTY check-ignore pattern is not a match — the gate must be able to fail on Windows', () => {
  // Measured 2026-09-10 on git 2.55.0.windows.5: in THIS repo `git check-ignore -q '<anything>/'`
  // exited 0, attributed to a BLANK .gitignore line, while a fresh repo exited 1. The DOC-003 caller
  // probes `cited + '/'` for every unresolved citation, so that turned EVERY dangling path into
  // "ignored": `lint()` reported 0 findings corpus-wide on Windows while CI on Linux reported 31, and
  // a PR shipped a citation to a file that had just been deleted. A gate that cannot fail on half the
  // team's machines is worse than no gate, because it is trusted.
  assert.equal(isGitIgnored('zzz-no-such-directory/', ROOT), false, 'a nonexistent directory is not ignored');
  assert.equal(isGitIgnored('.claude/skills/qa-test/zzz-deleted.md/', ROOT), false, 'nor is a deleted file probed as a dir');
  // ...and a real rule still matches, in both the bare and the trailing-slash form.
  assert.equal(isGitIgnored('node_modules', ROOT), true);
  assert.equal(isGitIgnored('results/', ROOT), true);
});

test('a reports/ citation is ephemeral; a durable path is not', () => {
  assert.ok(isEphemeralPath('reports/ba/bl-proposals-2026-08-05.md'));
  assert.ok(isEphemeralPath('reports/regression/REG-2026-07-24-2121/'));
  assert.ok(!isEphemeralPath('.claude/rules/reports.md'), 'a rules file that merely mentions reports is durable');
  assert.ok(!isEphemeralPath('scripts/lib/live-discover.ts'));
});

// --- the ratchets, over THIS checkout -------------------------------------------------------------

// One `lint(ROOT)` for every corpus-level assertion below. Each failure message carries the whole
// counts object: a ratchet that only says "expected 0, got 1" costs a CI round-trip to interpret, and
// these run on two platforms where reproducing locally is not always possible.
const CORPUS = lint(ROOT);
const show = (code) => CORPUS.findings.filter((f) => f.code === code).map((f) => `${f.file}:${f.line} ${f.detail}`).join('\n    ');
const counts = () => `counts=${JSON.stringify(CORPUS.counts)}`;

test('DOC-002 and DOC-003 are at zero — every remaining finding is a real defect to fix', () => {
  assert.equal(BASELINE['DOC-002'], 0, 'the baseline must stay at 0 — raising it is how a gate stops gating');
  assert.equal(BASELINE['DOC-003'], 0);
  assert.equal(CORPUS.counts['DOC-003'], 0, `a cited path no longer resolves (${counts()}):\n    ${show('DOC-003')}`);
  assert.equal(CORPUS.counts['DOC-002'], 0, `an npm run cites a script that does not exist (${counts()}):\n    ${show('DOC-002')}`);
});

// NOTE the assertion this deliberately does NOT make: "the corpus currently cites at least one pruned
// report". That is incidental state, not behaviour — it flips the day someone restores or prunes
// `reports/`, and a test that fails for that reason teaches nobody anything. What must hold on any
// checkout is the CLASSIFICATION: anything filed as DOC-003E is a `reports/` path, and no informational
// code ever reaches the ratchet.
test('DOC-003E is a reports/ path and is never ratcheted — pruning a report folder cannot fail the gate', () => {
  for (const f of CORPUS.findings.filter((x) => x.code === 'DOC-003E')) {
    const cited = f.detail.split(': ').pop().split(' → ').pop();
    assert.match(cited, /^reports\//, `${f.file}:${f.line} was filed as ephemeral but is not under reports/`);
  }
  assert.ok(!CORPUS.ratchet.over.some((o) => o.code === 'DOC-003E'), `an informational code must not enter the ratchet (${counts()})`);
  assert.equal(BASELINE['DOC-003E'], undefined, 'it has no baseline by design');
});

test('the may-not-exist directive is honoured, and only for existence rules', () => {
  const tierD = CORPUS.findings.filter((f) => f.file === '.claude/architecture/TIER.md' && f.code !== 'DOC-004');
  assert.deepEqual(
    tierD.map((f) => `${f.code} ${f.line} ${f.detail}`),
    [],
    `TIER.md's "What's Missing" table names absent artifacts on purpose (${counts()})`,
  );
  assert.ok(MAY_NOT_EXIST.startsWith('doclint:'), 'the marker stays namespaced so it is greppable');
});

// --- what a §Heading citation NAMES ---------------------------------------------------------------
//
// A citation is written inside a sentence, so the text after § runs on into prose the author never
// meant as part of the heading. Comparing the first 25 characters of that run-on against each heading
// failed on every citation of that shape: 9 of the 18 findings this rule carried were the corpus's own
// correct citations. Matching the citation's leading WORDS fixes that -- but the floor of two words is
// what keeps it from hiding the other 9, which were genuinely stale.

const HEADS = [
  'effort routing, and why the fast/full line sits where it does',
  'golden rule — never hardcode in scripts (applies beyond test data)',
  'atlassian / jira setup',
  'assertions',
  'assertion separation',
  'measurable ui vocabulary (inv class for storefront cases)',
  'manifest-domain routing',
  'concurrency — the unit to save is a round-trip, not a second',
];

test('a citation that runs on into prose still matches its heading', () => {
  assert.ok(headingMatch(HEADS, 'Effort routing records that the'), 'the run-on is prose, not part of the heading');
  assert.ok(headingMatch(HEADS, 'GOLDEN RULE failure in its purest form'));
  assert.ok(headingMatch(HEADS, '"Manifest-Domain Routing" for the target-suite resolution rule'), 'quotes must not block the match');
});

test('two words is the floor — one word would hide a genuinely stale citation', () => {
  // The measured case: onboarding.md renamed its section, and `§Atlassian / Admin SSO` must FAIL
  // rather than pass on the word "Atlassian" alone. Punctuation is not a word, so "atlassian /" is one.
  assert.equal(headingMatch(HEADS, 'Atlassian / Admin SSO'), null);
  assert.ok(headingMatch(HEADS, 'Atlassian / JIRA setup'), 'the corrected citation must pass');
});

test('the match lands on a word boundary, so a longer heading is not a match', () => {
  assert.equal(headingMatch(HEADS, 'Assertion STRENGTH'), null, '"Assertions" must not satisfy "Assertion STRENGTH"');
  assert.ok(headingMatch(HEADS, 'Assertion separation'), 'the real two-word heading still matches');
});

test('a single-word citation is matched whole — it was never truncated', () => {
  assert.ok(headingMatch(HEADS, 'Concurrency'));
  assert.equal(headingMatch(HEADS, 'Teardown'), null);
});

test('a compound citation must satisfy BOTH halves', () => {
  assert.ok(headingMatch(HEADS, 'Assertions + §Measurable UI vocabulary'));
  assert.equal(
    headingMatch(HEADS, 'Assertions + §No Such Heading'),
    null,
    'a compound whose second half is stale is exactly as broken as one whose first half is',
  );
});

test('DOC-004 is at zero — a § citation that stops resolving is a real defect now', () => {
  assert.equal(BASELINE['DOC-004'], 0, 'raising this baseline is how a gate stops gating');
  assert.equal(CORPUS.counts['DOC-004'], 0, `a cited section heading no longer resolves (${counts()}):\n    ${show('DOC-004')}`);
});

// --- DOC-006: a derived count transcribed into the always-loaded set ---------------------------------
//
// CLAUDE.md §Where the rules live: "Counts (suites, cases, agents…) are never transcribed into prose
// — run the script that prints them", because every contradiction the 2026-09-07 audit found was in a
// fact that had been restated. Measured 2026-09-09: `.claude/rules/regression.md` carried three such
// counts, ALL stale (126 suites vs 135, 4,155 test cases vs 4,503, 37 selection groups), in the tier
// every agent pays on every dispatch, in a file that named the manifest as the source of truth two
// paragraphs later. Prose does not stay right on its own.

const fires = (line) => [...line.matchAll(DERIVED_COUNT_RE)].some((m) => isTranscribedCount(line, m.index));

test('a transcribed corpus count is a finding — including one that is correct today', () => {
  assert.ok(fires('126 suites in `regression/suites/` organized by module'));
  assert.ok(fires('**Total: 4,155 test cases** (per manifest `testCount`)'));
  assert.ok(fires('- **Selection groups**: 37 groups — `smoke`, `critical`, …'));
  assert.ok(fires('135 suites'), 'the CORRECT number fails too — the defect is the transcription, not the arithmetic');
});

test('a single-digit count is still a count', () => {
  // The first draft used `\d[\d,]{1,6}`, which needs two characters, so every single-digit count
  // walked straight through the gate — an undocumented third exemption nobody chose.
  assert.ok(fires('9 suites'));
  assert.ok(fires('5 test cases'));
  assert.ok(fires('3 selection groups'));
});

test('a year followed by a comma is not a count', () => {
  // `2026, suites` matched while the capture could end in a comma. It cannot now.
  assert.ok(!fires('For most of 2026, suites on that lane were denied'));
});

test('an "N of M" proportion is an outcome, not a corpus size', () => {
  assert.ok(!fires('two suites on one disposable fixture set (5 of 34 cases lost)'));
  assert.ok(!fires('46 of 4,429 cases have ever caught a bug'));
});

test('a bound on concurrency is not an inventory', () => {
  assert.ok(!fires('CI runs up to 3 suites in parallel (configurable via MAX_PARALLEL)'));
  assert.ok(!fires('Max 3 concurrent browser agents'));
  assert.ok(fires('3 suites in parallel'), 'without the bound wording it reads as a count again');
});

test('a date does NOT exempt a count — the heuristic was removed on purpose', () => {
  // Paragraphs here are single lines up to 2,500 chars, so "there is a date on this line" let one
  // dated clause exempt every count in the paragraph, and no proximity window separates that from a
  // genuinely dated measurement. Prose in this tier should not be writing counts at all.
  assert.ok(fires('126 suites (measured 2026-09-09) and 4,155 test cases live today'));
});

test('the nouns cover what CLAUDE.md names — suites, cases, agents, skills, commands', () => {
  assert.ok(fires('17 agents as flat `.claude/agents/*.md` files'));
  assert.ok(fires('10 agents, 16 skills, 8 commands'));
});

test('DOC-006 does not fire on prose that merely contains a number and a noun', () => {
  assert.ok(!fires('Batch regression in groups of 3 (matching browser pool slots)'));
});

test('the may-not-exist marker is an escape hatch for DOC-006 too', () => {
  // On a ratchet pinned at zero, a rule with no way out turns one unusual-but-correct sentence into a
  // blocked PR. DOC-006 is evaluated after `exempt`, so the marker suppresses it like the others.
  const marked = CORPUS.findings.filter((f) => f.code === 'DOC-006' && f.detail.includes(MAY_NOT_EXIST));
  assert.deepEqual(marked, [], 'a marked line must never produce a finding');
});

test('DOC-006 is scoped to the always-loaded tier and ratchets at zero', () => {
  assert.equal(BASELINE['DOC-006'], 0, 'raising this baseline is how the counts grow back');
  const offenders = CORPUS.findings.filter((f) => f.code === 'DOC-006');
  assert.deepEqual(
    offenders.map((f) => `${f.file}:${f.line} ${f.detail}`),
    [],
    `a derived count was transcribed into CLAUDE.md or .claude/rules/ (${counts()})`,
  );
  const alwaysLoaded = new Set(alwaysLoadedFiles(ROOT));
  assert.ok(offenders.every((f) => alwaysLoaded.has(f.file)), 'DOC-006 must not reach the on-demand tier');
});
