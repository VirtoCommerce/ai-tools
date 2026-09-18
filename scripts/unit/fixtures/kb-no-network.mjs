// A NETWORK TRAP, preloaded with `--import` before the CLI's own entry point.
//
// PLAN §13 step 1 requires the v1 core to work against a fixture base with no network in the unit
// tests. "No network" is easy to believe and easy to be wrong about -- a stray `fetch`, a DNS
// lookup behind a URL parse, an accidental `https.request` in a dependency. So it is ENFORCED
// rather than asserted: every outbound door is replaced with one that throws a recognisable
// string, and the test that spawns the CLI through this file fails loudly if any of them opens.
//
// Preloaded, so it is in place before a single line of `kb.mjs` runs.
import dns from 'node:dns';
import dnsp from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const BOOM = (door) => () => { throw new Error(`KB-NETWORK-TRAP: ${door} was called`); };

globalThis.fetch = BOOM('fetch');
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
