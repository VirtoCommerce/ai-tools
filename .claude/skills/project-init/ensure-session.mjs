#!/usr/bin/env node
/**
 * skills/project-init/ensure-session.mjs
 *
 * Establish the browser-login SESSIONS that session-auth (`--ado-auth az-login` /
 * `--github-auth gh-cli`) relies on — WITHOUT the operator hand-crafting any command.
 * It auto-discovers the ADO org's Entra tenant and drives `az login --tenant <guid>`
 * itself, so nobody has to know or type the tenant; likewise `gh auth login --web` for
 * GitHub. Idempotent: if a session already authorizes the target, it does nothing.
 *
 * The ONE thing it cannot remove is the browser consent click — that is inherent to
 * interactive OAuth. For a fully non-interactive setup use a PAT (ADO_PAT /
 * GITHUB_FIX_BUGS_TOKEN) or a service principal instead of session auth.
 *
 * TEST_ENV-aware (mirrors config.js / verify-access env loading + _<ENV> promotion).
 *
 * Usage:
 *   TEST_ENV=<env> node skills/project-init/ensure-session.mjs [--ado] [--github]
 *   (no target flag ⇒ both, gated by the deployment profile: ADO only when tracker/vcs
 *    is azure, GitHub only when an upstream contribution is possible.)
 *
 * Flags: --ado, --github (restrict to one), --check (probe only, never launch a login),
 *   --print. Exit 0 iff every requested session ends up authorized.
 */
import { execSync, spawnSync } from "child_process";
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798"; // Azure DevOps app id

function parseArgs(argv) {
  const a = {};
  for (const x of argv) if (x.startsWith("--")) a[x.slice(2)] = true;
  return a;
}
function loadEnv() {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: ".env.defaults" });
  dotenv({ path: `.env.${TEST_ENV}`, override: true });
  dotenv({ path: ".env.local", override: true });
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }
  return TEST_ENV;
}
const log = (m) => console.log(`[ensure-session] ${m}`);
function tryOut(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

/** Discover an ADO org's tenant GUID from its unauthenticated auth-challenge headers. */
async function resolveAdoTenant(org) {
  try {
    const r = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.1`, { redirect: "manual" });
    const t = (r.headers.get("x-vss-resourcetenant") || "").trim();
    if (/^[0-9a-f-]{36}$/i.test(t)) return t;
    const m = /login\.microsoftonline\.com\/([0-9a-f-]{36})/i.exec(r.headers.get("www-authenticate") || "");
    return m ? m[1] : "";
  } catch { return ""; }
}
/** Probe whether the current auth (PAT or az session) is accepted by the ADO org. */
async function adoAuthorized(org, project) {
  let authHeader = "";
  if (process.env.ADO_PAT) authHeader = "Basic " + Buffer.from(":" + process.env.ADO_PAT).toString("base64");
  else {
    const tok = tryOut(`az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`);
    if (tok) authHeader = "Bearer " + tok;
  }
  if (!authHeader) return false;
  try {
    // `_apis/projects` is ORG-level — no project segment (a /{project}/ path 404s).
    const r = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.1`, { headers: { Authorization: authHeader, Accept: "application/json" } });
    return r.ok && (r.headers.get("content-type") || "").includes("application/json");
  } catch { return false; }
}

async function ensureAdo(check, deviceCode) {
  const org = process.env.ADO_ORG || "";
  const project = process.env.ADO_PROJECT || "";
  if (!org || !project) { log("ADO: SKIP (ADO_ORG/ADO_PROJECT unset)"); return true; }
  if (process.env.ADO_PAT) {
    const ok = await adoAuthorized(org, project);
    log(`ADO: ${ok ? "OK (ADO_PAT accepted)" : "FAIL (ADO_PAT rejected — check scopes)"}`);
    return ok;
  }
  if (await adoAuthorized(org, project)) { log(`ADO: OK (az session already authorizes '${org}')`); return true; }
  const tenant = await resolveAdoTenant(org);
  if (!tenant) { log(`ADO: FAIL — could not discover tenant for '${org}'`); return false; }
  if (check) { log(`ADO: NOT authorized — run: az login --tenant ${tenant}`); return false; }
  const azArgs = ["login", "--tenant", tenant, "--allow-no-subscriptions"];
  if (deviceCode) azArgs.push("--use-device-code"); // device-code: prints URL+code (works when the WAM popup hides the number-match)
  else if (process.platform === "win32") {
    // Disable the Windows WAM broker so az opens the REAL browser — it reuses the browser's
    // existing Azure session (SSO, usually no fresh MFA), instead of the native popup that
    // ignores browser cookies and forces number-match.
    spawnSync("az", ["config", "set", "core.enable_broker_on_windows=false"], { stdio: "ignore", shell: true });
  }
  log(`ADO: launching ${deviceCode ? "device-code" : "browser (SSO from your signed-in browser)"} login for tenant ${tenant}…`);
  spawnSync("az", azArgs, { stdio: "inherit", shell: true });
  const ok = await adoAuthorized(org, project);
  log(`ADO: ${ok ? "OK — session now authorizes '" + org + "'" : "still FAIL — the account may not be a member of '" + org + "'"}`);
  return ok;
}

async function ensureGithub(check) {
  if (tryOut("gh auth status") || process.env.GITHUB_FIX_BUGS_TOKEN) { log("GitHub: OK (gh session or PAT present)"); return true; }
  if (check) { log("GitHub: NOT authorized — run: gh auth login --web"); return false; }
  log("GitHub: launching browser login (gh auth login --web)…");
  spawnSync("gh", ["auth", "login", "--web", "--git-protocol", "https"], { stdio: "inherit", shell: true });
  const ok = Boolean(tryOut("gh auth status"));
  log(`GitHub: ${ok ? "OK — gh session established" : "still FAIL"}`);
  return ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const profile = loadProjectProfile();
  // Default targets from the profile; explicit --ado/--github narrows.
  const wantAdo = args.ado || (!args.ado && !args.github && (profile.tracker.kind === "azure" || profile.vcs.clientHost === "azure-repos"));
  const wantGh = args.github || (!args.ado && !args.github); // upstream is always GitHub
  let ok = true;
  if (wantAdo) ok = (await ensureAdo(Boolean(args.check), Boolean(args["device-code"]))) && ok;
  if (wantGh) ok = (await ensureGithub(Boolean(args.check))) && ok;
  log(ok ? "all requested sessions authorized ✓" : "one or more sessions need attention ✗");
  process.exit(ok ? 0 : 1);
}
main();
