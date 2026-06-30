#!/usr/bin/env node
/**
 * .claude/skills/project-init/verify-access.mjs
 *
 * Preflight after /project-init configures a profile. Reports PASS / FAIL / SKIP
 * per check; never throws. Network/tool checks degrade gracefully (SKIP when a
 * tool or credential is absent). Exit code: 0 if no hard FAIL, 1 otherwise.
 *
 * Checks:
 *   - profile present + parseable
 *   - env:check (the canonical layered-env validator)
 *   - GitHub auth (gh auth status, or a *_TOKEN env)
 *   - tracker reachability: Jira GET /myself, or Azure DevOps (PAT/az login present)
 *   - app URLs reachable (FRONT_URL / BACK_URL)
 *
 * Usage: node .claude/skills/project-init/verify-access.mjs [--print]
 */
import { execSync } from "child_process";
import { config as dotenv } from "dotenv";
import { resolveTestEnv } from "../../../scripts/lib/resolve-test-env.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

const TEST_ENV = resolveTestEnv("vcst");
dotenv({ path: ".env.defaults" });
dotenv({ path: `.env.${TEST_ENV}`, override: true });
dotenv({ path: ".env.local", override: true });

const results = [];
const add = (name, status, detail = "") => results.push({ name, status, detail });

function tryCmd(cmd) {
  try {
    execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

async function reachable(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status > 0;
  } catch {
    try {
      const res = await fetch(url, { method: "GET" });
      return res.status > 0;
    } catch {
      return false;
    }
  }
}

async function main() {
  const profile = loadProjectProfile();

  // 1. Profile
  add("profile", profile ? "PASS" : "FAIL", `type=${profile.projectType} tracker=${profile.tracker.kind} clientVcs=${profile.vcs.clientHost}`);

  // 2. env:check
  add("env:check", tryCmd("npm run env:check") ? "PASS" : "FAIL", "core env vars present");

  // 3. GitHub auth (needed for fixes / PRs / fork / issues)
  const ghTok = process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GIT_TOKEN || process.env.GITHUB_TOKEN;
  if (tryCmd("gh auth status")) add("github auth", "PASS", "gh logged in");
  else if (ghTok) add("github auth", "PASS", "token in env");
  else add("github auth", "FAIL", "run `gh auth login` or set GITHUB_FIX_BUGS_TOKEN");

  // 4. Tracker reachability
  if (profile.tracker.kind === "jira") {
    const base = (process.env.JIRA_BASE_URL || profile.tracker.baseUrl || "").replace(/\/$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    if (!base || !email || !token) {
      add("jira", "SKIP", "set JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN (or use Atlassian MCP interactively)");
    } else {
      try {
        const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
        const res = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
        add("jira", res.ok ? "PASS" : "FAIL", res.ok ? `${base}` : `GET /myself → ${res.status}`);
      } catch (e) {
        add("jira", "FAIL", e.message);
      }
    }
  } else {
    const az = profile.tracker.azure || {};
    const org = process.env.ADO_ORG || az.organization || "";
    const project = process.env.ADO_PROJECT || az.project || "";
    const hasAuth = Boolean(process.env.ADO_PAT) || (process.env.ADO_AUTH || "").toLowerCase() === "az-login" || tryCmd("az account show");
    if (org && project && hasAuth) add("azure-devops", "PASS", `${org}/${project} (auth present)`);
    else add("azure-devops", "FAIL", "set ADO_ORG/ADO_PROJECT + ADO_PAT, or run `az login` (ADO_AUTH=az-login)");
  }

  // 5. App URLs
  const front = process.env.FRONT_URL || "";
  const back = process.env.BACK_URL || "";
  add("FRONT_URL", (await reachable(front)) ? "PASS" : front ? "FAIL" : "SKIP", front);
  add("BACK_URL", (await reachable(back)) ? "PASS" : back ? "FAIL" : "SKIP", back);

  // Report
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n  Check            Status  Detail");
  console.log("  ---------------- ------- " + "-".repeat(40));
  for (const r of results) {
    const mark = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "–";
    console.log(`  ${pad(r.name, 16)} ${mark} ${pad(r.status, 5)} ${r.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  console.log(`\n  ${results.length} checks · ${results.filter((r) => r.status === "PASS").length} pass · ${fails.length} fail · ${results.filter((r) => r.status === "SKIP").length} skip\n`);
  process.exit(fails.length ? 1 : 0);
}

main();
