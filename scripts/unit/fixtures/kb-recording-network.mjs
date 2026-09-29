// A RECORDING network trap, preloaded with `--import` before the CLI's own entry point.
//
// `kb-no-network.mjs` proves a verb opens no door at all. Some claims need the opposite shape: a
// verb is ALLOWED to call the base, and the question is how many calls it made and who made them
// (VCST-6103: did the post-verb sweep push after `push --dry-run`?). A trap that throws cannot
// answer that — the sweep swallows every error by design — so this one answers every `fetch` with
// a 503, never leaves the process, and appends `METHOD URL` to the file named by `KB_FETCH_LOG`.
//
// Every other outbound door still throws, exactly as in `kb-no-network.mjs`: the only thing this
// file loosens is that `fetch` is COUNTED instead of fatal. Nothing it records ever reaches a
// network, so a test built on it can run against the real declared base's coordinates.
import { appendFileSync } from 'node:fs';
import dns from 'node:dns';
import dnsp from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const LOG = process.env.KB_FETCH_LOG;
if (!LOG) throw new Error('KB-NETWORK-TRAP: KB_FETCH_LOG is not set — refusing to record nowhere');

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  appendFileSync(LOG, `${(init.method ?? 'GET').toUpperCase()} ${url}\n`, 'utf8');
  return new Response('{"message":"recording trap"}', { status: 503, headers: { 'content-type': 'application/json' } });
};

const BOOM = (door) => () => { throw new Error(`KB-NETWORK-TRAP: ${door} was called`); };
for (const [mod, keys] of [
  [http, ['request', 'get']],
  [https, ['request', 'get']],
  [net, ['connect', 'createConnection']],
  [tls, ['connect']],
  [dns, ['lookup', 'resolve', 'resolve4', 'resolve6']],
  [dnsp, ['lookup', 'resolve', 'resolve4', 'resolve6']],
]) {
  for (const k of keys) mod[k] = BOOM(`${k}`);
}
net.Socket.prototype.connect = BOOM('net.Socket#connect');
