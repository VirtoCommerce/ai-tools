/**
 * bridge/resolve-plugin.mjs — find the install directory of a sibling plugin of this marketplace.
 *
 * vc-init has to reach into vc-fix in three places: the self-diagnostics collector it reports
 * onboarding observations to (vc-fix `hooks/session-telemetry.mjs`), the readiness table's plugin
 * row, and the $VC_RUN bridge, which launches vc-fix's token-holding scripts (`qa-fix-routing/ado.mjs`,
 * `vc-self-check/deliver.mjs`). A plugin's own files live in a cache directory whose path carries the
 * version, so neither plugin can name the other's path; it is resolved here, per call, in the same
 * order the vc-secrets shim resolves its launcher:
 *
 *   1. a CHECKOUT — the sibling `<this root>/../<name>` with a manifest. That is this repository's
 *      `plugins/` layout, and it is deliberately first so that developing here never picks up an
 *      older installed copy. An install never matches it: there the parent is the version-less
 *      `<cache>/<marketplace>/vc-init` directory, which holds version directories, not plugins.
 *   2. Claude Code's install registry (`~/.claude/plugins/installed_plugins.json`), the nearest
 *      project record for the cwd first, then the highest version;
 *   3. the plugin cache `<cache>/<marketplace>/<name>/<version>`, highest version — the marketplace
 *      segment is taken from THIS plugin's own location, so a same-named plugin from another
 *      marketplace is never picked (the same identity rule as the vc-secrets shim).
 *
 * Read-only and side-effect-free; returns null when nothing is found — every caller degrades
 * (no telemetry, a WARN row, a bridge refusal naming the missing plugin) rather than guess.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** This plugin's own install root: <root>/bridge/resolve-plugin.mjs. */
export function selfRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

const hasManifest = (dir) => existsSync(join(dir, ".claude-plugin", "plugin.json"));

/** Version ordering — numeric segments, a missing segment is 0, a release outranks its prerelease. */
export function compareVersions(a, b) {
  const key = (v) => {
    const s = String(v ?? "");
    const dash = s.indexOf("-");
    const core = (dash === -1 ? s : s.slice(0, dash)).split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
    return { core, release: dash === -1 };
  };
  const [x, y] = [key(a), key(b)];
  for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
    const [m, n] = [x.core[i] ?? 0, y.core[i] ?? 0];
    if (m !== n) return m > n ? 1 : -1;
  }
  if (x.release !== y.release) return x.release ? 1 : -1;
  return 0;
}

/**
 * The marketplace this plugin was installed from, read off its own path
 * (`<cache>/<marketplace>/vc-init/<version>`); "ai-tools" for a checkout.
 */
export function ownMarketplace(root = selfRoot()) {
  const parts = resolve(root).split(sep);
  const i = parts.lastIndexOf("vc-init");
  return i >= 2 && parts[i - 2] === "cache" ? parts[i - 1] : "ai-tools";
}

function fromRegistry(name, marketplace, { home, cwd }) {
  let registry;
  try {
    registry = JSON.parse(readFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), "utf8"));
  } catch {
    return null;
  }
  const records = (Array.isArray(registry?.plugins?.[`${name}@${marketplace}`]) ? registry.plugins[`${name}@${marketplace}`] : [])
    .filter((r) => r && typeof r === "object" && typeof r.installPath === "string" && hasManifest(r.installPath));
  if (!records.length) return null;
  const here = resolve(cwd);
  const matches = records.filter((r) => typeof r.projectPath === "string"
    && (here === resolve(r.projectPath) || here.startsWith(resolve(r.projectPath) + sep)));
  const longest = Math.max(0, ...matches.map((r) => resolve(r.projectPath).length));
  const nearest = matches.filter((r) => resolve(r.projectPath).length === longest);
  const pool = nearest.length ? nearest : records;
  return pool.reduce((best, r) => (best === null || compareVersions(r.version, best.version) > 0 ? r : best), null).installPath;
}

function fromCache(name, marketplace, { home }) {
  for (const cache of [join(home, ".claude", "plugins", "cache"), join(home, ".codex", "plugins", "cache")]) {
    const dir = join(cache, marketplace, name);
    let versions;
    try {
      versions = readdirSync(dir).filter((v) => hasManifest(join(dir, v)));
    } catch {
      continue;
    }
    if (versions.length) return join(dir, versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a)));
  }
  return null;
}

/**
 * The install root of plugin `name` (e.g. "vc-fix") from this marketplace, or null.
 * @param {string} name
 * @param {{ root?: string, home?: string, cwd?: string }} [opts]  overridable for tests
 * @returns {string|null}
 */
export function resolvePluginRoot(name, { root = selfRoot(), home = process.env.HOME || os.homedir(), cwd = process.cwd(), trustedOnly = false } = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return null;
  if (name === "vc-init") return resolve(root);
  const sibling = resolve(root, "..", name);
  if (hasManifest(sibling)) return sibling;
  const marketplace = ownMarketplace(root);
  if (trustedOnly) return fromOwnCache(name, root);
  return fromRegistry(name, marketplace, { home, cwd }) || fromCache(name, marketplace, { home });
}

/**
 * `trustedOnly` — for the bridge's INNER side, which runs the resolved file with tokens in its
 * environment. The registry and the cache roots above are found through HOME and the cwd, both of
 * which the CALLER sets; letting them pick the file would let the caller choose what runs with the
 * secret. Here the only candidates are the sibling checkout (above) and the version directories
 * beside THIS install in the same cache — a location derived from this file's own path.
 */
function fromOwnCache(name, root) {
  const parts = resolve(root).split(sep);
  const i = parts.lastIndexOf("vc-init");
  if (i < 2 || parts[i - 2] !== "cache") return null;
  const dir = join(parts.slice(0, i).join(sep) || sep, name);
  let versions;
  try {
    versions = readdirSync(dir).filter((v) => hasManifest(join(dir, v)));
  } catch {
    return null;
  }
  return versions.length ? join(dir, versions.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a))) : null;
}

/** Resolve `<plugin root>/<rel>` and return it only if the file exists. */
export function resolvePluginFile(name, rel, opts) {
  const base = resolvePluginRoot(name, opts);
  if (!base) return null;
  const file = resolve(base, rel);
  return file.startsWith(resolve(base) + sep) && existsSync(file) ? file : null;
}
