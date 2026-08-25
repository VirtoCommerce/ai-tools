#!/usr/bin/env node
/**
 * skills/project-init/gen-mcp.mjs
 *
 * Generate .mcp.json from templates/.mcp.json.example, tailored to:
 *   - the OS (the template is Windows-first `cmd /c npx`; on Linux/macOS we drop
 *     the `cmd /c` and call npx directly — per the note in the template head),
 *   - the chosen tracker/VCS (enable only the relevant servers via
 *     .claude/settings.local.json `enabledMcpjsonServers`),
 *   - available tokens — see "Secrets" below.
 *
 * .mcp.json keeps ALL server definitions (so they're available), but only the
 * enabled subset is listed in settings.local.json.
 *
 * SECRETS — NEVER a literal in .mcp.json (VCST-5774).
 * A resolved credential is written as a `${VAR}` INDIRECTION, and its VALUE goes into
 * .claude/settings.local.json `env`, which Claude Code applies to every session and its
 * subprocesses — that is what feeds `${VAR}` expansion in .mcp.json `headers`/`env`
 * (verified live: an http Bearer header and a stdio env var both resolve). So .mcp.json
 * carries no secret and is safe to read, diff, or share.
 *   - This file used to claim ".mcp.json and settings.local.json — Both files are
 *     gitignored." They were NOT: ensureGitignoreEntries() was called with the two
 *     evidence paths only, so a client project that IS a git repo was one `git add -A`
 *     away from publishing a live PAT. Both are now ignored explicitly (SECRET_IGNORE_BASE
 *     plus the resolved --out/--settings destinations),
 *     written BEFORE .mcp.json so the file never exists un-ignored, even briefly.
 *   - There is NO `gh auth token` fallback. Copying the operator's gh CLI OAuth session
 *     into a file is a credential they never agreed to persist — and it was observed on
 *     disk in two projects (`gho_…`). With no PAT the placeholder stays unresolved and
 *     enableOAuthIfNoPat() drops the header so the server uses interactive OAuth instead.
 *   - `--inline-secrets` restores the legacy literal substitution. Opt-in only, for a
 *     host that cannot apply settings `env`.
 *
 * Usage:
 *   node skills/project-init/gen-mcp.mjs --tracker jira --client-vcs github \
 *     [--with postman,figma,context7,devtools] [--os linux|windows|mac] \
 *     [--out .mcp.json] [--settings .claude/settings.local.json] [--print] \
 *     [--inline-secrets]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, resolve, isAbsolute, relative, sep } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config as dotenv } from "dotenv";
import { outputRoot, pluginRoot, resolveOutPath } from "./lib/paths.mjs";
import { resolveTestEnv } from "../../scripts/lib/resolve-test-env.js";
import { emitObservations } from "./lib/diag-obs.mjs";

// Read the shipped template from the plugin's own dir (works from any cwd); write
// .mcp.json / settings into the deployment project. The two roots are intentionally
// different — that is the fix. The Playwright servers are configured entirely via CLI
// flags in the template (--browser / --isolated / --viewport-size / --output-dir), so
// there are no per-project config files to copy.
const PLUGIN_ROOT = pluginRoot();

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const n = argv[i + 1];
    if (n === undefined || n.startsWith("--")) a[k] = true;
    else { a[k] = n; i++; }
  }
  return a;
}

function detectOs(flag) {
  if (flag) return flag;
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

// #220 — every stdio MCP server launches through `npx`, so each start performs an npm registry
// lookup inside the host's ~30s MCP startup budget. On a host that falls back slowly from a
// broken/unrouted IPv6 address to IPv4, that lookup has hung ~150s (vs ~4s with an IPv4-first
// hint), blowing the budget so ALL stdio servers fail to start and the browser/evidence
// capability is gone. So on every stdio server we (a) set NODE_OPTIONS to make DNS return IPv4
// first — the npx fetch never sits on a dead IPv6 socket — and (b) set npm_config_prefer_offline
// so a pinned+cached package resolves WITHOUT a registry round-trip at all.
//
// We use ONLY `--dns-result-order=ipv4first` (NODE_OPTIONS-allowed since Node 16.4). We do NOT add
// `--no-network-family-autoselection`: that form is newer (absent on the Node-18 floor this plugin
// supports), and an UNKNOWN flag in NODE_OPTIONS is FATAL — Node exits `bad option` before running,
// which would make every stdio server refuse to start, i.e. INVERT this very fix. IPv4-first
// ordering alone fixes the reported broken-IPv6 case: Node connects to the working IPv4 address
// first instead of stalling on the dead IPv6 one.
const IPV4_NODE_OPTIONS = "--dns-result-order=ipv4first";
/**
 * Ensure a stdio (Node-launched) server carries the IPv4-first NODE_OPTIONS + prefer-offline npm
 * config. Pure. An http/sse server (no local process) is untouched; any other env is kept. Our
 * `--dns-result-order=ipv4first` is appended LAST (the last occurrence of a repeated NODE_OPTIONS
 * flag wins) so a conflicting host-set DNS order is overridden rather than silently honoured, and
 * it is not double-appended on a re-run. The flag is NODE_OPTIONS-allowed since Node 16.4, so this
 * never makes a server refuse to start.
 */
