// A BENCHMARK MUST NOT ENTER THE DEMAND LOG (PLAN §14.2).
//
// Measured on this base's first 12 log files: six questions appear five times each -- 30 of the 39
// asks were one latency benchmark, pushed through the same path as real work. So panel 2, "what
// agents ask, by frequency", was ranking a stopwatch, and §14.1's denominator was 39 where real
// demand was 9.
//
// The fix is MARK, NOT DROP, and both halves are tested here. A benchmark must still exercise the
// real queue, the real flush and the real push -- that is what makes it representative, and one
// that writes nowhere is measuring a path nobody uses. What it must not do is reach the demand
// panels, and the report must SAY how many it set aside rather than quietly shrinking its own
// input.
//
// EVERY TEST HERE ISOLATES `KB_QUEUE_DIR`. Anything writing through `core/queue.mjs` in a test
// must: the suite once left 73 smoke-test lines sitting in a developer's real queue, staged for a
// public repository by the next sweep (PLAN §7.1a).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSynthetic, readQueue } from '../kb/core/queue.mjs';
import { localReader } from '../kb/core/reader.mjs';
import { analyse } from '../kb/core/report-analyse.mjs';
import { ask } from '../kb/core/verbs.mjs';

const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');
const opened = () => ({ reader: localReader(FIXTURE), locator: FIXTURE, how: 'test', why: null });

async function withQueue(fn, extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-synth-'));
  try {
    return await fn({ KB_QUEUE_DIR: dir, CLAUDE_CODE_HOST_SESSION_ID: 'testsess', ...extraEnv });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const linesOf = (env) => readQueue({ env }).then((q) => q.lines);
const ANSWERED = 'what does the Active column on /company/members reflect';

test('KB_SYNTHETIC marks a run, and nothing else does', () => {
  assert.equal(isSynthetic({ KB_SYNTHETIC: '1' }), true);
  assert.equal(isSynthetic({ KB_SYNTHETIC: 'true' }), true);
  assert.equal(isSynthetic({ KB_SYNTHETIC: 'on' }), true);
  assert.equal(isSynthetic({ KB_SYNTHETIC: '0' }), false);
  assert.equal(isSynthetic({ KB_SYNTHETIC: '' }), false);
  assert.equal(isSynthetic({}), false);
});

test('a synthetic run writes real lines, marked — it is not silenced', async () => {
  // MARKED, NOT DROPPED. A benchmark must still exercise the queue, the flush and the push, or it
  // is measuring a path nobody uses. What it must not do is enter the demand panels.
  await withQueue(async (env) => {
    const r = await ask(ANSWERED, opened(), { env, via: 'cli' });
    assert.equal(r.state, 'answer', 'the benchmark still gets a real answer');
    const [line] = await linesOf(env);
    assert.equal(line.synthetic, true);
    assert.equal(line.kind, 'ask');
    assert.equal(line.q, ANSWERED, 'and the line says exactly what it said before');
  }, { KB_SYNTHETIC: '1' });
});

test('an ordinary run carries no synthetic field at all — absent, not false', async () => {
  await withQueue(async (env) => {
    await ask(ANSWERED, opened(), { env, via: 'cli' });
    const [line] = await linesOf(env);
    assert.ok(!('synthetic' in line), 'a field on every ordinary line is volume for one benchmark');
  });
});

test('the report excludes synthetic lines from every panel and SAYS how many', () => {
  // Filtering without saying so would be a measurement nobody can audit — the same defect the flag
  // exists to fix, moved one layer up.
  const lines = [
    { kind: 'ask', q: 'a real question nobody answered', state: 'miss', at: '2026-09-19T10:00:00Z', _session: 's1', _path: 'log/2026-09-19/x-s1.jsonl' },
    { kind: 'ask', q: 'benchmark question', state: 'answer', matched: ['KB-27B4CD10'], ms: 40, synthetic: true, at: '2026-09-19T10:00:01Z', _session: 's1', _path: 'log/2026-09-19/x-s1.jsonl' },
    { kind: 'ask', q: 'benchmark question', state: 'answer', matched: ['KB-27B4CD10'], ms: 41, synthetic: true, at: '2026-09-19T10:00:02Z', _session: 's1', _path: 'log/2026-09-19/x-s1.jsonl' },
    { kind: 'flush', entries: 0, synthetic: true, at: '2026-09-19T10:00:03Z', _session: 's1', _path: 'log/2026-09-19/x-s1.jsonl' },
  ];
  const r = analyse({ lines, rows: [] });
  assert.equal(r.panels.questions.totalAsks, 1, 'the stopwatch is not demand');
  assert.equal(r.panels.misses.ranked.length, 1);
  assert.equal(r.meta.synthetic, 3);
  assert.equal(r.meta.syntheticAsks, 2);
  assert.ok(!('flush' in r.tally), 'a synthetic flush is not a delivery the demand log describes');
});
