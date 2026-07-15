#!/usr/bin/env node
/**
 * skills/project-init/probe-lib.mjs
 *
 * Shared, side-effect-free probe helpers used by BOTH verify-access.mjs (readiness
 * table) and derive-context.mjs (the /project-init "derive block"). Factored out so
 * the GitHub-upstream permission probe has ONE implementation — a divergence between
 * "what verify reports" and "what derive writes into the profile" would silently
 * mis-route /qa-fix (e.g. derive fork mode while verify claims direct is possible).
 *
 * Nothing here mutates process.env or writes files; callers own env loading + output.
 */
import { execSync } from "child_process";

/**
 * Azure DevOps app id — the resource GUID `az account get-access-token
 * --resource <this>` needs to mint an ADO-scoped bearer token. Shared here
 * (rather than duplicated per call site) because a prior copy-paste drift
 * across `project-init/*.mjs` shipped a wrong, transcribed GUID at several
 * sites — a single exported constant means there's only one place to get it
 * right. `qa-fix-routing/ado-rest.ts` needs the same value with a `/.default`
 * suffix for MSAL scope format; it lives in a different skill directory with
 * no cross-skill import path (see that skill's own path-resolution note), so
 * it keeps its own copy rather than reaching across plugin boundaries for one
 * string.
 */
export const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";

/** Run a command, return true on exit 0 (stdout/err suppressed). */
export function tryCmd(cmd) {
  try { execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }); return true; } catch { return false; }
}
/** Run a command, return trimmed stdout ("" on failure). */
export function tryOut(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
}

/**
 * Resolve the GitHub token to use for fix PRs / issues, and how it was obtained.
 *   → { token, via: "PAT" | "gh CLI" | "", scopes }
 * Prefers an explicit PAT (GITHUB_FIX_BUGS_TOKEN); else falls back to the gh CLI
 * session token. `scopes` is only populated for the gh-cli path (from `gh auth status`).
 */
export function resolveGithubToken() {
  let token = process.env.GITHUB_FIX_BUGS_TOKEN || "";
  let via = token ? "PAT" : "";
  let scopes = "";
  if (!token && tryCmd("gh auth status")) {
    token = tryOut("gh auth token");
    via = token ? "gh CLI" : "";
    const m = /Token scopes:\s*(.+)/i.exec(tryOut("gh auth status 2>&1") || "");
    scopes = m ? m[1].replace(/['\s]/g, "") : "";
  }
  return { token, via, scopes };
}

/**
 * Probe the caller's permission on an upstream GitHub repo. Given a token, hits
 * GET /user (→ login) and GET /repos/<repo> (→ permission), then derives the
 * contribution mode: push/maintain/admin ⇒ "direct", anything less ⇒ "fork" (you
 * PR from your own fork). `repo` defaults to `<upstreamOrg>/vc-platform` (the
 * project-init readiness/derive callers); the self-diagnostics deliver step passes
 * `repo: "<org>/vc-mcp-testing-module"` to probe the plugin's OWN repo. Pure network
 * probe; never throws.
 *
 * → { ok, login, perm, contributionMode, repo, status }
 *   ok=false when there is no token or /user failed; perm ∈
 *   admin|maintain|push|pull(read-only)|none|unknown.
 */
export async function probeGithubUpstream({ upstreamOrg = "VirtoCommerce", repo = `${upstreamOrg}/vc-platform`, token } = {}) {
  const out = { ok: false, login: "", perm: "unknown", contributionMode: "fork", repo, status: 0 };
  if (!token) return out;
  const gh = (path) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "vc-project-init", Accept: "application/vnd.github+json" },
    });
  try {
    const u = await gh("/user");
    out.status = u.status;
    if (!u.ok) return out;
    out.login = (await u.json()).login || "";
    const rp = await gh(`/repos/${repo}`);
    if (rp.ok) {
      const p = (await rp.json()).permissions || {};
      out.perm = p.admin ? "admin" : p.maintain ? "maintain" : p.push ? "push" : p.pull ? "pull(read-only)" : "none";
    }
    out.ok = true;
    out.contributionMode = ["push", "maintain", "admin"].includes(out.perm) ? "direct" : "fork";
  } catch { /* network — leave defaults (ok stays false unless /user succeeded) */ }
  return out;
}

/**
 * Discover an ADO org's Entra tenant GUID from its unauthenticated auth-challenge
 * headers (X-VSS-ResourceTenant / WWW-Authenticate authorization_uri), so callers can
 * hand the operator a ready `az login --tenant <guid>`. "" when it cannot be resolved.
 */
export async function resolveAdoTenant(org) {
  try {
    const r = await fetch(`https://dev.azure.com/${org}/_apis/projects?api-version=7.1`, { redirect: "manual" });
    const t = r.headers.get("x-vss-resourcetenant") || "";
    if (/^[0-9a-f-]{36}$/i.test(t.trim())) return t.trim();
    const m = /login\.microsoftonline\.com\/([0-9a-f-]{36})/i.exec(r.headers.get("www-authenticate") || "");
    return m ? m[1] : "";
  } catch { return ""; }
}

/**
 * Resolve an Azure DevOps auth header + how it was obtained, for an org probe.
 *   → { authHeader, via: "ADO_PAT" | "az session" | "" }
 * Prefers ADO_PAT (Basic), else mints a bearer token from the `az login` session
 * (see `ADO_RESOURCE` above). "" when neither is available.
 */
export function resolveAdoAuth() {
  if (process.env.ADO_PAT) {
    return { authHeader: "Basic " + Buffer.from(":" + process.env.ADO_PAT).toString("base64"), via: "ADO_PAT" };
  }
  if (tryCmd("az account show")) {
    const tok = tryOut(`az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`);
    if (tok) return { authHeader: "Bearer " + tok, via: "az session" };
  }
  return { authHeader: "", via: "" };
}
