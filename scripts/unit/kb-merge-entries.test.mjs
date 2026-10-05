// The entry merge's derivation (VCST-6122): what a merge plan turns into. The plans are data written
// by a model and are not tested here; the rules the OUTPUT must keep are.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEntry, stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { merge } from '../kb/merge-entries.mjs';

const entry = (id, extra = {}) => `${stringifyFrontmatter({
  id, subject: `subject of ${id}`, plane: 'experiential', question: 'q?', status: 'active',
  anchors: [{ coordinate: '/company/members' }],
  evidence: [{ method: 'observation', deployment: 'somewhere', at: '2026-09-25T11:16:59.019Z' }],
  ...extra,
})}\nBody of ${id}.\n`;
const files = () => new Map([
  ['entries/KB-00000001.md', entry('KB-00000001', { questions: [{ text: 'one?' }], concepts: [{ id: 'organization' }] })],
  ['entries/KB-00000002.md', entry('KB-00000002', {
    anchors: [{ coordinate: '/company/members' }, { coordinate: 'Mutations.lockOrganizationContact' }],
    questions: [{ text: 'One?' }, { text: 'two?' }], concepts: [{ id: 'member-block' }],
  })],
  ['entries/KB-00000003.md', entry('KB-00000003', { status: 'superseded', supersededBy: 'KB-00000001' })],
]);
const read = (r, id) => parseEntry(r.writes.get(`entries/${id}.md`));

test('an absorbed entry is superseded by its survivor and keeps its body, so show still resolves', () => {
  const r = merge(files(), [{ survivor: 'KB-00000001', absorbed: ['KB-00000002'] }]);
  assert.deepEqual(r.problems, []);
  const { data, body } = read(r, 'KB-00000002');
  assert.equal(data.status, 'superseded');
  assert.equal(data.supersededBy, 'KB-00000001');
  assert.match(body, /Body of KB-00000002/);
});

test('the survivor carries the absorbed evidence (tagged), anchors, questions and concepts without duplicates', () => {
  const r = merge(files(), [{ survivor: 'KB-00000001', absorbed: ['KB-00000002'], body: 'Merged body.', subject: 'sharper subject' }]);
  const { data, body } = read(r, 'KB-00000001');
  assert.equal(data.evidence.length, 2);
  assert.equal(data.evidence[1].mergedFrom, 'KB-00000002');
  assert.deepEqual(data.anchors.map((a) => a.coordinate), ['/company/members', 'Mutations.lockOrganizationContact']);
  assert.deepEqual(data.questions.map((q) => q.text), ['one?', 'two?']); // "One?" is the same question
  assert.deepEqual(data.concepts.map((c) => c.id), ['organization', 'member-block']);
  assert.equal(data.subject, 'sharper subject');
  assert.match(body, /Merged body\./);
});

test('without a new body the survivor keeps its own', () => {
  const r = merge(files(), [{ survivor: 'KB-00000001', absorbed: ['KB-00000002'], body: null }]);
  assert.match(read(r, 'KB-00000001').body, /Body of KB-00000001/);
});

test('a subject-only plan rewrites the subject and nothing else', () => {
  const r = merge(files(), [{ id: 'KB-00000002', subject: 'only the subject' }]);
  const { data } = read(r, 'KB-00000002');
  assert.equal(data.subject, 'only the subject');
  assert.equal(data.status, 'active');
  assert.equal(r.writes.size, 1);
});

test('the whole run is refused on any problem, and nothing is written', () => {
  const cases = [
    [{ survivor: 'KB-00000001', absorbed: ['KB-00000003'] }, /absorbed entry is superseded/],
    [{ survivor: 'KB-00000003', absorbed: ['KB-00000002'] }, /survivor is superseded/],
    [{ survivor: 'KB-00000001', absorbed: ['KB-00000001'] }, /absorbs itself/],
    [{ survivor: 'KB-00000001', absorbed: ['KB-0000000F'] }, /not in the base/],
    [{ survivor: 'KB-00000001', absorbed: [] }, /at least one absorbed/],
  ];
  for (const [plan, why] of cases) {
    const r = merge(files(), [plan]);
    assert.equal(r.writes.size, 0);
    assert.ok(r.problems.some((p) => why.test(p)), `${JSON.stringify(plan)} -> ${r.problems.join('; ')}`);
  }
});

test('an entry absorbed by one plan cannot survive or absorb in another', () => {
  const r = merge(files(), [
    { survivor: 'KB-00000001', absorbed: ['KB-00000002'] },
    { survivor: 'KB-00000002', absorbed: ['KB-00000001'] },
  ]);
  assert.equal(r.writes.size, 0);
  assert.ok(r.problems.length);
});
