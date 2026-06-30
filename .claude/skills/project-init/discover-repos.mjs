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
 * The storefront / theme / frontend repo is NOT discoverable from the modules
 * API — the /project-init skill asks for it and adds it to repos.client itself.
 * The proposal is a STARTING POINT: the skill shows it to the user to confirm/fix.
 *
 * Usage:
 *   node .claude/skills/project-init/discover-repos.mjs --client-org acme-corp [--out repos.json] [--print] [--insecure]
 *   # offline test with mock module data ([{Id,ProjectUrl}, ...]):
 *   node .claude/skills/project-init/discover-repos.mjs --client-org acme --modules-json mods.json --print
 */
import { readFileSync, writeFileSync } from "fs";
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

/** Map a module descriptor → { id, owner, name, kind, url }. Pure (unit-testable). */
export function moduleToRepo(mod) {
  const id = mod.Id || mod.id || "";
  const url = mod.ProjectUrl || mod.projectUrl || "";
  let owner = null;
  let name = null;
  const m = /github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/i.exec(url || "");
  if (m) {
    owner = m[1];
    name = m[2];
  } else if (id) {
    // VirtoCommerce.XCart → vc-module-x-cart (best-effort; owner left null).
    const short = id.replace(/^VirtoCommerce\./, "");
    name =
      "vc-module-" +
      short.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\./g, "-").toLowerCase();
  }
  return { id, owner, name, kind: "module", url };
}

/** Classify discovered modules into client vs platform repo lists. Pure. */
export function classify(modules, clientOrg) {
  const client = [];
  const platform = [];
  const seen = new Set();
  for (const mod of modules || []) {
    const r = moduleToRepo(mod);
    if (!r.name) continue;
    const full = r.owner ? `${r.owner}/${r.name}` : r.name;
    if (seen.has(full)) continue;
    seen.add(full);
    const isPlatform = !r.owner || r.owner.toLowerCase() === UPSTREAM_ORG.toLowerCase();
    if (isPlatform) {
      platform.push({ name: full, kind: r.kind });
    } else {
      // Non-VirtoCommerce owner ⇒ treat as client (skill lets the user correct).
      client.push({ name: full, kind: r.kind, host: "github" });
    }
  }
  return { client, platform };
}

async function getModulesLive() {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: ".env.defaults" });
  dotenv({ path: `.env.${TEST_ENV}`, override: true });
  dotenv({ path: ".env.local", override: true });

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

  if (args.out) {
    writeFileSync(resolve(args.out), JSON.stringify(result, null, 2) + "\n");
    console.error(`[discover-repos] wrote ${resolve(args.out)}`);
  }
  // Machine-readable result on stdout (so callers can pipe / capture).
  if (args.print || !args.out) console.log(JSON.stringify(result, null, 2));
}

// Run only when invoked directly (so classify/moduleToRepo stay importable for tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
