// The fixture base is a CONTRACT, not scenery.
//
// `.claude/knowledge/execution/when-to-write-a-test.md` says to test the DERIVATION and never the
// DECLARATION, and most of a fixture is declaration. Three things here are not:
//
//   * `id === mintId(subject)` is DERIVED, and it is the exact relation session 2's migration
//     rests on -- if it can drift in a six-entry fixture it can drift in 89 real entries.
//   * `index.json` agreeing with `entries/` is the consistency `kb reindex` exists to repair.
//     A fixture that quietly violated it would make every other kb test lie about the tool.
//   * The three shapes the other test files ASSERT ON -- the anchors+scope collision, the retired
//     entry, the entry with several evidence items -- are load-bearing. Delete one by accident and
//     the test that depends on it goes green by vacuity rather than failing.
//
// The declarations (which subject, which prose) are not tested, because nothing derives them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintId } from '../kb/core/canonical.mjs';
import { parseEntry } from '../kb/core/frontmatter.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { loadIndex } from '../kb/core/index-load.mjs';
import { rowKey } from '../kb/core/identity.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const entryFiles = () => readdirSync(join(FIXTURE, 'entries')).filter((f) => f.endsWith('.md'));
const parse = (file) => parseEntry(readFileSync(join(FIXTURE, 'entries', file), 'utf8'), file);

test('every id re-derives from its own subject', () => {
  for (const file of entryFiles()) {
    const { data } = parse(file);
    assert.equal(data.id, mintId(data.subject), `${file}: id does not derive from its subject`);
    assert.equal(file, `${data.id}.md`, `${file}: the filename must be the id`);
  }
});

test('every entry round-trips through the parser it will be read with', () => {
  for (const file of entryFiles()) assert.ok(parse(file).body.trim().length > 0, `${file}: empty body`);
});

test('the index and entries/ agree — same ids, same count, same paths', async () => {
  const loaded = await loadIndex(localReader(FIXTURE));
  assert.equal(loaded.state, 'ok');
  assert.deepEqual(loaded.rows.map((r) => r.id).sort(), entryFiles().map((f) => f.replace('.md', '')).sort());
  for (const row of loaded.rows) assert.equal(row.path, `entries/${row.id}.md`);
  assert.equal(JSON.parse(readFileSync(join(FIXTURE, 'index.json'), 'utf8')).count, loaded.rows.length);
});

test('each row’s trust and disputed are the counts computed from its own evidence[]', async () => {
  // PLAN §12 rule 5: the count is COMPUTED, never declared. The index caches it so ranking need
  // not open the entry, and a cache that disagrees with its source is the drift `reindex` repairs.
  const { rows } = await loadIndex(localReader(FIXTURE));
  for (const row of rows) {
    const evidence = parse(`${row.id}.md`).data.evidence ?? [];
    assert.equal(row.trust, evidence.filter((e) => !e.contradicts).length, `${row.id}: trust`);
    assert.equal(row.disputed, evidence.filter((e) => e.contradicts).length, `${row.id}: disputed`);
  }
});

test('the index scope matches each entry’s own appliesTo', async () => {
  const { rows } = await loadIndex(localReader(FIXTURE));
  for (const row of rows) {
    const applies = (parse(`${row.id}.md`).data.appliesTo ?? []).map((a) => `${a.axis}=${a.value}`.toLowerCase()).sort();
    assert.deepEqual(row.scope, applies, `${row.id}: scope`);
  }
});

// ─── the shapes the other test files depend on ────────────────────────────────────────────────

test('the fixture holds a genuine anchors+scope COLLISION for dedupe to refuse', async () => {
  const { rows } = await loadIndex(localReader(FIXTURE));
  const byKey = new Map();
  for (const r of rows.filter((x) => x.status === 'active')) {
    byKey.set(rowKey(r), [...(byKey.get(rowKey(r)) ?? []), r.id]);
  }
  const collisions = [...byKey.values()].filter((ids) => ids.length > 1);
  assert.equal(collisions.length, 1, 'exactly one collision, so the refusal has a deterministic target');
  assert.deepEqual(collisions[0].sort(), ['KB-378EEA52', 'KB-55C8E448']);
});

test('the fixture holds exactly one retired entry', async () => {
  const { rows } = await loadIndex(localReader(FIXTURE));
  assert.deepEqual(rows.filter((r) => r.status === 'retired').map((r) => r.id), ['KB-A31DCF79']);
});

test('the fixture holds an entry with several independent evidence items', async () => {
  // Without it, nothing exercises a trust label above "single observation", nor the provenance
  // block that PLAN §3.1 step 4 exists to print.
  const { data } = parse('KB-27B4CD10.md');
  assert.equal(data.evidence.length, 4);
  assert.equal(new Set(data.evidence.map((e) => e.by)).size, 4);
});

test('the fixture holds a disputed entry, so a dispute count is exercised', async () => {
  const { rows } = await loadIndex(localReader(FIXTURE));
  assert.ok(rows.some((r) => r.disputed > 0), 'no entry carries a contradiction');
});
