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
import { probeGithubUpstream, resolveGithubToken, resolveAdoTenant } from "./probe-lib.mjs";

const TEST_ENV = resolveTestEnv("vcst");
// quiet: dotenv v17 prints promo tips to stdout, which would garble the readiness table.
dotenv({ path: ".env.defaults", quiet: true });
dotenv({ path: `.env.${TEST_ENV}`, override: true, quiet: true });
dotenv({ path: ".env.local", override: true, quiet: true });
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
function cmdOut(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
}
/**
 * The `az` DEFAULT subscription, or "" when none is selected. A tenant-level
 * `--allow-no-subscriptions` login reports id === tenantId (a placeholder, not a
 * real subscription), which we treat as "no default".
 */
function azDefaultSub() {
  if (!tryCmd("az account show")) return { session: false, id: "", name: "", tenantId: "" };
  const id = cmdOut("az account show --query id -o tsv");
  const tenantId = cmdOut("az account show --query tenantId -o tsv");
  const name = cmdOut("az account show --query name -o tsv");
  const real = id && id !== tenantId;
  return { session: true, id: real ? id : "", name: real ? name : "", tenantId };
}
async function httpStatus(url) {
  if (!url) return 0;
  try { return (await fetch(url, { method: "GET", redirect: "manual" })).status; }
  catch { return -1; }
}
// resolveAdoTenant now lives in probe-lib.mjs (shared with derive-context.mjs).

