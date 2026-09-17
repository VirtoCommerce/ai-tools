// OPENING A CITED SECTION BY ID — the other half of `kb show`, and the half the suites need.
//
// `ECL-13.3` is cited 3,095 times in the consuming project's regression suites and `kb show` used
// to answer "not in this base" about it, which was false: the base holds it, in `knowledge/`, one
// directory over from the planes. These pin the four things that decide whether the answer is the
// right section or a plausible wrong one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pageSections, findSection, canonId, idForms, citedAs } from '../src/pages.mjs';

const ECL = [
  '---',
  'applicability: reference',
  'citedAs: ECL',
  '---',
  '',
  '# Edge cases',
  '',
  '## 10. Loyalty',
  '',
  '### 10.2 Points',
  '',
  '| Pattern | Status |',
  '|---|---|',
  '| points never expire | [OBSERVED] |',
  '',
  '#### 10.2.1 A subsection that travels with it',
  '',
  'body of the subsection',
  '',
  '### 10.3 The next sibling, which does not',
  '',
  'other',
  '',
  '## Appendix A — Template',
  '',
  '```markdown',
  '### 99.9 A TEMPLATE, not a section',
  '| Pattern | Status |',
  '```',
  '',
].join('\n');

// Numbered the same way as the ECL library and about something else entirely: this is the real
// collision that decided the design, not an invented one.
const STYLE = ['# BA style guide', '', '### 10.2 Tone of voice', '', 'write plainly', ''].join('\n');

const CATALOG = [
  '# VC bug catalog',
  '',
  '### VC-CART-001 — Apollo cache stale',
  '',
  '- **Pattern:** the cart reads empty right after an add',
  '',
].join('\n');

function baseWith(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-pages-'));
  writeFileSync(join(dir, 'kb.json'), JSON.stringify({ namespace: 'KB', idWidth: 8 }));
  for (const [rel, body] of Object.entries(pages)) {
    const full = join(dir, 'knowledge', ...rel.split('/'));
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

test('a cited section opens, with its subsections and without its siblings', () => {
  const dir = baseWith({ 'oracles/ecl.md': ECL });
  const hit = findSection(dir, 'ECL-10.2');
  assert.equal(hit.page, 'knowledge/oracles/ecl.md');
  assert.equal(hit.title, 'Points');
  assert.match(hit.text, /^### 10\.2 Points/);
  assert.match(hit.text, /10\.2\.1 A subsection that travels with it/, 'a subsection is part of the section');
  assert.ok(!hit.text.includes('The next sibling'), 'a sibling is not');
  rmSync(dir, { recursive: true, force: true });
});

// `ECL-05.1` and `ECL-5.1` are ONE section written two ways, and the suites contain both — 5 of the
// 56 distinct citations are padded. `lint-ecl` canonicalises for exactly this reason; a resolver
// that did not would call a citation the gate passes a dead reference.
test('a zero-padded citation is the same section', () => {
  assert.equal(canonId('05.1'), '5.1');
  assert.equal(canonId('14.10'), '14.10');
  assert.deepEqual(idForms('ECL-05.1'), ['ECL-05.1', '5.1']);
  // The tail is only tried when it is a section number: `VC-CART-001` minus its prefix is
  // `CART-001`, which is id-shaped and would be a coincidence, not a lookup.
  assert.deepEqual(idForms('VC-CART-001'), ['VC-CART-001']);
});

// THE MEASUREMENT THAT DECIDED THE DESIGN. Blind matching left five ids answered by two pages, and
// `ECL-10.2` — 252 citations — was one of them.
test('the prefix decides which page, when a page has claimed it', () => {
  const dir = baseWith({ 'oracles/ecl.md': ECL, 'ba/style.md': STYLE });
  assert.equal(citedAs(ECL), 'ECL');
  assert.equal(citedAs(STYLE), null);
  const hit = findSection(dir, 'ECL-10.2');
  assert.equal(hit.page, 'knowledge/oracles/ecl.md');
  assert.equal(hit.title, 'Points');

  // The same number, with no prefix to go on, is refused rather than guessed.
  const both = findSection(dir, '10.2');
  assert.equal(both.ambiguous.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('a page that declares nothing still answers for an id its heading carries whole', () => {
  const dir = baseWith({ 'oracles/catalog.md': CATALOG });
  const hit = findSection(dir, 'VC-CART-001');
  assert.equal(hit.title, 'Apollo cache stale', 'the dash between id and title is not part of the title');
  assert.match(hit.text, /Apollo cache stale/);
  rmSync(dir, { recursive: true, force: true });
});

// Two ways to answer the wrong question, both measured over the live base before being excluded:
// a fenced TEMPLATE whose body contains `###` lines (the ECL library has one), and headings whose
// first token is simply the first word of a title — `Platform`, `Cart`, `Using` — or a bare chapter
// number, which eleven pages carry.
test('a fenced template is not a section, and a word is not an id', () => {
  const dir = baseWith({ 'oracles/ecl.md': ECL, 'ba/style.md': STYLE });
  const ids = pageSections(dir).map((s) => s.id);
  assert.ok(!ids.includes('99.9'), 'the template inside the fence must not be indexed');
  assert.equal(findSection(dir, 'ECL-99.9'), null);
  assert.ok(!ids.includes('10'), 'a bare chapter number is not an id');
  assert.ok(!ids.includes('Appendix'), 'the first word of a title is not an id');
  assert.deepEqual([...new Set(ids)].sort(), ['10.2', '10.2.1', '10.3']);
  rmSync(dir, { recursive: true, force: true });
});
