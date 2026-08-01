#!/usr/bin/env node
/**
 * skills/qa-fix-routing/ado.mjs
 *
 * Thin, dependency-light Azure DevOps REST CLI for the INTERACTIVE bug-lifecycle
 * commands (/qa-fix, /qa-bug, /qa-verify-fix) and /project-init's tracker scan.
 * It exists so the interactive orchestrator never hand-rolls `curl + base64 + python`
 * again — the three grabli that cost time last time:
 *   - encoding: native `fetch().json()/.text()` is UTF-8 (Windows python defaulted to
 *     cp1252 and crashed on ADO's JSON);
 *   - auth: Basic PAT (`:$ADO_PAT`) or an `az login` bearer, mirrored from ado-rest.ts;
 *   - a 302 to the sign-in page (empty/invalid PAT) is detected and reported clearly
 *     instead of surfacing as an opaque JSON-parse error.
 *
 * Reads non-secret connection details (org/project/apiBase/projectId/repoId) from
 * project-profile.json when flags are omitted; secrets come from the env (ADO_PAT),
 * never flags. NEVER prints the token.
 *
 * Usage (org/project default from the profile; --org/--project override):
 *   node ado.mjs get-workitem   --id 967
 *   node ado.mjs comment        --id 967 --text-file body.txt   # or --text "..."
 *   node ado.mjs transition     --id 967 --state Active
 *   node ado.mjs list-types                                     # work item type names
 *   node ado.mjs list-states    --type Bug                      # states for a type
 *   node ado.mjs create-workitem --type Bug --title "..." --description-file body.md \
 *                               [--repro-file steps.md] [--severity "2 - High"] [--priority 2] \
 *                               [--tags "qa-autofix,frontend"] \
 *                               [--system-info-file sysinfo.html] \
 *                               [--field "<ref-from-the-contract>=<value>" …] \
 *                               [--assign-self] [--iteration current] [--parent 940]   # returns { id, url }
 *     --system-info(-file) → Microsoft.VSTS.TCM.SystemInfo (the "System Info" block: environment,
 *       build, browser, repro-rate — NOT a section inside the Description). HTML, like Description.
 *     --field "Ref.Path=value" (repeatable) → sets any work-item field, incl. this deployment's
 *       own custom Bug picklists. The refs are DISCOVERED, never hardcoded: they come from
 *       project-profile.json `tracker.fields.<Type>[]` (see bug-contract.mjs). A field this
 *       organization does not have is dropped, and a picklist value outside the discovered
 *       `allowedValues` is refused BEFORE the POST.
 *     --no-preflight → skip only the non-mutating write-scope probe (file/contract checks stay).
 *     --no-verify    → skip the post-create read-back (not recommended; a 200 is not proof).
 *     --assign-self → assign to the token/session owner (whoami); --assign-to <email> for explicit.
 *     --iteration current → stamp the team's active sprint (System.IterationPath); or pass a path.
 *     --parent <id> → link the bug under a parent work item (Hierarchy-Reverse relation).
 *   node ado.mjs whoami                                          # token owner { name, mail }
 *   node ado.mjs current-iteration [--team "<team>"]            # active sprint { id, name, path }
 *   node ado.mjs list-refs      --repo frontend [--filter heads/]
 *   node ado.mjs get-file       --repo frontend --path client-app/x.vue --branch dev
 *   node ado.mjs create-pr      --repo frontend --source refs/heads/claude/qa-autofix/967 \
 *                               --target refs/heads/dev --title "fix(AB#967): ..." \
 *                               --description-file pr.md [--work-item 967] [--draft]
 *   node ado.mjs list-policies  --repo frontend --pr 1200
 *
 * Exit non-zero on any HTTP >=400 or an auth redirect. `--json` prints the raw body.
 */
import { readFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import { loadLayeredEnv } from "../../scripts/lib/load-layered-env.mjs";
// The per-ORGANIZATION bug field contract (VCST-5582 E) — discovery lives in
// /project-init's discover-tracker.mjs; the pure contract logic is shared here so the scan
// and the payload builder can never disagree. See bug-contract.mjs's header.
import {
  resolveSlots, buildContractFields, verifyAgainstContract, renderVerifyTable,
  classifyFieldRejection, isHtmlByContract,
} from "./bug-contract.mjs";
// Non-mutating ADO write-scope probe, reused from /project-init's readiness table so
// "your PAT is read-only" is told ONCE, up front, in the same words on both surfaces.
import { discoverAdoWorkItemId, probeAdoWorkItemsWrite } from "../project-init/probe-lib.mjs";
// Azure HTML conversion + the Bug JSON-Patch builder live in a shared module so the CLI here
// and the TS tracker (trackers/azure-tracker.ts) can't drift. ensureAzureHtml/mdToHtml are
// re-exported below for the unit test that imports them from this file.
import { ensureAzureHtml, mdToHtml, buildBugFields } from "./ado-html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve per-env credentials (ADO_PAT, ADO_AUTH, …) from .env.defaults → .env.${TEST_ENV}
// → .env.local, mirroring verify-access.mjs / discover-tracker.mjs / derive-context.mjs, so
// `TEST_ENV=<env> node ado.mjs …` works standalone without the caller pre-sourcing the shell.
// Loaded relative to cwd (the project root) with the repo-wide layering precedence — .env.local
// OVERRIDES (dotenv override:true), same as the sibling scripts, so a stale exported value does
// not win over the project's .env.local. Guarded/non-fatal: only if the load itself throws (no
// env files, or an unexpected cwd) is the already-exported process env used unchanged.
try {
  loadLayeredEnv("vcst");
} catch {
  /* non-fatal — fall back to the ambient process env */
}

// ---- profile (defaults for org/project/apiBase/projectId/repoId) --------------------
// cwd-drift-proof: honor PROJECT_PROFILE_PATH, else search cwd AND walk up parent dirs
// (so `create-pr` invoked from inside .fix-workspace/<repo> still finds the project profile
// at the project root — the "no org/project" grabli from the run's create-pr cwd-drift).
function loadProfile() {
  const candidates = [];
  if (process.env.PROJECT_PROFILE_PATH) candidates.push(process.env.PROJECT_PROFILE_PATH);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    candidates.push(join(dir, "project-profile.json"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const path of candidates) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      delete raw._meta;
      return raw;
    } catch {
      /* try next */
    }
  }
  return {};
}
const PROFILE = loadProfile();
// Two DISTINCT axes, not one merged object: tracker.azure (Boards — org/project/apiBase
// scanned by discover-tracker.mjs, plus projectId/workItemTypes/roleStates that ONLY ever
// live here) vs vcs.azure (Repos — org/project/apiBase for the client's code host). A
// deployment can legitimately point Boards and Repos at different orgs/projects, and even
// when they're the same org/project, only tracker.azure ever carries projectId — so a
// single `vcs.azure || tracker.azure` object-level fallback (the pre-fix behavior) silently
// hid tracker.azure's fields (projectId, apiBase, workItemTypes, roleStates) the instant
// vcs.azure was non-empty, which is exactly the case for the Azure Boards + Azure Repos
// deployment this CLI targets. Each axis falls back to the OTHER axis's org/project only
// (never its tracker-only-fields) for the common single-org/project setup.
const TRACKER_AZ = (PROFILE.tracker && PROFILE.tracker.azure) || {};
const VCS_AZ = (PROFILE.vcs && PROFILE.vcs.azure) || {};

/** Boards (work-item) ops: get-workitem, comment, transition, list-types, list-states. */
function trackerAZ() {
  return {
    organization: TRACKER_AZ.organization || VCS_AZ.organization,
    project: TRACKER_AZ.project || VCS_AZ.project,
    apiBase: TRACKER_AZ.apiBase,
    projectId: TRACKER_AZ.projectId || VCS_AZ.projectId,
  };
}

/** Repos (git/PR) ops: list-refs, get-file, create-pr, list-policies. */
function vcsAZ() {
  return {
    organization: VCS_AZ.organization || TRACKER_AZ.organization,
    project: VCS_AZ.project || TRACKER_AZ.project,
    apiBase: VCS_AZ.apiBase || TRACKER_AZ.apiBase,
    // projectId is only ever scanned onto tracker.azure today (discover-tracker.mjs is a
    // Boards-only scan) — fall back to it for the common same-org/project deployment.
    projectId: VCS_AZ.projectId || TRACKER_AZ.projectId,
  };
}

// ---- args ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      // `--field` is repeatable (one per work-item field) → collect into an array.
      if (key === "field") (args.field ??= []).push(next);
      else args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(msg, code = 1) {
  console.error(`[ado] ${msg}`);
  process.exit(code);
}

// ---- auth (PAT Basic, or az-login bearer — mirrors ado-rest.ts) ----------------------
const ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
let _bearer = null;
async function authHeader() {
  const pat = process.env.ADO_PAT || "";
  const mode = (process.env.ADO_AUTH || (pat ? "pat" : "az-login")).toLowerCase();
  if (mode !== "az-login" && pat) {
    return "Basic " + Buffer.from(`:${pat}`).toString("base64");
  }
  const now = Date.now();
  if (_bearer && _bearer.exp - now > 60_000) return `Bearer ${_bearer.token}`;
  let AzureCliCredential;
  try {
    ({ AzureCliCredential } = await import("@azure/identity"));
  } catch {
    fail("Azure DevOps auth unavailable: set ADO_PAT (recommended) or install @azure/identity and run `az login`.");
  }
  const tok = await new AzureCliCredential().getToken(ADO_RESOURCE);
  if (!tok?.token) fail("Azure DevOps auth unavailable: set ADO_PAT, or run `az login` and set ADO_AUTH=az-login.");
  _bearer = { token: tok.token, exp: tok.expiresOnTimestamp };
  return `Bearer ${tok.token}`;
}

