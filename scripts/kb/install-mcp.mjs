#!/usr/bin/env node
/**
 * `npm run kb:install` — register the `kb` MCP server in this machine's `.mcp.json`, idempotently.
 *
 * WHY A SCRIPT AND NOT A TRACKED FILE (PLAN §13.7). Everything under `.claude/` reaches a teammate
 * by being in git. `.mcp.json` cannot: it is gitignored, and three alternatives were checked and
 * closed before this was written —
 *
 *   * `.claude/settings.json` CANNOT declare MCP servers. Measured: a sandbox with `mcpServers`
 *     there and no `.mcp.json` reports `mcp_servers: []` and zero tools.
 *   * Un-ignoring `.mcp.json` fights `VCST-5774 D2`, enforced in `gen-mcp.mjs` — a tracked file is
 *     a hard blocker under `--inline-secrets`, which writes a credential literal. It is also
 *     personal in practice: several servers in it are user-level, not project-level.
 *   * Adding `kb` to `plugins/vc-fix/templates/.mcp.json.example` ships it to CLIENTS, where
 *     `scripts/kb/mcp.mjs` does not exist, so the entry would simply fail.
 *
 * So the copy-paste paragraph in `docs/onboarding.md` was the only route a teammate had, for six
 * sessions. This replaces it.
 *
 * WHY IT MATTERS THAT THIS IS THE MCP DOOR SPECIFICALLY. The CLI works on every clone with no setup
 * (`npm run kb -- ask "<q>"`), so this is not about access — it is about whether anyone REACHES for
 * it. Measured: CLI-only, 0 calls in 71 tool calls (§1.1); with the server registered, one session
 * made seven calls including from subagents (2026-09-19). A door nobody opens is not a door.
 *
 * THREE THINGS IT PROMISES, and the third is the one that makes it safe to re-run:
 *   1. it adds `kb` to whatever `.mcp.json` you already have, creating the file only if absent;
 *   2. it changes NOTHING else — every other server, and the file's own formatting, survive;
 *   3. a second run is a no-op that says so.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from './core/token.mjs';

/** Relative, secret-free, identical on every machine — which is why it can be a constant here. */
export const KB_SERVER = Object.freeze({ command: 'node', args: ['scripts/kb/mcp.mjs'] });

export function merge(existingText, server = KB_SERVER) {
  let doc = {};
  if (existingText && existingText.trim()) {
    // A malformed `.mcp.json` is somebody's working config with a typo in it. Overwriting it to
    // "fix" the problem would take out every other server they have, so this stops instead.
    try { doc = JSON.parse(existingText); } catch (err) {
      return { state: 'invalid', why: `.mcp.json is not valid JSON (${err.message}) — fix it, then re-run` };
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      return { state: 'invalid', why: '.mcp.json is not a JSON object' };
    }
  }
  const servers = doc.mcpServers && typeof doc.mcpServers === 'object' ? doc.mcpServers : {};
  const before = JSON.stringify(servers.kb ?? null);
  if (before === JSON.stringify(server)) return { state: 'already', text: existingText, servers: Object.keys(servers) };

  const next = { ...doc, mcpServers: { ...servers, kb: { ...server } } };
  return {
    state: servers.kb ? 'replaced' : 'added',
    text: `${JSON.stringify(next, null, 2)}\n`,
    servers: Object.keys(next.mcpServers),
  };
}

export function install({ env = process.env, write = writeFileSync, read = readFileSync, exists = existsSync } = {}) {
  const path = join(repoRoot(env), '.mcp.json');
  const current = exists(path) ? read(path, 'utf8') : '';
  const r = merge(current);
  if (r.state === 'invalid') return { ...r, path };
  if (r.state !== 'already') write(path, r.text, 'utf8');
  return { ...r, path, created: !current };
}

const HEADLINE = {
  added: 'kb registered',
  replaced: 'kb entry updated',
  already: 'kb already registered — nothing to do',
  invalid: 'kb install: refused',
};

function main() {
  const r = install();
  const out = (s) => process.stdout.write(`${s}\n`);
  out(`kb install: ${HEADLINE[r.state]}`);
  out(`  ${r.path}${r.created ? ' (created)' : ''}`);
  if (r.why) { out(`  ${r.why}`); return 1; }
  out(`  servers now: ${r.servers.join(', ')}`);
  if (r.state !== 'already') {
    // Both of these are earned. MCP servers bind at session START, and `/project-init` rewrites
    // `.mcp.json` wholesale from a template rather than merging into it.
    out('  RESTART Claude Code — MCP servers bind at session start.');
    out('  Run /project-init later? It rewrites .mcp.json from its template — re-run this after.');
  }
  return 0;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  process.exit(main());
}
