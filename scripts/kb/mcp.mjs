#!/usr/bin/env node
// The MCP server — the PRIMARY door onto the knowledge base (PLAN §4).
//
// WHY THIS DOOR AND NOT ONLY THE CLI, all of it measured rather than argued:
//
//   * A tool the model can SEE beats a command it must remember. The A/B (PLAN §1.8) is 0 `kb`
//     calls without the server and 1 with it, same model, same prompt, same `CLAUDE.md`.
//   * MCP TOOLS REACH SUBAGENTS; HOOKS DO NOT (PLAN §1.6). This repo does its real work in
//     subagents, so that single fact decides the shape of the whole delivery.
//   * The token objection was false: ~12 tokens per tool schema, so five verbs sit inside the
//     run-to-run noise (PLAN §1.7).
//   * Both failure modes are LOUD — a server that fails to start is named in the harness roster and
//     by the model, and one that dies mid-session returns `is_error: true` and the model says
//     "lookup failed" rather than guessing (PLAN §1.7).
//
// AND IT IS WHERE THE LATENCY ARGUMENT PAYS OFF (PLAN §3.3). Every `kb ask` is a fresh process:
// ~150 ms of Node start plus ~150–190 ms of DNS+TCP+TLS on the first request are per-PROCESS costs
// that no cache removes. The server pays both ONCE PER SESSION and holds the index in memory, so a
// question costs the retrieval and nothing else.
//
// ── THE ONE RULE THIS FILE LIVES UNDER ───────────────────────────────────────────────────────
//
// STDOUT IS THE JSON-RPC CHANNEL. Nothing but a frame may ever be written to it. That is why this
// file does NOT import `config.js` (it writes `[config] TEST_ENV=…` to stdout at import and can
// `process.exit(1)` over unrelated variables — session 3, finding 1) and why every diagnostic here
// goes to stderr. The token comes from `core/token.mjs`, which reproduces `config.js`'s layer
// precedence with no stdout, no exit and no dependence on the working directory.
//
// ── WHAT HAPPENS WHEN STDIN CLOSES ───────────────────────────────────────────────────────────
//
// The session's queued captures, confirmations and log lines are flushed to the base as ONE atomic
// commit — no explicit `push`, no hook. If there is no token the queue is simply kept (`no-token` is
// a state, not an error) and the first later session with one pushes it.
//
// ── AND IT NO LONGER WAITS FOR THAT ──────────────────────────────────────────────────────────
//
// This file used to say "a session that learned something banks it by ending", which was true and
// useless: NOBODY ENDS A SESSION. They stay open for days, and switching away from a tab is not
// ending one. The evidence sat on one laptop, which is the exact failure this system exists to
// remove. Two rules now bound it, and the second is the one that makes it a bound:
//
//   * `OWN_FLUSH_AFTER_MS` (push.mjs) — on the way out of a request, publish if the oldest queued
//     line is over five minutes old. This covers a working session, and NOT its tail: it needs a
//     later request to fire, and a session's captures come at the END of the work with nothing
//     after them.
//   * A TIMER in this process, below — the only thing that does not depend on being called again.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { openBase } from './core/base.mjs';
import { flush, ownFlushDue, sweepIfDue } from './core/push.mjs';
import { askLines, captureLines, evidenceLines, showLines } from './core/render.mjs';
import { queueDir } from './core/queue.mjs';
import { repoRoot, writeToken } from './core/token.mjs';
import { TOPIC_MAX, ask, capture, confirm, dispute, show, stat } from './core/verbs.mjs';
import { resolveWho } from './core/who.mjs';

/** The newest protocol version this server speaks; older ones are echoed back when a client asks. */
export const LATEST_PROTOCOL = '2025-06-18';
const SUPPORTED_PROTOCOLS = new Set([LATEST_PROTOCOL, '2025-11-25', '2025-03-26', '2024-11-05']);

