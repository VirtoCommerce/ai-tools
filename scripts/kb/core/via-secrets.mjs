// The write token through vc-secrets, WITHOUT making reading depend on it.
//
// The token lives in vc-secrets (CLAUDE.md §Project Overview), so it reaches only a process the
// launcher starts: `node <shim> run kb` for the server, `node <shim> task kb-push` for the Stop hook's
// push. The obvious wiring — put `node ${VC_SECRETS} run kb` into `.mcp.json` — fails three ways:
//
//   * the desktop app does not expand `${VC_SECRETS}` in `.mcp.json` from the settings `env`, so node
//     looks for a file literally named `${VC_SECRETS}` and the server never starts;
//   * the launcher REFUSES an untrusted or changed declaration (README §Trusting), and a refused
//     launch is a missing server — reading, which needs no token (PLAN §6.4), dies with the write;
//   * `kb-register` rewrites the `kb` entry on every session start, so a hand fix does not survive.
//
// So `.mcp.json` keeps the plain `node scripts/kb/mcp.mjs`, and the SERVER decides: with no token of
// its own and a declared `kb` server, it relaunches itself through the launcher and relays stdio. The
// client's bytes are kept until the relaunched server answers; if the launcher exits before a single
// byte of output (untrusted, secret not set, shim gone), the server runs here, read-only, on the
// bytes it kept — the queue is durable and the next launch with a token pushes it.
//
// HOP is the loop guard: the launcher passes the inherited environment to its child
// (plugins/vc-secrets/README.md), so the relaunched server sees it and serves directly.

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PassThrough } from 'node:stream';

import { defaultShimPath } from '../../../plugins/vc-secrets/scripts/shim-path.mjs';
import { repoRoot, vcSecretsDeclares, writeToken } from './token.mjs';

export const HOP = 'KB_VIA_VC_SECRETS';

/**
 * The launcher's shim: `$VC_SECRETS` (what `/project-init` puts into the settings `env`), else the
 * plugin's documented default location. Null when neither file exists — no vc-secrets on this machine.
 */
export function shimPath(env = process.env, exists = existsSync) {
  for (const p of [env.VC_SECRETS, defaultShimPath(env)]) {
    if (p && !p.includes('${') && exists(p)) return p;
  }
  return null;
}

/**
 * Should this process go through the launcher for its token? Only when it has no token of its own,
 * is not already the launcher's child, a declaration names the entry, and the shim is on disk.
 * @returns {{ shim: string } | null}
 */
export function viaSecrets(kind, name, env = process.env, { exists = existsSync } = {}) {
  if (env[HOP] || writeToken(env).token) return null;
  if (!vcSecretsDeclares(kind, name, env)) return null;
  const shim = shimPath(env, exists);
  return shim ? { shim } : null;
}

/**
 * Relaunch the server as `node <shim> run kb` and relay stdio. `fallback(input)` runs the server in
 * this process on a stream that replays what the client already sent — called when the launcher ends
 * before it wrote anything (it refused, or the server it started could not come up).
 */
export function relayThroughSecrets({
  shim, env = process.env, input = process.stdin, output = process.stdout, errput = process.stderr,
  fallback, spawn = nodeSpawn, exit = (code) => process.exit(code),
}) {
  const note = (s) => { try { errput.write(`[kb-mcp] ${s}\n`); } catch { /* stderr is a courtesy */ } };
  const child = spawn(process.execPath, [shim, 'run', 'kb'], {
    cwd: repoRoot(env),
    env: { ...env, [HOP]: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let kept = [];       // the client's bytes, until the relaunched server answers
  let alive = false;   // it wrote output: it is the server now, nothing to fall back to
  let ended = false;   // the client closed stdin
  let sink = child.stdin;

  child.stdin.on('error', () => { /* a refused launch closes its stdin; the exit handler decides */ });
  input.on('data', (chunk) => {
    if (kept) kept.push(chunk);
    try { sink.write(chunk); } catch { /* see above */ }
  });
  input.on('end', () => { ended = true; try { sink.end(); } catch { /* see above */ } });

  child.stdout.on('data', (chunk) => {
    if (!alive) { alive = true; kept = null; }
    output.write(chunk);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { try { child.kill(signal); } catch { /* gone */ } });

  const fallBack = (why) => {
    note(`vc-secrets did not start kb (${why}) — serving here without a write token; captures stay queued`);
    const replay = new PassThrough();
    for (const chunk of kept) replay.write(chunk);
    kept = null;
    sink = replay;
    if (ended) replay.end();
    fallback(replay);
  };

  child.on('error', (err) => { if (!alive && kept) fallBack(err?.message ?? String(err)); });
  // 'close', not 'exit': it fires after the child's stdout has drained, so no last frame is lost.
  child.on('close', (code, signal) => {
    if (alive) { exit(code ?? (signal ? 1 : 0)); return; }
    if (kept) fallBack(signal ? `signal ${signal}` : `exit ${code}`);
  });
  return child;
}
