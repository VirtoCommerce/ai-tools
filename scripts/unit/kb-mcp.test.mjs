// The MCP server: the protocol, the four states across the translation, and the flush on stdin close.
//
// OFFLINE, LIKE EVERY OTHER kb TEST. The in-process half runs against the fixture base; the spawned
// half runs the real server under the `--import` network trap, so it does not merely avoid the
// network — it proves the path cannot reach it. Every invocation also isolates `KB_QUEUE_DIR`:
// anything that writes through `core/queue.mjs` without doing so writes into the DEVELOPER'S REAL
// QUEUE, which the sweep then publishes (session 3 found 73 such lines waiting to go out).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { LATEST_PROTOCOL, TOOLS, createServer, memoizeReader } from '../kb/mcp.mjs';

const run = promisify(execFile);
const REPO = join(import.meta.dirname, '..', '..');
const SERVER = join(REPO, 'scripts', 'kb', 'mcp.mjs');
const TRAP = join(import.meta.dirname, 'fixtures', 'kb-no-network.mjs');
const FIXTURE = join(import.meta.dirname, 'fixtures', 'kb-base');

function scratch(name) {
  const dir = mkdtempSync(join(tmpdir(), `kb-mcp-${name}-`));
  return { dir, done: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}

/** A server over the fixture base, with its own queue. */
function fixtureServer(queueDir, extra = {}) {
  return createServer({
    env: {
      KB_BASE: FIXTURE, KB_QUEUE_DIR: queueDir, KB_NO_SWEEP: '1',
      CLAUDE_CODE_HOST_SESSION_ID: 'mcptest0', ...extra,
    },
  });
}

const callText = (res) => res.result.content.map((c) => c.text).join('\n');

const call = (server, name, args, id = 1) => server.handle({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args },
});

// ─── the handshake and the roster ─────────────────────────────────────────────────────────────

test('initialize answers with a protocol version, the tools capability and a server name', async () => {
  const q = scratch('init');
  try {
    const s = fixtureServer(q.dir);
    const r = await s.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    assert.equal(r.result.protocolVersion, '2025-06-18', 'a version we speak is echoed back');
    assert.ok(r.result.capabilities.tools, 'tools are advertised or the client never lists them');
    assert.equal(r.result.serverInfo.name, 'kb');
    assert.match(r.result.serverInfo.version, /^\d+\.\d+\.\d+/, 'the version comes from package.json, not a literal');
  } finally { q.done(); }
});

test('a protocol version we do not speak gets ours back rather than a failure', async () => {
  const q = scratch('proto');
  try {
    const r = await fixtureServer(q.dir).handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    assert.equal(r.result.protocolVersion, LATEST_PROTOCOL);
  } finally { q.done(); }
});

test('tools/list offers exactly the five verbs PLAN §4 puts on the MCP door', async () => {
  const q = scratch('list');
  try {
    const r = await fixtureServer(q.dir).handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.deepEqual(r.result.tools.map((t) => t.name).sort(),
      ['kb_ask', 'kb_capture', 'kb_confirm', 'kb_dispute', 'kb_show']);
    // push / reindex / stat are CLI-only: the push happens by itself when the process ends, and
    // the other two are operator repairs against a checkout.
    assert.ok(!r.result.tools.some((t) => /push|reindex|stat/.test(t.name)));
  } finally { q.done(); }
});

test('every tool schema declares its required arguments — a tool that cannot be called correctly is worse than absent', () => {
  for (const t of TOOLS) {
    assert.equal(t.inputSchema.type, 'object', `${t.name} schema`);
    assert.ok(t.inputSchema.required?.length, `${t.name} declares required fields`);
    for (const field of t.inputSchema.required) {
      assert.ok(t.inputSchema.properties[field], `${t.name}.${field} is described`);
    }
    assert.ok(t.description.length > 80, `${t.name}'s description names WHEN to reach for it`);
  }
});

test('the ask description names the trigger, not the mechanism — the measured root cause of the bypass', () => {
  const ask = TOOLS.find((t) => t.name === 'kb_ask');
  assert.match(ask.description, /about to assert/i, 'the moment the verb applies');
  assert.match(ask.description, /trust/i, 'and what it returns that a grep cannot');
  assert.ok(!/raw\.githubusercontent|vc-knowledge|\.claude\//.test(ask.description),
    'and it must NOT name a path to the base: three of three agents took the directory when one was named (PLAN §1.2)');
});

// ─── the four states survive the translation ──────────────────────────────────────────────────

