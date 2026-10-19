// .claude/skills/ticket-context/lib/cache.mjs — P3 + D2 + D10. A bundle is cached only where git ignores it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { skillRoot } from "./paths.mjs";

export const TTL_MS = 24 * 3600 * 1000;

/** D10: what produced a bundle is part of its key — this skill's own files (scripts, schema, rules) and the
 *  analyst prompt beside it. A change to any of them (a scrubber fix, a prompt rule) rebuilds cached bundles
 *  instead of serving the old ones for a day. Line endings are normalised so two checkouts of one commit agree. */
export function skillFingerprint(root = skillRoot()) {
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(mjs|json|md)$/.test(e.name)) files.push(p);
  } };
  walk(root);
  const agent = resolve(root, "..", "..", "agents", "ticket-context-analyst.md");
  if (existsSync(agent)) files.push(agent);
  const h = createHash("sha256");
  for (const f of files) h.update(relative(root, f).split("\\").join("/")).update("\0").update(readFileSync(f, "utf8").replace(/\r\n/g, "\n")).update("\0");
  return h.digest("hex").slice(0, 16);
}

/** D10: ticket `updated` + each PR's head SHA, state and merge time (a merge invalidates) + linked issues' `updated` +
 *  the --domain the known-ground lookups used + the skill fingerprint. Confluence/Figma/Loom/pages are not in it (documented). */
// `env` is part of the key: a bundle records whether each PR is deployed on THIS stand, so another env's bundle
// is never fresh for this one.
export function freshnessKey({ ticketUpdated, prShas = [], linkedUpdated = [], domain = null, skill = null, env = null }) {
  return createHash("sha256").update(JSON.stringify({ t: ticketUpdated, p: [...prShas].sort(), l: [...linkedUpdated].sort(), d: domain ?? null, s: skill ?? null, e: env ?? null })).digest("hex").slice(0, 16);
}

/**
 * Ask git about the FULL path only. git answers correctly for a file that does not exist yet under an ignored
 * directory, and honours negations (`.vc-fix/*` + `!.vc-fix/context/`). Checking ancestor directories too would
 * say "ignored" for a path git says is NOT ignored and write a bundle into a committable place. A wrong
 * "not ignored" only skips the cache; a wrong "ignored" leaks — so every doubt (exit 1, 128, no git) is false.
 */
export function isIgnored(root, path, exec = execFileSync) {
  const rel = relative(root, path).split("\\").join("/");
  if (!rel || rel.startsWith("..")) return false;
  try { exec("git", ["check-ignore", "-q", "--no-index", rel], { cwd: root, stdio: "ignore" }); return true; } catch { return false; } // 1 = not ignored, 128 = not a repo
}

export function readCached(file, key, now = new Date(), ttl = TTL_MS) {
  if (!existsSync(file)) return null;
  try {
    const b = JSON.parse(readFileSync(file, "utf8"));
    const age = now - new Date(b.fetched_at); // a fetched_at in the future (or unparsable ⇒ NaN) is a miss, never "fresh"
    return b.freshness_key === key && age >= 0 && age < ttl ? b : null;
  } catch { return null; }
}

export function writeCache(root, file, bundle, ignored = (p) => isIgnored(root, p)) {
  if (!ignored(file)) return { cached: false, reason: "the cache path is not git-ignored" };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(bundle, null, 2));
  return { cached: true, path: file };
}