export function ensureNodeOptions(server) {
  if (server?.type && server.type !== "stdio") return server; // http/sse: no Node process to hint
  const args = Array.isArray(server?.args) ? server.args : [];
  const isNodeLaunch = server?.command === "npx" || (server?.command === "cmd" && args.includes("npx"));
  if (!isNodeLaunch) return server;
  const prevEnv = server.env || {};
  const prev = prevEnv.NODE_OPTIONS || "";
  const NODE_OPTIONS = prev.includes(IPV4_NODE_OPTIONS) ? prev : prev ? `${prev} ${IPV4_NODE_OPTIONS}` : IPV4_NODE_OPTIONS;
  return { ...server, env: { ...prevEnv, NODE_OPTIONS, npm_config_prefer_offline: "true" } };
}

/** Drop `//` doc-comment keys from a server def so template comments don't leak into runtime .mcp.json. Pure. */
function stripComments(server) {
  if (!server || typeof server !== "object" || Array.isArray(server)) return server;
  const out = {};
  for (const [k, v] of Object.entries(server)) if (!k.startsWith("//")) out[k] = v;
  return out;
}

/**
 * The official REMOTE github MCP supports interactive OAuth exactly like atlassian/figma (which
 * ship header-less). If no PAT resolved, injectTokenRefs leaves the literal `Bearer <PLACEHOLDER>` —
 * a broken header that 401s with NO path to OAuth. So when the Authorization header is still an
 * unresolved placeholder, DROP it: the server then falls back to the OAuth flow (the behaviour the
 * template comment promises). Pure. #220 item 4.
 */
export function enableOAuthIfNoPat(server) {
  const auth = server?.headers?.Authorization;
  if (typeof auth !== "string" || !/<[A-Z0-9_]+>/.test(auth)) return server;
  const headers = { ...server.headers };
  delete headers.Authorization;
  return { ...server, headers };
}

/**
 * Extract the npx PACKAGE SPECS from the generated servers (e.g. `chrome-devtools-mcp@1.6.0`,
 * `@azure/mcp@3.0.0-beta.32`, `@playwright/mcp@0.0.77`). Pure. The first non-flag token after
 * `npx` is the spec; `-y`/`--yes`/`--…` are skipped and non-stdio servers (no npx) are ignored.
 * Used by --warm-cache so the first real MCP start resolves a PINNED spec from cache instead of
 * a registry round-trip (#220 item 5).
 */
export function extractNpxSpecs(servers) {
  const specs = new Set();
  for (const def of Object.values(servers || {})) {
    if (def?.type && def.type !== "stdio") continue;
    const args = Array.isArray(def?.args) ? def.args : [];
    const npxIdx = def?.command === "npx" ? -1 : args.indexOf("npx");
    if (def?.command !== "npx" && npxIdx < 0) continue;
    for (let i = def?.command === "npx" ? 0 : npxIdx + 1; i < args.length; i++) {
      const a = args[i];
      if (typeof a !== "string") continue;
      if (a === "-y" || a === "--yes" || a.startsWith("--")) continue;
      specs.add(a); // first non-flag token after npx is the package spec
      break;
    }
  }
  return [...specs];
}

/**
 * The PINNED @playwright/mcp version from the generated servers (VCST-5702 ITEM 4). Emitted at
 * project-init so a mismatch between the pinned spec and the version actually installed surfaces
 * HERE: on @playwright/mcp 0.0.77 a bare screenshot filename resolves against the MCP server's OWN
 * cwd, NOT the configured absolute --output-dir (VCST-5582 C), so the exact version is load-bearing.
 * Pure. Returns "" when no playwright server is present, "unpinned" when the spec carries no @version.
 */
