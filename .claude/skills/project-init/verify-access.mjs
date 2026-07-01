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
    const hasAuth = Boolean(process.env.ADO_PAT) || (process.env.ADO_AUTH || "").toLowerCase() === "az-login" || tryCmd("az account show");
    add("Azure DevOps auth", org && project && hasAuth ? "PASS" : "FAIL",
      org && project && hasAuth ? `${org}/${project} (auth present)` : "set ADO_ORG/ADO_PROJECT + ADO_PAT, or `az login` (ADO_AUTH=az-login)");
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
}

// --- pretty bordered table (plain Unicode; always aligned) ---
function renderTable(rows) {
  // Plain ASCII status words (no ambiguous-width glyphs) so borders always align.
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const cells = rows.map((r) => ({ name: r.name, status: r.status, detail: trunc(r.detail, 74) }));
  const H = { name: "Check", status: "Status", detail: "Detail" };
  const w1 = Math.max(H.name.length, ...cells.map((c) => c.name.length));
  const w2 = Math.max(H.status.length, ...cells.map((c) => c.status.length));
  const w3 = Math.max(H.detail.length, ...cells.map((c) => c.detail.length));
  const pad = (s, n) => s + " ".repeat(n - s.length);
  const line = (l, m, r) => `${l}${"─".repeat(w1 + 2)}${m}${"─".repeat(w2 + 2)}${m}${"─".repeat(w3 + 2)}${r}`;
  const row = (a, b, c) => `│ ${pad(a, w1)} │ ${pad(b, w2)} │ ${pad(c, w3)} │`;

  const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const fails = rows.filter((r) => r.status === "FAIL");

  console.log("");
  console.log(`  /qa-fix readiness — TEST_ENV=${resolveTestEnv("vcst")}`);
  console.log(line("┌", "┬", "┐"));
  console.log(row(H.name, H.status, H.detail));
  console.log(line("├", "┼", "┤"));
  for (const c of cells) console.log(row(c.name, c.status, c.detail));
  console.log(line("└", "┴", "┘"));
  console.log(
    `  ${rows.length} checks · ✓ ${counts.PASS || 0} pass · ✗ ${counts.FAIL || 0} fail · ! ${counts.WARN || 0} warn · – ${counts.SKIP || 0} skip`
  );
  console.log(fails.length ? `  ✗ NOT READY — resolve: ${fails.map((f) => f.name).join(", ")}` : `  ✓ READY for /qa-fix.`);
  console.log("");
  process.exit(fails.length ? 1 : 0);
}

main();