// ---- base URL -----------------------------------------------------------------------
/** axis: "tracker" (Boards work-item ops) | "vcs" (Repos git/PR ops). */
function base(args, axis = "vcs") {
  if (args["api-base"]) return String(args["api-base"]).replace(/\/$/, "");
  const AZ = axis === "tracker" ? trackerAZ() : vcsAZ();
  const org = args.org || AZ.organization;
  const project = args.project || AZ.project;
  if (AZ.apiBase && !args.org && !args.project) return String(AZ.apiBase).replace(/\/$/, "");
  if (!org || !project) fail("no org/project — pass --org/--project or set tracker/vcs.azure in project-profile.json");
  return `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
}

/**
 * Org-level base (`https://dev.azure.com/<org>`) — for org-scoped endpoints (connectionData)
 * and work-item relation URLs, which are org-scoped, not project-scoped. Derives the org from
 * --org / the tracker profile, else strips the trailing `/<project>` off the project base.
 */
function orgUrl(args) {
  const org = args.org || trackerAZ().organization;
  if (org) return `https://dev.azure.com/${org}`;
  return base(args, "tracker").replace(/\/[^/]+$/, "");
}

// ---- fetch wrapper ------------------------------------------------------------------
// Transient ADO failures worth a bounded retry: a network throw, a 429 throttle, or a gateway
// 5xx (502/503/504 are common on dev.azure.com under load). A single fetch with ZERO backoff
// turned an intermittent 504 into a hard command failure — so retry a few times with exponential
// backoff before surfacing it. A 4xx other than 429 is a caller error and is NEVER retried.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchRetry(url, opts, { attempts = 3, baseMs = 250 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (RETRY_STATUS.has(res.status) && attempt < attempts) {
        await sleep(baseMs * 2 ** (attempt - 1)); // 250ms, 500ms
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e; // network-level failure (DNS, ECONNRESET, socket timeout)
      if (attempt >= attempts) throw e;
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

async function call(method, url, { body, contentType } = {}) {
  const headers = { Authorization: await authHeader(), Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = contentType || "application/json";
  const res = await fetchRetry(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    fail(`HTTP ${res.status} redirect to sign-in for ${method} ${url}\n      => ADO auth not accepted. Is ADO_PAT loaded (absolute path to .env.local) and non-empty/valid?`);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (res.ok) return { _raw: text };
    fail(`HTTP ${res.status} non-JSON for ${method} ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const m = data?.message || data?.value?.Message || JSON.stringify(data).slice(0, 300);
    fail(`HTTP ${res.status} for ${method} ${url}: ${m}`);
  }
  return data;
}

const V = "api-version=7.1";
const enc = encodeURIComponent;

/**
 * Like `call`, but RETURNS the failure instead of exiting — the single-retry self-heal
 * (VCST-5582 E-f) has to read the server's rejection to decide what to fix.
 */
async function callSoft(method, url, { body, contentType } = {}) {
  const headers = { Authorization: await authHeader(), Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = contentType || "application/json";
  try {
    const res = await fetchRetry(url, {
      method, headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      redirect: "manual",
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw: text }; }
    if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, message: "sign-in redirect — ADO auth not accepted", data };
    if (!res.ok) return { ok: false, status: res.status, message: data?.message || data?.value?.Message || String(text).slice(0, 300), data };
    return { ok: true, status: res.status, message: "", data };
  } catch (e) {
    return { ok: false, status: 0, message: e?.message || String(e), data: {} };
  }
}

// ─── the bug field contract (VCST-5582 E) ─────────────────────────────────────────────
/**
 * Where a `--*-file` path resolves from. `VC_FIX_HOME || cwd`, symmetric with the rest of the
 * plugin (skills/project-init/lib/paths.mjs `outputRoot()`), NOT bare cwd. The OPUS run died on
 * a raw `ENOENT … readFileUtf8` Node stack because `resolve(path)` used the process cwd, which
 * is not necessarily the project the report was written into.
 */
function inputRoot() {
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}
function resolveInput(p) {
  const s = String(p || "");
  return isAbsolute(s) ? s : resolve(inputRoot(), s);
}

/** The discovered contract for a work-item type, or [] when none was scanned. */
function contractFor(type) {
  const all = (PROFILE.tracker && PROFILE.tracker.fields) || {};
  const want = String(type || "").toLowerCase();
  for (const [k, v] of Object.entries(all)) if (k.toLowerCase() === want && Array.isArray(v)) return v;
  return [];
}


// ---- commands -----------------------------------------------------------------------
const COMMANDS = {
  async "get-workitem"(args) {
    if (!args.id) fail("--id required");
    const d = await call("GET", `${base(args, "tracker")}/_apis/wit/workitems/${args.id}?$expand=all&${V}`);
    if (args.json) return d;
    const f = d.fields || {};
    const g = (k) => (f[k] && f[k].displayName ? f[k].displayName : f[k]);
    return {
      id: d.id,
      type: g("System.WorkItemType"),
      title: g("System.Title"),
      state: g("System.State"),
      tags: g("System.Tags"),
      areaPath: g("System.AreaPath"),
      severity: g("Microsoft.VSTS.Common.Severity"),
      priority: g("Microsoft.VSTS.Common.Priority"),
      assignedTo: g("System.AssignedTo"),
      description: stripHtml(g("System.Description")),
      reproSteps: stripHtml(g("Microsoft.VSTS.TCM.ReproSteps")),
      relations: (d.relations || []).map((r) => ({ rel: r.rel, url: r.url })),
    };
  },

  async comment(args) {
    if (!args.id) fail("--id required");
    const text = args["text-file"] ? readFileSync(resolve(args["text-file"]), "utf-8") : args.text;
    if (!text) fail("--text or --text-file required");
    // Comments are an HTML field — convert Markdown so it doesn't render as a single
    // unreadable blob. Pass `--raw` to skip the guard (already-HTML author content is
    // detected and passed through automatically either way).
    const body = args.raw ? String(text) : ensureAzureHtml(text);
    const d = await call(
      "POST",
      `${base(args, "tracker")}/_apis/wit/workItems/${args.id}/comments?api-version=7.0-preview.3`,
      { body: { text: body } },
    );
    return { id: d.id, ok: true };
  },

  async transition(args) {
    if (!args.id || !args.state) fail("--id and --state required");
    const d = await call(
      "PATCH",
      `${base(args, "tracker")}/_apis/wit/workitems/${args.id}?${V}`,
      {
        body: [{ op: "add", path: "/fields/System.State", value: String(args.state) }],
        contentType: "application/json-patch+json",
      },
    );
    return { id: d.id, state: d.fields?.["System.State"] };
  },

  async "list-types"(args) {
    const d = await call("GET", `${base(args, "tracker")}/_apis/wit/workitemtypes?${V}`);
    return (d.value || []).map((t) => t.name);
  },

  async "list-states"(args) {
    if (!args.type) fail("--type required");
    const d = await call("GET", `${base(args, "tracker")}/_apis/wit/workitemtypes/${enc(args.type)}/states?${V}`);
    return (d.value || []).map((s) => ({ name: s.name, category: s.category }));
  },

  // Identity of the token/session owner — org-scoped connectionData. Used to auto-assign a
  // created bug back to its creator (create-workitem --assign-self). `mail` is the value ADO
  // resolves for System.AssignedTo; `name` is the display name for a preview.
  async whoami(args) {
    // connectionData is a preview API — it rejects the plain "7.1" the other ops use.
    const d = await call("GET", `${orgUrl(args)}/_apis/connectionData?api-version=7.1-preview`);
    const u = d.authenticatedUser || {};
    const mail = u.properties?.Account?.$value || null;
    return { id: u.id || null, name: u.providerDisplayName || null, uniqueName: mail || u.subjectDescriptor || null, mail };
  },

  // The team's CURRENT sprint (iteration) — for stamping System.IterationPath on a new bug so
  // it lands in the active sprint, not the backlog. Team from --team or tracker.azure.team;
  // omitted ⇒ the project's default team.
  async "current-iteration"(args) {
    const team = (typeof args.team === "string" ? args.team : "") || TRACKER_AZ.team || "";
    const teamSeg = team ? `/${enc(team)}` : "";
    const d = await call("GET", `${base(args, "tracker")}${teamSeg}/_apis/work/teamsettings/iterations?$timeframe=current&${V}`);
    const it = (d.value || [])[0];
    return it ? { id: it.id, name: it.name, path: it.path } : null;
  },

  // The Bug JSON-Patch body is built by the SHARED buildBugFields (ado-html.mjs), the same
  // builder AzureTracker.createWorkItem uses — so the field list can't drift between the CLI
  // and the TS tracker. This command only resolves the CLI-only conveniences (reading
  // --*-file bodies, --assign-self via whoami, --iteration current) into concrete values first.
  async "create-workitem"(args) {
    // `str()` guards every optional flag against parseArgs's boolean-`true` coercion
    // (a flag with no following value, or immediately followed by another `--flag`,
    // parses to `true` rather than a string). Without this, e.g. `--title` swallowed
    // by an adjacent flag would pass the truthy required-field check below and get
    // written to ADO as the literal string "true".
    const str = (v) => (typeof v === "string" ? v : "");
    for (const k of ["type", "title"])
      if (!str(args[k])) fail(`--${k} required (with a value)`);
    // ─── PRE-FLIGHT — ONE message, every problem at once (VCST-5582 E-d) ──────────────
    // The old code checked failure causes SEQUENTIALLY — three `readFileSync(resolve(…))`
    // calls (cwd-relative, no existence check → a raw Node ENOENT stack, not a fail()),
    // then `whoami` for --assign-self, then `current-iteration` for --iteration. Each one
    // crashed separately and cost a full agent turn. Now everything that can be known before
    // the POST is resolved first, and a failure reports EVERY problem together with each
    // missing path shown ABSOLUTE and the exact PAT scope to grant.
    const problems = [];
    const readInput = (flag, inlineFlag) => {
      const p = str(args[flag]);
      if (!p) return str(args[inlineFlag]);
      const abs = resolveInput(p);
      if (!existsSync(abs)) {
        problems.push(`--${flag} "${p}" not found — resolved to ${abs} (relative paths resolve against VC_FIX_HOME || cwd = ${inputRoot()})`);
        return "";
      }
      try {
        if (statSync(abs).isDirectory()) { problems.push(`--${flag} "${p}" is a directory, not a file (${abs})`); return ""; }
        return readFileSync(abs, "utf-8");
      } catch (e) {
        problems.push(`--${flag} "${p}" could not be read (${abs}): ${e.message}`);
        return "";
      }
    };
    const description = readInput("description-file", "description");
    const repro = readInput("repro-file", "repro");
    const systemInfo = readInput("system-info-file", "system-info");
    // Parse repeatable `--field "Ref.Path=value"` into an object (CLI-specific validation), e.g.
    //   --field "Custom.Environment=QA" --field "Custom.Reportedby=QA team".
    const customFields = {};
    for (const spec of Array.isArray(args.field) ? args.field : str(args.field) ? [str(args.field)] : []) {
      const eq = String(spec).indexOf("=");
      if (eq < 0) fail(`--field must be "Field.Ref=value" (got "${spec}")`);
      const path = String(spec).slice(0, eq).trim();
      if (!path) fail(`--field has an empty field ref (got "${spec}")`);
      customFields[path] = String(spec).slice(eq + 1);
    }
    // Attachment inputs are URLs (already uploaded), not files — but a caller that passes a
    // local path by mistake must hear about it HERE, not as an opaque relation error.
    for (const a of str(args.attachments) ? str(args.attachments).split(",").map((s) => s.trim()).filter(Boolean) : []) {
      if (!/^https?:\/\//i.test(a)) problems.push(`--attachments entry "${a}" is not a URL — upload it first (\`ado.mjs upload-attachment --file <png>\`) and pass the returned url`);
    }

    // Identity + iteration, resolved together so BOTH failures surface in the same message.
    let assignedTo = str(args["assign-to"]);
    if (!assignedTo && args["assign-self"]) {
      const me = await callSoft("GET", `${orgUrl(args)}/_apis/connectionData?api-version=7.1-preview`);
      if (!me.ok) problems.push(`--assign-self: identity lookup failed (HTTP ${me.status || "network"}) — ${me.message || "connectionData unreachable"}`);
      else {
        const u = me.data.authenticatedUser || {};
        assignedTo = u.properties?.Account?.$value || u.subjectDescriptor || "";
        if (!assignedTo) problems.push("--assign-self: could not resolve the token owner identity (connectionData returned none) — pass --assign-to <email>");
      }
    }
    let iterationPath = str(args.iteration);
    if (iterationPath && /^current$/i.test(iterationPath)) {
      const team = (typeof args.team === "string" ? args.team : "") || TRACKER_AZ.team || "";
      const teamSeg = team ? `/${enc(team)}` : "";
      const r = await callSoft("GET", `${base(args, "tracker")}${teamSeg}/_apis/work/teamsettings/iterations?$timeframe=current&${V}`);
      const it = r.ok ? (r.data.value || [])[0] : null;
      if (!it?.path) problems.push(`--iteration current: no current sprint resolved for team "${team || "(project default)"}" — pass --team, set tracker.azure.team, or give an explicit --iteration <path>`);
      else iterationPath = it.path;
    }

    // Write-scope probe — non-mutating (a deliberately invalid PATCH: ADO answers 401 when the
    // scope is MISSING, 400/409/422 when it is present and only the body was rejected). This is
    // the difference between "your PAT is read-only" told up front and a 401 after the report is
    // already written. Skippable with --no-preflight for a scripted retry.
    if (!args["no-preflight"]) {
      const apiBase = base(args, "tracker");
      const hdr = await authHeader();
      const probeId = await discoverAdoWorkItemId({ apiBase, authHeader: hdr });
      if (probeId) {
        const { scope } = await probeAdoWorkItemsWrite({ apiBase, authHeader: hdr, workItemId: probeId });
        if (scope === "absent") {
          problems.push('the ADO credential has NO Work Items WRITE scope — grant "Work Items: Read, write, & manage" on the PAT (dev.azure.com → User settings → Personal access tokens), or `az login` as an identity that has it');
        }
        // "restricted" (an ACL-403 on the probed item) and "unverified" are inconclusive — a
        // correctly-scoped PAT must not be blocked by a probe that hit a locked Area Path.
      }
    }

    if (problems.length) {
      fail(
        `create-workitem pre-flight failed — NOTHING was created. Fix all ${problems.length} problem(s) and re-run:\n` +
          problems.map((p, i) => `      ${i + 1}. ${p}`).join("\n") +
          "\n      (Do NOT retry with fewer fields — that is how a work item ends up created with its fields unset.)",
        2,
      );
    }

    // ─── CONTRACT-DRIVEN payload (VCST-5582 E-c) ──────────────────────────────────────
    // Send only fields THIS organization actually has; validate every picklist value against
    // the discovered allowedValues BEFORE the POST; let a contract-required field with no value
    // block the request rather than create a half-filled item. With no contract (metadata
    // unreachable / a Jira deployment / an un-scanned profile) this is a NO-OP and the legacy
    // field set is sent unchanged, labelled "unverified defaults" (the E-f ladder's last rung).
    const contract = contractFor(args.type);
    const fieldMap = (PROFILE.tracker && PROFILE.tracker.fieldMap) || {};
    const fieldDefaults = (PROFILE.tracker && PROFILE.tracker.fieldDefaults) || {};
    let contractNote = "unverified defaults (no field contract in the profile — run /project-init to scan it)";
    let mapping = {};
    let dropped = [];
    if (contract.length) {
      const slots = resolveSlots(contract, fieldMap);
      mapping = slots.mapping;
      // The slots buildBugFields emits through its OWN dedicated ops — declared here so the
      // required sweep counts them as filled instead of blocking the POST on a field we are
      // very much sending (and so we don't emit a duplicate JSON-Patch op for it).
      const selfEmitted = {
        title: str(args.title), body: description, repro, systemInfo,
        tags: str(args.tags), assignee: assignedTo, sprint: iterationPath,
      };
      const satisfiedRefs = Object.entries(selfEmitted)
        .filter(([slot, v]) => v && mapping[slot])
        .map(([slot]) => mapping[slot]);
      const built = buildContractFields(
        contract,
        mapping,
        {
          severity: str(args.severity),
          priority: args.priority !== undefined && args.priority !== true ? String(args.priority) : undefined,
        },
        { ...fieldDefaults, ...customFields },
        satisfiedRefs,
      );
      if (built.errors.length) {
        fail(
          `create-workitem: ${built.errors.length} value(s) rejected by the ${args.type} field contract — NOTHING was created:\n` +
            built.errors.map((e, i) => `      ${i + 1}. ${e}`).join("\n"),
          2,
        );
      }
      if (built.missingRequired.length) {
        fail(
          `create-workitem: ${built.missingRequired.length} REQUIRED ${args.type} field(s) have no value and no default — NOTHING was created:\n` +
            built.missingRequired
              .map((f, i) => `      ${i + 1}. ${f.name} (${f.ref})${f.allowedValues?.length ? ` — allowed: ${f.allowedValues.join(", ")}` : ""}`)
              .join("\n") +
            "\n      Ask the operator once, then persist the answer to tracker.fieldMap / tracker.fieldDefaults so it is never asked again.\n" +
            "      (A required field is NEVER dropped to make the request go through.)",
          2,
        );
      }
      dropped = built.dropped;
      // Replace the caller's raw --field set with the validated, contract-checked one.
      for (const k of Object.keys(customFields)) delete customFields[k];
      Object.assign(customFields, built.fields);
      // Severity/priority now travel as contract fields; don't ALSO send them via the legacy
      // canonical refs, which would duplicate the op (and could target a ref this org lacks).
      contractNote = `contract-driven (${contract.length} field(s), ${contract.filter((f) => f.required).length} required)`;
    }
    const useContract = contract.length > 0;

    const fields = buildBugFields({
      title: str(args.title),
      description,
      reproSteps: repro,
      severity: useContract ? "" : str(args.severity),
      priority: useContract ? undefined : (args.priority !== undefined && args.priority !== true ? args.priority : undefined),
      tags: str(args.tags),
      systemInfo,
      fields: customFields,
      attachments: str(args.attachments),
      assignedTo,
      iterationPath,
      parentId: str(args.parent),
      orgUrl: orgUrl(args),
      raw: !!args.raw,
      // The field TYPE makes the HTML decision DERIVED rather than asserted (E-a): `html` ⇒
      // HTML body, `plainText` ⇒ text. Absent contract ⇒ null ⇒ the legacy known-refs set.
      isHtmlRef: useContract ? (ref) => isHtmlByContract(contract, ref) : null,
    });
    // The leading `$` before the type is literal + required by the ADO create endpoint.
    // Reuse the SAME resolved base for both the create call and the returned URL — building
    // the URL from a separately-recomputed org/project (as opposed to the apiBase actually
    // used above) risks a stale/mismatched link if tracker.azure.apiBase and
    // tracker.azure.organization/project ever drift (they're written independently by
    // gen-profile.mjs).
    const apiUrl = base(args, "tracker");
    const createUrl = `${apiUrl}/_apis/wit/workitems/$${enc(args.type)}?${V}`;
    let res = await callSoft("POST", createUrl, { body: fields, contentType: "application/json-patch+json" });

    // ─── SELF-HEAL, exactly ONCE (VCST-5582 E-f) ──────────────────────────────────────
    // The server is the final authority: `alwaysRequired` covers process-level requiredness
    // but NOT conditional form rules ("required when State = X"), so a contract-clean payload
    // can still be rejected. Parse WHICH field the rejection is about and drop/keep precisely
    // that one — a REQUIRED field is never dropped (STOP + ask instead), and we never retry by
    // shrinking the payload blindly, which is how the OPUS bug ended up with empty fields.
    let healed = null;
    if (!res.ok && res.status >= 400 && res.status < 500) {
      const r = classifyFieldRejection(res.message, contract);
      if (r.droppable && r.ref) {
        const before = fields.length;
        const retryFields = fields.filter((op) => op.path !== `/fields/${r.ref}`);
        if (retryFields.length < before) {
          healed = { ref: r.ref, name: r.name, reason: r.reason };
          res = await callSoft("POST", createUrl, { body: retryFields, contentType: "application/json-patch+json" });
        }
      }
      if (!res.ok) {
        fail(
          `create-workitem: Azure rejected the payload (HTTP ${res.status}) — ${res.message}\n` +
            (r.ref ? `      Field: ${r.name} (${r.ref}) · reason: ${r.reason} · required: ${r.required ? "YES — cannot be dropped, ask the operator for a value" : "no"}\n` : "") +
            "      Fix the INPUT and re-run. Do NOT retry with fields removed.",
          2,
        );
      }
    } else if (!res.ok) {
      fail(`create-workitem: HTTP ${res.status} for POST ${createUrl}: ${res.message}`, 1);
    }
    const d = res.data;

    // ─── READ BACK AND VERIFY (VCST-5582 E-e) ─────────────────────────────────────────
    // A 200 means "an item was created", NOT "the fields are populated". Re-read the item and
    // check every contract-required field and every mapped slot; PATCH the gaps ONCE, re-verify,
    // and report honestly if anything is still missing. The caller renders `verifyTable`.
    const sentByRef = {};
    for (const op of fields) {
      const m = /^\/fields\/(.+)$/.exec(op.path || "");
      if (m) sentByRef[m[1]] = op.value;
    }
    let verify = null;
    let patched = [];
    if (!args["no-verify"]) {
      const read = await callSoft("GET", `${apiUrl}/_apis/wit/workitems/${d.id}?$expand=all&${V}`);
      if (read.ok) {
        verify = verifyAgainstContract(contract, mapping, read.data.fields || {}, sentByRef);
        // ONE repair pass: re-send only the values we HAD for the fields that came back empty.
        const repairable = verify.missing.filter((r) => sentByRef[r.ref] !== undefined && sentByRef[r.ref] !== "");
        if (repairable.length) {
          const patch = repairable.map((r) => ({ op: "add", path: `/fields/${r.ref}`, value: sentByRef[r.ref] }));
          const p = await callSoft("PATCH", `${apiUrl}/_apis/wit/workitems/${d.id}?${V}`, { body: patch, contentType: "application/json-patch+json" });
          patched = repairable.map((r) => r.ref);
          const re = p.ok ? p : await callSoft("GET", `${apiUrl}/_apis/wit/workitems/${d.id}?$expand=all&${V}`);
          if (re.ok) verify = verifyAgainstContract(contract, mapping, re.data.fields || {}, sentByRef);
        }
      }
    }

    return {
      id: d.id,
      type: d.fields?.["System.WorkItemType"],
      title: d.fields?.["System.Title"],
      state: d.fields?.["System.State"],
      url: `${apiUrl}/_workitems/edit/${d.id}`,
      // Everything below is the E-c/E-e/E-f evidence the caller MUST show the operator —
      // the ticket key alone was never proof the bug is filled in.
      contract: contractNote,
      ...(dropped.length ? { droppedFields: dropped } : {}),
      ...(healed ? { selfHealed: healed } : {}),
      ...(verify ? { fieldsOk: verify.ok, verifyTable: renderVerifyTable(verify.rows), stillMissing: verify.missing.map((r) => r.ref) } : {}),
      ...(patched.length ? { patchedAfterCreate: patched } : {}),
    };
  },

  // Upload a file (screenshot, HAR, GQL log) to ADO and return its attachment URL. Embed the
  // URL inline in a Description/comment (`<img src=...>`) and/or pass it to create-workitem's
  // `--attachments` to also link it in the Attachments tab. Binary body — direct fetch (the
  // shared `call` helper JSON-encodes non-string bodies), like get-file.
  async "upload-attachment"(args) {
    const file = args.file;
    if (typeof file !== "string" || !file) fail("--file <path> required");
    const p = resolve(file);
    const buf = readFileSync(p);
    const name = typeof args.name === "string" && args.name ? args.name : basename(p);
    const url = `${base(args, "tracker")}/_apis/wit/attachments?fileName=${enc(name)}&${V}`;
    const headers = {
      Authorization: await authHeader(),
      Accept: "application/json",
      "Content-Type": "application/octet-stream",
    };
    const res = await fetch(url, { method: "POST", headers, body: buf, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      fail(`HTTP ${res.status} sign-in redirect on upload-attachment — ADO_PAT not accepted.`);
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      fail(`HTTP ${res.status} non-JSON on upload-attachment: ${text.slice(0, 200)}`);
    }
    if (!res.ok) fail(`HTTP ${res.status} on upload-attachment: ${data?.message || text.slice(0, 200)}`);
    return { id: data.id, url: data.url, name };
  },

  async "list-refs"(args) {
    if (!args.repo) fail("--repo required");
    const filter = args.filter ? `filter=${enc(args.filter)}&` : "";
    const d = await call("GET", `${base(args, "vcs")}/_apis/git/repositories/${enc(args.repo)}/refs?${filter}${V}&$top=500`);
    return (d.value || []).map((r) => r.name.replace("refs/heads/", ""));
  },

  async "get-file"(args) {
    if (!args.repo || !args.path) fail("--repo and --path required");
    // ADO item paths are repo-RELATIVE (`client-app/x.vue` or `/client-app/x.vue`). On Git Bash /
    // MSYS, a leading-slash arg is silently rewritten into a Windows path — `--path /client-app/x.vue`
    // arrives here as `C:/Program Files/Git/client-app/x.vue`. Forwarding that to ADO 404s opaquely,
    // so detect the drive-letter/Git-install mangle and tell the caller how to stop it.
    if (/^[A-Za-z]:[\\/]/.test(args.path) || /[\\/](?:Program Files[\\/]Git|mingw\d*|usr[\\/]bin)[\\/]/i.test(args.path)) {
      fail(
        `--path looks MSYS-mangled (a leading '/' was rewritten to a Windows path): ${args.path}\n` +
        "      ADO item paths are repo-relative. Re-run with MSYS_NO_PATHCONV=1 (e.g.\n" +
        "      `MSYS_NO_PATHCONV=1 node ado.mjs get-file --repo <r> --path /client-app/x.vue ...`),\n" +
        "      or drop the leading slash (`--path client-app/x.vue`)."
      );
    }
    const b = args.branch || "";
    const q = b
      ? `&versionDescriptor.version=${enc(b)}&versionDescriptor.versionType=branch`
      : "";
    const url = `${base(args, "vcs")}/_apis/git/repositories/${enc(args.repo)}/items?path=${enc(args.path)}${q}&${V}&$format=text&includeContent=true`;
    // items endpoint returns raw text with $format=text
    const headers = { Authorization: await authHeader() };
    const res = await fetch(url, { headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) fail(`HTTP ${res.status} sign-in redirect — ADO_PAT not accepted.`);
    const text = await res.text();
    if (!res.ok) fail(`HTTP ${res.status} for get-file: ${text.slice(0, 200)}`);
    return { _raw: text };
  },

  async "create-pr"(args) {
    for (const k of ["repo", "source", "target", "title"]) if (!args[k]) fail(`--${k} required`);
    const description = args["description-file"]
      ? readFileSync(resolve(args["description-file"]), "utf-8")
      : args.description || "";
    const body = {
      sourceRefName: args.source.startsWith("refs/") ? args.source : `refs/heads/${args.source}`,
      targetRefName: args.target.startsWith("refs/") ? args.target : `refs/heads/${args.target}`,
      title: String(args.title),
      description: String(description),
      isDraft: Boolean(args.draft),
    };
    if (args["work-item"]) body.workItemRefs = [{ id: String(args["work-item"]) }];
    const d = await call(
      "POST",
      `${base(args, "vcs")}/_apis/git/repositories/${enc(args.repo)}/pullrequests?${V}`,
      { body },
    );
    // Labels: ADO PR create ignores a labels body; each is a separate POST (preview api).
    const labels = args.labels ? String(args.labels).split(",").map((s) => s.trim()).filter(Boolean) : [];
    for (const name of labels) {
      await call(
        "POST",
        `${base(args, "vcs")}/_apis/git/repositories/${enc(args.repo)}/pullRequests/${d.pullRequestId}/labels?api-version=7.1-preview.1`,
        { body: { name } },
      );
    }
    const org = args.org || vcsAZ().organization;
    const project = args.project || vcsAZ().project;
    return {
      pullRequestId: d.pullRequestId,
      title: d.title,
      status: d.status,
      isDraft: d.isDraft,
      source: d.sourceRefName,
      target: d.targetRefName,
      createdBy: d.createdBy?.displayName,
      mergeStatus: d.mergeStatus,
      url: `https://dev.azure.com/${org}/${enc(project)}/_git/${enc(args.repo)}/pullrequest/${d.pullRequestId}`,
      workItemRefs: (d.workItemRefs || []).map((w) => w.id),
    };
  },

  async "list-policies"(args) {
    if (!args.repo || !args.pr) fail("--repo and --pr required");
    const projectId = args["project-id"] || vcsAZ().projectId;
    if (!projectId) fail("no projectId — pass --project-id or set tracker.azure.projectId in the profile");
    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${args.pr}`;
    // policy/evaluations is a PREVIEW endpoint — plain 7.1 returns HTTP 400 (observed in the run).
    const d = await call("GET", `${base(args, "vcs")}/_apis/policy/evaluations?artifactId=${enc(artifactId)}&api-version=7.1-preview.1`);
    return (d.value || []).map((e) => ({
      type: e.configuration?.type?.displayName,
      status: e.status,
      isBlocking: e.configuration?.isBlocking,
    }));
  },

  // Code Search over the client's Azure Repos — the RCA step for an azure-repos client repo
  // (ADO has no cross-repo GitHub-style `search_code`; narrow by module then read files).
  //   node ado.mjs search --q "<symbol|error string>" [--repo <name>] [--top 25] [--json]
  async "search"(args) {
    const text = args.q || args.text;
    if (!text) fail("--q <searchText> required (optional: --repo <name> --top <n>)");
    const AZ = vcsAZ();
    const org = args.org || AZ.organization;
    const project = args.project || AZ.project;
    if (!org || !project) fail("search: no org/project — pass --org/--project or set vcs/tracker.azure in project-profile.json");
    // ADO Code Search REST lives on the almsearch.* host (NOT dev.azure.com) and REQUIRES a
    // filters.Project; a filters.Repository sent WITHOUT Project fails with
    //   "Filter [Repository] is found but filter [Project] is not."
    // So Repository (optional repo scoping) is only ever sent PAIRED with Project. Needs the
    // org's "Code Search" extension + ADO_PAT Code(read) scope — a 404 here usually means the
    // extension isn't installed on the org.
    const filters = { Project: [project] };
    if (args.repo) filters.Repository = [String(args.repo)];
    const url = `https://almsearch.dev.azure.com/${org}/${enc(project)}/_apis/search/codesearchresults?${V}`;
    const d = await call("POST", url, { body: { searchText: String(text), $top: Number(args.top) || 25, filters } });
    if (args.json) return d;
    return {
      count: d.count,
      results: (d.results || []).map((r) => ({
        path: r.path,
        repository: r.repository?.name,
        branch: r.versions?.[0]?.branchName,
        matches: (r.matches?.content || []).length,
      })),
    };
  },
};

function stripHtml(s) {
  if (!s || typeof s !== "string") return s || "";
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (!cmd || !COMMANDS[cmd]) {
    fail(`unknown command "${cmd || ""}". Available: ${Object.keys(COMMANDS).join(", ")}`);
  }
  const out = await COMMANDS[cmd](args);
  if (out && out._raw !== undefined) process.stdout.write(out._raw);
  else console.log(JSON.stringify(out, null, 2));
}

// Run as CLI only when invoked directly (`node ado.mjs …`) — guarded so the module can be
// imported (e.g. to unit-test the Markdown->HTML guard) without triggering the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => fail(e?.message || String(e)));
}

export { ensureAzureHtml, mdToHtml };