export function pinnedPlaywrightVersion(servers) {
  for (const spec of extractNpxSpecs(servers)) {
    const m = /^(@playwright\/mcp)(?:@(.+))?$/.exec(spec);
    if (m) return m[2] || "unpinned";
  }
  return "";
}

// A safe npm package-spec charset (scoped names, versions, dist-tags) — NO shell metacharacters.
// warmNpxCache interpolates the spec into a shell `npm cache add`; specs come from the trusted
// pinned template today, but validating here keeps that exec safe by construction.
const NPX_SPEC_RE = /^[@a-zA-Z0-9._/+-]+$/;

/**
 * Best-effort: pre-populate the npm cache for each pinned npx spec so a prefer-offline start
 * resolves it WITHOUT a registry round-trip (#220 item 5). The fetch runs with the SAME IPv4-first
 * NODE_OPTIONS so warming itself can't hang on a broken IPv6 route. The per-spec timeout is aligned
 * to the ~30s MCP startup budget — a fetch that can't beat the budget isn't worth waiting longer
 * for. A spec with unsafe characters is skipped (never shelled out). Fully swallowed per spec —
 * warming NEVER blocks or fails onboarding. Returns [{ spec, ok, ms, skipped? }].
 */
function warmNpxCache(specs, { perSpecTimeoutMs = 30000 } = {}) {
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}${IPV4_NODE_OPTIONS}` };
  const out = [];
  for (const spec of specs) {
    if (!NPX_SPEC_RE.test(spec)) { out.push({ spec, ok: false, ms: 0, skipped: true }); continue; }
    const t0 = process.hrtime.bigint();
    let ok = true;
    try {
      execSync(`npm cache add ${spec}`, { stdio: "ignore", timeout: perSpecTimeoutMs, env });
    } catch {
      ok = false;
    }
    out.push({ spec, ok, ms: Math.round(Number(process.hrtime.bigint() - t0) / 1e6) });
  }
  return out;
}

/**
 * Pure: map warm results → self-diagnostics observations. A warm that FAILED (or was skipped for
 * an unsafe spec) means the generated .mcp.json ships without a warmed cache for that server, so
 * its first start will hit the registry — a `degraded_artifact` on `mcp_config`. A successful warm
 * produces nothing. Kept pure + exported so this telemetry mapping is unit-tested without network.
 */
export function classifyWarmResults(results) {
  return (results || [])
    .filter((r) => !r.ok)
    .map((r) => ({
      class: "degraded_artifact",
      subject: "mcp_config",
      evidence: { snippet: r.skipped ? `npx spec skipped (unsafe): ${r.spec}` : `npx cache warm failed: ${r.spec}` },
    }));
}

/** Windows template uses command:"cmd", args:["/c","npx",...]. On *nix call npx directly. */
function normalizeForOs(server, os) {
  if (os === "windows") return server;
  if (server.command === "cmd" && Array.isArray(server.args) && server.args[0] === "/c") {
    return { ...server, command: server.args[1], args: server.args.slice(2) };
  }
  return server;
}

/**
 * Every credential placeholder the template can carry → the env var names that may supply it,
 * in precedence order. The placeholder's OWN name is the variable the generated `.mcp.json`
 * references and the key written into settings.local.json `env`, so the indirection reads the
 * same on both sides regardless of which alias actually held the value.
 *
 * NB: no `<FIGMA_API_KEY>` — the remote Figma MCP is OAuth-only, so the template carries no
 * figma key placeholder to inject (#220 item 3). And no `gh auth token` fallback for GitHub —
 * see the "SECRETS" note in the file header.
 */
const TOKEN_SOURCES = {
  "<GITHUB_PERSONAL_ACCESS_TOKEN>": ["GITHUB_PERSONAL_ACCESS_TOKEN", "GITHUB_FIX_BUGS_TOKEN", "GIT_TOKEN", "GITHUB_TOKEN"],
  "<POSTMAN_API_KEY>": ["POSTMAN_API_KEY"],
  "<CONTEXT7_API_KEY>": ["CONTEXT7_API_KEY"],
};

/** Which placeholders resolve from `env`, as `{ "<NAME>": { varName, value } }`. Pure.
 *  A placeholder with no value is ABSENT from the result, so it stays `<UNRESOLVED>` in the
 *  generated config and still trips unresolvedPlaceholders() → dormant-extra / OAuth-drop / WARN. */
export function resolveTokens(env = process.env) {
  const out = {};
  for (const [ph, names] of Object.entries(TOKEN_SOURCES)) {
    const value = names.map((n) => env[n]).find((v) => v);
    if (value) out[ph] = { varName: ph.slice(1, -1), value };
  }
  return out;
}

/** Replace every RESOLVED `<PLACEHOLDER>` in a server def with a `${VAR}` indirection. Pure.
 *
 * Substitution fires wherever the placeholder APPEARS, not only when it is the whole string: the
 * Postman MCP's `"Authorization": "Bearer <POSTMAN_API_KEY>"` is an EMBEDDED placeholder, and the
 * old whole-string-keyed lookup never touched it — so `.mcp.json` shipped a literal
 * `Bearer <POSTMAN_API_KEY>` even when the key WAS set, the server 401'd, and the WARN below fired
 * on a key that existed (#174 / `project-init/mcp_config`).
 *
 * `inline: true` (the `--inline-secrets` opt-out) substitutes the VALUE instead of the reference,
 * restoring the pre-VCST-5774 behaviour for a host that cannot apply settings `env`. */
export function injectTokenRefs(server, resolved, { inline = false } = {}) {
  const replace = (v) => {
    if (typeof v !== "string") return v;
    let out = v;
    for (const [ph, { varName, value }] of Object.entries(resolved)) {
      if (out.includes(ph)) out = out.split(ph).join(inline ? value : `\${${varName}}`);
    }
    return out;
  };
  // Substitute at the LEAF. The old shape applied `replace` only to a non-object object-VALUE,
  // so `o.map(walk)` handed each array element back to a branch that returned it untouched — a
  // placeholder inside `args[]` (a CLI-flag credential, e.g. `--api-key <X>`) was never resolved
  // and shipped literal. No template server uses that shape today, which is why it went unseen.
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === "object") {
      const out = {};
      for (const [k, v] of Object.entries(o)) out[k] = walk(v);
      return out;
    }
    return replace(o);
  };
  return walk(server);
}

/** The `<PLACEHOLDER>` names injectTokenRefs() could NOT resolve in a built server def (deduped).
 *
 * Single source of truth for "this server is missing a credential", used by BOTH the enable
 * decision (an optional extra with a missing key stays dormant) and the degraded-artifact WARN
 * below (which now only ever sees servers we actually enabled). Keeping one helper is what stops
 * the two from drifting — the bug it replaced was exactly that divergence: the enable side checked
 * nothing while the warn side checked for placeholders. */
export function unresolvedPlaceholders(server) {
  if (!server) return [];
  return [...new Set(JSON.stringify(server).match(/<[A-Z0-9_]+>/g) || [])];
}

// ─── evidence destination (VCST-5582 C) ──────────────────────────────────────────────
//
// Screenshots taken during a /qa-bug run were landing at the PROJECT ROOT and being moved
// afterwards. Two facts existed but were never connected: the template's `--output-dir` was
// RELATIVE (`test-results/<browser>`, resolved against whatever cwd the MCP server happens to
// start in — the project root, if we're lucky), while `skills/qa-evidence/output-paths.md`
// declared the destination policy `reports/bugs/screenshots/`. Nothing said HOW a screenshot
// gets from one to the other, so the path was guessed.
//
// The fix is to make the DESTINATION DETERMINISTIC rather than hope about cwd: we rewrite
// `--output-dir` to an ABSOLUTE path inside the project's own evidence tree. Whatever cwd the
// MCP server inherits, its default target can no longer be the project root — the strongest
// available guarantee, since playwright-mcp resolves a relative --output-dir against its cwd.
// `_incoming/` is the landing zone; /qa-bug performs ONE deterministic move from there into
// `reports/bugs/screenshots/<bug-slug>/` at its evidence step.
const EVIDENCE_INCOMING = ["reports", "bugs", "screenshots", "_incoming"];
/** Rewrite a Playwright server's relative --output-dir to an absolute path under the project. */
export function absolutizeOutputDir(server, root) {
  const args = server?.args;
  if (!Array.isArray(args)) return server;
  const i = args.indexOf("--output-dir");
  if (i < 0 || i + 1 >= args.length) return server;
  const current = String(args[i + 1] || "");
  if (isAbsolute(current)) return server; // already pinned (a hand-edited template)
  // Keep only the LAST path segment (the browser lane) and re-root it in the evidence tree,
  // so an older template value like `test-results/chrome` is migrated too.
  const lane = current.split(/[/\\]/).filter(Boolean).pop() || "chrome";
  const next = [...args];
  next[i + 1] = join(root, ...EVIDENCE_INCOMING, lane);
  return { ...server, args: next };
}

/** Paths /project-init generates that MUST never be committed (VCST-5774 — defect D2).
 *
 * `.mcp.json` is the load-bearing one: it is a GENERATED file that references a credential, and
 * on a client deployment whose root is a git repo an un-ignored copy is one `git add -A` away
 * from the customer's remote — irreversibly, since git history retains it. The rest are the other
 * per-machine artifacts of onboarding: `.env.local` + `.env.*.local` (secrets), the deployment
 * profile, the telemetry dir, and the local settings file that now holds the token VALUE.
 *
 * These are written BEFORE .mcp.json (see main) so the file never exists un-ignored. */
const SECRET_IGNORE_BASE = [
  ".env.local",
  ".env.*.local",
  "project-profile.json",
  ".vc-fix/",
];
/** A generated destination as a project-relative ignore entry, or null when it lands OUTSIDE the
 *  project — where no .gitignore of ours can cover it, so the caller must say so out loud rather
 *  than write a `.mcp.json` line that silently protects the wrong path. The literals used to be
 *  hardcoded while `--out`/`--settings` were free to move the files. */
function ignoreEntryFor(projectRoot, absPath) {
  const rel = relative(projectRoot, absPath);
  // Three ways `relative()` says "not under projectRoot", and only one of them looks like it:
  //   - "" — the destination IS the root, so there is no file here to ignore;
  //   - a ".." SEGMENT — above the root. Matched as a segment, not a prefix: a real directory
  //     named "..hidden" is genuinely inside the project and must keep its entry;
  //   - an ABSOLUTE path — Windows cross-drive, where no relative path can exist at all. This one
  //     passed the old `!startsWith("..")` test, so `--settings D:\x\s.json` from a C: project
  //     wrote the credential off-project, emitted NO warning, and added a "D:/x/s.json" line that
  //     can only ever match a literal directory named "D:".
  if (!rel || isAbsolute(rel)) return null;
  const parts = rel.split(sep);
  return parts.includes("..") ? null : parts.join("/");
}
/** Where the Playwright MCP servers land raw captures — see the EVIDENCE_INCOMING note below. */
const EVIDENCE_IGNORES = ["test-results/", "reports/bugs/screenshots/_incoming/"];

/**
 * Append the ignore entries a destination implies, if missing. Idempotent, and it only ever
 * APPENDS a marked block — an existing .gitignore is never rewritten or reordered, and a
 * project with no .gitignore at all gets one. `title`/`notes` label the block so two calls
 * (secrets, evidence) stay legible instead of merging into one unexplained list.
 *
 * These live here rather than in a separate generator because they exist BECAUSE of the files
 * this script just wrote; keeping them together stops the two from drifting — which is exactly
 * how the header comment came to claim a `.mcp.json` ignore that was never added.
 */
export function ensureGitignoreEntries(root, entries, opts = {}) {
  const {
    title = "vc-fix (/project-init) — browser evidence landing zone",
    notes = [
      "The Playwright MCP servers write raw captures here; /qa-bug moves the ones it keeps",
      "into reports/bugs/screenshots/<bug-slug>/. Nothing here is evidence of record.",
    ],
  } = opts;
  const path = join(root, ".gitignore");
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const missing = entries.filter((e) => !lines.has(e));
  if (!missing.length) return [];
  const block = [
    existing && !existing.endsWith("\n") ? "\n" : "",
    `\n# === ${title} ===\n`,
    ...notes.map((n) => `# ${n}\n`),
    missing.map((e) => `${e}\n`).join(""),
  ].join("");
  writeFileSync(path, existing + block);
  return missing;
}