test('a covered question answers with trust, confirmations and provenance, and is not an error', async () => {
  const q = scratch('ask');
  try {
    const r = await call(fixtureServer(q.dir), 'kb_ask', { question: 'what does the Active column on /company/members reflect' });
    assert.ok(!r.result.isError);
    const text = callText(r);
    assert.match(text, /KB-27B4CD10/);
    assert.match(text, /\[well attested\]/, 'the trust label');
    assert.match(text, /4 confirmation\(s\)/, 'the count');
    assert.match(text, /seen by session:95777cf8 on vcptcore_stable/, 'the provenance');
    assert.match(text, /bound to the CONTACT record/, 'the claim itself');
  } finally { q.done(); }
});

test('a MISS is an answer, not an error — the base was read and holds nothing', async () => {
  const q = scratch('miss');
  try {
    const r = await call(fixtureServer(q.dir), 'kb_ask', { question: 'how do I configure a Kubernetes ingress controller' });
    assert.ok(!r.result.isError, 'isError here would read as "the lookup broke", and it did not');
    assert.match(callText(r), /the base was read and holds nothing on this/);
    assert.match(callText(r), /kb_capture/, 'and it names the door this caller actually has');
  } finally { q.done(); }
});

test('UNREACHABLE is an error and says so in words that cannot be read as a miss', async () => {
  const q = scratch('unreachable');
  const broken = scratch('broken');
  try {
    // The index loads and every body is absent: the mid-session failure shape.
    const { cpSync, rmSync: rm } = await import('node:fs');
    cpSync(FIXTURE, broken.dir, { recursive: true });
    rm(join(broken.dir, 'entries'), { recursive: true, force: true });
    const s = createServer({ env: { KB_BASE: broken.dir, KB_QUEUE_DIR: q.dir, KB_NO_SWEEP: '1', CLAUDE_CODE_HOST_SESSION_ID: 'mcptest0' } });
    const r = await call(s, 'kb_ask', { question: 'what does the Active column on /company/members reflect' });
    assert.equal(r.result.isError, true, 'a failed lookup must be loud: the model then says "lookup failed" instead of guessing (PLAN §1.7)');
    assert.match(callText(r), /not "nothing is known"/);
    assert.match(callText(r), /KB-27B4CD10/, 'graceful degradation still names the entry the index knows about');
  } finally { q.done(); broken.done(); }
});

test('NO BASE is an error, and it is named as a config problem rather than a knowledge one', async () => {
  const q = scratch('nobase');
  try {
    const s = createServer({ env: { KB_BASE: join(import.meta.dirname, 'fixtures'), KB_QUEUE_DIR: q.dir, KB_NO_SWEEP: '1' } });
    const r = await call(s, 'kb_ask', { question: 'anything' });
    assert.equal(r.result.isError, true);
    assert.match(callText(r), /no base is configured|not a base|no kb\.json/);
  } finally { q.done(); }
});