/** Version from `package.json` rather than a literal: a transcribed constant is correct once. */
function serverVersion(env = process.env) {
  try { return String(JSON.parse(readFileSync(join(repoRoot(env), 'package.json'), 'utf8')).version ?? '0.0.0'); } catch { return '0.0.0'; }
}

// ── the tool surface ──────────────────────────────────────────────────────────────────────────
//
// FIVE VERBS, and the descriptions are not decoration. The measured root cause of the bypass
// (PLAN §1.2) is that an agent was told WHERE the base was and never that it could ASK — so each
// description names the moment the verb applies, in the words the trigger uses ("about to assert
// how the platform behaves"), not the mechanism. `push`, `reindex` and `stat` stay CLI-only:
// pushing happens by itself when this process ends, and the other two are operator repairs.

const str = (description) => ({ type: 'string', description });

/**
 * WHAT THE WORK IS -- the one field an AGENT has to decide something for, which makes its wording
 * the whole of its design. This project has exactly one measured lever on agent behaviour: the
 * words it reads (PLAN §21.1 -- the same prompt, the same two agents, a brief naming the tool and
 * the question shape produced 5 calls, a brief without it produced 0). So the description names
 * Written twice, as that section's shape predicted it would have to be. The first draft opened
 * "What you are working on right now", which is a DESCRIPTION of a field; §21.1's one
 * observed-to-work instruction is IMPERATIVE, so this one opens with the verb. It then does the
 * three things that sentence did: it names the SHAPE ("short English noun phrase"), gives
 * examples, and says what it is NOT (a sentence, the prompt, a translation of one). It also says
 * when to CHANGE it, because a topic passed once and left alone is the per-session field this
 * design rejected; and it gives the one reason an agent has to care, in a clause, because a field
 * with no stated purpose gets the shortest string that satisfies the schema.
 *
 * ONE DEFINITION FOR ALL FIVE VERBS, not five copies: the field means the same thing everywhere,
 * and five copies is five chances for four of them to go stale. The cap comes from `TOPIC_MAX`
 * rather than being typed in here -- a transcribed constant is correct exactly once
 * (`.claude/rules/test-data.md`, GOLDEN RULE), and this one would go stale in a tool description,
 * where nothing would ever fail.
 */
const TOPIC = str('Name what you are working on, as a SHORT ENGLISH NOUN PHRASE — '
  + '"configurable product checkout", "B2B member roles", "order import failures". '
  + 'Pass the SAME one on every kb call of one piece of work, and change it when the work changes: it '
  + 'is what lets a later reader see your questions and what you recorded as one piece of work. The '
  + 'session cannot do that — a session covers many tasks. '
  + 'Write it yourself, in English: not a sentence, not the prompt you were given, not a translation of it, '
  + `and no customer or client names in it. Cut at ${TOPIC_MAX} characters.`);

