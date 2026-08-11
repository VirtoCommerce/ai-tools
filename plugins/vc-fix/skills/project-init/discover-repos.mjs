#!/usr/bin/env node
/**
 * skills/project-init/discover-repos.mjs
 *
 * Query the Platform API for installed modules and propose a client/platform
 * repo split for the deployment profile — AND derive projectType + clientOrg from
 * it (this is the redesign's "scan is the source of projectType" step: it ALWAYS
 * runs, and needs no --client-org). Each module's ProjectUrl (or, as a fallback, its
 * Id) is mapped to a repo and classified by owner: VirtoCommerce ⇒ platform; anything
 * else ⇒ client. Emits { projectType, clientOrg, client:[...], platform:[...] } for
 * `gen-profile.mjs --repos-json --merge` (which now also ingests projectType/clientOrg).
 *
 * DERIVE (no questions):
 *   - clientOrg  — the owner of the discovered client modules (from their repo URL);
 *     for an azure-repos host, ADO_ORG. --client-org still OVERRIDES when passed.
 *   - projectType — "client" if any client module was found, OR the host is azure-repos
 *     (native VirtoCommerce always lives on GitHub), OR a clientOrg resolved; else
 *     "platform" (native VC — the original default; every repo stays platform-owned).
 *
 * The storefront / theme / frontend repo is NOT a platform module, so it is not in
 * the modules API. Instead this scans the CLIENT's code host (Azure Repos or GitHub,
 * per --client-vcs) for a repo whose name matches a theme/frontend heuristic and adds
 * it to repos.client as kind:"frontend". If NONE matches, it prints a notice so the
 * skill ASKS the operator to name it. The proposal is a STARTING POINT — confirm/fix.
 *
 * Usage:
 *   node skills/project-init/discover-repos.mjs \
 *     [--client-vcs github|azure-repos] [--client-org acme-corp] [--out repos.json] [--print] [--insecure]
 *   # offline test with mock module data ([{Id,ProjectUrl}, ...]); skips the repo scan:
 *   node skills/project-init/discover-repos.mjs --modules-json mods.json --print
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadLayeredEnv } from "../../scripts/lib/load-layered-env.mjs";
import { resolveAdoAuth } from "./probe-lib.mjs";
import { outputRoot } from "./lib/paths.mjs";

const UPSTREAM_ORG = "VirtoCommerce";

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

/** Map a module descriptor → { id, owner, name, host, kind, url, nameFromId }. Pure (unit-testable).
 *  `nameFromId` is true when the name is a HEURISTIC derived from the module id (there was no
 *  ProjectUrl to parse) rather than an authoritative repo URL — main() cross-checks such guesses
 *  against the client's live repo listing before trusting them (#216). */
export function moduleToRepo(mod) {
  const id = mod.Id || mod.id || "";
  const url = mod.ProjectUrl || mod.projectUrl || "";
  let owner = null;
  let name = null;
  let host = null;
  let nameFromId = false;
  const gh = /github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url || "");
  // Azure Repos: https://[org@]dev.azure.com/<org>/<project>/_git/<repo>
  const az = /dev\.azure\.com\/([^/@]+)\/(?:[^/]+\/)*_git\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url || "");
  if (gh) {
    owner = gh[1]; name = gh[2]; host = "github";
  } else if (az) {
    owner = az[1]; name = az[2]; host = "azure-repos";
  } else if (id) {
    // No resolvable repo URL. The upstream `vc-module-*` naming convention applies ONLY to a
    // genuine `VirtoCommerce.*` PLATFORM module — for that it is a safe, authoritative guess. For a
    // CLIENT module id it would INVENT a name that has no basis and 404s at fix time (the
    // omnia-opus/OPUS `Opus.Main` → `vc-module-opus-main` bug). So synthesize ONLY for
    // `VirtoCommerce.*`; for a client id leave `name` NULL and let main() RESOLVE it against the
    // live repo listing (resolveModuleRepo) — never inventing a name. `nameFromId` marks either as
    // id-derived (unauthoritative) in both cases.
    if (/^VirtoCommerce\./i.test(id)) {
      const short = id.replace(/^VirtoCommerce\./i, "");
      name = "vc-module-" + short.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();
    } // else: a client module id → name stays null; resolved from the live listing, never invented.
    nameFromId = true;
  }
  return { id, owner, name, host, kind: "module", url, nameFromId };
}

/**
 * Classify discovered modules into client vs platform repo lists. Pure.
 * Platform iff a VirtoCommerce-owned repo, or (owner unknown) a `VirtoCommerce.*` module
 * id. Everything else — a non-VirtoCommerce owner, an owner matching `clientOrg`, or a
 * non-`VirtoCommerce.*` id (e.g. a custom `vc-module-leo-main`) — is a CLIENT repo.
 */
