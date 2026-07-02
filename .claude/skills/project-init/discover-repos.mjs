#!/usr/bin/env node
/**
 * .claude/skills/project-init/discover-repos.mjs
 *
 * Query the Platform API for installed modules and propose a client/platform
 * repo split for the deployment profile. Each module's ProjectUrl (or, as a
 * fallback, its Id) is mapped to a repo and classified by owner: VirtoCommerce
 * ⇒ platform; anything else (esp. under --client-org) ⇒ client. Emits
 * { client:[...], platform:[...] } for `gen-profile.mjs --repos-json --merge`.
 *
 * The storefront / theme / frontend repo is NOT a platform module, so it is not in
 * the modules API. Instead this scans the CLIENT's code host (Azure Repos or GitHub,
 * per --client-vcs) for a repo whose name matches a theme/frontend heuristic and adds
 * it to repos.client as kind:"frontend". If NONE matches, it prints a notice so the
 * skill ASKS the operator to name it. The proposal is a STARTING POINT — confirm/fix.
 *
 * Usage:
 *   node .claude/skills/project-init/discover-repos.mjs --client-org acme-corp \
 *     [--client-vcs github|azure-repos] [--out repos.json] [--print] [--insecure]
 *   # offline test with mock module data ([{Id,ProjectUrl}, ...]); skips the repo scan:
 *   node .claude/skills/project-init/discover-repos.mjs --client-org acme --modules-json mods.json --print
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
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
  const rx = /(vc-theme|vc-frontend|storefront|theme|front-?end)/i;
  return [...new Set((names || []).filter((n) => rx.test(n)))];
}

/** List the client's repo NAMES from their code host (Azure Repos or GitHub). */
async function listClientReposLive(host, { org, project }) {
  if (host === "azure-repos") {
    if (!org || !project) throw new Error("need ADO_ORG + ADO_PROJECT to list Azure Repos");
    const pat = process.env.ADO_PAT || "";
    if (!pat) throw new Error("need ADO_PAT to list Azure Repos");
    const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`;
    const res = await fetch(url, {
      headers: { Authorization: "Basic " + Buffer.from(":" + pat).toString("base64"), Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`ADO repositories → ${res.status}`);
    return ((await res.json()).value || []).map((r) => r.name);
  }
  // github
  if (!org) throw new Error("need client org to list GitHub repos");
  const tok = process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || "";
  const hdr = { "User-Agent": "vc-project-init", Accept: "application/vnd.github+json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
  for (const kind of ["orgs", "users"]) {
    const res = await fetch(`https://api.github.com/${kind}/${org}/repos?per_page=100`, { headers: hdr });
    if (res.ok) return (await res.json()).map((r) => r.name);
  }
  throw new Error(`GitHub repos for '${org}' → not found`);
}

async function getModulesLive() {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: ".env.defaults" });
  dotenv({ path: `.env.${TEST_ENV}`, override: true });
  dotenv({ path: ".env.local", override: true });
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
  const clientOrg = args["client-org"] || "";

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

  const result = classify(modules, clientOrg);
  console.error(
    `[discover-repos] ${result.platform.length} platform repo(s), ${result.client.length} client repo(s)` +
      (clientOrg ? ` (client org: ${clientOrg})` : ""),
  );

  // Scan the CLIENT's repos for a storefront/theme/frontend repo — it is NOT installed as
  // a platform module, so the modules API never surfaces it. Live mode only.
  if (!args["modules-json"] && clientOrg) {
    const host = args["client-vcs"] || "github";
    try {
      const org = host === "azure-repos" ? (process.env.ADO_ORG || clientOrg) : clientOrg;
      const all = await listClientReposLive(host, { org, project: process.env.ADO_PROJECT || "" });
      const fe = pickFrontendRepos(all);
      const have = new Set(result.client.map((c) => c.name.split("/").pop()));
      for (const n of fe) {
        if (have.has(n)) continue;
        result.client.push({ name: `${org}/${n}`, kind: "frontend", host });
      }
      console.error(
        fe.length
          ? `[discover-repos] storefront/theme repo(s) found: ${fe.join(", ")}`
          : `[discover-repos] NO storefront/theme repo matched — ASK the operator to name it, then add { kind: "frontend" } to repos.client.`,
      );
    } catch (err) {
      console.error(`[discover-repos] client-repo scan skipped (${err.message}) — ASK the operator to name the storefront/theme repo.`);
    }
  }

  if (args.out) {
    const outAbs = resolve(args.out);
    mkdirSync(dirname(outAbs), { recursive: true }); // ensure the --out dir exists
    writeFileSync(outAbs, JSON.stringify(result, null, 2) + "\n");
    console.error(`[discover-repos] wrote ${outAbs}`);
  }
  // Machine-readable result on stdout (so callers can pipe / capture).
  if (args.print || !args.out) console.log(JSON.stringify(result, null, 2));
}

// Run only when invoked directly (so classify/moduleToRepo stay importable for tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
