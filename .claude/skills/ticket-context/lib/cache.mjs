// .claude/skills/ticket-context/lib/cache.mjs — P3 + D2 + D10. A bundle is cached only where git ignores it.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

export const TTL_MS = 24 * 3600 * 1000;

/** D10: ticket `updated` + PR head SHAs + linked issues' `updated`. Confluence/Figma/Loom/pages are not in it (documented). */
export function freshnessKey({ ticketUpdated, prShas = [], linkedUpdated = [] }) {
  return createHash("sha256").update(JSON.stringify({ t: ticketUpdated, p: [...prShas].sort(), l: [...linkedUpdated].sort() })).digest("hex").slice(0, 16);
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