export const TOOLS = Object.freeze([
  {
    name: 'kb_ask',
    description: 'Ask the shared knowledge base what is already known about how the Virto Commerce platform BEHAVES. '
      + 'Use it whenever you are about to assert, write or test something about platform behaviour that could be '
      + 'checked by observation — before grepping, before reasoning it out, before writing the assertion. '
      + 'Returns matching entries with their trust label, confirmation count and per-observation provenance. '
      + 'Says plainly when the base was read and holds nothing (go find out, then kb_capture) and when it could '
      + 'NOT be read (conclude nothing; retry) — these are different answers and never look alike. '
      + 'Name the deployment you are working against, if you know it: the same behaviour differs between stands, '
      + 'and an answer weighed on the wrong one is how this base got its only dispute.',
    inputSchema: {
      type: 'object',
      properties: {
        question: str('The behavioural question, in plain words, e.g. "what does the Active column on /company/members reflect".'),
        deployment: str('Which deployment this question is about, if you know — the same string you would pass to '
          + 'kb_capture, e.g. vcst_qa, vcptcore_stable. Omit it rather than guess: an absent stand costs nothing, '
          + 'a wrong one is read as fact by everybody after you.'),
        topic: TOPIC,
        top: { type: 'integer', minimum: 1, maximum: 5, description: 'How many entries to open. Default 3.' },
      },
      required: ['question'],
    },
  },
  {
    name: 'kb_show',
    description: 'Read one knowledge-base entry in full by its id (KB-XXXXXXXX), including its evidence trail and status. '
      + 'Use after kb_ask when a hit is worth reading whole, or when a report, ticket or test case cites an id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('The entry id, e.g. KB-27B4CD10.'),
        topic: TOPIC,
      },
      required: ['id'],
    },
  },
  {
    name: 'kb_capture',
    description: 'Record a NEW observation about platform behaviour that you verified yourself on a live deployment, '
      + 'so the next session does not have to re-derive it. Use after kb_ask returned nothing and you then found out. '
      + 'Refused if an entry already covers the same anchors and scope — confirm that one instead. '
      + 'Names back the entries YOU OPENED earlier in this session and asks whether what you just wrote '
      + 'disagrees with any of them — if it does, kb_dispute that entry rather than leaving the base '
      + 'holding two answers to one question. Also lists entries sitting at the same coordinates. '
      + 'Queued locally and published shortly after, without you doing anything.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: str('One line, the fact itself, as a claim — not a topic.'),
        question: str('The question this entry answers, phrased as somebody would ask it.'),
        claim: str('The observation in prose: what you did, what happened, and what follows.'),
        deployment: str('Where you observed it, e.g. vcst_qa, vcptcore_stable.'),
        anchors: { type: 'array', items: { type: 'string' }, description: 'Structured coordinates the fact lives at: a route (/company/members), an endpoint (POST /api/carts), a GraphQL operation (Query.products). At least one.' },
        scope: { type: 'array', items: { type: 'string' }, description: 'axis=value pairs bounding where the fact applies, e.g. surface=storefront-ui. At least one — without scope a storefront fact gets applied to admin.' },
        method: str('How it was established. Default "observation".'),
        topic: TOPIC,
      },
      required: ['subject', 'question', 'claim', 'deployment', 'anchors', 'scope'],
    },
  },
  {
    name: 'kb_confirm',
    description: 'Record that you saw an existing entry hold true on a deployment — its confirmation count is what a later '
      + 'reader weighs the claim by. Use when kb_ask returned an entry and you then observed the same thing yourself. '
      + 'Queued locally and published shortly after, without you doing anything.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('The entry id, e.g. KB-27B4CD10.'),
        deployment: str('Where you observed it.'),
        note: str('Optional: what you saw, if it adds anything the entry does not already say.'),
        topic: TOPIC,
      },
      required: ['id', 'deployment'],
    },
  },
  {
    name: 'kb_dispute',
    description: 'Record that an existing entry did NOT hold — what you observed instead, and where. Never deletes or retires '
      + 'anything: one contradiction against four confirmations is a flag for a human, not a deletion. '
      + 'Queued locally and sent when this session ends.',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('The entry id, e.g. KB-27B4CD10.'),
        deployment: str('Where you observed the contradiction.'),
        saw: str('What you saw instead — required, because a bare "it is wrong" is not evidence.'),
        topic: TOPIC,
      },
      required: ['id', 'deployment', 'saw'],
    },
  },
]);

// ── the base, opened once ─────────────────────────────────────────────────────────────────────

/**
 * Hold the manifest and the indexes in memory for the life of the process.
 *
 * This is the half of PLAN §3.3's argument that the on-disk cache cannot deliver: a CLI invocation
 * is a new process, so "fetch the index once per session" can only ever mean re-reading it from
 * disk and re-parsing it. Here the second question does neither.
 *
 * The TTL is `raw`'s own `max-age=300`, deliberately, not "forever": the plan already accepts five
 * minutes of read staleness (worst case a freshly captured entry reads as a miss, which the
 * push-time dedup then corrects), and a server left running all day must not be answering out of
 * this morning's index. Entry BODIES are not memoised — they are read once per answer and the
 * index is what every question pays for.
 */
