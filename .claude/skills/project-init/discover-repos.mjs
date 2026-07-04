#!/usr/bin/env node
/**
 * .claude/skills/project-init/discover-repos.mjs
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
 *   node .claude/skills/project-init/discover-repos.mjs \
 *     [--client-vcs github|azure-repos] [--client-org acme-corp] [--out repos.json] [--print] [--insecure]
 *   # offline test with mock module data ([{Id,ProjectUrl}, ...]); skips the repo scan:
 *   node .claude/skills/project-init/discover-repos.mjs --modules-json mods.json --print
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

/** Map a module descriptor → { id, owner, name, host, kind, url }. Pure (unit-testable). */
export function moduleToRepo(mod) {
  const id = mod.Id || mod.id || "";
  const url = mod.ProjectUrl || mod.projectUrl || "";
  let owner = null;
  let name = null;
  let host = null;
  const gh = /github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url || "");
  // Azure Repos: https://[org@]dev.azure.com/<org>/<project>/_git/<repo>
  const az = /dev\.azure\.com\/([^/@]+)\/(?:[^/]+\/)*_git\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url || "");
  if (gh) {
    owner = gh[1]; name = gh[2]; host = "github";
  } else if (az) {
    owner = az[1]; name = az[2]; host = "azure-repos";
  } else if (id) {
    // No resolvable repo URL → derive a name from the id (owner stays null; classify
    // then decides client-vs-platform by the id namespace).
    const short = id.replace(/^VirtoCommerce\./, "");
    name =
      "vc-module-" +
      short.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();
  }
  return { id, owner, name, host, kind: "module", url };
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
    if (!r.name) continue;
    const full = r.owner ? `${r.owner}/${r.name}` : r.name;
    if (seen.has(full)) continue;
    seen.add(full);
    let isPlatform = r.owner
      ? r.owner.toLowerCase() === UPSTREAM_ORG.toLowerCase()
      : /^VirtoCommerce\./i.test(r.id); // owner unknown → decide by module-id namespace
    if (r.owner && co && r.owner.toLowerCase() === co) isPlatform = false; // explicit client org wins
    if (isPlatform) {
      platform.push({ name: full, kind: r.kind });
    } else {
      // host from the URL when known; else omit so profile.vcs.clientHost governs.
      client.push({ name: full, kind: r.kind, ...(r.host ? { host: r.host } : {}) });
    }
  }
  return { client, platform };
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
 * Decide, from a repo's parsed package.json, whether it descends from VirtoCommerce
 * vc-frontend, and pin the version anchor. Pure + conservative: only asserts the
 * vc-frontend upstream on a clear signal (a `vc-frontend` package name, or a
 * `@vc-shell`/virtocommerce dependency) — a routing/containment decision must not
 * guess. Returns { upstream, upstreamRef } or null (operator then names it).
 */
export function frontendProvenanceFromPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return null;
  const name = String(pkg.name || "").toLowerCase();
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const vcSignal =
    name === "vc-frontend" ||
    name.includes("vc-frontend") ||
    Object.keys(deps).some((d) => /@vc-shell|virtocommerce|@virto\//i.test(d));
  if (!vcSignal) return null;
  return { upstream: "VirtoCommerce/vc-frontend", upstreamRef: String(pkg.version || "") };
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
    return frontendProvenanceFromPackage(pkg);
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
      const fe = pickFrontendRepos(all.map((r) => r.name));
      const have = new Set(result.client.map((c) => c.name.split("/").pop()));

      // Backfill defaultBranch onto client MODULE entries (from the modules API, which
      // carries no branch info) by matching the live repo listing (H2).
      for (const c of result.client) {
        const bare = c.name.split("/").pop();
        const info = byName.get(bare);
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
