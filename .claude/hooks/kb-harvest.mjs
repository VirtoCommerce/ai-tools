#!/usr/bin/env node
/**
 * kb-harvest — a Stop hook that records WHAT A SESSION CONCLUDED, to learn the vocabulary the
 * knowledge base should be keyed to.
 *
 * WHY THIS EXISTS (PLAN §16-§17). Six sessions built a base agents do not read: five real-work
 * sessions made 203 tool calls and zero asks, and an A/B with every `kb` schema pre-loaded still
 * called nothing. The measured reason is not access cost -- it is that reading demands two hard
 * things at once: the agent must suspect it does not know, AND phrase the question in the base's
 * language. The base's strongest signal, the anchor, fires on 0 of 91 of its own entries' natural
 * language questions.
 *
 * But the same agents, when they STATE what they found, speak the base's language natively. W1
 * closed with "CartType.taxType is declared String! ... resolving null"; W3 with
 * "Organization.assignableRoles(storeId:) -- storeId is client-supplied, unvalidated, nullable".
 * Those are exactly the anchor shapes `index.json` stores. So the vocabulary we need in order to
 * fix retrieval is already being produced -- on the WRITE side, and thrown away.
 *
 * THREE DECISIONS, each of which could have gone the other way:
 *
 * 1. IT READS, IT DOES NOT ASK. A Stop hook can block and send the model a question ("what did you
 *    learn?"), which would cost a whole extra turn on every session in the repo. It is not worth
 *    that: the closing message ALREADY says what the session concluded. This hook spends zero model
 *    tokens and cannot change what a session does.
 *
 * 2. IT WRITES LOCALLY, NEVER TO THE BASE. The base's log is PUBLIC (PLAN §7) and a closing message
 *    is free text that can carry absolute paths, customer names, ticket contents or a token echoed
 *    from a command. A corpus for studying phrasing does not need to be shared to be useful, and
 *    `scrub`/`secret-gate` guard VALUES, not prose. So: a gitignored local file, and if any of this
 *    is ever published it is a separate decision with its own review.
 *
 * 3. IT IS NOT REGISTERED IN THE TRACKED `.claude/settings.json`. This is an instrument for an
 *    experiment that has not earned a place in everyone's session yet; it is enabled per-machine
 *    from `.claude/settings.local.json`. CLAUDE.md §Repository Structure records what happened the
 *    last time a collector was registered in both places.
 *
 * Contract: reads the hook payload on stdin, exits 0 whatever happens, prints nothing. A harvester
 * that can fail a session is worse than no harvester.
 */
import { writeFileSync, mkdirSync, openSync, readSync, fstatSync, closeSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// The CLOSING message is at the end, so a tail would do for it -- but the COORDINATES are the more
// valuable half (they are the demand side, in the agent's own hand) and they are spread over the
// whole session. Measured on the wave: a 512 KB tail found 2 of W1's coordinates. 8 MB covers every
// transcript this project has produced (largest 19.9 MB is an outlier builder session, where a tail
// is still fine), and reading a few MB once, at Stop, costs nothing a person can notice.
const TAIL_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 4000;

/** Coordinate shapes, the same ones `coordinates.mjs` treats as structured. */
const COORD = [
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_\-/{}.]+/g,
  /\b(?:Query|Mutations?)\.[A-Za-z][A-Za-z0-9_]*/g,
  /\b[A-Z][A-Za-z0-9_]*Type\.[A-Za-z][A-Za-z0-9_]*/g,
  /(?<![\w/])\/api\/[A-Za-z0-9_\-/{}.]+/g,
];

function readTail(path) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

function main() {
  // fd 0, not '/dev/stdin': the path form does not open on Windows, and this hook's own first
  // test failed exactly there -- silently, exit 0, no file, nothing to see. Read the descriptor.
  let payload = '';
  try { payload = readFileSync(0, 'utf8'); } catch { /* fall through to argv */ }
  let hook = {};
  try { hook = JSON.parse(payload || process.argv[2] || '{}'); } catch { return; }

  const transcript = hook.transcript_path || hook.transcriptPath;
  if (!transcript) return;

  let tail = '';
  try { tail = readTail(transcript); } catch { return; }

  // The tail may begin mid-line; a broken first line is simply skipped by the parse guard.
  let closing = '';
  const coords = new Set();
  for (const line of tail.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const c of o.message.content) {
      if (c.type === 'text' && c.text && c.text.trim()) closing = c.text;
      if (c.type === 'tool_use') {
        const s = JSON.stringify(c.input || {});
        for (const re of COORD) for (const m of s.matchAll(re)) coords.add(m[0].trim());
      }
    }
  }
  if (!closing && !coords.size) return;

  // ONE FILE PER SESSION, REWRITTEN — not one appended line per Stop.
  // `Stop` fires at the end of every assistant turn, not once per session, so the first version of
  // this appended a near-duplicate row on every turn: a five-turn conversation left five rows with
  // identical coordinates and five different closings, and the corpus would have been dominated by
  // whichever session talked the most. Rewriting keeps exactly what the name promises — what this
  // session concluded, as of its latest turn.
  const out = process.env.KB_HARVEST_DIR || join(process.cwd(), '.kb-harvest');
  const sid = String(hook.session_id ?? hook.sessionId ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'unknown';
  const file = join(out, sid + '.json');
  const row = {
    at: new Date().toISOString(),
    session: String(hook.session_id ?? hook.sessionId ?? '').slice(0, 12) || 'unknown',
    // the coordinates the session actually typed -- the demand side, in its own words
    coordinates: [...coords].slice(0, 60),
    // what it concluded -- the vocabulary a future `capture` would be written in
    closing: closing.replace(/\s+/g, ' ').slice(0, MAX_TEXT),
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(row, null, 1) + '\n', 'utf8');
  } catch { /* best effort, always */ }
}

try { main(); } catch { /* a harvester must never fail a session */ }
process.exit(0);