export function memoizeReader(reader, { ttlMs = 300_000, now = () => Date.now() } = {}) {
  if (!reader) return reader;
  const cache = new Map();
  const through = (key, fn) => async () => {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await fn();
    // Only a SUCCESSFUL read is held. Caching a failure would turn one blip into five minutes of
    // "unreachable" for a base that came back on the next second.
    if (value?.ok) cache.set(key, { at: now(), value });
    return value;
  };
  return {
    ...reader,
    readManifest: through('kb.json', () => reader.readManifest()),
    readIndex: (name) => through(`index:${name}`, () => reader.readIndex(name))(),
    readEntry: (path) => reader.readEntry(path),
  };
}

// ── verb → MCP result ─────────────────────────────────────────────────────────────────────────
//
// THE FOUR STATES SURVIVE THE TRANSLATION, which is the one thing this mapping must get right.
// `miss` is an ANSWER — the base was read and holds nothing — so it is not an error and the text
// says what to do about it. `unreachable` and `no-base` are `isError: true`, because the measured
// effect of an error result (PLAN §1.7) is that the model says "lookup failed" and does NOT fall
// back to guessing. That is exactly the behaviour PLAN §3.5 is trying to buy: an agent that could
// not reach the base must conclude nothing, not conclude "nothing is known".

const FAILED = new Set(['no-base', 'unreachable']);

/**
 * WHICH DOOR THIS IS, stamped on every line this process writes (PLAN §7).
 *
 * The counterpart of `kb.mjs`'s `VIA = 'cli'`. PLAN §4 argues both doors are load-bearing; this is
 * what will turn that argument into a count.
 */
const VIA = 'mcp';

const text = (lines, isError = false) => ({
  content: [{ type: 'text', text: lines.join('\n') }],
  ...(isError ? { isError: true } : {}),
});

/**
 * The caller's own tool-use id, when the client sends one.
 *
 * WHO ASKED — answered by measurement on 2026-09-19, after being twice declared unanswerable.
 * PLAN §7 refused to log the caller because `parent_tool_use_id` is not in the request. That is
 * TRUE, and it is not the same statement as "the request carries nothing identifying" — which
 * nobody had checked. Dumping one real request showed:
 *
 *   "_meta": { "claudecode/toolUseId": "toolu_01Fy89…", "progressToken": 2 }
 *
 * It does not say whether a subagent called; nothing the server can see does. What it IS is an
 * exact JOIN KEY into the transcript, where every `tool_use` carries `isSidechain` and
 * `agentName`. So "who asked" stops being an inference and becomes a lookup. On 2026-09-19
 * subagent use was established by ELIMINATION — seven calls in a session's log against zero in
 * the main thread's transcript — which worked once and does not generalise. This does.
 *
 * NOT A PROXY, which is what §7 rightly refused: a proxy guesses the answer, this one carries the
 * key to it. Client-specific (`claudecode/`), and ABSENT rather than guessed for any other client,
 * because a field that defaults is a field that lies.
 */
const callIdOf = (message) => {
  const id = message?.params?._meta?.['claudecode/toolUseId'];
  return typeof id === 'string' && id ? id : null;
};