export function classify(modules, clientOrg) {
  const client = [];
  const platform = [];
  const seen = new Set();
  const co = (clientOrg || "").toLowerCase();
  for (const mod of modules || []) {
    const r = moduleToRepo(mod);
    let isPlatform = r.owner
      ? r.owner.toLowerCase() === UPSTREAM_ORG.toLowerCase()
      : /^VirtoCommerce\./i.test(r.id); // owner unknown → decide by module-id namespace
    if (r.owner && co && r.owner.toLowerCase() === co) isPlatform = false; // explicit client org wins
    if (isPlatform) {
      // A VirtoCommerce.* platform module always has a name (URL-derived or the safe vc-module-*
      // guess); skip the impossible no-name case defensively.
      if (!r.name) continue;
      const full = r.owner ? `${r.owner}/${r.name}` : r.name;
      if (seen.has(full)) continue;
      seen.add(full);
      platform.push({ name: full, kind: r.kind });
    } else {
      // CLIENT. `r.name` is NULL for a client module with no ProjectUrl — the name is NEVER invented
      // (see moduleToRepo); instead carry the module id so main() resolves it against the live repo
      // listing. Dedup by the full name when we have one, else by the module id.
      const full = r.name ? (r.owner ? `${r.owner}/${r.name}` : r.name) : null;
      if (!full && !r.id) continue; // nothing to key on / route
      const key = full ? full.toLowerCase() : `id:${String(r.id).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // host from the URL when known; else omit so profile.vcs.clientHost governs. nameFromId is
      // carried so main() knows to resolve it; moduleId is the resolution INPUT when name is null.
      const entry = { name: full, kind: r.kind };
      if (r.host) entry.host = r.host;
      if (r.nameFromId) entry.nameFromId = true;
      if (!full && r.id) entry.moduleId = r.id;
      client.push(entry);
    }
  }
  return { client, platform };
}

/**
 * #216 — reconcile id-GUESSED client-module names (moduleToRepo `nameFromId`) against the
 * client's LIVE repo listing. Pure (unit-testable — the network fetch that OBTAINS the names
 * stays in main()). Case-insensitive, because moduleToRepo lowercases the derived name while
 * the live listing carries original case. For each guessed client MODULE: a match CONFIRMS it
 * (clear the internal `nameFromId` flag, decision made); a miss marks it `nameUnverified` so the
 * operator confirms/corrects repos.client instead of /qa-fix routing a bug to a repo that isn't
 * there. Returns the names left unverified (for the caller to log). Mutates the entries.
 */
export function flagUnverifiedModules(clientRepos, liveRepoNames) {
  const live = new Set((liveRepoNames || []).map((n) => String(n).toLowerCase()));
  const unverified = [];
  for (const c of clientRepos || []) {
    if (c.kind !== "module" || !c.nameFromId) continue;
    const bare = String(c.name).split("/").pop().toLowerCase();
    delete c.nameFromId; // decision made — the internal provenance flag never persists
    if (live.has(bare)) continue; // guess confirmed against the live listing
    c.nameUnverified = true;
    unverified.push(c.name);
  }
  return unverified;
}

// Structural tokens that are NEVER part of a module's identity — the naming scaffolding both a
// module id and a repo name wrap around the meaningful words. Dropped from BOTH sides before
// matching (VCST-5702 client-module resolution).
const REPO_NOISE_TOKENS = new Set(["vc", "module", "modules", "modul", "platform", "src"]);

/** Tokenize a module id / repo name on `.`, `-`, `_`, and camelCase boundaries; lowercased. Pure. */
function tokenizeRepoId(s) {
  return String(s || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → boundary
    .split(/[.\-_\s]+/)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve a client module id to a REAL repo from the live listing by token overlap — never by
 * inventing a `vc-module-*` name (VCST-5702). `Opus.Main` + `["opus-module-main", ...]` →
 * `opus-module-main`. Pure + unit-testable (the network fetch that obtains `liveRepoNames` stays
 * in main()).
 *
 * Match: tokenize the id and each candidate, drop the structural noise tokens (REPO_NOISE_TOKENS)
 * and — from candidates only — the clientOrg tokens that are NOT themselves part of the id (so an
 * org slug that is genuinely part of the module identity, like `opus` in `Opus.Main`, is KEPT).
 * A candidate matches when the id token set equals its stripped set or is a subset of it; prefer
 * the equal match, then the fewest EXTRA candidate tokens. EXACTLY ONE best candidate → resolved;
 * zero or a tie → null (never pick arbitrarily).
 *
 * @returns {string|null} the resolved repo name (original case), or null if unresolved/ambiguous.
 */
export function resolveModuleRepo(moduleId, liveRepoNames, clientOrg = "") {
  const idTokens = new Set(tokenizeRepoId(moduleId).filter((t) => !REPO_NOISE_TOKENS.has(t)));
  if (!idTokens.size) return null;
  // An org token that is ALSO an id token is part of the identity, not noise — keep it.
  const orgNoise = new Set(tokenizeRepoId(clientOrg).filter((t) => !idTokens.has(t)));
  let best = null;
  let bestExtra = Infinity;
  let tie = false;
  for (const name of liveRepoNames || []) {
    const cand = new Set(tokenizeRepoId(name).filter((t) => !REPO_NOISE_TOKENS.has(t) && !orgNoise.has(t)));
    if (!cand.size) continue;
    let subset = true;
    for (const t of idTokens) if (!cand.has(t)) { subset = false; break; }
    if (!subset) continue;
    const extra = cand.size - idTokens.size; // 0 = exact match
    if (extra < bestExtra) { best = name; bestExtra = extra; tie = false; }
    else if (extra === bestExtra) tie = true;
  }
  return best && !tie ? best : null;
}

/** Heuristic: pick storefront/theme/frontend repo names from a client repo list. Pure. */
export function pickFrontendRepos(names) {
  // Broadened (H6): the storefront repo is frequently named without the vc- prefix
  // (a plain `frontend`, `storefront`, `webstore`, `shopfront`, a `theme`, or an `spa`).
  const rx = /(vc-theme|vc-frontend|store-?front|shop-?front|web-?store|storefront|theme|front-?end|\bspa\b)/i;
  return [...new Set((names || []).filter((n) => rx.test(n)))];
}

/** Strip a git ref down to its branch name: `refs/heads/main` → `main`. Pure. */
export function stripRef(ref) {
  return String(ref || "").replace(/^refs\/heads\//, "");
}

/**
 * Reduce a storefront package.json `version` to the vc-frontend LINE it was cut from —
 * its MAJOR.MINOR ("2.49.7" → "2.49", "v1.4.2" → "1.4"). Per the Virto convention a
 * client frontend fork carries its OWN patch version (which has no upstream tag); only
 * the first two components pin the vc-frontend version that was taken. Pure. "" when no
 * leading X.Y can be parsed.
 */
export function vcFrontendRef(version) {
  const m = /^\s*v?(\d+)\.(\d+)/.exec(String(version || ""));
  return m ? `${m[1]}.${m[2]}` : "";
}

/**
 * Parse a tag/version into [major, minor, patch] numbers, or null. Accepts an optional
 * leading `v` and a `refs/tags/` prefix; ignores any pre-release/build suffix. Pure.
 */
export function parseSemver(tag) {
  const m = /(?:^|\/|v)(\d+)\.(\d+)\.(\d+)/.exec(String(tag || ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Pick the RESOLVABLE upstream BASELINE tag for a fork line (MAJOR.MINOR), given the
 * upstream's existing tag list. Pure. "" when neither of the two candidates exists.
 *
 * A client frontend fork carries its OWN patch increments on top of the line's base
 * (`2.49.7` is the fork's `.7`, NOT an upstream tag). So the fork version is NOT a
 * git ref, and neither is the bare line label `2.49`. The defensible resolvable baseline
 * is the line's BASE tag: PRIMARY — construct `<major>.<minor>.0` and use it IFF it exists
 * upstream (the canonical, guaranteed common ancestor ≤ the fork per the Virto convention).
 * FALLBACK 1 (if `X.Y.0` was never tagged) — the SMALLEST existing tag on the line; FALLBACK 2
 * (line never tagged at all) — the HIGHEST existing tag on an EARLIER line (< line).
 * Over-attribution to "client" (a false positive from too-old a baseline) is SAFE;
 * leaking client code (a false negative) is not — the earliest-on-line baseline keeps
 * that safety.
 */
export function pickBaselineTag(tags, line) {
  const [lMaj, lMin] = String(line || "").split(".").map(Number);
  if (!Number.isFinite(lMaj) || !Number.isFinite(lMin)) return "";
  const parsed = [];
  for (const t of tags || []) {
    const v = parseSemver(t);
    if (v) parsed.push({ tag: String(t), v });
  }
  // PRIMARY: construct the line's base by appending `.0` (`2.49` → `2.49.0`) and use it
  // IFF that tag actually EXISTS upstream. Per the Virto convention a line is cut from its
  // `X.Y.0` base, so this is the canonical, guaranteed-common-ancestor baseline. Return the
  // raw existing tag verbatim (may carry a `v` prefix, e.g. `v2.49.0`) so it is fetchable.
  const dotZero = parsed.find((p) => p.v[0] === lMaj && p.v[1] === lMin && p.v[2] === 0);
  if (dotZero) return dotZero.tag;

  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  // FALLBACK 1 (only when `X.Y.0` was never tagged): the smallest existing patch on the line.
  const onLine = parsed.filter((p) => p.v[0] === lMaj && p.v[1] === lMin).sort((a, b) => cmp(a.v, b.v));
  if (onLine.length) return onLine[0].tag;
  // FALLBACK 2 (the line was never tagged at all): the highest existing tag on an EARLIER line.
  const below = parsed
    .filter((p) => p.v[0] < lMaj || (p.v[0] === lMaj && p.v[1] < lMin))
    .sort((a, b) => cmp(b.v, a.v)); // highest earlier tag first
  return below.length ? below[0].tag : "";
}

/**
 * `git ls-remote --tags <upstream>` → array of bare tag names (deduped; the `^{}`
 * annotated-tag peel suffix stripped), or null on ANY failure (git missing, offline,
 * bad token). Auth: GITHUB_FIX_BUGS_TOKEN embedded in the URL when present — the
 * upstream is always a public VirtoCommerce GitHub repo, so the token is optional but
 * avoids rate limits. GIT_TERMINAL_PROMPT=0 so a missing credential fails fast instead
 * of hanging on a prompt.
 */
function lsRemoteTags(upstreamFull) {
  try {
    const tok = process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || "";
    const auth = tok ? `${tok}@` : "";
    const url = `https://${auth}github.com/${upstreamFull}.git`;
    const out = execSync(`git ls-remote --tags "${url}"`, {
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 20000,
    }).toString();
    const tags = new Set();
    for (const raw of out.split("\n")) {
      const m = /refs\/tags\/(.+?)(?:\^\{\})?$/.exec(raw.trim());
      if (m) tags.add(m[1]);
    }
    return [...tags];
  } catch {
    return null;
  }
}

/**
 * Resolve a fork's line label to a concrete, EXISTING upstream tag. Returns
 * { upstream, upstreamRef, upstreamRefResolved, forkVersion }. Never throws.
 *  - line resolves to a baseline tag → upstreamRef = that tag, upstreamRefResolved:true
 *  - ls-remote fails (offline / no git / no token) OR no candidate tag → keep the bare
 *    line label (or fork version when the line is unparseable), upstreamRefResolved:false
 *    (the skill then ASKS the operator, per existing behavior).
 */
function resolveUpstreamRef({ upstream, forkVersion, line }) {
  const base = { upstream, forkVersion: forkVersion || "" };
  if (!line) return { ...base, upstreamRef: forkVersion || "", upstreamRefResolved: false };
  const tags = lsRemoteTags(upstream);
  if (!tags) return { ...base, upstreamRef: line, upstreamRefResolved: false };
  const baseline = pickBaselineTag(tags, line);
  if (baseline) return { ...base, upstreamRef: baseline, upstreamRefResolved: true };
  return { ...base, upstreamRef: line, upstreamRefResolved: false };
}

/**
 * Decide, from a repo's parsed package.json, whether it descends from VirtoCommerce
 * vc-frontend, and pin the version anchor. Pure + conservative: only asserts the
 * vc-frontend upstream on a clear signal (a `vc-frontend` package name, or a
 * `@vc-shell`/virtocommerce dependency) — a routing/containment decision must not
 * guess. Returns { upstream, upstreamRef } or null (operator then names it).
 *
 * The anchor form depends on WHICH repo this is:
 *  - the repo IS vc-frontend itself (name === "vc-frontend") ⇒ its `version` is a genuine
 *    upstream release, so pin the FULL version;
 *  - a CLIENT fork (any other name, recognised via the @vc-shell/virtocommerce signal) ⇒
 *    pin the MAJOR.MINOR line (`vcFrontendRef`): the fork's patch version has no upstream tag.
 */
export function frontendProvenanceFromPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return null;
  const name = String(pkg.name || "").toLowerCase();
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const isUpstreamItself = name === "vc-frontend";
  const vcSignal =
    isUpstreamItself ||
    name.includes("vc-frontend") ||
    Object.keys(deps).some((d) => /@vc-shell|virtocommerce|@virto\//i.test(d));
  if (!vcSignal) return null;
  const upstreamRef = isUpstreamItself ? String(pkg.version || "") : vcFrontendRef(pkg.version);
  return { upstream: "VirtoCommerce/vc-frontend", upstreamRef };
}

/**
 * Derive the client org from a classified client-repo list. Pure. Prefers, in order:
 * an explicit override, ADO_ORG for an azure-repos host, then the most common owner
 * among client entries that carry one ("owner/name"). "" when none can be resolved
 * (e.g. GitHub client modules with no ProjectUrl) — the caller then asks the operator.
 */
export function deriveClientOrg(client, { host, adoOrg, override } = {}) {
  if (override) return override;
  if (host === "azure-repos" && adoOrg) return adoOrg;
  const counts = new Map();
  for (const r of client || []) {
    const i = (r.name || "").indexOf("/");
    if (i < 0) continue;
    const owner = r.name.slice(0, i);
    counts.set(owner, (counts.get(owner) || 0) + 1);
  }
  let best = "", bestN = 0;
  for (const [owner, n] of counts) if (n > bestN) { best = owner; bestN = n; }
  return best;
}

/** GitHub API auth headers from the fix token (if any). */
function githubHeaders() {
  const tok = process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || "";
  return { "User-Agent": "vc-project-init", Accept: "application/vnd.github+json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}

/**
 * List the client's repos from their code host (Azure Repos or GitHub), returning
 * `[{ name, defaultBranch }]` (H2: the default branch is carried so checkoutForFix
 * doesn't blind-guess `main`). GitHub also carries `{ isFork, fullName }` for provenance.
 */
async function listClientReposLive(host, { org, project }) {
  if (host === "azure-repos") {
    if (!org || !project) throw new Error("need ADO_ORG + ADO_PROJECT to list Azure Repos");
    const { authHeader } = resolveAdoAuth();
    if (!authHeader) throw new Error("need ADO_PAT or an `az login` session to list Azure Repos");
    const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`;
    const res = await fetch(url, { headers: { Authorization: authHeader, Accept: "application/json" } });
    const ct = res.headers.get("content-type") || "";
    // ADO answers an unauthenticated/misdirected request with a 203 + HTML sign-in page.
    if (!res.ok || !ct.includes("application/json")) {
      const via = process.env.ADO_PAT ? "ADO_PAT" : "the az session";
      throw new Error(
        `ADO repositories → ${res.status} — ${via} not accepted for org '${org}'` +
          (process.env.ADO_PAT ? "" : " (the az identity may not be a member of this ADO org, or it is in a different tenant — try `az login --tenant <id>`, or set ADO_PAT)"),
      );
    }
    return ((await res.json()).value || []).map((r) => ({
      name: r.name,
      id: r.id || "",
      defaultBranch: stripRef(r.defaultBranch),
    }));
  }
  // github
  if (!org) throw new Error("need client org to list GitHub repos");
  const hdr = githubHeaders();
  for (const kind of ["orgs", "users"]) {
    const res = await fetch(`https://api.github.com/${kind}/${org}/repos?per_page=100`, { headers: hdr });
    if (res.ok) {
      return (await res.json()).map((r) => ({
        name: r.name,
        id: String(r.id || ""),
        defaultBranch: r.default_branch || "",
        isFork: Boolean(r.fork),
        fullName: r.full_name || "",
      }));
    }
  }
  throw new Error(`GitHub repos for '${org}' → not found`);
}

/**
 * Best-effort upstream provenance for a storefront repo — { upstream, upstreamRef } or null.
 * GitHub: a true fork exposes `parent.full_name` (the exact upstream). Otherwise (and for
 * Azure Repos, which has no fork lineage) read the repo's package.json and infer vc-frontend
 * lineage + version. Never throws — provenance is optional; the operator fills gaps.
 */
async function deriveFrontendProvenance(host, { org, project, name, isFork, fullName }) {
  try {
    // 1. Identify the upstream repo (a real GitHub fork names its parent; else infer
    //    vc-frontend lineage from package.json) and read the fork's own version.
    let upstream = "";
    if (host === "github") {
      const res = await fetch(`https://api.github.com/repos/${org}/${name}`, { headers: githubHeaders() });
      if (res.ok) {
        const repo = await res.json();
        if (repo.fork && repo.parent?.full_name) upstream = repo.parent.full_name;
      }
    }
    const pkg = await readPackageJsonLive(host, { org, project, name });
    if (!upstream) {
      const strong = frontendProvenanceFromPackage(pkg); // @vc-shell/virtocommerce signal
      if (strong?.upstream) upstream = strong.upstream;
    }
    const forkVersion = String(pkg?.version || "");
    const line = vcFrontendRef(forkVersion); // MAJOR.MINOR line the fork was cut from
    // No fork parent and no strong signal, but this repo was already name-matched as the
    // storefront fork and its package.json shows a parseable version → assume vc-frontend.
    if (!upstream && line) upstream = "VirtoCommerce/vc-frontend";
    if (!upstream) return null;

    // 2. Resolve the fork line to a CONCRETE, EXISTING upstream tag (the line's base).
    //    The fork's patch (e.g. `.7`) and the bare line label (`2.49`) are NOT git refs;
    //    /qa-fix Gate 1b needs a resolvable baseline to diff the fork against upstream.
    return resolveUpstreamRef({ upstream, forkVersion, line });
  } catch {
    return null;
  }
}

/** Fetch + parse a repo's root package.json from the code host. Returns the object or null. */
async function readPackageJsonLive(host, { org, project, name }) {
  try {
    if (host === "azure-repos") {
      const { authHeader } = resolveAdoAuth();
      if (!authHeader) return null;
      const url =
        `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories/` +
        `${encodeURIComponent(name)}/items?path=/package.json&api-version=7.1&$format=text`;
      const res = await fetch(url, { headers: { Authorization: authHeader, Accept: "text/plain" } });
      if (!res.ok) return null;
      return JSON.parse(await res.text());
    }
    const res = await fetch(`https://api.github.com/repos/${org}/${name}/contents/package.json`, {
      headers: { ...githubHeaders(), Accept: "application/vnd.github.raw+json" },
    });
    if (!res.ok) return null;
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

/** List a repo's branch names (heads) from the code host. [] on any failure. */
async function listRepoBranches(host, { org, project, name }) {
  try {
    if (host === "azure-repos") {
      const { authHeader } = resolveAdoAuth();
      if (!authHeader) return [];
      const url =
        `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories/` +
        `${encodeURIComponent(name)}/refs?filter=heads/&api-version=7.1&$top=500`;
      const res = await fetch(url, { headers: { Authorization: authHeader, Accept: "application/json" } });
      if (!res.ok) return [];
      return ((await res.json()).value || []).map((r) => stripRef(r.name));
    }
    const res = await fetch(`https://api.github.com/repos/${org}/${name}/branches?per_page=100`, {
      headers: githubHeaders(),
    });
    if (!res.ok) return [];
    return (await res.json()).map((b) => b.name);
  } catch {
    return [];
  }
}

/**
 * The branch feature branches base off + PRs TARGET. Many client teams integrate on a
 * `dev`/`develop` branch while the repo's `defaultBranch` stays `main` (the released line).
 * Pure. Prefers dev → develop → the default branch. Pass the branch list ([] ⇒ defaultBranch).
 */
export function detectIntegrationBranch(branches, defaultBranch) {
  const set = new Set((branches || []).map((b) => b.toLowerCase()));
  for (const cand of ["dev", "develop", "development"]) {
    if (set.has(cand)) return branches.find((b) => b.toLowerCase() === cand);
  }
  return defaultBranch || "main";
}

/** Kind-default toolchain (mirrors repo-router.ts REPO_PROFILES). Pure. */
export function kindToolchain(kind) {
  if (kind === "frontend") {
    return {
      install: "yarn install --frozen-lockfile || npm ci || npm install",
      build: "yarn build || npm run build",
      typecheck: "yarn typecheck || npx vue-tsc --noEmit",
      lint: "yarn lint || npm run lint",
      test: "yarn test:unit || npx vitest run",
    };
  }
  // module / platform → .NET
  return {
    install: "dotnet restore -p:NuGetAudit=false",
    build: "dotnet build -c Debug -p:NuGetAudit=false",
    test: "dotnet test --nologo -p:NuGetAudit=false",
  };
}

/**
 * BAKE the clone/PR contribution plan for a CLIENT repo (mirrors repo-router.ts
 * contributionPlan for the client branch — always push directly, host per the repo).
 * Pure. So the interactive command reads this instead of re-deriving it from TS.
 *
 * `vcsAuth` mirrors gen-profile.mjs's `vcs.authEnv` derivation: "pat" ⇒ the write
 * token env var; "gh-cli"/"az-login"/anything else ⇒ "" (use the ambient session —
 * no env var to read). Defaults to "pat" only when the caller omits it, so existing
 * callers that don't pass --vcs-auth keep today's behaviour.
 */
export function contributionForClient(host, { org, project, name, integrationBranch, vcsAuth = "pat" }) {
  const bare = String(name).split("/").pop();
  if (host === "azure-repos") {
    return {
      ownership: "client",
      mode: "direct",
      host: "azure-repos",
      prApi: "ado-rest",
      cloneUrl: `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${bare}`,
      prTarget: integrationBranch,
      authEnv: vcsAuth === "pat" ? "ADO_PAT" : "",
    };
  }
  return {
    ownership: "client",
    mode: "direct",
    host: "github",
    prApi: "gh",
    cloneUrl: `https://github.com/${name}.git`,
    prTarget: integrationBranch,
    authEnv: vcsAuth === "pat" ? "GITHUB_FIX_BUGS_TOKEN" : "",
  };
}

const hostnameOf = (u) => {
  try { return new URL(u).hostname; } catch { return ""; }
};
const originOf = (u) => {
  try { return new URL(u).origin; } catch { return String(u || "").replace(/\/$/, ""); }
};

/**
 * Probe which host both RESOLVES the store and PROXIES the storefront GraphQL — the value
 * `APP_BACKEND_URL` must take for a LOCAL dev run (vc-frontend's app-runner.ts derives the
 * store-resolution `domain` from APP_BACKEND_URL's hostname in dev; the ADMIN host does NOT
 * resolve the store → blank app). Tries FRONT_URL first, then BACK_URL. Returns
 * { backendUrlForDev, storeId, storeDomain } or null (operator fills in). Never throws.
 */
async function probeStorefrontBackend({ frontUrl, backUrl, storeId }) {
  const query =
    "query GetPageContext($domain:String,$permalink:String){pageContext(domain:$domain,permalink:$permalink){store{storeId storeName}}}";
  for (const candidate of [frontUrl, backUrl].filter(Boolean)) {
    const origin = originOf(candidate);
    const domain = hostnameOf(candidate);
    try {
      const res = await fetch(`${origin}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ operationName: "GetPageContext", query, variables: { domain, permalink: "sign-in" } }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const store = data?.data?.pageContext?.store;
      if (store?.storeId) {
        return { backendUrlForDev: origin, storeId: store.storeId || storeId || "", storeDomain: domain };
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function getModulesLive() {
  loadLayeredEnv("vcst"); // throws on a malformed TEST_ENV — let it crash loudly here

  const BACK_URL = (process.env.BACK_URL || "").replace(/\/$/, "");
  const ADMIN = process.env.ADMIN || "";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    throw new Error("Need BACK_URL + ADMIN + ADMIN_PASSWORD in env (.env.local). Run the base env setup first.");
  }

  const tokenRes = await fetch(`${BACK_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", username: ADMIN, password: ADMIN_PASSWORD }),
  });
  if (!tokenRes.ok) throw new Error(`OAuth token failed: ${tokenRes.status} ${tokenRes.statusText}`);
  const { access_token } = await tokenRes.json();

  const modRes = await fetch(`${BACK_URL}/api/platform/modules`, {
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
  });
  if (!modRes.ok) throw new Error(`GET /api/platform/modules failed: ${modRes.status}`);
  return await modRes.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const override = args["client-org"] || "";
  const host = args["client-vcs"] || "github";
  const vcsAuth = args["vcs-auth"] || "pat";

  let modules;
  if (args["modules-json"]) {
    modules = JSON.parse(readFileSync(resolve(args["modules-json"]), "utf-8"));
  } else {
    try {
      modules = await getModulesLive();
    } catch (err) {
      console.error(`[discover-repos] live discovery failed: ${err.message}`);
      console.error(`[discover-repos] You can enter the repo map manually instead.`);
      process.exit(2);
    }
  }

  // Classify modules (no --client-org needed: owner / id-namespace already decides
  // client-vs-platform; the override only forces a repo under that org to be client).
  const result = classify(modules, override);

  // Derive the client org from the classified client modules (or ADO_ORG / override).
  const clientOrg = deriveClientOrg(result.client, {
    host, adoOrg: process.env.ADO_ORG || "", override,
  });
  console.error(
    `[discover-repos] ${result.platform.length} platform repo(s), ${result.client.length} client repo(s)` +
      (clientOrg ? ` (client org: ${clientOrg})` : " (no client org resolved)"),
  );

  // Scan the CLIENT's repos for a storefront/theme/frontend repo — it is NOT installed as
  // a platform module, so the modules API never surfaces it. Live mode only, needs an org.
  if (!args["modules-json"] && clientOrg) {
    try {
      const org = host === "azure-repos" ? (process.env.ADO_ORG || clientOrg) : clientOrg;
      const project = process.env.ADO_PROJECT || "";
      const all = await listClientReposLive(host, { org, project });
      const byName = new Map(all.map((r) => [r.name, r]));
      const liveNames = all.map((r) => r.name);
      const fe = pickFrontendRepos(liveNames);
      const have = new Set(result.client.map((c) => c.name && c.name.split("/").pop()).filter(Boolean));

      // RESOLVE id-derived client MODULE names against the live listing (VCST-5702) — and backfill
      // the default branch. A client module with no ProjectUrl arrives with `name: null` + a
      // `moduleId`; match it to a REAL repo by token overlap instead of inventing a `vc-module-*`
      // name that 404s. A miss stays `name: null` (no fabricated clone URL — self-enforcing) and is
      // marked `nameUnverified`; the operator picks from the listing rather than typing from memory.
      for (const c of result.client) {
        if (c.kind === "module" && c.name == null && c.moduleId) {
          const resolved = resolveModuleRepo(c.moduleId, liveNames, clientOrg);
          if (resolved) {
            c.name = `${org}/${resolved}`;
            c.host = host;
            delete c.nameFromId;
          } else {
            delete c.nameFromId;
            c.nameUnverified = true;
            const sample = liveNames.slice(0, 12).join(", ");
            console.error(
              `[discover-repos] UNVERIFIED client module '${c.moduleId}' — no repo in ${clientOrg}'s listing token-matches it; leaving repos.client name:null with NO clone URL. ` +
                `Confirm/correct repos.client (name + repoId from the listing). Candidates: ${sample}${liveNames.length > 12 ? ", …" : ""}.`,
            );
          }
        }
        // Backfill defaultBranch from the live listing (the modules API carries no branch info, H2).
        const bare = c.name ? c.name.split("/").pop() : null;
        const info = bare ? byName.get(bare) : null;
        if (info?.defaultBranch && !c.defaultBranch) c.defaultBranch = info.defaultBranch;
      }

      for (const n of fe) {
        if (have.has(n)) continue;
        const info = byName.get(n) || {};
        const entry = { name: `${org}/${n}`, kind: "frontend", host };
        if (info.defaultBranch) entry.defaultBranch = info.defaultBranch;
        // Best-effort upstream provenance (H3): the platform repo + version this fork
        // was cut from, so /qa-fix can tell a client customization from a platform bug.
        const prov = await deriveFrontendProvenance(host, {
          org, project, name: n, isFork: info.isFork, fullName: info.fullName,
        });
        if (prov?.upstream) {
          entry.upstream = prov.upstream;
          entry.upstreamRef = prov.upstreamRef;
          entry.upstreamRefResolved = prov.upstreamRefResolved;
          if (prov.forkVersion) entry.forkVersion = prov.forkVersion;
          // Fix 3a — print the verified upstream baseline per frontend fork.
          const mark = prov.upstreamRefResolved ? "(verified)" : "(UNVERIFIED — ref not found)";
          console.error(
            `[discover-repos] frontend  ${entry.name}  → upstream ${prov.upstream} @ ${prov.upstreamRef} ${mark}` +
              (prov.forkVersion ? `   [fork ${prov.forkVersion}]` : ""),
          );
        }
        result.client.push(entry);
      }
      const feEntries = result.client.filter((c) => c.kind === "frontend");
      const unverified = feEntries.filter((c) => c.upstream && !c.upstreamRefResolved);
      console.error(
        fe.length
          ? `[discover-repos] storefront/theme repo(s) found: ${fe.join(", ")}` +
              (feEntries.some((c) => c.upstream)
                ? unverified.length
                  ? ` (provenance derived; upstreamRef UNVERIFIED for ${unverified.map((c) => c.name).join(", ")} — ASK the operator to confirm the vc-frontend line base tag, e.g. 2.49 → 2.49.0)`
                  : ` (provenance derived; upstreamRef verified)`
                : ` — provenance NOT derived; ASK the operator for the vc-frontend version the fork is based on (repos.client[].upstreamRef).`)
          : `[discover-repos] NO storefront/theme repo matched — ASK the operator to name it, then add { kind: "frontend" } to repos.client.`,
      );

      // BAKE per-repo decisions so the interactive /qa-fix reads facts, not emulated TS:
      // repoId, integrationBranch (PR target), workBranchPrefix, contribution plan, toolchain,
      // and — for the storefront — localVerify (Gate-6 local run facts, incl. the probed
      // backend host that resolves the store). The storefront probe is run PER frontend
      // repo (not memoized across repos) — a deployment can have more than one
      // kind:"frontend" client repo (e.g. a storefront + a separate admin-theme repo),
      // and each may resolve a different store/backend.
      for (const c of result.client) {
        // An UNRESOLVED client module (name:null, nameUnverified) gets NO repoId / branch /
        // contribution — a fabricated clone URL is exactly the bug. It stays a name:null entry the
        // operator must complete (assert-profile flags it; /qa-fix Gate 1 refuses to route to it).
        if (!c.name) continue;
        const bare = c.name.split("/").pop();
        const info = byName.get(bare) || {};
        if (info.id && !c.repoId) c.repoId = info.id;
        const branches = await listRepoBranches(host, { org, project, name: bare });
        c.integrationBranch = detectIntegrationBranch(branches, c.defaultBranch);
        c.workBranchPrefix = "claude/qa-autofix/";
        c.contribution = contributionForClient(host, {
          org, project, name: c.name, integrationBranch: c.integrationBranch, vcsAuth,
        });
        c.toolchain = kindToolchain(c.kind);
        if (c.kind === "frontend") {
          const feProbe = await probeStorefrontBackend({
            frontUrl: process.env.FRONT_URL || "",
            backUrl: process.env.BACK_URL || "",
            storeId: process.env.STORE_ID || "",
          });
          c.localVerify = {
            devCmd: "yarn dev",
            url: "https://localhost:3000",
            selfSignedCert: true,
            backendUrlForDev: feProbe?.backendUrlForDev || (process.env.FRONT_URL || "").replace(/\/$/, ""),
            storeId: feProbe?.storeId || process.env.STORE_ID || "",
            storeDomain: feProbe?.storeDomain || hostnameOf(process.env.FRONT_URL || ""),
            // false ⇒ the probe never confirmed this host resolves the store; the
            // Gate-6 local-verify recipe must NOT trust it blindly (the "blank-app
            // trap" frontend-local-verify.md warns about) — re-probe/confirm by hand.
            probed: Boolean(feProbe),
            userEnv: "USER_EMAIL",
            passEnv: "USER_PASSWORD",
          };
          console.error(
            feProbe
              ? `[discover-repos] storefront local-verify backend probed for ${bare}: ${feProbe.backendUrlForDev} (store ${feProbe.storeId})`
              : `[discover-repos] storefront local-verify backend NOT probed for ${bare} — defaulted to FRONT_URL (localVerify.probed=false); verify repos.client[].localVerify.backendUrlForDev resolves the store before trusting it.`,
          );
        }
      }
    } catch (err) {
      console.error(`[discover-repos] client-repo scan skipped (${err.message}) — ASK the operator to name the storefront/theme repo.`);
    }
  }

  // Derive projectType: client iff we found client code, the host is azure-repos (native
  // VC is always on GitHub), or a clientOrg resolved; else platform (the native default).
  const projectType =
    result.client.length || host === "azure-repos" || clientOrg ? "client" : "platform";
  // #216 / VCST-5702 — any id-derived client module that was never resolved against a live listing
  // (no clientOrg, or --modules-json mode, so the resolution step above never ran) is NOT confirmed:
  // mark it `nameUnverified` before the internal `nameFromId` flag is stripped, so an unchecked
  // module never looks trusted. `nameUnverified` is now LOAD-BEARING, not merely advisory: such an
  // entry has `name: null` (never an invented name) and therefore NO contribution/clone URL —
  // /qa-fix Gate 1 cannot route to it, and assert-profile reports it as a shape defect
  // (`client_repo_unverified`). It is still surfaced to the operator via stderr to prompt a fix.
  for (const c of result.client) {
    if (c.nameFromId && c.nameUnverified === undefined) c.nameUnverified = true;
    delete c.nameFromId;
  }
  const out = { projectType, clientOrg, ...result };
  console.error(`[discover-repos] derived projectType=${projectType}`);
  if (projectType === "client" && !clientOrg && host === "github") {
    console.error(
      `[discover-repos] GENUINE AMBIGUITY: client code on GitHub but no org resolved (modules lack a ProjectUrl) — ASK the operator for the client GitHub org (or confirm native platform).`,
    );
  }

  if (args.out) {
    // Relative --out resolves against the deployment project (process.cwd()), so the
    // repos-json lands beside the profile that gen-profile will read. --out absolute wins.
    const outAbs = resolve(outputRoot(), args.out);
    mkdirSync(dirname(outAbs), { recursive: true }); // ensure the --out dir exists
    writeFileSync(outAbs, JSON.stringify(out, null, 2) + "\n");
    console.error(`[discover-repos] wrote ${outAbs}`);
  }
  // Machine-readable result on stdout (so callers can pipe / capture).
  if (args.print || !args.out) console.log(JSON.stringify(out, null, 2));
}

// Run only when invoked directly (so classify/moduleToRepo stay importable for tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
