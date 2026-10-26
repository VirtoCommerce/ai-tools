// plugins/vc-test/lib/capabilities.mjs — what this install can do, once per run (spec §5.2). The floors read it so
// that an artifact the install cannot run is a named SKIP, never a doubt that fires a floor nothing can execute.
// CLI: node plugins/vc-test/lib/capabilities.mjs --key <KEY> --mcp <comma list>   → <WORK>/capabilities.json
//   (the MCP list comes from the orchestrator: a script cannot see the session's servers)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { storeConfig } from "./knowledge-store.mjs";
import { argOf, currentEnv, outputRoot, workDir } from "./paths.mjs";
import { ProfileError, loadProfile, testBlock } from "./profile.mjs";

const URLS = { "back-url": "BACK_URL", "front-url": "FRONT_URL" };
const mcpKey = (name) => `mcp:${String(name).trim().toLowerCase().replace(/[\s_]+/g, "-")}`;

export async function reach(url) {
  try { await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) }); return true; } catch { return false; }
}

const sameStand = (a, b) => String(a ?? "").replace(/\/+$/, "").toLowerCase() === String(b ?? "").replace(/\/+$/, "").toLowerCase();

/**
 * May the run create or change data on this stand (U16, U22)? Only by declaration: the env is in the test
 * block with `writable: true`, BACK_URL is the URL that declaration recorded (so an override in .env.local
 * cannot point a "writable" run at another stand), the stand answered, and a host-governed project has not
 * made it read-only. There is no runtime signal of "production", so nothing else makes a stand writable.
 * Shared with teardown.mjs, so a run and its teardown agree.
 * @returns {{ writable: boolean, reason: string }}
 */
export function standOf({ envName, backUrl, block, governance = null, reachable }) {
  const no = (reason) => ({ writable: false, reason });
  const decl = block?.environments?.[envName];
  if (!decl) return no(`environment ${envName} is not declared in the profile's test block — run /vc-test:init`);
  if (decl.writable !== true) return no(`environment ${envName} is declared read-only (test.environments.${envName}.writable)`);
  if (governance?.stand?.writable === false) return no("a host-governed project: governance.stand.writable is false");
  if (!backUrl) return no("BACK_URL is not set");
  if (!decl.backUrl) return no(`test.environments.${envName} records no backUrl — run /vc-test:init`);
  if (!sameStand(backUrl, decl.backUrl)) return no(`BACK_URL ${backUrl} is not the stand declared writable for ${envName} (${decl.backUrl})`);
  if (!reachable) return no(`BACK_URL ${backUrl} did not answer`);
  return { writable: true, reason: `declared writable (test.environments.${envName})` };
}

const listMaps = (dir, suffix) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(suffix)).map((f) => f.slice(0, -suffix.length)).sort() : []);

// The repository scripts the context step and the floors lean on (§5.2): a project without one has the capability
// missing, and a floor that needs it is a named SKIP, never a doubt.
const SCRIPTS = { "deploy-pr": "deploy:pr", preflight: "preflight", "domain-check": "domain:check", "bl-extract": "bl:extract",
  "regression-select": "regression:select", "tc-scope": "tc:scope", "schema-refresh": "schema:refresh" };

function projectScripts(root) {
  let declared = {};
  try { declared = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {}; } catch { /* no package.json: none declared */ }
  const scripts = Object.fromEntries(Object.entries(SCRIPTS).map(([cap, name]) => [cap, Object.hasOwn(declared, name)]));
  // The 0.3.x keys stay for their readers.
  return { scripts, "contract-refresh": scripts["schema-refresh"], "regression-corpus": scripts["regression-select"] };
}

const AXIS = { jira: "jira", azure: "ado", github: "github", "azure-repos": "ado" };

export async function probe({ env, envName = currentEnv(), profile, mcp = null, root = outputRoot(), reach: reachFn = reach }) {
  const caps = { missing: [] };
  for (const [cap, name] of Object.entries(URLS)) {
    const url = env[name];
    if (!url) { caps[cap] = false; caps.missing.push(`${cap}: ${name} not set`); continue; }
    caps[cap] = await reachFn(url);
    if (!caps[cap]) caps.missing.push(`${cap}: ${url} did not answer`);
  }
  const names = (mcp ?? []).map((n) => String(n).trim()).filter(Boolean);
  // The list itself, only when the caller gave one (`--mcp`): the floors read a lane as missing only from a list that
  // was probed — no list is "not probed", never "nothing installed".
  if (mcp) caps.mcp = names;
  for (const name of names) caps[mcpKey(name)] = true;
  const has = (re) => names.some((n) => re.test(n));
  caps.kb = has(/^kb$/i);
  caps.virtooz = has(/virtooz/i);

  const tracker = profile?.tracker?.kind ?? null;
  const host = profile?.vcs?.clientHost ?? null;
  caps.tracker = { kind: tracker, auth: (tracker && profile?.auth?.[AXIS[tracker]]) || null };
  caps.host = { kind: host, auth: (host && profile?.auth?.[AXIS[host]]) || null };
  const governance = profile?.governance ?? null;
  caps.governed = !!(governance?.host || governance?.secrets === "host");

  const store = storeConfig(profile, { root });
  const domainDir = join(store.project, "domain");
  caps.knowledgeStore = { path: store.project, exists: existsSync(store.project), domainMaps: listMaps(domainDir, ".md"), mindMaps: listMaps(domainDir, ".mind-map.json") };
  Object.assign(caps, projectScripts(root));

  caps.stand = standOf({ envName, backUrl: env.BACK_URL, block: testBlock(profile), governance, reachable: caps["back-url"] === true });
  return caps;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const key = argOf(process.argv, "key");
  if (!key) { console.error("usage: capabilities.mjs --key <KEY> --mcp <comma list>"); process.exit(1); }
  let profile;
  try { profile = loadProfile(); } catch (e) { console.error(e.message); process.exit(e instanceof ProfileError ? e.code : 1); }
  const { loadLayeredEnv } = await import("../scripts/lib/load-layered-env.mjs");
  loadLayeredEnv(currentEnv()); // the project's env files into process.env, as every vc-fix script loads them
  const mcpArg = argOf(process.argv, "mcp");
  const caps = await probe({ env: process.env, profile, mcp: mcpArg === undefined ? null : mcpArg.split(",") });
  const out = join(workDir(key), "capabilities.json");
  writeFileSync(out, JSON.stringify(caps, null, 2) + "\n");
  console.log(JSON.stringify({ path: out, ...caps }));
}