async function callTool(name, args, ctx) {
  const opened = ctx.opened;
  switch (name) {
    case 'kb_ask': {
      const question = String(args?.question ?? '').trim();
      if (!question) return text(['kb_ask needs a question.'], true);
      const r = await ask(question, opened, {
        env: ctx.env, top: Number(args?.top) || 3, via: VIA, call: ctx.call, deployment: args?.deployment,
        topic: args?.topic,
      });
      return text(askLines(r, { prefix: 'kb_ask' }), FAILED.has(r.state));
    }
    case 'kb_show': {
      const id = String(args?.id ?? '').trim();
      if (!id) return text(['kb_show needs an entry id.'], true);
      const r = await show(id, opened, { env: ctx.env, via: VIA, call: ctx.call, topic: args?.topic });
      return text(showLines(r, { prefix: 'kb_show' }), FAILED.has(r.state));
    }
    case 'kb_capture': {
      const r = await capture({
        subject: args?.subject, question: args?.question, claim: args?.claim,
        deployment: args?.deployment, method: args?.method,
        anchors: asList(args?.anchors), scope: asList(args?.scope),
      }, opened, { env: ctx.env, via: VIA, call: ctx.call, topic: args?.topic });
      // `refused` is not an error: the base already holds the fact, which is the dedup working, and
      // the text hands back the id to confirm instead.
      return text(captureLines(r, { prefix: 'kb_capture' }), r.state === 'invalid' || FAILED.has(r.state));
    }
    case 'kb_confirm':
    case 'kb_dispute': {
      const verb = name === 'kb_confirm' ? 'confirm' : 'dispute';
      const fn = verb === 'confirm' ? confirm : dispute;
      const r = await fn(String(args?.id ?? '').trim(), {
        deployment: args?.deployment, note: args?.note, saw: args?.saw, method: args?.method,
      }, opened, { env: ctx.env, via: VIA, call: ctx.call, topic: args?.topic });
      return text(evidenceLines(verb, r), r.state === 'invalid' || FAILED.has(r.state));
    }
    default:
      return null; // not a tool of ours -- the caller turns that into a JSON-RPC error
  }
}

const asList = (v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? [v] : []);

// ── the protocol ──────────────────────────────────────────────────────────────────────────────

const RPC = Object.freeze({ PARSE: -32700, INVALID: -32600, NO_METHOD: -32601, INTERNAL: -32603 });

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/**
 * Build the request handler. Pure in the sense that matters: it touches stdin/stdout not at all, so
 * the whole protocol surface is testable offline by feeding it objects.
 */
