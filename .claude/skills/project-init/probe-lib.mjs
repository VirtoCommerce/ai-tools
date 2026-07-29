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

// ── GitHub token KIND (VCST-5582 A) ──────────────────────────────────────────────────
//
// The upstream path (fork VirtoCommerce/* → fork-PR, or file an Issue there) is reachable
// ONLY by a CLASSIC token, per GitHub's docs: "Only personal access tokens (classic) have
// write access for public repositories that are not owned by you or an organization that
// you are not a member of." A fine-grained PAT is bound to one resource owner and is
// READ-ONLY on public repos it does not own — it authenticates, reads vc-platform as
// pull(read-only), gets classified contributionMode "fork", and then 403s at fork/push
// time. `X-OAuth-Scopes` is the discriminator: GitHub returns it for classic tokens (even
// with an empty scope list) and omits it entirely for fine-grained ones.
//
// Kept in step with plugins/vc-fix/skills/project-init/probe-lib.mjs (the canonical copy) —
// skills/vc-self-check/deliver.mjs is BYTE-IDENTICAL across both trees and imports
// GITHUB_UPSTREAM_REMEDY from here, so both surfaces must export it.

/** Scopes that grant the upstream fork / fork-PR / issue-create path on a classic token. */
const FORK_CAPABLE_SCOPE_RE = /^(repo|public_repo)$/i;

/**
 * The exact remedy text, defined ONCE so verify-access, deliver, and the profile agree. It names
 * the SINGLE recommended credential — one classic `repo` token covers the client's own repos AND
 * the VirtoCommerce upstream, so the operator has one thing to create, not a decision tree.
 */
export const GITHUB_UPSTREAM_REMEDY =
  "create ONE CLASSIC token with the `repo` scope — github.com → Settings → Developer settings → " +
  "Personal access tokens → Tokens (classic). It covers both your own org's repos and the " +
  "VirtoCommerce upstream (fork / fork-PR / Issue). Or run `gh auth login` and use the browser " +
  "session instead. A fine-grained PAT cannot do the upstream half: it is read-only on public " +
  "repos it does not own, so fork / fork-PR / issue-create return 403.";

function readScopeHeader(headers) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get("x-oauth-scopes");
  for (const k of Object.keys(headers)) if (k.toLowerCase() === "x-oauth-scopes") return headers[k];
  return null;
}
function splitScopes(raw) {
  return String(raw ?? "").split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
}

/**
 * Classify a GitHub credential and decide whether it can take the UPSTREAM path.
 * Pure. → { kind, scopes, scopesKnown, forkCapable, remedy }
 *   kind        classic | fine-grained | gh-cli | none
 *   forkCapable "yes" | "no" | "unknown" — TRI-STATE on purpose: only "yes" may be treated
 *               as fork-capable. "unknown" must NOT be optimistically assumed capable.
 */
export function classifyGithubTokenKind(token, headers, { via = "", scopes: viaScopes = "" } = {}) {
  const t = String(token || "");
  if (!t) return { kind: "none", scopes: [], scopesKnown: false, forkCapable: "no", remedy: GITHUB_UPSTREAM_REMEDY };

  const hdr = readScopeHeader(headers);
  const headerScopesKnown = typeof hdr === "string";
  const cliScopes = splitScopes(viaScopes);
  const scopes = headerScopesKnown ? splitScopes(hdr) : cliScopes;
  const scopesKnown = headerScopesKnown || cliScopes.length > 0;

  let kind;
  if (via === "gh CLI" || /^gh[ou]_/.test(t)) kind = "gh-cli";
  else if (/^github_pat_/.test(t)) kind = "fine-grained";
  else if (/^ghp_/.test(t)) kind = "classic";
  else kind = headerScopesKnown ? "classic" : "fine-grained";

  let forkCapable;
  if (kind === "fine-grained") forkCapable = "no";
  else if (!scopesKnown) forkCapable = "unknown";
  else forkCapable = scopes.some((s) => FORK_CAPABLE_SCOPE_RE.test(s)) ? "yes" : "no";

  return { kind, scopes, scopesKnown, forkCapable, remedy: forkCapable === "yes" ? "" : GITHUB_UPSTREAM_REMEDY };
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
 * → { ok, login, perm, contributionMode, repo, status, tokenKind, tokenScopes, forkCapable, remedy }
 *   ok=false when there is no token or /user failed; perm ∈
 *   admin|maintain|push|pull(read-only)|none|unknown. The token-KIND fields come from
 *   classifyGithubTokenKind() — `contributionMode: "fork"` says WHERE a PR goes, `forkCapable`
 *   says whether this credential can actually get it there (VCST-5582 A).
 */
export async function probeGithubUpstream({ upstreamOrg = "VirtoCommerce", repo = `${upstreamOrg}/vc-platform`, token, via = "", scopes = "" } = {}) {
  const out = {
    ok: false, login: "", perm: "unknown", contributionMode: "fork", repo, status: 0,
    tokenKind: "none", tokenScopes: [], forkCapable: "no", remedy: GITHUB_UPSTREAM_REMEDY,
  };
  if (!token) return out;
  const gh = (path) =>
    fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "vc-project-init", Accept: "application/vnd.github+json" },
    });
  try {
    const u = await gh("/user");
    out.status = u.status;
    const kind = classifyGithubTokenKind(token, u.headers, { via, scopes });
    out.tokenKind = kind.kind;
    out.tokenScopes = kind.scopes;
    out.forkCapable = kind.forkCapable;
    out.remedy = kind.remedy;
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
 * (resource GUID 499b84ac-… = the Azure DevOps app id). "" when neither is available.
 */
export function resolveAdoAuth() {
  if (process.env.ADO_PAT) {
    return { authHeader: "Basic " + Buffer.from(":" + process.env.ADO_PAT).toString("base64"), via: "ADO_PAT" };
  }
  if (tryCmd("az account show")) {
    const tok = tryOut("az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv");
    if (tok) return { authHeader: "Bearer " + tok, via: "az session" };
  }
  return { authHeader: "", via: "" };
}