/** Azure DevOps REST auth header (PAT Basic, else an `az login` bearer). {header, via} — header "" if none. */
function adoAuth() {
  if (process.env.ADO_PAT) return { header: "Basic " + Buffer.from(":" + process.env.ADO_PAT).toString("base64"), via: "ADO_PAT" };
  if (tryCmd("az account show")) {
    try {
      const tok = execSync("az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (tok) return { header: "Bearer " + tok, via: "az session" };
    } catch { /* no token */ }
  }
  return { header: "", via: "" };
}

/** Split owner/name. */
function splitRepo(full) {
  const i = (full || "").indexOf("/");
  return i >= 0 ? { owner: full.slice(0, i), name: full.slice(i + 1) } : { owner: "", name: full || "" };
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
        const r = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.1`, { headers: { Authorization: authHeader, Accept: "application/json" } });
        const okJson = r.ok && (r.headers.get("content-type") || "").includes("application/json");
        let detail;
        if (okJson) detail = `${org}/${project} (${via})`;
        else if (via === "az session") {
          const tenant = await resolveAdoTenant(org); // auto-discovered → ready-to-run login
          detail = `az session not accepted for '${org}' (→ ${r.status}) — run \`az login --tenant ${tenant || "<org-tenant>"}\` or set ADO_PAT`;
        } else detail = `ADO_PAT not accepted for '${org}' (→ ${r.status}) — check scopes (Work Items R/W, Code R/W)`;
        add("Azure DevOps auth", okJson ? "PASS" : "FAIL", detail);
      } catch (e) { add("Azure DevOps auth", "FAIL", e.message); }
    }
  }

  // 8. GitHub auth for fix PRs/issues — REAL probe, whether the token comes from a PAT
  //    or the gh-cli session. Resolve a token, hit /user + the upstream repo, and check
  //    the permission is enough for the contribution mode (fork ⇒ read is enough since you
  //    PR from your own fork; direct ⇒ needs push). Shared with derive-context via
  //    probe-lib so "what verify reports" and "what the profile stored" can't drift.
  const forkMode = profile.upstream.contributionMode === "fork";
  const ghAuthed = tryCmd("gh auth status");
  const { token: ghtok, via: ghVia, scopes: ghScopes } = resolveGithubToken();
  if (ghtok) {
    const label = `GitHub auth (${forkMode ? "fork-PR" : "direct PR"})`;
    const p = await probeGithubUpstream({ upstreamOrg: profile.upstream.org || "VirtoCommerce", token: ghtok });
    if (p.ok && p.login) {
      // fork mode: read is enough (fork + PR from own account); direct: needs push+.
      const enough = p.perm !== "unknown" && (forkMode || ["push", "maintain", "admin"].includes(p.perm));
      const scopesNote = ghScopes ? ` [scopes: ${ghScopes}]` : "";
      add(label, enough ? "PASS" : "WARN",
        `${ghVia}, login '${p.login}'; ${p.repo}: ${p.perm}${scopesNote}` + (enough ? "" : forkMode ? "" : " — direct PR needs push; use fork mode or a token with write"));
    } else add(label, "FAIL", `${ghVia}: GET /user → ${p.status || "error"}`);
  } else add("GitHub auth", "FAIL", "no GITHUB_FIX_BUGS_TOKEN and no gh CLI session — set the PAT or run `gh auth login`");

  // 9. gh CLI session (informational — the capability probe above is the real gate)
  add("gh CLI session", ghAuthed ? "PASS" : (process.env.GITHUB_FIX_BUGS_TOKEN ? "SKIP" : "FAIL"),
    ghAuthed ? "gh authenticated" : "run `gh auth login` (or rely on the PAT above)");

  // 10. Client repos reachable + writable — the MAIN /qa-fix operation on a client deployment
  //     is clone+PR on the CLIENT's own repos, so probe them here rather than discover a dead
  //     token at Gate 2. Native platform (no client repos) → SKIP. Per repo, by its host.
  const clientRepos = profile.repos?.client || [];
  if (!clientRepos.length) {
    add("Client repos", "SKIP", "native-platform deployment — no client repos to probe");
  } else {
    const ado = adoAuth();
    for (const r of clientRepos) {
      if (!r?.name) continue;
      const host = r.host || profile.vcs.clientHost || "github";
      const label = `Client repo ${r.name}${r.kind ? ` (${r.kind})` : ""}`;
      if (host === "azure-repos") {
        const org = profile.vcs.azure?.organization || process.env.ADO_ORG || "";
        const project = profile.vcs.azure?.project || process.env.ADO_PROJECT || "";
        const { name } = splitRepo(r.name);
        if (!ado.header) { add(label, "FAIL", "no ADO_PAT / az session to reach Azure Repos"); continue; }
        if (!org || !project) { add(label, "FAIL", "missing vcs.azure.organization / project"); continue; }
        try {
          const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(name)}?api-version=7.1`;
          const res = await fetch(url, { headers: { Authorization: ado.header, Accept: "application/json" } });
          const okJson = res.ok && (res.headers.get("content-type") || "").includes("application/json");
          add(label, okJson ? "PASS" : "FAIL", okJson ? `reachable via ${ado.via}` : `→ ${res.status} (${ado.via} not accepted — check PAT Code R/W or az tenant)`);
        } catch (e) { add(label, "FAIL", e.message); }
      } else {
        // github client repo
        if (!ghtok) { add(label, "FAIL", "no GitHub token to reach the client repo"); continue; }
        try {
          const { owner, name } = splitRepo(r.name);
          const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
            headers: { "User-Agent": "vc-verify", Accept: "application/vnd.github+json", Authorization: `Bearer ${ghtok}` },
          });
          if (res.ok) {
            const repo = await res.json();
            const push = Boolean(repo.permissions?.push);
            add(label, push ? "PASS" : "WARN", push ? `push access via ${ghVia}` : `reachable (${ghVia}) but no push perm — PR needs write`);
          } else add(label, "FAIL", `GET repos/${owner}/${name} → ${res.status}`);
        } catch (e) { add(label, "FAIL", e.message); }
      }
    }
  }

  // 11. Azure subscription (monitoring) — the `az` default subscription must point at the
  //     deployment's subscription so azure-mcp's subscription-scoped tools + /qa-monitoring
  //     resolve. Only relevant when monitoring is configured; otherwise SKIP. Non-blocking
  //     (WARN, not FAIL): /qa-fix doesn't need it; ensure-subscription.mjs is the fixer.
  const monConfigured = Boolean(
    process.env.AZURE_SUBSCRIPTION_ID ||
    process.env.APPINSIGHTS_APP_ID_BACKEND || process.env.APPINSIGHTS_APP_ID_STOREFRONT ||
    process.env.APPINSIGHTS_RESOURCE_BACKEND || process.env.APPINSIGHTS_RESOURCE_STOREFRONT,
  );
  if (!monConfigured) {
    add("Azure subscription (monitoring)", "SKIP", "monitoring not configured (no AZURE_SUBSCRIPTION_ID / APPINSIGHTS_*)");
  } else {
    const sub = azDefaultSub();
    const wanted = process.env.AZURE_SUBSCRIPTION_ID || "";
    if (!sub.session) {
      add("Azure subscription (monitoring)", "WARN", "no `az` session — run `az login`, then ensure-subscription.mjs");
    } else if (!sub.id) {
      add("Azure subscription (monitoring)", "WARN", "az session has NO default subscription (tenant-level login) — run ensure-subscription.mjs");
    } else if (wanted && sub.id !== wanted) {
      add("Azure subscription (monitoring)", "WARN", `az default '${sub.name}' ≠ AZURE_SUBSCRIPTION_ID — run ensure-subscription.mjs to align`);
    } else {
      add("Azure subscription (monitoring)", "PASS", `az default: ${sub.name} (${sub.id})${wanted ? "" : " — no AZURE_SUBSCRIPTION_ID pin, using az default"}`);
    }
  }

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
    "azure-mcp": { auth: "az/AAD", status: () => {
      const s = azDefaultSub();
      if (!s.session) return ["NOT AUTH", "run `az login`"];
      if (!s.id) return ["WARN", "az session but NO default subscription — run ensure-subscription.mjs"];
      return ["AUTHORIZED", `default sub: ${s.name || s.id}`];
    } },
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
  // Full, UN-truncated remediation for each FAIL — the Detail column is width-capped, so
  // an actionable command (e.g. `az login --tenant <guid>`) would otherwise be cut off.
  if (fails.length) {
    console.log(paint(ANSI.bold, "  To resolve:"));
    for (const f of fails) console.log(`   ${paint(ANSI.red, "•")} ${f.name}: ${f.detail}`);
  }
  console.log("");
}

main();
