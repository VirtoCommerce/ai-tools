#!/usr/bin/env node
/**
 * .claude/skills/project-init/verify-access.mjs
 *
 * Full /qa-fix readiness checkup after /project-init. Reports PASS / FAIL / WARN /
 * SKIP per check in a bordered table; never throws; never prints secret values.
 * Exit code 0 if no hard FAIL, 1 otherwise.
 *
 * Checks (TEST_ENV-aware; applies the same _<ENV> suffix promotion as config.js so
 * per-env creds resolve):
 *   - deployment profile present + parseable
 *   - core env vars (config.js required set)
 *   - Storefront URL reachable (FRONT_URL)
 *   - Admin / platform URL reachable (BACK_URL)
 *   - Admin login — real OAuth password grant against {BACK_URL}/connect/token
 *   - Storefront user login — soft probe (WARN, not FAIL: storefront users may auth via xAPI)
 *   - Jira API token — GET /rest/api/3/myself  (jira tracker)  OR  Azure DevOps auth present
 *   - GitHub fix token (GITHUB_FIX_BUGS_TOKEN) — validate token + push perm on the upstream repo
 *   - gh CLI session — gh auth status
 *
 * Usage: node .claude/skills/project-init/verify-access.mjs
 */
import { execSync } from "child_process";
import { config as dotenv } from "dotenv";
import { readFileSync } from "fs";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

const TEST_ENV = resolveTestEnv("vcst");
dotenv({ path: ".env.defaults" });
dotenv({ path: `.env.${TEST_ENV}`, override: true });
dotenv({ path: ".env.local", override: true });
// Per-env suffix promotion (mirror config.js) so ADMIN_PASSWORD_<ENV> → ADMIN_PASSWORD etc.
const SUF = `_${TEST_ENV.toUpperCase()}`;
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
}

const BACK = (process.env.BACK_URL || "").replace(/\/+$/, "");
const FRONT = (process.env.FRONT_URL || "").replace(/\/+$/, "");

const results = [];
const add = (name, status, detail = "") => results.push({ name, status, detail });