export function createServer({ env = process.env, baseArg = null, ttlMs = 300_000 } = {}) {
  const chosen = openBase({ baseArg: baseArg ?? env.KB_BASE_ARG ?? null, env });
  const opened = { ...chosen, reader: memoizeReader(chosen.reader, { ttlMs }) };
  const ctx = { env, opened };
  let sweeping = null;

  /** The opportunistic sweep (PLAN §7), off the response path: it must never slow an answer. */
  const sweep = () => {
    if (sweeping) return sweeping;
    sweeping = sweepIfDue({ env, base: opened.locator, token: writeToken(env).token })
      .catch(() => ({ state: 'failed' }))
      .finally(() => { sweeping = null; });
    return sweeping;
  };

  async function handle(message) {
    // WHO CALLED — a question this file has twice declared unanswerable without ever looking.
    //
    // PLAN §7 refused to log the caller because `parent_tool_use_id` is not in the MCP request, and
    // that is true about THAT field. It is not the same statement as "the request carries nothing
    // identifying", which nobody checked. On 2026-09-19 a run proved subagents use the base — by
    // ELIMINATION, seven calls in the session's log against zero in the main thread's transcript.
    // That works once and does not scale.
    //
    // So: dump the raw request LOCALLY and read what is actually there. Off unless `KB_RAW_DUMP`
    // names a file, never published, and never on the response path. If the answer turns out to be
    // "nothing", that is a measurement and §7's note can finally cite one.
    if (env.KB_RAW_DUMP) {
      try {
        // mkdir first. Without it a missing directory throws, the catch swallows it, and the dump
        // is a silent no-op — which is how a hook, a harvester and a probe all failed earlier the
        // same day. A diagnostic that fails quietly is worse than no diagnostic: it reports the
        // absence of evidence as evidence of absence.
        mkdirSync(dirname(env.KB_RAW_DUMP), { recursive: true });
        appendFileSync(env.KB_RAW_DUMP, `${JSON.stringify({ at: new Date().toISOString(), message })}\n`, 'utf8');
      } catch { /* a diagnostic must never cost a request */ }
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return fail(null, RPC.INVALID, 'expected a JSON-RPC object');
    }
    const { id = null, method } = message;
    // A NOTIFICATION HAS NO ID AND GETS NO REPLY. Answering one corrupts the channel just as
    // surely as printing to stdout would: the client is not waiting for it and the next real
    // response is read against the wrong frame.
    const isNotification = !Object.hasOwn(message, 'id') || message.id === undefined;

    if (typeof method !== 'string') return isNotification ? null : fail(id, RPC.INVALID, 'no method');

    switch (method) {
      case 'initialize': {
        const asked = String(message.params?.protocolVersion ?? '');
        return reply(id, {
          // Echo the client's version when we speak it; otherwise name ours and let it decide.
          protocolVersion: SUPPORTED_PROTOCOLS.has(asked) ? asked : LATEST_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'kb', version: serverVersion(env) },
          instructions: 'The shared Virto Commerce knowledge base: what has actually been OBSERVED about how the '
            + 'platform behaves, with trust and provenance. Ask it before asserting behaviour; capture what you '
            + 'had to find out yourself.',
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        return isNotification ? null : reply(id, {});
      case 'tools/list':
        return reply(id, { tools: TOOLS });
      case 'tools/call': {
        const name = String(message.params?.name ?? '');
        let result;
        try {
          result = await callTool(name, message.params?.arguments ?? {}, { ...ctx, call: callIdOf(message) });
        } catch (err) {
          // A CRASH IS NOT ONE OF THE FOUR STATES and must never be mistaken for one -- least of
          // all for "the base holds nothing". Reported as a tool error, which the model reads as
          // "lookup failed" rather than as an answer.
          return reply(id, text([`kb: ${name} failed — ${err?.message ?? err}`,
            'The base was NOT read. This is not "nothing is known" — conclude nothing; retry.'], true));
        }
        if (!result) return fail(id, RPC.NO_METHOD, `no such tool: ${name}`);
        // Bookkeeping happens AFTER the answer is composed and is never awaited: a sweep that
        // delayed an answer would have traded the thing the caller asked for against housekeeping.
        sweep();
        return reply(id, result);
      }
      default:
        return isNotification ? null : fail(id, RPC.NO_METHOD, `method not found: ${method}`);
    }
  }

  /**
   * THE FLUSH, when stdin closes (PLAN §7; session 3's handover).
   *
   * `includeMine: true` — this is the primary flush and the only one that takes the current
   * session's own queue. Neither `flush` nor `sweepIfDue` prints or throws; the summary goes to
   * stderr, where it cannot corrupt the channel that is closing anyway.
   */
  async function shutdown() {
    if (sweeping) { try { await sweeping; } catch { /* best effort */ } }
    const { token, from } = writeToken(env);
    const r = await flush({ env, base: opened.locator, token, includeMine: true }).catch((err) => ({ state: 'failed', why: String(err?.message ?? err) }));
    return { ...r, tokenFrom: from };
  }

  return { handle, shutdown, opened, base: opened.locator, how: opened.how, stat: () => stat(opened, { env }) };
}

// ── stdio transport ───────────────────────────────────────────────────────────────────────────

/** One line in, one line out. MCP's stdio framing is newline-delimited JSON, nothing more. */
export function runStdio({ env = process.env, input = process.stdin, output = process.stdout, errput = process.stderr } = {}) {
  const server = createServer({ env });
  const note = (s) => { try { errput.write(`[kb-mcp] ${s}\n`); } catch { /* stderr is a courtesy */ } };
  note(`base ${server.base} (${server.how})`);

  const send = (msg) => { try { output.write(`${JSON.stringify(msg)}\n`); } catch (err) { note(`could not write a frame: ${err?.message ?? err}`); } };

  // Responses are sent in the order the requests were HANDLED, not the order they arrive, which
  // JSON-RPC permits (every response carries its id). Handling is serialised anyway: the work is
  // one network read deep and ordering the queue is cheaper than reasoning about interleaving.
  // WHO THIS SERVER IS, resolved ONCE, and SEEDED INTO THE DISPATCH CHAIN rather than awaited on
  // the side. The chain already serialises every request, so putting the lookup at its head means
  // the first tool call waits for it and no later one ever does — without a second synchronisation
  // mechanism and without a window in which the session's opening lines are unattributed.
  //
  // It cannot reject (`resolveWho` returns a result), and the `catch` is belt and braces: a
  // bookkeeping lookup must never be able to take the dispatch chain down with it.
  let chain = resolveWho({ env, dir: queueDir(env) })
    .then((r) => { note(`who ${r.who ?? 'none'} (${r.from})`); }, () => { /* never fatal */ });
  const dispatch = (line) => {
    let message;
    try { message = JSON.parse(line); } catch (err) { send(fail(null, RPC.PARSE, `invalid JSON: ${err.message}`)); return; }
    const batch = Array.isArray(message) ? message : [message];
    chain = chain.then(async () => {
      for (const one of batch) {
        const out = await server.handle(one).catch((err) => fail(one?.id ?? null, RPC.INTERNAL, String(err?.message ?? err)));
        if (out) send(out);
      }
    });
  };

  let buffer = '';
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let nl = buffer.indexOf('\n');
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) dispatch(line);
      nl = buffer.indexOf('\n');
    }
  });

  let closing = null;
  const close = (why) => {
    if (closing) return closing;
    closing = (async () => {
      note(`${why} — flushing`);
      try { await chain; } catch { /* a failed request must not cost the flush */ }
      const r = await server.shutdown();
      // Every outcome is said out loud, including the ones that are not failures: `no-token` means
      // the queue is KEPT and the first later session with a token pushes it, which an operator
      // reading this line needs to be able to tell apart from a push that went wrong.
      note(`flush: ${r.state}${r.commit ? ` ${r.commit.slice(0, 7)}` : ''}${r.why ? ` — ${r.why}` : ''}`
        + `${r.tokenFrom ? ` (token from ${r.tokenFrom})` : ''}`);
      return r;
    })();
    return closing;
  };

  // ── THE CEILING ──────────────────────────────────────────────────────────────────────────────
  //
  // `OWN_FLUSH_AFTER_MS` alone was NOT a ceiling, and calling it one was wrong. It is checked on the
  // way out of a `tools/call`, so it needs a LATER call to fire — and the lines that matter most are
  // the ones with nothing after them. A session's captures come at the END of the work: on
  // 2026-09-19 the last capture landed at 10:59:17 and no `kb` call followed it, so under that rule
  // alone it would have sat on one laptop until the session ended. Nobody ends sessions; that is the
  // defect the rule was written to close, surviving in the tail.
  //
  // A timer in the server process is the only thing that makes the bound real, because the server is
  // the one thing that outlives a request and does not depend on being called again. `unref()` so it
  // can never hold the process open by itself, and it is cleared on close so a flush cannot race the
  // shutdown flush. `ownFlushDue` still gates it, so an idle session does no work and writes nothing.
  const FLUSH_TICK_MS = 60_000;
  let ticking = false;
  const ticker = setInterval(() => {
    if (ticking || closing) return;
    ticking = true;
    ownFlushDue({ env })
      .then((due) => (due ? server.shutdown() : null))
      .then((r) => { if (r && r.state !== 'nothing') note(`flush (timer): ${r.state}${r.commit ? ` ${r.commit.slice(0, 7)}` : ''}`); })
      .catch(() => { /* a timer must never take the session down */ })
      .finally(() => { ticking = false; });
  }, FLUSH_TICK_MS);
  ticker.unref();
  const stopTicker = () => clearInterval(ticker);

  input.on('end', () => { stopTicker(); close('stdin closed').then(() => process.exit(0), () => process.exit(0)); });
  input.on('close', () => { stopTicker(); close('stdin closed').then(() => process.exit(0), () => process.exit(0)); });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { stopTicker(); close(signal).then(() => process.exit(0), () => process.exit(0)); });
  }

  return { server, close, dispatch };
}

// `node scripts/kb/mcp.mjs` starts the server; importing this file starts nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runStdio();
