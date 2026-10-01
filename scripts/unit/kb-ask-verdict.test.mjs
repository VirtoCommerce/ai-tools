// `ask` under the base's verdict ranker (VCST-6122 Decision 1a): what switches it on, what it logs,
// and how the agent's half of an `ambiguous` verdict is paired with the ask it closes.
//
// The switch is DATA: a base without `ranker.json` must behave exactly as before, because that is
// every base in production until the operator publishes one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readQueue } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { RANKER } from '../kb/core/rank.mjs';
import { exitFor } from '../kb/core/exits.mjs';
import { askLines } from '../kb/core/render.mjs';
import { ask, loadVerdictRanker, none, show } from '../kb/core/verbs.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const QUESTION = 'what does the Active column on /company/members reflect';

const ranker = (bias, answer = 0.5) => ({
  schema: 1, rank: 'verdict-test', fusion: { method: 'linear', weights: { sentence: 1, document: 0, concepts: 0.25, anchors: 0.5 } },
  rerank: { k: 10, lambda: 0.5 },
  model: { features: ['idfCoverage'], mean: [0], std: [1], weights: [0], bias },
  thresholds: { answer },
});

async function withBase(rankerJson, fn) {
  const root = mkdtempSync(join(tmpdir(), 'kb-verdict-'));
  const base = join(root, 'base');
  const queue = join(root, 'queue');
  cpSync(FIXTURE, base, { recursive: true });
  if (rankerJson !== undefined) writeFileSync(join(base, 'ranker.json'), typeof rankerJson === 'string' ? rankerJson : JSON.stringify(rankerJson));
  const opened = { reader: localReader(base), locator: base, how: 'test', why: null };
  const env = { KB_QUEUE_DIR: queue, CLAUDE_CODE_HOST_SESSION_ID: 'verdictsess' };
  try { return await fn({ opened, env, lines: () => readQueue({ env }).then((q) => q.lines) }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('no ranker.json: ask is floor-1, byte for byte -- no verdict on the result or the line', async () => {
  await withBase(undefined, async ({ opened, env, lines }) => {
    const r = await ask(QUESTION, opened, { env });
    assert.equal(r.verdict, undefined);
    const [line] = (await lines()).filter((l) => l.kind === 'ask');
    assert.equal(line.rank, RANKER);
    assert.equal(line.verdict, undefined);
  });
});

test('a malformed ranker.json is treated as absent: the fallback is floor-1, never half a verdict', async () => {
  for (const bad of ['{not json', JSON.stringify({ rank: 'x' }), JSON.stringify({ ...ranker(0), model: { ...ranker(0).model, weights: [] } })]) {
    await withBase(bad, async ({ opened, env, lines }) => {
      assert.equal(await loadVerdictRanker(opened.reader), null);
      await ask(QUESTION, opened, { env });
      assert.equal((await lines()).find((l) => l.kind === 'ask').rank, RANKER);
    });
  }
});

test('below the threshold: ambiguous, exit 0, the headlines and a handle that is the ask line itself', async () => {
  await withBase(ranker(-10), async ({ opened, env, lines }) => {
    const r = await ask(QUESTION, opened, { env });
    assert.equal(r.state, 'ambiguous');
    assert.equal(exitFor(r.state), 0);
    assert.ok(r.headlines.length >= 1 && r.headlines.length <= 3);
    const line = (await lines()).find((l) => l.kind === 'ask');
    assert.equal(line.rank, 'verdict-test');
    assert.equal(line.verdict, 'ambiguous');
    assert.deepEqual(line.shown, r.headlines.map((h) => h.id));
    assert.equal(r.handle, line.at);
    assert.ok(askLines(r).some((l) => l.includes(`ask handle: ${line.at}`)));
  });
});

test('above the threshold: one answer, its body read, the verdict and its features on the line', async () => {
  await withBase(ranker(10), async ({ opened, env, lines }) => {
    const r = await ask(QUESTION, opened, { env });
    assert.equal(r.state, 'answer');
    assert.equal(r.hits.length, 1);
    assert.ok(r.hits[0].body);
    const line = (await lines()).find((l) => l.kind === 'ask');
    assert.equal(line.verdict, 'answer');
    assert.deepEqual(line.matched, [r.hits[0].id]);
    assert.equal(typeof line.f.idfCoverage, 'number');
  });
});

test('kb_none and kb_show name the ask they close by its handle, not by being the latest', async () => {
  await withBase(ranker(-10), async ({ opened, env, lines }) => {
    const first = await ask(QUESTION, opened, { env });
    await ask('who can block a member of an organization on the storefront', opened, { env });
    const n = await none({ env, ask: first.handle });
    assert.equal(n.state, 'recorded');
    assert.equal(n.after, first.handle);
    await show(first.headlines[0].id, opened, { env, ask: first.handle });
    const all = await lines();
    assert.equal(all.find((l) => l.kind === 'none').after, first.handle);
    assert.equal(all.find((l) => l.kind === 'show').after, first.handle);
    const unknown = await none({ env, ask: 'not-a-handle' });
    assert.equal(unknown.after, undefined);
    assert.match(unknown.why, /no ask of this session has the handle/);
  });
});
