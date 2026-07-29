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

// ── GitHub token KIND (VCST-5582 A) ──────────────────────────────────────────────────
//
// RECOMMENDED CREDENTIAL: one CLASSIC token with the `repo` scope. It is the only shape that
// covers BOTH of the plugin's GitHub jobs — the client's own repos (clone/push/PR, private
// included) and the VirtoCommerce upstream (fork / fork-PR / Issue) — so onboarding asks for
// exactly one value. (`gh auth login` is the equivalent no-token alternative.)
//
// The platform delivery path (fork VirtoCommerce/* → fork-PR, or file an upstream Issue)
// is reachable ONLY by a CLASSIC token, per GitHub's own docs: "Only personal access
// tokens (classic) have write access for public repositories that are not owned by you or
// an organization that you are not a member of." A fine-grained PAT is bound to a single
// resource owner and is READ-ONLY on public repos it does not own — it authenticates fine,
// reads `vc-platform` as `pull(read-only)`, and is therefore classified `contributionMode:
// "fork"` … a mode it can never execute. Nothing used to notice: the readiness table said
// READY, the profile stored `fork`, and the 403 only appeared at push/deliver time.
//
// So the token KIND is now a first-class, probed fact. `X-OAuth-Scopes` is the discriminator:
// GitHub returns it for classic tokens (even when the scope list is empty) and omits it
// entirely for fine-grained ones.

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
 * Pure — `headers` is the `GET /user` response's headers (a `Headers` object or a plain
 * object); `via` / `scopes` come from resolveGithubToken() for the gh-CLI path, whose
 * scopes are parsed from `gh auth status` rather than from a response header.
 *
 * → { kind, scopes, scopesKnown, forkCapable, remedy }
 *     kind        classic | fine-grained | gh-cli | none
 *     forkCapable "yes" | "no" | "unknown"  — TRI-STATE on purpose: only "yes" may be
 *                 treated as fork-capable. "unknown" (a PAT whose scopes we could not
 *                 read) must NOT be optimistically assumed capable — that optimism is
 *                 exactly the deliver.mjs defect this fixes.
 *     remedy      "" when nothing needs fixing, else GITHUB_UPSTREAM_REMEDY.
 */
export function classifyGithubTokenKind(token, headers, { via = "", scopes: viaScopes = "" } = {}) {
  const t = String(token || "");
  if (!t) return { kind: "none", scopes: [], scopesKnown: false, forkCapable: "no", remedy: GITHUB_UPSTREAM_REMEDY };

  const hdr = readScopeHeader(headers);
  const headerScopesKnown = typeof hdr === "string";
  const cliScopes = splitScopes(viaScopes);
  const scopes = headerScopesKnown ? splitScopes(hdr) : cliScopes;
  const scopesKnown = headerScopesKnown || cliScopes.length > 0;

  // The gh-CLI session is its own axis (a browser login, not a PAT the operator pasted) —
  // report it as such so the readiness row can say "browser session", not "classic PAT".
  let kind;
  if (via === "gh CLI" || /^gh[ou]_/.test(t)) kind = "gh-cli";
  else if (/^github_pat_/.test(t)) kind = "fine-grained"; // definitive prefix
  else if (/^ghp_/.test(t)) kind = "classic"; // definitive prefix
  else kind = headerScopesKnown ? "classic" : "fine-grained"; // header presence is the discriminator

  let forkCapable;
  if (kind === "fine-grained") forkCapable = "no"; // structurally incapable, whatever the scopes say
  else if (!scopesKnown) forkCapable = "unknown"; // a classic/session token we could not read scopes for
  else forkCapable = scopes.some((s) => FORK_CAPABLE_SCOPE_RE.test(s)) ? "yes" : "no";

  return { kind, scopes, scopesKnown, forkCapable, remedy: forkCapable === "yes" ? "" : GITHUB_UPSTREAM_REMEDY };
}

