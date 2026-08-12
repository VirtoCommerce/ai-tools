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
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";

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
 *
 * NOTE: `main()` no longer calls this — it now resolves each guessed name inline via
 * `resolveModuleRepo` (which also picks the exact live repo, not just confirm/deny). This is kept
 * DELIBERATELY as a covered pure utility (its #216 unit tests pin the confirm/mark contract) and as
 * the batch counterpart to the single-module `resolveModuleRepo`; it is not dead-by-accident.
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

/** Azure DevOps auth header from ADO_PAT (Basic) or an `az login` bearer token. "" if neither. */
function adoAuthHeaderSync() {
  const pat = process.env.ADO_PAT || "";
  if (pat) return "Basic " + Buffer.from(":" + pat).toString("base64");
  try {
    const tok = execSync(
      "az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv",
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim();
    if (tok) return "Bearer " + tok;
  } catch { /* no az session */ }
  return "";
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
    const authHeader = adoAuthHeaderSync();
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
    if (host === "github") {
      // A real GitHub fork names its parent directly.
      const res = await fetch(`https://api.github.com/repos/${org}/${name}`, { headers: githubHeaders() });
      if (res.ok) {
        const repo = await res.json();
        if (repo.fork && repo.parent?.full_name) {
          // Anchor the version from package.json when available.
          const pkg = await readPackageJsonLive(host, { org, project, name });
          return { upstream: repo.parent.full_name, upstreamRef: String(pkg?.version || "") };
        }
      }
    }
    // Fallback (Azure Repos, or a GitHub copy that isn't a fork): infer from package.json.
    const pkg = await readPackageJsonLive(host, { org, project, name });
    const strong = frontendProvenanceFromPackage(pkg);
    if (strong) return strong;
    // No @vc-shell/vc-frontend signal, but this repo was ALREADY identified as the
    // client's storefront fork (name heuristic). Per the Virto convention its
    // package.json `version`'s MAJOR.MINOR pins the vc-frontend line it was cut from —
    // anchor upstreamRef to that so /qa-fix Gate 1b can compare against the right upstream.
    const ref = vcFrontendRef(pkg?.version);
    if (ref) return { upstream: "VirtoCommerce/vc-frontend", upstreamRef: ref };
    return null;
  } catch {
    return null;
  }
}

/** Fetch + parse a repo's root package.json from the code host. Returns the object or null. */
async function readPackageJsonLive(host, { org, project, name }) {
  try {
    if (host === "azure-repos") {
      const authHeader = adoAuthHeaderSync();
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

async function getModulesLive() {
  const TEST_ENV = resolveTestEnv("vcst");
  // quiet: stdout carries the machine-readable repo map (dotenv v17 prints promo tips otherwise).
  dotenv({ path: ".env.defaults", quiet: true });
  dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
  dotenv({ path: ".env.local", override: true, quiet: true });
  // Per-env suffix promotion (mirror config.js / verify-access) so ADMIN_PASSWORD_<ENV>
  // → ADMIN_PASSWORD etc. — otherwise per-env creds in .env.local are never seen.
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }

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
        if (prov?.upstream) { entry.upstream = prov.upstream; entry.upstreamRef = prov.upstreamRef; }
        result.client.push(entry);
      }
      console.error(
        fe.length
          ? `[discover-repos] storefront/theme repo(s) found: ${fe.join(", ")}` +
              (result.client.some((c) => c.kind === "frontend" && c.upstream)
                ? ` (provenance derived)`
                : ` — provenance NOT derived; ASK the operator for the vc-frontend version the fork is based on (repos.client[].upstreamRef).`)
          : `[discover-repos] NO storefront/theme repo matched — ASK the operator to name it, then add { kind: "frontend" } to repos.client.`,
      );
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
    const outAbs = resolve(args.out);
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