// --- color support (green/yellow/red status markers; auto-off when piped or NO_COLOR) ---
const USE_COLOR = !process.env.NO_COLOR && (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));
const ANSI = { reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", gray: "\x1b[90m", cyan: "\x1b[36m" };
const paint = (code, s) => (USE_COLOR ? `${code}${s}${ANSI.reset}` : s);
// Status → colour + a leading fixed-width ASCII marker (safe width; the colour is the signal).
const STATUS_STYLE = {
  PASS: ANSI.green, OK: ANSI.green, AUTHORIZED: ANSI.green,
  WARN: ANSI.yellow, "NEEDS OAUTH": ANSI.yellow,
  FAIL: ANSI.red, "NOT AUTH": ANSI.red,
  SKIP: ANSI.gray, "NO KEY": ANSI.gray,
};
const MARKER = { PASS: "+", OK: "+", AUTHORIZED: "+", WARN: "!", "NEEDS OAUTH": "!", FAIL: "x", "NOT AUTH": "x", SKIP: "-", "NO KEY": "-" };
// Render a status word as "<marker> <WORD>" padded to width `n`, then colourised (colour added
// AFTER padding so borders stay aligned regardless of the invisible ANSI escapes).
const statusCell = (st, n) => {
  const label = `${MARKER[st] || " "} ${st}`;
  const padded = label + " ".repeat(Math.max(0, n - label.length));
  return paint(ANSI.bold + (STATUS_STYLE[st] || ""), padded);
};
const statusWidth = (st) => `${MARKER[st] || " "} ${st}`.length;

// Target render width. A TTY reports stdout.columns; under a pipe (the harness / a Bash
// tool) it is undefined, so fall back to $COLUMNS then a conservative 100 — otherwise the
// box table renders at its natural ~130 cols, wraps in the panel, and the borders shatter
// into garbled lines (i.e. the table "doesn't appear"). Detail columns are budgeted to fit.
const MAXW = Number(process.env.COLUMNS) || process.stdout.columns || 100;
const truncTo = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

function tryCmd(cmd) {
  try { execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }); return true; } catch { return false; }
}
async function httpStatus(url) {
  if (!url) return 0;
  try { return (await fetch(url, { method: "GET", redirect: "manual" })).status; }
  catch { return -1; }
}

async function main() {
  // 1. Profile
  const profile = loadProjectProfile();
  add("Deployment profile", profile ? "PASS" : "FAIL",
    `type=${profile.projectType} tracker=${profile.tracker.kind} vcs=${profile.vcs.clientHost} upstream=${profile.upstream.org}/${profile.upstream.contributionMode}`);

  // 2. Core env vars
  const core = ["FRONT_URL", "BACK_URL", "ADMIN", "ADMIN_PASSWORD", "USER_EMAIL", "USER_PASSWORD", "STORE_ID"];
  const miss = core.filter((v) => !process.env[v]);
  add("Core env vars (config.js)", miss.length ? "FAIL" : "PASS",
    miss.length ? `missing: ${miss.join(", ")}` : `all ${core.length} present (TEST_ENV=${TEST_ENV})`);

  // 3-4. URLs reachable
  const fS = await httpStatus(FRONT);
  add("Storefront URL (FRONT_URL)", fS >= 200 && fS < 500 ? "PASS" : FRONT ? "FAIL" : "SKIP", `${FRONT || "(unset)"}${FRONT ? ` → HTTP ${fS}` : ""}`);
  const bS = await httpStatus(BACK);
  add("Admin/platform URL (BACK_URL)", bS >= 200 && bS < 500 ? "PASS" : BACK ? "FAIL" : "SKIP", `${BACK || "(unset)"}${BACK ? ` → HTTP ${bS}` : ""}`);

  // 5. Admin login — real password grant
  if (BACK && process.env.ADMIN && process.env.ADMIN_PASSWORD) {
    try {
      const r = await fetch(`${BACK}/connect/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password", username: process.env.ADMIN, password: process.env.ADMIN_PASSWORD, scope: "offline_access" }),
      });
      add("Admin login (ADMIN_PASSWORD)", r.ok ? "PASS" : "FAIL",
        r.ok ? `token acquired for '${process.env.ADMIN}'` : `POST /connect/token → ${r.status} (check ADMIN / ADMIN_PASSWORD)`);
    } catch (e) { add("Admin login (ADMIN_PASSWORD)", "FAIL", e.message); }
  } else add("Admin login (ADMIN_PASSWORD)", "SKIP", "BACK_URL / ADMIN / ADMIN_PASSWORD not all set");

  // 6. Storefront user login — soft probe (platform grant may not apply to storefront users)
  if (BACK && process.env.USER_EMAIL && process.env.USER_PASSWORD) {
    try {
      const r = await fetch(`${BACK}/connect/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password", username: process.env.USER_EMAIL, password: process.env.USER_PASSWORD, scope: "offline_access" }),
      });
      add("Storefront user login (USER_PASSWORD)", r.ok ? "PASS" : "WARN",
        r.ok ? `token acquired for '${process.env.USER_EMAIL}'` : `platform grant → ${r.status}; storefront users may auth via xAPI — verify manually`);
    } catch (e) { add("Storefront user login (USER_PASSWORD)", "WARN", e.message); }
  } else add("Storefront user login (USER_PASSWORD)", "SKIP", "USER_EMAIL / USER_PASSWORD not set");

  // 7. Tracker
  if (profile.tracker.kind === "jira") {
    const base = (process.env.JIRA_BASE_URL || profile.tracker.baseUrl || "").replace(/\/$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    if (!base || !email || !token) add("Jira API token", "SKIP", "set JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN (or use Atlassian MCP)");
    else {
      try {
        const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
        const r = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
        const me = r.ok ? await r.json() : null;
        add("Jira API token", r.ok ? "PASS" : "FAIL", r.ok ? `GET /myself → 200 (${me.displayName || me.emailAddress})` : `GET /myself → ${r.status}`);
      } catch (e) { add("Jira API token", "FAIL", e.message); }
    }
  } else {
    const az = profile.tracker.azure || {};
    const org = process.env.ADO_ORG || az.organization || "";
    const project = process.env.ADO_PROJECT || az.project || "";
    // Resolve auth: ADO_PAT (Basic) else a bearer token from the `az login` session
    // (resource GUID 499b84ac-… = Azure DevOps). Then PROBE the org — a live session that
    // is not a member of the org (or a different tenant) answers 203 + an HTML sign-in
    // page, so "az account show works" is NOT proof of access.
    let authHeader = "", via = "";
    if (process.env.ADO_PAT) { authHeader = "Basic " + Buffer.from(":" + process.env.ADO_PAT).toString("base64"); via = "ADO_PAT"; }
    else if (tryCmd("az account show")) {
      try {
        const tok = execSync("az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
        if (tok) { authHeader = "Bearer " + tok; via = "az session"; }
      } catch { /* no token */ }
    }
    if (!org || !project) add("Azure DevOps auth", "FAIL", "set ADO_ORG + ADO_PROJECT");
    else if (!authHeader) add("Azure DevOps auth", "FAIL", "no ADO_PAT and no `az login` session — run `az login` (browser) or set ADO_PAT");
    else {
      try {
        const r = await fetch(`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/projects?api-version=7.1`, { headers: { Authorization: authHeader, Accept: "application/json" } });
        const okJson = r.ok && (r.headers.get("content-type") || "").includes("application/json");
        add("Azure DevOps auth", okJson ? "PASS" : "FAIL",
          okJson ? `${org}/${project} (${via})`
                 : `${via} not accepted for '${org}' (→ ${r.status})` + (via === "az session" ? " — az identity not a member / wrong tenant: `az login --tenant <id>` or set ADO_PAT" : " — check ADO_PAT scopes"));
      } catch (e) { add("Azure DevOps auth", "FAIL", e.message); }
    }
  }

  // 8. GitHub fix token (PAT) — validate + push perm on the upstream platform repo
  const ghtok = process.env.GITHUB_FIX_BUGS_TOKEN || "";
  const upstream = `${profile.upstream.org || "VirtoCommerce"}/vc-platform`;
  if (ghtok) {
    try {
      const gh = (path) => fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${ghtok}`, "User-Agent": "vc-project-init", Accept: "application/vnd.github+json" } });
      const u = await gh("/user");
      if (u.ok) {
        const login = (await u.json()).login;
        const rp = await gh(`/repos/${upstream}`);
        let perm = "unknown";
        if (rp.ok) { const p = (await rp.json()).permissions || {}; perm = p.admin ? "admin" : p.maintain ? "maintain" : p.push ? "push" : p.pull ? "pull(read-only)" : "none"; }
        add("GitHub fix token (PAT)", "PASS", `valid, login '${login}'; ${upstream}: ${perm}`);
      } else add("GitHub fix token (PAT)", "FAIL", `GET /user → ${u.status}`);
    } catch (e) { add("GitHub fix token (PAT)", "FAIL", e.message); }
  } else add("GitHub fix token (PAT)", "SKIP", "GITHUB_FIX_BUGS_TOKEN unset (relying on gh CLI)");

  // 9. gh CLI session
  add("gh CLI session", tryCmd("gh auth status") ? "PASS" : ghtok ? "SKIP" : "FAIL",
    tryCmd("gh auth status") ? "gh authenticated" : "run `gh auth login` (or rely on the PAT above)");

  renderTable(results);
  renderMcp();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

// --- MCP servers report (.mcp.json + enabled set) with per-server auth status ---
function renderMcp() {
  const MCP = {
    "playwright-chrome": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "playwright-firefox": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "playwright-edge": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "Chrome DevTools": { auth: "local", status: () => ["OK", "local, no auth"] },
    github: { auth: "token", status: () => {
      const t = process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      if (t) return ["AUTHORIZED", "PAT in env"];
      if (tryCmd("gh auth token")) return ["AUTHORIZED", "gh CLI token"];
      return ["NOT AUTH", "no PAT / gh token"];
    } },
    atlassian: { auth: "oauth", status: () => ["NEEDS OAUTH", "authorize in claude.ai connectors / /mcp"] },
    "figma-remote-mcp": { auth: "oauth", status: () => ["NEEDS OAUTH", "authorize in claude.ai connectors / /mcp"] },
    "azure-mcp": { auth: "az/AAD", status: () => tryCmd("az account show") ? ["AUTHORIZED", "az login active"] : ["NOT AUTH", "run `az login`"] },
    context7: { auth: "key", status: () => process.env.CONTEXT7_API_KEY ? ["AUTHORIZED", "CONTEXT7_API_KEY set"] : ["NO KEY", "optional — set CONTEXT7_API_KEY"] },
    postman: { auth: "key", status: () => process.env.POSTMAN_API_KEY ? ["AUTHORIZED", "POSTMAN_API_KEY set"] : ["NO KEY", "optional — set POSTMAN_API_KEY"] },
  };

  let mcp, enabled;
  try { mcp = JSON.parse(readFileSync(".mcp.json", "utf-8")); } catch { mcp = null; }
  try { enabled = JSON.parse(readFileSync(".claude/settings.local.json", "utf-8")).enabledMcpjsonServers; } catch { enabled = null; }

  console.log("  MCP servers (.mcp.json)");
  if (!mcp) { console.log("  ✗ .mcp.json not generated yet — run gen-mcp.mjs (step 6).\n"); return; }
  const names = enabled && enabled.length ? enabled : Object.keys(mcp.mcpServers || {});

  const rows = names.map((n) => {
    const meta = MCP[n] || { auth: "?", status: () => ["?", "unknown server"] };
    const [st, detail] = meta.status();
    return { name: n, auth: meta.auth, status: st, detail };
  });

  const cols = ["Server", "Auth", "Status", "Detail"];
  const w0 = Math.max(cols[0].length, ...rows.map((r) => r.name.length));
  const w1 = Math.max(cols[1].length, ...rows.map((r) => r.auth.length));
  const w2 = Math.max(cols[2].length, ...rows.map((r) => r.status.length));
  // Chrome for the 4-col row "│ a │ b │ c │ d │" is 13 fixed chars; budget Detail to fit MAXW.
  const mcpDetailBudget = Math.max(24, MAXW - 13 - w0 - w1 - w2);
  for (const r of rows) r.detail = truncTo(r.detail, mcpDetailBudget);
  const w = [w0, w1, w2, Math.max(cols[3].length, ...rows.map((r) => r.detail.length))];
  const pad = (s, n) => s + " ".repeat(n - s.length);
  const line = (l, m, r) => l + w.map((x) => "─".repeat(x + 2)).join(m) + r;
  const row = (a, colorStatus = false) => "│ " + a.map((v, i) => {
    const cell = pad(v, w[i]);
    return colorStatus && i === 2 ? paint(ANSI.bold + (STATUS_STYLE[v] || ""), cell) : cell;
  }).join(" │ ") + " │";
  console.log("  created " + paint(ANSI.green, "✓") + " — " + names.length + " enabled");
  console.log(line("┌", "┬", "┐"));
  console.log(row(cols));
  console.log(line("├", "┼", "┤"));
  for (const r of rows) console.log(row([r.name, r.auth, r.status, r.detail], true));
  console.log(line("└", "┴", "┘"));
  const oauth = rows.filter((r) => r.status === "NEEDS OAUTH").map((r) => r.name);
  if (oauth.length) console.log(`  ! OAuth authorization needed (interactive): ${oauth.join(", ")} — reload the client, then authorize.`);
  console.log("");
}

// --- pretty bordered table (plain Unicode; always aligned) ---
function renderTable(rows) {
  // Plain ASCII status words (no ambiguous-width glyphs) so borders always align.
  const H = { name: "Check", status: "Status", detail: "Detail" };
  const w1 = Math.max(H.name.length, ...rows.map((r) => r.name.length));
  const w2 = Math.max(H.status.length, ...rows.map((r) => statusWidth(r.status)));
  // Chrome for "│ name │ status │ detail │" is 10 fixed chars; give the rest to Detail,
  // floored so it stays legible, so the whole table fits within MAXW and never wraps.
  const detailBudget = Math.max(24, MAXW - 10 - w1 - w2);
  const cells = rows.map((r) => ({ name: r.name, status: r.status, detail: truncTo(r.detail, detailBudget) }));
  const w3 = Math.max(H.detail.length, ...cells.map((c) => c.detail.length));
  const pad = (s, n) => s + " ".repeat(n - s.length);
  const line = (l, m, r) => `${l}${"─".repeat(w1 + 2)}${m}${"─".repeat(w2 + 2)}${m}${"─".repeat(w3 + 2)}${r}`;
  const headRow = (a, b, c) => `│ ${pad(a, w1)} │ ${pad(b, w2)} │ ${pad(c, w3)} │`;

  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const fails = rows.filter((r) => r.status === "FAIL");

  console.log("");
  console.log(`  ${paint(ANSI.bold, `/qa-fix readiness — TEST_ENV=${resolveTestEnv("vcst")}`)}`);
  console.log(line("┌", "┬", "┐"));
  console.log(headRow(H.name, H.status, H.detail));
  console.log(line("├", "┼", "┤"));
  for (const c of cells) {
    console.log(`│ ${pad(c.name, w1)} │ ${statusCell(c.status, w2)} │ ${pad(c.detail, w3)} │`);
  }
  console.log(line("└", "┴", "┘"));
  console.log(
    `  ${rows.length} checks · ` +
      `${paint(ANSI.green, `✓ ${counts.PASS || 0} pass`)} · ` +
      `${paint(ANSI.red, `✗ ${counts.FAIL || 0} fail`)} · ` +
      `${paint(ANSI.yellow, `! ${counts.WARN || 0} warn`)} · ` +
      `${paint(ANSI.gray, `– ${counts.SKIP || 0} skip`)}`
  );
  console.log(fails.length
    ? paint(ANSI.bold + ANSI.red, `  ✗ NOT READY — resolve: ${fails.map((f) => f.name).join(", ")}`)
    : paint(ANSI.bold + ANSI.green, `  ✓ READY for /qa-fix.`));
  console.log("");
}

main();