/**
 * Map a GitHub repo `permissions` object (from GET /repos/<repo>) to the coarse
 * permission label used across project-init. Pure — extracted so probeGithubUpstream
 * and the readiness table share ONE mapping (and so it is unit-testable without network).
 *   → admin | maintain | push | pull(read-only) | none
 */
export function permFromGithubPermissions(perms) {
  const p = perms || {};
  return p.admin ? "admin" : p.maintain ? "maintain" : p.push ? "push" : p.pull ? "pull(read-only)" : "none";
}

/**
 * True when a GitHub permission label grants WRITE (push). /qa-fix needs this on any repo
 * it pushes to — a client repo (always) and the platform upstream in DIRECT mode. In FORK
 * mode the push target is your own fork, so upstream read is enough. Pure.
 */
export function githubCanWrite(perm) {
  return ["push", "maintain", "admin"].includes(perm);
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
 *   admin|maintain|push|pull(read-only)|none|unknown.
 *
 * The token-KIND fields come from classifyGithubTokenKind() over the `GET /user` response
 * headers (VCST-5582 A): `contributionMode: "fork"` alone is not enough to know the token can
 * ACTUALLY fork, so every consumer (readiness row, profile, deliver route) reads `forkCapable`.
 * `via` / `scopes` are the resolveGithubToken() values — pass them for the gh-CLI path.
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
    // Classify from the /user headers whether or not the call succeeded on the repo below —
    // a 401 leaves ok=false, but a kind we could read is still worth reporting.
    const kind = classifyGithubTokenKind(token, u.headers, { via, scopes });
    out.tokenKind = kind.kind;
    out.tokenScopes = kind.scopes;
    out.forkCapable = kind.forkCapable;
    out.remedy = kind.remedy;
    if (!u.ok) return out;
    out.login = (await u.json()).login || "";
    const rp = await gh(`/repos/${repo}`);
    if (rp.ok) out.perm = permFromGithubPermissions((await rp.json()).permissions);
    out.ok = true;
    out.contributionMode = githubCanWrite(out.perm) ? "direct" : "fork";
  } catch { /* network — leave defaults (ok stays false unless /user succeeded) */ }
  return out;
}

// ── Azure DevOps WRITE-scope probes (non-mutating) ───────────────────────────────────
//
// The readiness table's read-only ADO probes (whoami / get-workitem / list-refs) all
// pass on a PAT that has READ but NOT WRITE scope — so a read-only PAT reads as READY and
// the missing write scope only bites later at /qa-fix time (401 on transition / comment /
// push). These probes distinguish "no write scope" from "write scope present" WITHOUT
// mutating anything, by sending a deliberately-INVALID write request and reading the
// status: ADO answers 401 when the PAT/session lacks the write scope (rejected at authorization,
// before body validation), 403 when the scope is present but THIS object is ACL-restricted, and
// 400/409/422 when the scope IS present but the body is rejected (nothing is created/changed).

/**
 * Interpret an ADO WRITE-endpoint probe's HTTP status into a write-scope verdict.
 * Pure — the whole 401-vs-400 signal lives here so it is unit-testable in isolation.
 *   401                → "absent"      (authorized token, but the WRITE SCOPE is missing)
 *   403                → "restricted"  (scope may be present, but THIS object is ACL-restricted —
 *                                       e.g. the probed work-item sits in an Area Path the identity
 *                                       can't edit; NOT proof the PAT lacks Work-Items-Write). A
 *                                       false-negative FAIL here would block a correctly-scoped PAT,
 *                                       so consumers treat it as WARN, not NOT-READY.
 *   400 / 409 / 422    → "present"     (scope OK; the invalid body was rejected at validation)
 *   anything else      → "unverified"  (2xx / 404 / sign-in redirect / network error — inconclusive)
 * → { scope: "present" | "absent" | "restricted" | "unverified", status }
 */
export function classifyWriteProbe(status) {
  if (status === 401) return { scope: "absent", status };
  if (status === 403) return { scope: "restricted", status };
  if (status === 400 || status === 409 || status === 422) return { scope: "present", status };
  return { scope: "unverified", status };
}