/**
 * Layer the deployment's env files into process.env BEFORE resolveTokens() reads them (VCST-5582 E4).
 *
 * gen-mcp used to read tokens straight from process.env, but /project-init's documented flow puts
 * them in `.env.local` (scaffold-secrets.mjs tells the operator to) — a file no one has SOURCED into
 * the environment on the first pass. So GITHUB_PERSONAL_ACCESS_TOKEN / POSTMAN_API_KEY / … read as
 * unset, and the github/postman MCP shipped DISABLED (unresolved `<PLACEHOLDER>`). It only ever
 * resolved if someone re-ran the generator with the secrets already exported — which the flow never
 * tells anyone to do. Mirror derive-context.mjs exactly: `.env.defaults` → `.env.<TEST_ENV>` →
 * `.env.local`, then promote the per-env `_<ENV>` suffix, all rooted at outputRoot (the project).
 * Does NOT override a value already present in process.env (a real export wins over a file).
 */
function loadDeploymentEnv(root = outputRoot()) {
  const TEST_ENV = resolveTestEnv("vcst");
  dotenv({ path: join(root, ".env.defaults"), quiet: true });
  dotenv({ path: join(root, `.env.${TEST_ENV}`), override: true, quiet: true });
  dotenv({ path: join(root, ".env.local"), override: true, quiet: true });
  const SUF = `_${TEST_ENV.toUpperCase()}`;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith(SUF) && v) process.env[k.slice(0, -SUF.length)] = v;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Load .env.defaults/.env.<env>/.env.local so a token the operator placed in .env.local (per the
  // documented flow) is actually seen on the FIRST pass — before resolveTokens() reads process.env.
  loadDeploymentEnv();
  const os = detectOs(args.os);
  const tracker = args.tracker || "jira";
  const extras = String(args.with || "").split(",").map((s) => s.trim()).filter(Boolean);

  const templatePath = join(PLUGIN_ROOT, "templates", ".mcp.json.example");
  if (!existsSync(templatePath)) {
    console.error(`[gen-mcp] template not found: ${templatePath}`);
    process.exit(1);
  }
  const template = JSON.parse(readFileSync(templatePath, "utf-8"));
  const srcServers = template.mcpServers || {};

  // Build the tailored mcpServers (OS-normalized + tokens injected + evidence dir pinned to
  // an absolute project path), keeping all defs.
  const projectRoot = outputRoot();
  const inlineSecrets = Boolean(args["inline-secrets"]);
  const resolved = resolveTokens();
  const mcpServers = {};
  for (const [name, def] of Object.entries(srcServers)) {
    // normalizeForOs first (so a *nix `npx` command is detectable), then inject the IPv4-first
    // NODE_OPTIONS + prefer-offline (#220), the token INDIRECTIONS, and the absolute evidence dir;
    // for github, fall back to OAuth if no PAT resolved; finally strip the template's `//`
    // doc-comment keys so they don't leak into the runtime .mcp.json.
    let built = absolutizeOutputDir(injectTokenRefs(ensureNodeOptions(normalizeForOs(def, os)), resolved, { inline: inlineSecrets }), projectRoot);
    if (name === "github") built = enableOAuthIfNoPat(built);
    mcpServers[name] = stripComments(built);
  }

  // Which servers to ENABLE (the rest stay defined but dormant). Only playwright-chrome
  // is enabled by default; playwright-firefox / playwright-edge stay DEFINED in .mcp.json
  // so the client can opt into cross-browser runs by adding them to enabledMcpjsonServers.
  const enabled = new Set([
    "playwright-chrome",
    "github",
  ]);
  if (tracker === "jira") enabled.add("atlassian");
  if (tracker === "azure" || extras.includes("azure")) enabled.add("azure-mcp");
  const extraMap = {
    postman: "postman",
    figma: "figma-remote-mcp",
    context7: "context7",
    devtools: "Chrome DevTools",
  };
  // An OPTIONAL extra whose key never resolved is NOT enabled: scaffold-secrets emits
  // POSTMAN_API_KEY / CONTEXT7_API_KEY as optional placeholders and documents "blank ⇒ that MCP
  // server stays disabled", but this loop used to `enabled.add()` every `--with` extra
  // unconditionally. Onboarding then shipped `.mcp.json` with e.g. context7 enabled and a literal
  // `<CONTEXT7_API_KEY>` — a server that cannot start — and the warn loop below reported it as
  // `degraded_artifact:mcp_config` against a key the operator deliberately left blank. The server
  // stays DEFINED (dormant) exactly like playwright-firefox/-edge, so filling the key and re-running
  // is all it takes to enable it.
  const dormantExtras = [];
  for (const e of extras) {
    const name = extraMap[e];
    if (!name) continue;
    const missing = unresolvedPlaceholders(mcpServers[name]);
    if (missing.length) dormantExtras.push({ name, missing });
    else enabled.add(name);
  }
  // Only enable servers that actually exist in the template.
  const enabledList = [...enabled].filter((n) => mcpServers[n]);

  // Ignore EVERY file this run generates BEFORE writing any of them, so `.mcp.json` never exists
  // un-ignored — not even for the duration of this function (VCST-5774 D2). Two labelled blocks:
  // the secret-adjacent local config, then the browser evidence landing zone. `_incoming/` is a
  // landing zone, not evidence of record; `test-results/` covers the legacy lane and HAR output.
  // Resolve both destinations FIRST: the ignore entries are derived from where the files will
  // actually land, so `--out`/`--settings` cannot route a credential-bearing file past the block
  // that is named after protecting it.
  const outPath = resolveOutPath(args.out, ".mcp.json");
  const settingsPath = args.settings
    ? resolve(outputRoot(), args.settings)
    : join(outputRoot(), ".claude", "settings.local.json");
  const generatedEntries = [outPath, settingsPath].map((f) => ignoreEntryFor(projectRoot, f));
  for (const [i, entry] of generatedEntries.entries()) {
    if (!entry) console.warn(`[gen-mcp] ⚠ ${[outPath, settingsPath][i]} is OUTSIDE the project root — no .gitignore entry can cover it. Make sure it is not committed.`);
  }
  const ignoredSecrets = ensureGitignoreEntries(projectRoot, [...generatedEntries.filter(Boolean), ...SECRET_IGNORE_BASE], {
    title: "vc-fix (/project-init) — generated local config, never commit",
    notes: [
      "Per-machine onboarding output. .mcp.json references a credential via ${VAR}; the VALUE",
      "lives in .claude/settings.local.json `env` and .env.local. None of this belongs in git.",
    ],
  });
  const ignoredEvidence = ensureGitignoreEntries(projectRoot, EVIDENCE_IGNORES);
  const ignored = [...ignoredSecrets, ...ignoredEvidence];
  if (ignored.length) console.log(`[gen-mcp] .gitignore += ${ignored.join(", ")}`);

  writeFileSync(outPath, JSON.stringify({ mcpServers }, null, 2) + "\n");
  console.log(`[gen-mcp] wrote ${outPath} (os=${os})`);
  console.log(`[gen-mcp] browser evidence lands in ${join(projectRoot, ...EVIDENCE_INCOMING)}\\<browser> (absolute — never the project root, whatever cwd the MCP server starts in)`);
  // VCST-5702 ITEM 4 — emit the PINNED @playwright/mcp version so a version mismatch surfaces at
  // project-init. On 0.0.77 a bare screenshot filename resolves against the server cwd, not the
  // configured --output-dir, so Stage 5 (output-paths.md) MUST reconcile the file into _incoming/.
  const pwVersion = pinnedPlaywrightVersion(mcpServers);
  if (pwVersion) {
    console.log(`[gen-mcp] @playwright/mcp pinned at ${pwVersion} — capture with a BARE filename; on 0.0.77 it lands in the server cwd, so /qa-bug reconciles it into _incoming/ (output-paths.md Stage 5).`);
  }

  // Sync settings.local.json enabledMcpjsonServers (gitignored) into the project's
  // .claude/ (created if the fresh project has none yet).
  mkdirSync(dirname(settingsPath), { recursive: true });
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { settings = {}; }
  }
  settings.enabledMcpjsonServers = enabledList;
  // The `${VAR}` indirections written into .mcp.json above need a value at session start.
  // A settings `env` block is applied "for every session and its subprocesses", which is what
  // .mcp.json expansion reads — so this file, not .mcp.json, is where the secret lives. Only
  // vars the template ACTUALLY references are written, and other operator keys are preserved.
  // Skipped under --inline-secrets: there the value is already in .mcp.json, so a second copy
  // here would defeat the point.
  // Derived from the SHIPPED config, not the template: only a var the generated file actually
  // references needs a value. This also makes `--inline-secrets` self-enforcing — that mode emits
  // no `${VAR}` at all, so secretEnv is empty by construction rather than by a parallel `if`.
  const shipped = JSON.stringify(mcpServers);
  const secretEnv = Object.fromEntries(
    Object.values(resolved)
      .filter(({ varName }) => shipped.includes("${" + varName + "}"))
      .map(({ varName, value }) => [varName, value]),
  );
  // PRUNE before merging. Every var in TOKEN_SOURCES is one this generator OWNS, so a credential
  // the operator has since revoked (or moved into .mcp.json via --inline-secrets) must not survive
  // here: settings `env` is exported to every session AND subprocess, so a stale value is both
  // wider-reaching than the header it replaced and invisible — the run would report a clean
  // .mcp.json while the dead token sat in the file next to it. Only OUR keys are touched; an
  // operator's own env entries are preserved.
  const managedVars = Object.keys(TOKEN_SOURCES).map((ph) => ph.slice(1, -1));
  const pruned = managedVars.filter((v) => settings.env?.[v] !== undefined && !(v in secretEnv));
  for (const v of pruned) delete settings.env[v];
  if (settings.env && !Object.keys(settings.env).length) delete settings.env;
  if (Object.keys(secretEnv).length) settings.env = { ...(settings.env ?? {}), ...secretEnv };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  console.log(`[gen-mcp] enabled servers: ${enabledList.join(", ")}`);
  if (Object.keys(secretEnv).length) {
    console.log(`[gen-mcp] .mcp.json references \${${Object.keys(secretEnv).join("}, ${")}} — values written to ${settingsPath} (no secret in .mcp.json)`);
  }
  if (pruned.length) {
    // console.warn, not log: this is the one branch that DELETES a credential the operator may
    // still want. Treating absence as withdrawal is deliberate — leaving behind a value we can no
    // longer account for is the worse failure for a secret-hygiene tool — but the restore path has
    // to be stated rather than inferred, because "absent" also describes a merely different shell.
    console.warn(`[gen-mcp] ⚠ removed ${pruned.join(", ")} from ${settingsPath} — no longer resolvable from the environment or .env.local. If that was intentional, revoke it at the source too; if not, put it in .env.local (the durable source) and re-run.`);
  }
  if (inlineSecrets) {
    console.warn("[gen-mcp] ⚠ --inline-secrets: credential VALUES were written into .mcp.json. It is gitignored, but treat the file as a secret.");
  }
  // Requested-but-dormant optional extras. This is the documented outcome of a blank optional key,
  // NOT a degraded artifact — so it is an info line and emits no observation.
  for (const { name, missing } of dormantExtras) {
    console.log(`[gen-mcp] ${name}: defined but NOT enabled — ${missing.join(", ")} unset (optional; set it in .env.local and re-run to enable).`);
  }

  // Warn about any enabled server whose token is still a placeholder — AND report it as an
  // observation (8a). `.mcp.json` is a REQUIRED output of /project-init, so shipping it with an
  // unresolved credential DEGRADES that output: the class is `degraded_artifact` on `mcp_config`,
  // not a bare warn. A visible warning that emitted no telemetry was the same blindness VCST-5582 H
  // fixed for the readiness table — self-diagnostics could not see the Postman 401 the shipped
  // `.mcp.json` guaranteed. Evidence carries the server name + placeholder NAME only (both
  // plugin-authored); the key VALUE is never in scope here (the placeholder is literally unresolved).
  // NB: an optional extra with a blank key never reaches this loop — it was left dormant above, so
  // the only servers checked here are ones we DID enable and therefore genuinely need a credential.
  const obs = [];
  for (const name of enabledList) {
    const names = unresolvedPlaceholders(mcpServers[name]);
    if (!names.length) continue;
    console.warn(`[gen-mcp] ⚠ ${name}: unresolved ${names.join(", ")} — set the token in .env.local or via login, then re-run.`);
    for (const placeholder of names) {
      obs.push({ class: "degraded_artifact", subject: "mcp_config", evidence: { snippet: `${name}: unresolved ${placeholder}` } });
    }
  }
  if (obs.length) emitObservations(obs, { skill: "project-init" });

  // #220 item 5 — opt-in (--warm-cache): pre-fetch the pinned npx packages into the npm cache so
  // the first MCP start doesn't pay a registry round-trip. Opt-in because it does N network fetches;
  // it runs with the IPv4-first hint so it can't hang on a broken IPv6 route, and is best-effort.
  if (args["warm-cache"]) {
    const specs = extractNpxSpecs(mcpServers);
    console.log(`[gen-mcp] warming npm cache for ${specs.length} npx package(s): ${specs.join(", ") || "(none)"}`);
    const results = warmNpxCache(specs);
    for (const r of results) {
      if (r.ok) console.log(`[gen-mcp] warmed ${r.spec} in ${r.ms}ms`);
      else console.warn(`[gen-mcp] ⚠ could not warm ${r.spec}${r.skipped ? " (unsafe spec — skipped)" : ` (${r.ms}ms)`} — its first MCP start will hit the registry; check network/proxy.`);
    }
    const warmObs = classifyWarmResults(results);
    if (warmObs.length) emitObservations(warmObs, { skill: "project-init" });
  }

  console.log("[gen-mcp] ⚠ Restart the MCP servers (reload the IDE / Claude Code) for changes to take effect.");
  if (args.print) console.log(JSON.stringify({ mcpServers }, null, 2));
}

// CLI only — `ensureGitignoreEntries` / `absolutizeOutputDir` are imported by the unit tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
