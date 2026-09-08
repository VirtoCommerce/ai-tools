// Pins the context-budget gate (scripts/maintenance/lint-claude-docs.mjs). Two layers: pure-function
// contracts, and an integration run over THIS checkout — so `npm test` (already on every PR via
// unit-tests.yml) fails the moment the always-loaded set breaches its budget or a ratchet grows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET, BASELINE, alwaysLoadedFiles, measureBudget, isPlaceholderPath, classifyScript, ratchet, lint } from '../maintenance/lint-claude-docs.mjs';

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