test('kb_show returns one entry whole, and an unknown id is a miss rather than a failure', async () => {
  const q = scratch('show');
  try {
    const s = fixtureServer(q.dir);
    const found = await call(s, 'kb_show', { id: 'KB-27B4CD10' });
    assert.ok(!found.result.isError);
    assert.match(callText(found), /status: active/);
    const absent = await call(s, 'kb_show', { id: 'KB-00000000' });
    assert.ok(!absent.result.isError, 'the base answered; it just does not hold that id');
    assert.match(callText(absent), /not in this base's index/);
  } finally { q.done(); }
});

// ─── writing: it queues, and nothing is sent by the call ──────────────────────────────────────

test('kb_capture queues one line and sends nothing', async () => {
  const q = scratch('capture');
  try {
    const r = await call(fixtureServer(q.dir), 'kb_capture', {
      subject: 'the widget counter resets on page refresh',
      question: 'does the widget counter survive a refresh',
      claim: 'Refreshing /widgets/counter resets the counter to zero.',
      deployment: 'vcst_qa',
      anchors: ['/widgets/counter'],
      scope: ['surface=storefront-ui'],
    });
    assert.ok(!r.result.isError);
    assert.match(callText(r), /queued KB-/);
    assert.match(callText(r), /nothing has been sent/);
    const queued = readFileSync(join(q.dir, 'mcptest0.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(queued.filter((l) => l.kind === 'capture').length, 1);
    assert.ok(queued.at(-1).payload.entry, 'the queue carries the payload the push needs');
  } finally { q.done(); }
});

test('a capture the base already holds is REFUSED — and a refusal is not an error', async () => {
  const q = scratch('dupe');
  try {
    const r = await call(fixtureServer(q.dir), 'kb_capture', {
      subject: 'members list Active column means something else entirely',
      question: 'what does Active mean',
      claim: 'A second entry about the same coordinates.',
      deployment: 'vcst_qa',
      anchors: ['/company/members', 'Query.organizationContacts'],
      scope: ['surface=storefront-ui', 'surface=storefront-xapi'],
    });
    assert.ok(!r.result.isError, 'the dedup working is not a failure');
    assert.match(callText(r), /REFUSED/);
    assert.match(callText(r), /KB-27B4CD10/, 'and it hands back the entry to confirm instead');
  } finally { q.done(); }
});

test('kb_capture missing a required field is an error the caller can fix, not a queued write', async () => {
  const q = scratch('invalid');
  try {
    const r = await call(fixtureServer(q.dir), 'kb_capture', { subject: 'half a capture' });
    assert.equal(r.result.isError, true);
    assert.match(callText(r), /capture needs/);
    assert.ok(!existsSync(join(q.dir, 'mcptest0.jsonl')), 'nothing was queued');
  } finally { q.done(); }
});

test('kb_confirm queues evidence; kb_dispute without --saw is refused', async () => {
  const q = scratch('confirm');
  try {
    const s = fixtureServer(q.dir);
    const ok = await call(s, 'kb_confirm', { id: 'KB-27B4CD10', deployment: 'vcst_qa' });
    assert.ok(!ok.result.isError);
    assert.match(callText(ok), /queued on KB-27B4CD10/);

    const bad = await call(s, 'kb_dispute', { id: 'KB-27B4CD10', deployment: 'vcst_qa' });
    assert.equal(bad.result.isError, true);
    assert.match(callText(bad), /needs --saw|what you saw instead/);

    const lines = readFileSync(join(q.dir, 'mcptest0.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.filter((l) => l.kind === 'confirm').length, 1);
    assert.equal(lines.filter((l) => l.kind === 'dispute').length, 0, 'an invalid dispute is not a queued one');
  } finally { q.done(); }
});

// ─── protocol hygiene ─────────────────────────────────────────────────────────────────────────

test('a notification gets NO reply — answering one desynchronises the channel', async () => {
  const q = scratch('notify');
  try {
    const s = fixtureServer(q.dir);
    assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.equal(await s.handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }), null);
    assert.equal(await s.handle({ jsonrpc: '2.0', method: 'some/unknown/notification' }), null);
  } finally { q.done(); }
});

test('an unknown method and an unknown tool both fail loudly, with JSON-RPC codes', async () => {
  const q = scratch('unknown');
  try {
    const s = fixtureServer(q.dir);
    const method = await s.handle({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
    assert.equal(method.error.code, -32601);
    const tool = await call(s, 'kb_delete_everything', {}, 10);
    assert.equal(tool.error.code, -32601);
    assert.match(tool.error.message, /no such tool/);
  } finally { q.done(); }
});

test('ping answers, because a client that cannot ping declares the server dead', async () => {
  const q = scratch('ping');
  try {
    const r = await fixtureServer(q.dir).handle({ jsonrpc: '2.0', id: 3, method: 'ping' });
    assert.deepEqual(r, { jsonrpc: '2.0', id: 3, result: {} });
  } finally { q.done(); }
});

// ─── the in-memory index: the half of the latency argument a disk cache cannot deliver ────────

test('the index is read ONCE for the life of the process, and a failed read is not cached', async () => {
  let manifestReads = 0;
  let indexReads = 0;
  let failing = true;
  const reader = memoizeReader({
    kind: 'fake',
    locator: 'fake://base',
    readManifest: async () => { manifestReads += 1; return { ok: true, text: '{}' }; },
    readIndex: async () => {
      indexReads += 1;
      return failing ? { ok: false, reason: 'unreachable', detail: 'blip' } : { ok: true, text: '{"entries":[]}' };
    },
    readEntry: async () => ({ ok: true, text: '' }),
  });

  await reader.readManifest();
  await reader.readManifest();
  assert.equal(manifestReads, 1, 'the second question pays nothing');

  await reader.readIndex('index.json');
  await reader.readIndex('index.json');
  assert.equal(indexReads, 2, 'a blip must not become five minutes of "unreachable"');

  failing = false;
  await reader.readIndex('index.json');
  await reader.readIndex('index.json');
  assert.equal(indexReads, 3, 'once it succeeds, it is held');
});

test('the memo expires, so a server left running all day does not answer out of this morning', async () => {
  let reads = 0;
  let clock = 0;
  const reader = memoizeReader({
    readManifest: async () => { reads += 1; return { ok: true, text: '{}' }; },
    readIndex: async () => ({ ok: true, text: '' }),
    readEntry: async () => ({ ok: true, text: '' }),
  }, { ttlMs: 300_000, now: () => clock });

  await reader.readManifest();
  clock = 299_999;
  await reader.readManifest();
  assert.equal(reads, 1);
  clock = 300_001;
  await reader.readManifest();
  assert.equal(reads, 2, 'past raw\'s own max-age, ask again');
});

// ─── the real process: stdout is the channel, and stdin closing is the flush ──────────────────

/** Spawn the server under the network trap, feed it frames, close stdin, collect everything. */
async function spawnServer(frames, env = {}) {
  const child = run(process.execPath, ['--import', `file://${TRAP.replace(/\\/g, '/')}`, SERVER], {
    env: { ...process.env, KB_BASE: FIXTURE, CLAUDE_CODE_HOST_SESSION_ID: 'mcpproc0', ...env },
    cwd: REPO,
  });
  child.child.stdin.end(frames.map((f) => `${JSON.stringify(f)}\n`).join(''));
  try {
    const { stdout, stderr } = await child;
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('the real server speaks JSON-RPC on stdout and NOTHING else — every line is a frame', async () => {
  const q = scratch('proc');
  try {
    const r = await spawnServer([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'kb_ask', arguments: { question: 'what does the Active column on /company/members reflect' } } },
    ], { KB_QUEUE_DIR: q.dir });

    assert.ok(!`${r.stdout}${r.stderr}`.includes('KB-NETWORK-TRAP'), `a network door was opened:\n${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    const frames = lines.map((l, i) => {
      try { return JSON.parse(l); } catch { throw new assert.AssertionError({ message: `stdout line ${i + 1} is not a JSON-RPC frame — the channel is corrupted: ${l.slice(0, 120)}` }); }
    });
    assert.deepEqual(frames.map((f) => f.id), [1, 2, 3], 'one response per request, notifications excluded');
    assert.ok(frames.every((f) => f.jsonrpc === '2.0'));
    assert.match(frames[2].result.content[0].text, /KB-27B4CD10/);
    // The diagnostics went to stderr, where they cannot corrupt the protocol.
    assert.match(r.stderr, /\[kb-mcp\] base /);
  } finally { q.done(); }
});

test('malformed input on the channel is answered with a parse error, not a crash', async () => {
  const q = scratch('garbage');
  try {
    const child = run(process.execPath, ['--import', `file://${TRAP.replace(/\\/g, '/')}`, SERVER], {
      env: { ...process.env, KB_BASE: FIXTURE, KB_QUEUE_DIR: q.dir, CLAUDE_CODE_HOST_SESSION_ID: 'mcpproc1' },
      cwd: REPO,
    });
    child.child.stdin.end('{not json at all\n{"jsonrpc":"2.0","id":7,"method":"ping"}\n');
    const { stdout } = await child;
    const frames = stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(frames[0].error.code, -32700, 'a parse error, addressed to no id');
    assert.equal(frames[1].id, 7, 'and the session carries on');
  } finally { q.done(); }
});

test('WHEN STDIN CLOSES the queue is flushed — and with no token it is KEPT, not lost', async () => {
  const q = scratch('flush');
  try {
    // A queue left by this session id, exactly as a capture would have written it.
    writeFileSync(join(q.dir, 'mcpproc2.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), kind: 'ask', q: 'anything', state: 'miss' })}\n`, 'utf8');

    const r = await spawnServer([{ jsonrpc: '2.0', id: 1, method: 'ping' }], {
      KB_QUEUE_DIR: q.dir,
      CLAUDE_CODE_HOST_SESSION_ID: 'mcpproc2',
      // A writable base — the flush must get as far as the token check, which happens before any
      // network call, so the trap is never reached.
      KB_BASE: 'https://raw.githubusercontent.com/VirtoCommerce/vc-knowledge/main',
      KB_GITHUB_TOKEN: '', GITHUB_TOKEN: '', VC_ENV_ROOT: q.dir,
    });

    assert.ok(!`${r.stdout}${r.stderr}`.includes('KB-NETWORK-TRAP'), 'no token means no network call at all');
    assert.match(r.stderr, /stdin closed — flushing/);
    assert.match(r.stderr, /flush: no-token/, 'the state is named out loud');
    assert.match(r.stderr, /the queue is kept/);
    assert.ok(existsSync(join(q.dir, 'mcpproc2.jsonl')), 'and the queue really is still there');
    assert.equal(r.code, 0, 'a session with nothing to push still ends cleanly');
  } finally { q.done(); }
});

test('a local base cannot be pushed to, and the server says so instead of failing silently', async () => {
  const q = scratch('localflush');
  try {
    const r = await spawnServer([{ jsonrpc: '2.0', id: 1, method: 'ping' }], { KB_QUEUE_DIR: q.dir });
    assert.match(r.stderr, /flush: no-base/);
    assert.match(r.stderr, /not a writable base/);
  } finally { q.done(); }
});
