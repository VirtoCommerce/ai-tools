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

/** The path, and every ancestor directory with a trailing "/", so a file that does not exist yet still matches `.vc-fix/`. */
export function isIgnored(root, path, exec = execFileSync) {
  const rel = relative(root, path).split("\\").join("/");
  if (!rel || rel.startsWith("..")) return false;
  const parts = rel.split("/");
  const candidates = [rel, ...parts.slice(0, -1).map((_, i) => `${parts.slice(0, i + 1).join("/")}/`)];
  for (const c of candidates) {
    try { exec("git", ["check-ignore", "-q", "--no-index", c], { cwd: root, stdio: "ignore" }); return true; } catch { /* 1 = not ignored, 128 = not a repo */ }
  }
  return false;
}

export function readCached(file, key, now = new Date(), ttl = TTL_MS) {
  if (!existsSync(file)) return null;
  try {
    const b = JSON.parse(readFileSync(file, "utf8"));
    return b.freshness_key === key && now - new Date(b.fetched_at) < ttl ? b : null;
  } catch { return null; }
}

export function writeCache(root, file, bundle, ignored = (p) => isIgnored(root, p)) {
  if (!ignored(file)) return { cached: false, reason: "the cache path is not git-ignored" };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(bundle, null, 2));
  return { cached: true, path: file };
}
