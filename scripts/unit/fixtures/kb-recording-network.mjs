// A RECORDING network trap, preloaded with `--import` before the CLI's own entry point.
//
// `kb-no-network.mjs` proves a verb opens no door at all. Some claims need the opposite shape: a
// verb is ALLOWED to call the base, and the question is which calls it made (VCST-6103: did the
// post-verb sweep push after `push --dry-run`?). A trap that throws cannot answer that — the sweep
// swallows every error by design — so this one RECORDS every `fetch` as `METHOD URL` in the file
// named by `KB_FETCH_LOG`, and never leaves the process.
//
// It is `kb-no-network.mjs` with exactly one door loosened: every other door is closed by importing
// that file, not by a copy of it, so the two can never disagree about what "no network" means.
//
// `KB_FAKE_BASE` picks what the recorded fetch answers:
//   * unset / `down` — every call is a 503, the base is unreachable;
//   * `healthy`      — an empty base: the ref, commit, tree and index.json a push reads all answer,
//                      so a dry run builds its plan. Every WRITE (POST/PATCH) is still a 503: a
//                      write is recorded, and nothing it carries is ever accepted anywhere.
import { appendFileSync } from 'node:fs';
import './kb-no-network.mjs';

const LOG = process.env.KB_FETCH_LOG;
if (!LOG) throw new Error('KB-NETWORK-TRAP: KB_FETCH_LOG is not set — refusing to record nowhere');
const HEALTHY = process.env.KB_FAKE_BASE === 'healthy';

const INDEX = JSON.stringify({ schema: 1, generated: '2026-09-01T00:00:00Z', count: 0, entries: [] });
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The four reads a push makes, answered as an empty base. Anything else is a 503. */
function healthyRead(url) {
  const path = new URL(url).pathname;
  if (/\/git\/ref\/heads\//.test(path)) return json(200, { object: { sha: 'c0ffee00' } });
  if (/\/git\/commits\/c0ffee00$/.test(path)) return json(200, { tree: { sha: 'feed0000' } });
  if (/\/git\/trees\/feed0000$/.test(path)) return json(200, { truncated: false, tree: [{ path: 'index.json', type: 'blob', sha: 'b10b0000' }] });
  if (/\/git\/blobs\/b10b0000$/.test(path)) return json(200, { encoding: 'base64', content: Buffer.from(INDEX, 'utf8').toString('base64') });
  return null;
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const method = (init.method ?? 'GET').toUpperCase();
  appendFileSync(LOG, `${method} ${url}\n`, 'utf8');
  return (HEALTHY && method === 'GET' && healthyRead(url)) || json(503, { message: 'recording trap' });
};