/**
 * Map a WRITE-probe `scope` (from classifyWriteProbe / probeAdoCodeWrite, or a GitHub push
 * boolean coerced to "present"/"absent") to a /project-init readiness-table SEVERITY, shared by
 * every write-capability row (Azure Boards transition-write, client-repo push).
 *
 * DESIGN CALL (operator, 2026-07-22): a missing WRITE scope is **never** an onboarding-blocking
 * FAIL — only a **WARN with a clear explanation**. Refusing to finish onboarding over a token
 * that reaches the resource but lacks one write scope is too heavy; the operator can grant it
 * before running `/qa-fix` (and `/qa-fix`'s own Gate 1 re-checks the ACTUAL routed repo anyway).
 * So `present` ⇒ PASS; everything else (`absent` / `restricted` ACL-403 / `unverified`) ⇒ WARN.
 * (Fundamentals — missing core env, unreachable URLs, bad admin login, a totally absent/rejected
 * credential that can't even reach the resource — stay FAIL; those are handled at their own sites,
 * not here.) Pure — unit-tested.
 */
export function writeProbeSeverity(scope) {
  return scope === "present" ? "PASS" : "WARN";
}

/**
 * Find ONE existing work-item id in the project (most-recently changed) via WIQL, so a
 * write probe can target a REAL item — a bogus id would 404 even with write scope and
 * spoil the 401-vs-400 signal. Read-only; returns a number or null. Never throws.
 * `fetchImpl` is injectable for unit tests.
 */
export async function discoverAdoWorkItemId({ apiBase, authHeader, fetchImpl = fetch }) {
  if (!apiBase || !authHeader) return null;
  try {
    const res = await fetchImpl(`${apiBase.replace(/\/$/, "")}/_apis/wit/wiql?api-version=7.1&$top=1`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC" }),
      redirect: "manual",
    });
    if (!res.ok) return null;
    const d = await res.json();
    const id = d?.workItems?.[0]?.id;
    return typeof id === "number" ? id : null;
  } catch { return null; }
}

/**
 * Non-mutating probe: does the ADO auth (PAT / az-login) carry Work-Items WRITE scope?
 * PATCHes a KNOWN work item with a deliberately-malformed JSON-Patch body (an object where
 * ADO requires an array) — the request is rejected at validation the instant it is
 * authorized, so nothing is ever created or changed. `workItemId` must exist
 * (discoverAdoWorkItemId). See classifyWriteProbe for the status split. Never throws.
 * → { scope, status }
 */
export async function probeAdoWorkItemsWrite({ apiBase, authHeader, workItemId, fetchImpl = fetch }) {
  if (!apiBase || !authHeader || !workItemId) return { scope: "unverified", status: 0 };
  try {
    const res = await fetchImpl(`${apiBase.replace(/\/$/, "")}/_apis/wit/workitems/${workItemId}?api-version=7.1`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: "{}", // invalid: a JSON-Patch document MUST be an array → 400 when authorized; never mutates
      redirect: "manual",
    });
    return classifyWriteProbe(res.status);
  } catch { return { scope: "unverified", status: -1 }; }
}

/**
 * Non-mutating probe: does the ADO auth carry Code (Git) WRITE scope for `repo`? POSTs an
 * empty body to the repo's /pushes endpoint — 401/403 when Code-write scope is absent,
 * 400/422 when present (the push is rejected for missing refUpdates/commits; nothing is
 * pushed). `repo` is the repo name or id. Never throws. → { scope, status }
 */
export async function probeAdoCodeWrite({ apiBase, authHeader, repo, fetchImpl = fetch }) {
  if (!apiBase || !authHeader || !repo) return { scope: "unverified", status: 0 };
  try {
    const res = await fetchImpl(`${apiBase.replace(/\/$/, "")}/_apis/git/repositories/${encodeURIComponent(repo)}/pushes?api-version=7.1`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}", // invalid push (no refUpdates/commits) → 400 when authorized; never pushes
      redirect: "manual",
    });
    return classifyWriteProbe(res.status);
  } catch { return { scope: "unverified", status: -1 }; }
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
