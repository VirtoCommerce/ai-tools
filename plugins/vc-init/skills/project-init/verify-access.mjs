#!/usr/bin/env node
/**
 * skills/project-init/verify-access.mjs
 *
 * Full plugin readiness checkup after /project-init. Reports PASS / FAIL / WARN /
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
 *   - Storefront user login — the REAL storefront login: a STORE-SCOPED OAuth password grant
 *     (grant_type=password + storeId), how the storefront/xAPI signs a shopper in. PASS/FAIL on
 *     that; WARN only when genuinely inconclusive (no STORE_ID to scope to, or endpoint unreachable)
 *   - Jira API token — GET /rest/api/3/myself  (jira tracker; WARN not FAIL — the runtime
 *     path is the Atlassian MCP OAuth, the token is only an optional probe)  OR  Azure DevOps auth present
 *   - Azure Boards WRITE (transition) — non-mutating write-scope probe (PATCH a known item
 *     with an invalid body: 401/403 = no Work-Items-write scope; 400 = scope present). A missing
 *     write scope is a **WARN** (with a grant-this explanation), NOT an onboarding-blocking FAIL —
 *     see probe-lib.writeProbeSeverity. /qa-fix transitions/comments the ticket, so the WARN says
 *     to grant Work Items (Read & Write) before running it.
 *   - GitHub fix token (GITHUB_FIX_BUGS_TOKEN) — validate token + push perm on the upstream repo
 *     (the upstream repo is a PROXY probe; no push ⇒ WARN, the real target is the routed repo at
 *     /qa-fix Gate 1. fork mode: read is enough since you PR from your own fork. A token that
 *     doesn't authenticate at all ⇒ FAIL)
 *   - gh CLI session — gh auth status
 *   - Client repos — reachable + write-probed on their own host (GitHub permissions.push; Azure
 *     Repos non-mutating /pushes probe). A missing write scope is a **WARN** (grant-before-/qa-fix),
 *     not a FAIL — the read-only-PAT gap (read-only PAT reaches get-repo 200 but push 401) is surfaced, not
 *     hard-blocked. A totally unreachable repo / absent credential is still FAIL.
 *
 * Usage: node skills/project-init/verify-access.mjs
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { loadLayeredEnv } from "../../scripts/lib/load-layered-env.mjs";
import { resolveTestEnv } from "../../scripts/lib/resolve-test-env.js";
import { loadProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { outputRoot, pluginRoot } from "./lib/paths.mjs";
// The SAME distinctive-prefix matcher the telemetry redactor uses. Shared on purpose: this
// audit used to keep its own shorter copy, so a token type redact.mjs already knew about
// (glpat-/xoxb-/sk_live_/AKIA/JWT) passed the hygiene check clean.
import { SECRET_PREFIX_RE } from "../../scripts/lib/redact.mjs";
// Self-diagnostics CAPTURE channel. This table is the plugin's own structured verdict on the
// deployment; before VCST-5582 H it was rendered and then discarded (exit 0 unless a hard FAIL),
// so a WARN the operator could plainly see — e.g. "no field contract scanned for Bug" — was
// invisible to /vc-self-check and the run self-diagnosed "no plugin issues detected".
import { emitObservations, httpStatusFrom, classForStatus } from "./lib/diag-obs.mjs";
import { resolvePluginFile, resolvePluginRoot } from "../../bridge/resolve-plugin.mjs";
import { defaultShimPath } from "../../scripts/install-bridge.mjs";
import { parseDoctor, runDoctor, secretsVerdict } from "./lib/vc-secrets-doctor.mjs";
import { ROLES, hostInstallPath, hostLine, hostServerKeys, isHostGoverned } from "./lib/governance.mjs";
import { hostState, roleDrift } from "./lib/host-adapter.mjs";
import { envsIn, hostEnvFor, markedUsersIn } from "./lib/test-users.mjs";
import {
  probeGithubUpstream, resolveGithubToken, resolveAdoTenant, ADO_RESOURCE,
  githubCanWrite, discoverAdoWorkItemId, probeAdoWorkItemsWrite, probeAdoCodeWrite,
  writeProbeSeverity,
} from "./probe-lib.mjs";
// Slot resolution for the "tracker bug field contract" readiness row (VCST-5582 E-g) — the
// SAME pure function the create path uses, so the row can't claim a mapping create won't make.
import { resolveSlots } from "../../scripts/lib/bug-contract.mjs";
import { SECRETS_FILE as BROWSER_SECRETS_FILE, currentState as browserSecretsState } from "./sync-browser-secrets.mjs";
import { missingDeps, pluginRoots } from "./install-deps.mjs";
import { declaredPasswords, passwordSecretNames } from "./lib/passwords.mjs";
import { fileURLToPath } from "url";

let TEST_ENV;
try {
  TEST_ENV = loadLayeredEnv("vcst");
} catch (err) {
  console.error(`[verify-access] ${err.message}`);
  process.exit(1);
}

const BACK = (process.env.BACK_URL || "").replace(/\/+$/, "");
const FRONT = (process.env.FRONT_URL || "").replace(/\/+$/, "");

/**
 * The storefront-user login readiness check (D2). A storefront shopper is NOT a platform user, so the
 * plain platform password grant (no storeId) 400s for them by construction — a right and a wrong
 * password are then indistinguishable and the row degrades to a "verify manually" WARN, which
 * resolves nothing (the /project-init §3 S2 anti-pattern). This probes the REAL storefront login: a
 * STORE-SCOPED OAuth password grant (`grant_type=password` + `storeId`), exactly how the
 * storefront / xAPI signs a shopper in (knowledge/api/api-auth.md), and reports PASS/FAIL on THAT.
 * WARN is kept ONLY for the genuinely inconclusive cases: no store to scope to, or the endpoint is
 * unreachable — never as the terminal state of a probed axis.
 *
 * Network is injected via `fetchImpl` so this is unit-testable without a live platform.
 * @returns {{ status:"PASS"|"FAIL"|"WARN", detail:string }}
 */
export async function probeStorefrontLogin({ back, store, email, password, fetchImpl = fetch }) {
  const grant = (params) => fetchImpl(`${back}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const creds = { grant_type: "password", username: email, password, scope: "offline_access" };
  try {
    // 1) the plain platform grant — a storefront user who is ALSO a platform user passes here.
    const r = await grant(creds);
    if (r.ok) return { status: "PASS", detail: `platform token acquired for '${email}'` };
    // 2) the real storefront login: a STORE-SCOPED grant. Needs a store to scope to.
    if (!store) {
      return { status: "WARN", detail: `platform grant → ${r.status} and STORE_ID unset — set STORE_ID so the store-scoped storefront login check can resolve this axis` };
    }
    const rs = await grant({ ...creds, storeId: store });
    if (rs.ok) return { status: "PASS", detail: `store-scoped token acquired for '${email}' (storeId=${store})` };
    const body = await rs.text().catch(() => "");
    const invalid = rs.status === 400 && /invalid_grant/i.test(body);
    return {
      status: "FAIL",
      detail: `store-scoped grant (storeId=${store}) → ${rs.status}${invalid ? " invalid_grant — USER_EMAIL / USER_PASSWORD rejected for the storefront" : " — check USER_EMAIL / USER_PASSWORD / STORE_ID"}`,
    };
  } catch (e) {
    // A transport failure IS the genuinely-inconclusive case — the only remaining WARN.
    return { status: "WARN", detail: `login endpoint unreachable (${e.message}) — verify storefront login manually` };
  }
}

/**
 * Audit a SHIPPED generated file for a credential sitting in it (VCST-5774 — defect D1 / B4).
 *
 * WHY A CHECK AND NOT JUST A FIXED GENERATOR. gen-mcp.mjs now emits `${VAR}` indirections, but
 * this failure is silent-shaped: a literal token works perfectly, every day, right up until the
 * day someone commits it. The file on disk may predate the fix, have been hand-edited, or have
 * been produced with `--inline-secrets`. So verify the ARTIFACT; never trust the producer.
 *
 * TWO NETS, TWO CONFIDENCE LEVELS — and that separation is the whole design:
 *
 *   - `hits` (CERTAIN) — `SECRET_PREFIX_RE`, shared with hooks/redact.mjs, matched anywhere. A
 *     `ghp_…`/`glpat-…`/`AKIA…` is a credential no matter what key it hides under, so a hit here
 *     can block readiness. False positives are effectively impossible.
 *
 *   - `weak` (SUSPECTED) — a value under a credential-shaped KEY (or after a `--api-key`-style
 *     flag, or inline in a URL) that is not a `${VAR}` ref or an unresolved `<PLACEHOLDER>`. This
 *     is the net that catches a credential type nobody has invented yet — but it is blind to what
 *     the value MEANS, so it also matches `PASSWD_FILE=/etc/passwd`, `MAX_TOKENS=4096` and
 *     `--secrets .env.playwright.local` (this repo's own documented Playwright setup, which the
 *     first version of this check graded as a readiness-blocking FAIL on three servers).
 *     **A `weak` hit can only ever WARN.** That is what lets the key vocabulary below stay WIDE:
 *     narrowing it to kill the false positives had silently dropped ~16 real credential names
 *     (`AccountKey`, `subscriptionKey`, `signingKey`, `licenseKey`, …) that redact.mjs already
 *     knew about — trading false alarms for false silence, the wrong direction for a detector.
 *
 * `looksLikeSecret()` then removes the obviously-not-a-credential values (a path, a filename, a
 * number, a short enum word) so the WARNs that remain are worth reading. A readiness row that
 * cries wolf is how a real finding gets scrolled past.
 *
 * The walk is RECURSIVE over the whole server def, not just `headers`/`env` — `args[]`, `url`,
 * `command` and nested bags included — because the generator substitutes placeholders at every
 * leaf, so anything less means the producer can write a shape the auditor cannot read.
 *
 * Returns JSON PATHS (`github.headers.Authorization`, `srv.args[2]`) — key names only, all
 * plugin- or operator-authored. A credential VALUE never reaches the result, the readiness table,
 * or the observation evidence.
 */
// A credential-shaped key. Deliberately WIDE (see `weak` above): every name hooks/redact.mjs
// treats as a secret keyword should land here, because the value filter and the WARN-only ceiling
// — not a narrow vocabulary — are what keep this from crying wolf.
const CRED_KEY = /^authorization$|KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|SIGNATURE|PAT\b/i;
// A CLI flag carrying a credential. Split into two flat alternatives with no nested quantifier
// around the keyword: the earlier `^--?[\w-]*(?:key|token|…)[\w-]*=?$` backtracked quadratically
// (~18 s on a 192 KB argv element).
const CRED_FLAG = /^--?(?:[\w-]*[_-])?(?:key|token|secret|pat|password|auth|secrets)(?:[_-][\w-]*)?$/i;
// A URL carrying the credential inline: `scheme://user:pass@host`, or `?access_token=…`.
// A `${VAR}` / `<PLACEHOLDER>` value is excluded so an unresolved template URL stays clean.
const URL_CRED = /:\/\/[^/\s:@]+:([^/\s@]+)@|[?&](?:access_?token|api[_-]?key|token|key|secret|password|sig)=(?!\$\{|<)([^&\s]+)/i;
const isIndirection = (s) => /^\$\{[A-Za-z0-9_]+\}$/.test(s) || /^<[A-Z0-9_]+>$/.test(s);

/** Could this VALUE plausibly be a credential? Used only to suppress `weak` noise — never to
 *  dismiss a `SECRET_PREFIX_RE` match, which is certain regardless of shape. Everything here is a
 *  shape a real opaque credential does not have: a filesystem path, a filename, a bare number, a
 *  short enum word. Deliberately conservative — when in doubt, keep the WARN. */
function looksLikeSecret(v) {
  if (v.length < 8) return false;                                   // too short to be a credential
  if (/^\d+$/.test(v)) return false;                                // MAX_TOKENS=4096, MIN_LENGTH=8
  if (/[/\\]/.test(v)) return false;                                // AUTH_KEY_FILE=/etc/key.pem
  if (/^\.?[\w.-]*\.[a-z0-9]{2,6}$/i.test(v)) return false;         // --secrets .env.playwright.local
  if (/^(?:true|false|null|none|off|on|auto|env|default|oauth|basic|bearer)$/i.test(v)) return false;
  return true;
}

/** Recursive leaf scan. `credKey` = an enclosing key looked credential-shaped — it PROPAGATES into
 *  nested objects/arrays, so `env.AUTH_TOKEN.value` and `headers["X-Api-Key"][0]` are still seen.
 *  `prevArg` = the preceding array element, so a `--api-key` flag taints the value after it. */
function scanLiterals(node, path, out, credKey = false, prevArg = "") {
  if (typeof node === "string") {
    if (!node) return;
    const urlMatch = URL_CRED.exec(node);
    if (SECRET_PREFIX_RE.test(node)) { out.hits.add(path); return; }
    // `--api-key=VALUE` as ONE argv token: the flag net only sees the PRECEDING element, so the
    // fused form used to pass clean. Split it and judge the right-hand side.
    const fused = /^(--?[\w-]+)=(.+)$/.exec(node);
    const tainted = credKey || CRED_FLAG.test(prevArg) || (fused && CRED_FLAG.test(fused[1]));
    const value = fused ? fused[2] : node;
    if (urlMatch) {
      const inline = urlMatch[1] ?? urlMatch[2] ?? "";
      if (looksLikeSecret(inline)) out.weak.add(path);
      return;
    }
    // `Bearer ${VAR}` must read as an indirection; the prefix net above already saw the raw value.
    const bare = value.replace(/^(?:Bearer|Basic|token)\s+/i, "").trim();
    if (tainted && !isIndirection(bare) && looksLikeSecret(bare)) out.weak.add(path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanLiterals(v, `${path}[${i}]`, out, credKey, i > 0 ? node[i - 1] : ""));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) scanLiterals(v, `${path}.${k}`, out, credKey || CRED_KEY.test(k));
  }
}

/** @returns {{ hits: string[], weak: string[], unparsable: boolean }}
 *  `hits` = certain (known token shape) · `weak` = suspected (credential-shaped key, opaque value).
 *  Both empty + parsable ⇒ clean. */
export function findLiteralSecrets(mcpJsonText) {
  let doc;
  try { doc = JSON.parse(mcpJsonText); } catch { return { hits: [], weak: [], unparsable: true }; }
  const out = { hits: new Set(), weak: new Set() };
  for (const [name, def] of Object.entries(doc?.mcpServers ?? {})) scanLiterals(def, name, out);
  return { hits: [...out.hits], weak: [...out.weak].filter((p) => !out.hits.has(p)), unparsable: false };
}

/** The same audit for `.claude/settings.local.json` — the file the credential VALUE now lives in.
 *  The STRUCTURAL net is scoped to `env` (the block gen-mcp writes; scanning `permissions` would
 *  flag ordinary rule strings), but the CERTAIN prefix net runs over the WHOLE document: a token
 *  pasted into a hook command is exactly what "the file may have been hand-edited" means, and a
 *  `ghp_…` there cannot be a false positive. */
export function findSettingsSecrets(settingsJsonText) {
  let doc;
  try { doc = JSON.parse(settingsJsonText); } catch { return { hits: [], weak: [], unparsable: true }; }
  const out = { hits: new Set(), weak: new Set() };
  scanLiterals(doc?.env ?? {}, "env", out);
  const whole = { hits: new Set(), weak: new Set() };
  scanLiterals(doc ?? {}, "", whole);
  for (const p of whole.hits) out.hits.add(p.replace(/^\./, ""));
  return { hits: [...out.hits], weak: [...out.weak].filter((p) => !out.hits.has(p)), unparsable: false };
}

/**
 * Grade one generated file's secret hygiene. PURE — the caller does all the I/O, so every branch
 * is table-testable. The first version of this logic lived inline in main() and was therefore
 * untestable; its "outside a git repo" branch was wrong (see `exposed` below).
 *
 * `exposed` is the only exposure axis that matters, and it is NOT `!ignored`:
 *   - outside a repo there is nothing to `git add`, so ignore-state is not a finding at all. The
 *     old code graded a literal in a non-repo project as FAIL and explained it with "one
 *     `git add -A` publishes it" — and 4 of the 5 leaking projects VCST-5774 found on disk were
 *     exactly that shape, so the loudest, least accurate branch was also the most-hit one;
 *   - a file git already TRACKS stays committable however many .gitignore rules match it —
 *     `git check-ignore` returns 1 for a tracked path, so adding the rule is a no-op and
 *     "re-run /project-init" is not a fix. That case gets its own remediation line.
 *
 * Only a CERTAIN hit can FAIL. A `weak` (suspected) hit caps at WARN however exposed the file is,
 * because that net is value-blind: it cannot tell a credential from `--secrets .env.local`, and a
 * readiness gate that blocks onboarding over a filename would teach operators to ignore the row.
 *
 * `kind` names the file; since VCST-6402 a credential is a defect in EITHER of them. Tokens live in
 * vc-secrets and reach a process through the $VC_RUN bridge or `vc-secrets run`; .mcp.json holds a
 * launcher call and settings.local.json `env` holds only VC_RUN (a path). Between VCST-5774 and
 * VCST-6402 settings.local.json WAS the value's home and a credential there graded PASS — an upgraded
 * project still carries one, and the row now says how to move it.
 */
/** The ids vc-fix can be installed under, in PRIORITY order: `vc-tools` is the marketplace's name
 *  before the 2026-09-30 rename, so a pre-rename install still resolves, but never ahead of a new one. */
export const VC_FIX_PLUGIN_IDS = ["vc-fix@ai-tools", "vc-fix@vc-tools"];
/** vc-init — the onboarding plugin since VCST-6402; it was born after the rename, so one id. */
export const VC_INIT_PLUGIN_IDS = ["vc-init@ai-tools"];

/** Pick the vc-fix install from `claude plugin list --json`: the highest-priority id with an ENABLED
 *  entry, else the highest-priority id with any entry. `enabledIds` lists every id that is enabled —
 *  more than one means two copies' hooks.json each start a telemetry collector (CLAUDE.md, VCST-5582 H). */
export function pickPluginInstall(list, ids = VC_FIX_PLUGIN_IDS) {
  const find = (id, enabledOnly) => list.find((x) => x.id === id && (!enabledOnly || x.enabled));
  const first = (enabledOnly) => ids.map((id) => find(id, enabledOnly)).find(Boolean);
  return { entry: first(true) || first(false) || null, enabledIds: ids.filter((id) => find(id, true)) };
}

export function gradeSecretHygiene({ kind, file, hits, weak = [], unparsable, inRepo, ignored, tracked }) {
  const exposed = inRepo && (tracked || !ignored);
  const why = tracked ? "tracked by git" : "not gitignored";
  // NAME THE COMMAND, don't say "re-run /project-init" (VCST-5774 review #7). The documented path
  // for an EXISTING install is `/project-init --check`, whose Step C runs normalize-env →
  // verify-access → assert-profile and never calls gen-mcp.mjs — so the row an operator hits after
  // upgrading pointed them at a flow that reports the problem and cannot fix it. The generator is
  // what rewrites the file, so the remediation is the generator.
  const REGEN = 'node "$CLAUDE_PLUGIN_ROOT/skills/project-init/gen-mcp.mjs" --tracker <jira|azure> --client-vcs <github|azure-repos>';
  const fix = tracked
    ? `\`git rm --cached ${file}\` + commit (a .gitignore rule CANNOT untrack it), then rotate the credential`
    : `run \`/project-init --check\` (it stores the token in vc-secrets and strips the file; \`${REGEN}\` rewrites .mcp.json and prunes the settings env), then rotate the credential`;

  if (unparsable) {
    return { status: "WARN", detail: `${file} is not valid JSON — could not audit it for credentials${exposed ? ` (and it is ${why})` : ""}` };
  }
  if (hits.length && exposed) {
    return { status: "FAIL", detail: `credential in ${hits.join(", ")} AND ${file} is ${why} — one \`git add -A\` publishes it. Fix: ${fix}.` };
  }
  if (weak.length && exposed) {
    return { status: "WARN", detail: `${file} is ${why} and ${weak.join(", ")} may hold a credential (a credential-shaped key with an opaque value — could equally be a filename or an id). Check it; if it is a secret, ${fix}.` };
  }
  if (hits.length) {
    return { status: "WARN", detail: `credential at rest in ${hits.join(", ")} (${file} is not committable, so not exposed) — tokens belong in vc-secrets now. Run \`/project-init --check\` to move it there and strip the file (\`${REGEN}\` rewrites ${kind === "mcp" ? "this file" : ".mcp.json and prunes this env"}), then rotate it.` };
  }
  if (weak.length && kind === "mcp") {
    // Not exposed, and only suspected — but .mcp.json is gitignored in the normal case, so this is
    // where the structural net earns its keep: staying silent here would make it dead weight.
    return { status: "WARN", detail: `${weak.join(", ")} may hold a credential literal in ${file} (a credential-shaped key with an opaque value — could equally be a filename or an id). The file is not committable. If it IS a secret, run \`${REGEN}\` to replace it with a \${VAR} reference.` };
  }
  if (exposed) {
    return { status: "WARN", detail: `${file} carries no credential but is ${why} — ${tracked ? `\`git rm --cached ${file}\`` : "add it to .gitignore"}, so a future hand-edit cannot be committed` };
  }
  return { status: "PASS", detail: `no exposed credential in ${file}${inRepo ? "" : " (not a git repo)"}` };
}

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

function tryCmd(cmd, opts = {}) {
  try { execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], ...opts }); return true; } catch { return false; }
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
      const tok = execSync(`az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      if (tok) return { header: "Bearer " + tok, via: "az session" };
    } catch { /* no token */ }
  }
  return { header: "", via: "" };
}

/** The onboarding tokens this project's vc-secrets declaration lists (github-pat / ado-pat / jira-token). */
/** The project's local vc-secrets declaration, parsed; null when absent or unreadable. */
export function readLocalDeclaration(root) {
  try {
    return JSON.parse(readFileSync(resolve(root, ".claude", "vc-secrets.local.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * The "Browser login secrets" row under option B: are this env's passwords stored, and do the lanes in
 * .mcp.json run from vc-secrets? Returns [label, status, detail].
 */
function browserPasswordsRow({ root, env, pwByEnv }) {
  const label = "Browser login secrets";
  if (!pwByEnv[env]) {
    return [label, "WARN", `passwords are in vc-secrets for ${Object.keys(pwByEnv).join(", ")}, not for TEST_ENV=${env} — add it with /project-init --add-env, or switch TEST_ENV`];
  }
  let lanesViaBridge = false;
  try {
    const servers = JSON.parse(readFileSync(resolve(root, ".mcp.json"), "utf8")).mcpServers || {};
    lanesViaBridge = Object.entries(servers).some(([n, d]) => /^playwright-/.test(n) && Array.isArray(d.args) && d.args.includes("playwright"));
  } catch {
    /* no .mcp.json yet — reported below */
  }
  if (!lanesViaBridge) return [label, "WARN", `the Playwright lanes in .mcp.json do not run from vc-secrets — re-run gen-mcp.mjs (/project-init --check), then restart Claude Code`];
  const leftover = existsSync(resolve(root, ".env.playwright.local"));
  const doctor = runDoctor({ cwd: root });
  if (!doctor.available) return [label, "FAIL", "vc-secrets is not installed — /project-init --check (§0d), then restart"];
  const needed = passwordSecretNames({ [env]: pwByEnv[env] });
  const v = secretsVerdict(parseDoctor(doctor.text), needed);
  const q = JSON.stringify(doctor.shim);
  if (!v.ready) {
    const todo = [...(v.trustNeeded ? [`node ${q} trust`] : []), ...v.missing.map((n) => `node ${q} set ${n}`), ...v.problems];
    return [label, "FAIL", `not ready for ${env} — run in a terminal: ${todo.join(" ; ")}`];
  }
  return [label, leftover ? "WARN" : "PASS", `${pwByEnv[env].join(", ")} for ${env} in vc-secrets — typed by name, no password file${leftover ? "; .env.playwright.local is left over — migrate-secrets.mjs --strip deletes it" : ""}`];
}

export function readDeclaredSecrets(root) {
  try {
    const d = JSON.parse(readFileSync(resolve(root, ".claude", "vc-secrets.local.json"), "utf8"));
    return Object.keys(d.secrets || {}).filter((n) => ["github-pat", "ado-pat", "jira-token"].includes(n));
  } catch {
    return [];
  }
}

/** Split owner/name. */
function splitRepo(full) {
  const i = (full || "").indexOf("/");
  return i >= 0 ? { owner: full.slice(0, i), name: full.slice(i + 1) } : { owner: "", name: full || "" };
}

// Fire the self-diagnostics terminal-step marker via the collector's own `complete` subcommand
// (reuses its exact logic + captureEnabled gate). Synchronous + fully swallowed: telemetry must
// NEVER break onboarding, so any failure (missing hook, spawn error, timeout) is ignored.
function signalSelfDiagnosticsComplete() {
  try {
    const hook = resolvePluginFile("vc-fix", "hooks/session-telemetry.mjs");
    if (!hook) return;
    execSync(`node "${hook}" complete --skill "project-init"`, { stdio: "ignore", timeout: 5000 });
  } catch {
    /* never throw */
  }
}

/**
 * Host-governed rows that depend on THIS folder: the host's own setup ran here (a role with more than one
 * server on means it has not — lib/host-adapter.mjs hostState), the profile names the servers that are
 * actually on, and every `.env.<env>` maps to a host website environment with its test users on the
 * host's password slots. Read-only, and no secret is resolved: whether a slot holds a password is the
 * host's own check (its setup command), not ours.
 */
function hostPersonRows(g, installPath, root) {
  const state = hostState(g.host, installPath, root);
  const setup = state.setupCommands[0] || "the host's setup";
  // Never a FAIL: without knowing the host, "its setup has not run" is a guess (hostState).
  add("Host setup for this folder", state.confirmed ? "PASS" : "WARN",
    state.confirmed ? `${state.enabled.length} of ${g.host}'s servers on, ${state.disabled.length} switched off`
      : state.likelyFresh ? `looks untouched: ${state.reasons.join("; ")} — if ${setup} has not run in this folder, run it and restart Claude Code`
        : `not confirmed: none of ${g.host}'s servers is switched off here — if ${setup} has not run in this folder, run it`);
  const drift = roleDrift(g, state);
  if (drift.length) add("Profile vs servers on", "WARN", `${drift.join("; ")} — re-run /project-init to record the servers that are on`);

  // A guest profile written before 0.4.0 has no websiteAuth: the host's own slots decide.
  if ((g.websiteAuth || state.websiteAuth) !== "host-secrets") {
    add("Website test users", "SKIP", "the operator signs in by hand (governance.websiteAuth manual-operator)");
    return;
  }
  const { slots, hostEnvs } = state;
  if (!slots.length) {
    add("Website test users", "FAIL", `the profile says the host keeps test-user passwords, but ${g.host} declares no password slots now — gen-profile --gov-website-auth manual-operator, or update the host plugin`);
    return;
  }
  for (const env of envsIn(readdirSafe(root))) {
    const hostEnv = hostEnvFor(env, g, hostEnvs);
    if (!hostEnv) {
      add(`Website test users — ${env}`, "FAIL", `.env.${env} is not mapped to a ${g.host} website environment (${hostEnvs.join(", ")}) — gen-profile --gov-envs ${env}=<one of them>`);
      continue;
    }
    const slotOf = (u) => slots.find((s) => s.hostEnv === hostEnv && s.slot === u.key);
    const users = markedUsersIn(readFileSync(resolve(root, `.env.${env}`), "utf8")).filter(slotOf);
    add(`Website test users — ${env}`, users.length ? "PASS" : "WARN",
      // The verdict first: no secret is resolved here, so a filled slot is NOT checked — say so up front.
      users.length ? `slots unchecked · ${users.map((u) => `${u.key}→${slotOf(u).secret}`).join(", ")} (${hostEnv}); ${setup} checks them`
        : `no test user yet on ${hostEnv} — /project-init --add-user`);
  }
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

async function main() {
  // 1. Profile — loadProjectProfile() returns PROFILE_DEFAULTS even when the file is ABSENT, so
  //    `profile ? PASS : FAIL` was ALWAYS PASS: a silently-failed profile write read as green with
  //    default platform/jira values. Detect the file EXPLICITLY (mirror loadProjectProfile's path
  //    logic) and FAIL when it's missing; the loaded defaults still drive the detail string.
  const profilePath = process.env.PROJECT_PROFILE_PATH || resolve(outputRoot(), "project-profile.json");
  const profileExists = existsSync(profilePath);
  const profile = loadProjectProfile(outputRoot());
  add("Deployment profile", profileExists ? "PASS" : "FAIL",
    profileExists
      ? `type=${profile.projectType} tracker=${profile.tracker.kind} vcs=${profile.vcs.clientHost} upstream=${profile.upstream.org}/${profile.upstream.contributionMode}`
      : `no project-profile.json at ${profilePath} — run /project-init to create it (vc-fix and vc-perf stop until it exists)`);

  // 1-host. A HOST-GOVERNED project (VCST-6402 step 8): the client's governance plugin owns the MCP
  //     servers and every secret, so this table checks what is ours to check and nothing else — the
  //     host plugin is installed, each role's server exists among the servers it ships (read-only), and
  //     the non-secret URLs answer. No token, no session probe, no login: none of that is ours here.
  if (profileExists && isHostGoverned(profile)) {
    const g = profile.governance;
    const installPath = hostInstallPath(g.host, { projectRoot: outputRoot() });
    add("Host governance plugin", installPath ? "PASS" : "FAIL",
      installPath ? `${g.host} installed (${installPath}) — its rules outrank ours` : `${g.host} is recorded in the profile but not installed — install it, or re-run /project-init --governance none`);
    const keys = hostServerKeys(installPath);
    for (const role of ROLES) {
      const want = role === "browsers" ? (g.servers?.browsers || []) : [g.servers?.[role]].filter(Boolean);
      if (!want.length) { add(`Host server — ${role}`, "SKIP", "no server mapped for this role"); continue; }
      const missing = want.filter((k) => !keys.has(k));
      add(`Host server — ${role}`, !installPath ? "SKIP" : missing.length ? "FAIL" : "PASS",
        !installPath ? "host plugin not found" : missing.length ? `${missing.join(", ")} not among the host plugin's MCP servers (${[...keys].join(", ") || "none"})` : `${want.join(", ")} shipped by ${g.host}`);
    }
    const fS = await httpStatus(FRONT);
    add("Storefront URL (FRONT_URL)", fS >= 200 && fS < 500 ? "PASS" : FRONT ? "FAIL" : "SKIP", `${FRONT || "(unset)"}${FRONT ? ` → HTTP ${fS}` : ""}`);
    const bS = await httpStatus(BACK);
    add("Admin/platform URL (BACK_URL)", bS >= 200 && bS < 500 ? "PASS" : BACK ? "FAIL" : "SKIP", `${BACK || "(unset)"}${BACK ? ` → HTTP ${bS}` : ""}`);
    if (installPath) hostPersonRows(g, installPath, outputRoot());
    add("Tokens / MCP config", "SKIP", hostLine(profile, "no vc-secrets, no $VC_RUN, no .mcp.json of ours"));
    console.log("\n  Host-governed readiness (no secret is resolved in this mode)");
    renderTable(results);
    signalSelfDiagnosticsComplete();
    process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
  }

  // 1a. Secret hygiene of the files /project-init generates (VCST-5774). Two things can go wrong
  //     and each is invisible until it is too late: a credential written where it does not belong
  //     (D1), and the file holding it being committable (D2). BOTH generated files are audited —
  //     `.mcp.json`, which must carry only `${VAR}` refs, and `.claude/settings.local.json`, which
  //     is where the VALUE now lives. Auditing only the first would have left the fix's own new
  //     secret location completely unguarded. Grading is the pure gradeSecretHygiene() above.
  const projectRoot = outputRoot();
  const inRepo = tryCmd("git rev-parse --is-inside-work-tree", { cwd: projectRoot });
  for (const { kind, rel, scan } of [
    { kind: "mcp", rel: ".mcp.json", scan: findLiteralSecrets },
    { kind: "settings", rel: ".claude/settings.local.json", scan: findSettingsSecrets },
  ]) {
    const label = `Secret hygiene — ${rel}`;
    const abs = resolve(projectRoot, rel);
    if (!existsSync(abs)) {
      add(label, "SKIP", `no ${rel} in this project — run /project-init to generate one`);
      continue;
    }
    const { hits, weak, unparsable } = scan(readFileSync(abs, "utf-8"));
    // Both probes run in the PROJECT root, not the process cwd, and both are needed:
    // check-ignore answers "would a new file be ignored", ls-files answers "is it already
    // committed" — and a tracked file reports NOT-ignored, so neither alone is sufficient.
    const ignored = inRepo && tryCmd(`git check-ignore -q -- "${rel}"`, { cwd: projectRoot });
    const tracked = inRepo && tryCmd(`git ls-files --error-unmatch -- "${rel}"`, { cwd: projectRoot });
    const { status, detail } = gradeSecretHygiene({ kind, file: rel, hits, weak, unparsable, inRepo, ignored, tracked });
    add(label, status, detail);
  }

  // 1b. The ACTIVE plugin installs resolve at runtime. Since VCST-6402 onboarding is its own plugin
  //     (vc-init) and the bug lifecycle that READS this profile is vc-fix — both must be installed,
  //     and each command resolves its own launch path from `claude plugin list --json` (by the ids
  //     below, knowledge/execution/plugin-root.md), NOT a baked profile field. Confirm that resolver
  //     finds both, and fall back to the on-disk resolver (bridge/resolve-plugin.mjs: a checkout
  //     sibling, the install registry, the cache) when the `claude` CLI isn't on PATH in the shell.
  let cliList = null;
  try {
    cliList = JSON.parse(execSync("claude plugin list --json", { stdio: ["ignore", "pipe", "ignore"], timeout: 20000 }).toString());
  } catch {
    /* claude CLI unavailable / not on PATH — fall back to the on-disk resolver below */
  }
  const enabledIds = [];
  const roots = {};
  for (const [name, ids, probe] of [
    ["vc-init", VC_INIT_PLUGIN_IDS, ["skills", "project-init", "verify-access.mjs"]],
    ["vc-fix", VC_FIX_PLUGIN_IDS, ["skills", "qa-fix-routing", "ado.mjs"]],
  ]) {
    const picked = cliList ? pickPluginInstall(cliList, ids) : { entry: null, enabledIds: [] };
    if (picked.enabledIds.length > 1) enabledIds.push(picked.enabledIds);
    const active = picked.entry?.installPath || "";
    const onDisk = name === "vc-init" ? pluginRoot() : (resolvePluginRoot("vc-fix") || "");
    if (active && existsSync(resolve(active, ...probe))) roots[name] = { root: active, how: "cli" };
    else if (!active && onDisk && existsSync(resolve(onDisk, ...probe))) roots[name] = { root: onDisk, how: "disk" };
    else roots[name] = { root: "", how: "" };
  }
  const missing = Object.entries(roots).filter(([, r]) => !r.root).map(([n]) => n);
  if (missing.length) {
    add("Plugin root (claude plugin list)", "FAIL",
      `could not resolve the active ${missing.join(" + ")} install — install it with /plugin install ${missing.map((n) => `${n}@ai-tools`).join(" ")} (vc-fix pulls in vc-init and vc-secrets); see knowledge/execution/plugin-root.md`);
  } else if (Object.values(roots).every((r) => r.how === "cli")) {
    add("Plugin root (claude plugin list)", "PASS", `vc-init and vc-fix both resolve (${roots["vc-init"].root} · ${roots["vc-fix"].root})`);
  } else {
    const why = cliList
      ? "`claude plugin list` ran but found no enabled install for " + Object.entries(roots).filter(([, r]) => r.how === "disk").map(([n]) => n).join(" + ") + " (running from a checkout, or the plugin is disabled)"
      : "`claude plugin list` unavailable in this shell — commands must use the cache-dir fallback (plugin-root.md)";
    add("Plugin root (claude plugin list)", "WARN", `${why}. Found on disk: ${roots["vc-init"].root} · ${roots["vc-fix"].root}`);
  }
  for (const ids of enabledIds) {
    add("Plugin root (single install)", "WARN",
      `${ids.join(" and ")} are both enabled — each one's hooks.json starts its own telemetry collector, so spans duplicate and state writes race. Uninstall the old one (/plugin uninstall ${ids.slice(1).join(", ")}) and restart Claude Code`);
  }

  // 1b''. Each installed plugin's npm dependencies are in ITS install folder — Claude Code installs none,
  //       and a plugin update lands in a new folder without them. vc-fix's tracker / code-host helpers
  //       fail with "Cannot find package 'dotenv'" otherwise.
  {
    const gaps = pluginRoots().map(({ name, root }) => ({ name, root, missing: missingDeps(root) })).filter((p) => p.missing.length);
    if (gaps.length) {
      add("Plugin dependencies", "FAIL", `${gaps.map((g) => `${g.name} lacks ${g.missing.join(", ")}`).join("; ")} — run: node "$CLAUDE_PLUGIN_ROOT/skills/project-init/install-deps.mjs"`);
    } else {
      add("Plugin dependencies", "PASS", "every installed plugin has its npm dependencies");
    }
  }

  // 1b'. Browser login: the agent types a password's NAME and Playwright MCP substitutes the value from
  //      the --secrets file gen-mcp wires in — so the password never enters the model's context. A
  //      missing or stale file means the agent would have to read the password to type it.
  //      Option B (lib/passwords.mjs): no file — the current env's passwords are vc-secrets entries and
  //      each lane is a declared server; the row checks those instead.
  const pwByEnv = declaredPasswords(readLocalDeclaration(outputRoot()));
  if (Object.keys(pwByEnv).length) {
    add(...browserPasswordsRow({ root: outputRoot(), env: resolveTestEnv("vcst"), pwByEnv }));
  } else try {
    const bs = browserSecretsState(outputRoot());
    const regen = `TEST_ENV=${bs.env} node "$CLAUDE_PLUGIN_ROOT/skills/project-init/sync-browser-secrets.mjs", then restart Claude Code`;
    if (bs.before === null) add("Browser login secrets", "WARN", `no ${BROWSER_SECRETS_FILE} — run ${regen}; gen-mcp then passes it to every Playwright lane`);
    else if (bs.stale) add("Browser login secrets", "WARN", `${BROWSER_SECRETS_FILE} is out of date for TEST_ENV=${bs.env} (a password changed, or another env) — run ${regen}`);
    else if (bs.missing.length) add("Browser login secrets", "WARN", `${bs.written.join(", ") || "nothing"} ready; no value for ${bs.missing.join(", ")} in .env.local`);
    else add("Browser login secrets", "PASS", `${bs.written.join(", ")} — typed by name, never read by the agent`);
  } catch (e) {
    add("Browser login secrets", "WARN", `could not check ${BROWSER_SECRETS_FILE}: ${e.message}`);
  }

  // 1c. Tokens live in vc-secrets and reach a process only through the $VC_RUN bridge (VCST-6402).
  //     Three facts, each its own row: the bridge shim is installed, every token this project
  //     declared is stored and its declarations trusted (doctor's LINES, not its exit code — an
  //     untrusted checkout exits 0), and THIS run actually came through the bridge — a direct run
  //     sees only the session logins, so the token rows below would report a PAT as missing.
  const declared = readDeclaredSecrets(outputRoot());
  const shimPath = process.env.VC_RUN || defaultShimPath();
  add("$VC_RUN bridge", existsSync(shimPath) ? "PASS" : "FAIL",
    existsSync(shimPath) ? `shim at ${shimPath}` : `no shim at ${shimPath} — run node "<vc-init>/scripts/install-bridge.mjs" (/project-init §0d does this)`);
  if (!declared.length) {
    add("vc-secrets (tokens)", "SKIP", "no PAT axis — every axis uses a session login (gh auth login / az login / Atlassian OAuth)");
  } else {
    const doctor = runDoctor({ cwd: outputRoot() });
    if (!doctor.available) {
      add("vc-secrets (tokens)", "FAIL", `${declared.join(", ")} declared, but vc-secrets is not installed (${process.env.VC_SECRETS ? "VC_SECRETS points at a missing file" : "no shim at the default path"}) — /project-init --check installs it (§0d) and writes VC_SECRETS into .claude/settings.local.json; restart`);
    } else {
      const v = secretsVerdict(parseDoctor(doctor.text), declared);
      const q = JSON.stringify(doctor.shim);
      const todo = [...(v.trustNeeded ? [`node ${q} trust`] : []), ...v.missing.map((n) => `node ${q} set ${n}`), ...v.problems];
      add("vc-secrets (tokens)", v.ready ? "PASS" : "FAIL",
        v.ready ? `${declared.join(", ")} stored and trusted` : `not ready — run in a terminal: ${todo.join(" ; ")}`);
    }
    if (process.env.VC_BRIDGE !== "1") {
      add("Launched through $VC_RUN", "WARN",
        `this run was started directly, so the token rows below see only session logins — re-run as: node "$VC_RUN" onboard verify-access`);
    }
  }

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

  // 6. Storefront user login — the REAL storefront login (store-scoped OAuth), not a soft
  //    "verify manually" WARN. See probeStorefrontLogin (D2).
  if (BACK && process.env.USER_EMAIL && process.env.USER_PASSWORD) {
    const v = await probeStorefrontLogin({
      back: BACK, store: process.env.STORE_ID || "",
      email: process.env.USER_EMAIL, password: process.env.USER_PASSWORD,
    });
    add("Storefront user login (USER_PASSWORD)", v.status, v.detail);
  } else add("Storefront user login (USER_PASSWORD)", "SKIP", "USER_EMAIL / USER_PASSWORD not set");

  // 7. Tracker
  if (profile.tracker.kind === "jira") {
    // Jira access at runtime is via the Atlassian MCP (OAuth) — see the MCP table below and
    // tracker-ops.md ("Atlassian MCP OAuth or JIRA_API_TOKEN"). JIRA_API_TOKEN is only an
    // OPTIONAL convenience probe, so a missing or rejected token is a WARN, never a hard FAIL:
    // it must not mark the deployment NOT READY (exit 1) when the operator authorizes Jira
    // through the Atlassian MCP instead — which this script cannot probe (issue #119).
    const base = (process.env.JIRA_BASE_URL || profile.tracker.baseUrl || "").replace(/\/$/, "");
    const email = process.env.JIRA_EMAIL || "";
    const token = process.env.JIRA_API_TOKEN || "";
    if (!base || !email || !token) add("Jira API token", "SKIP", "no direct token — Jira runs via Atlassian MCP OAuth (authorize in /mcp); set JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN only to probe a direct token");
    else {
      try {
        const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
        const r = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: "application/json" } });
        const me = r.ok ? await r.json() : null;
        add("Jira API token", r.ok ? "PASS" : "WARN", r.ok ? `GET /myself → 200 (${me.displayName || me.emailAddress})` : `token rejected (GET /myself → ${r.status}) — fine if using Atlassian MCP OAuth; else check JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN`);
      } catch (e) { add("Jira API token", "WARN", `token probe failed (${e.message}) — fine if using Atlassian MCP OAuth`); }
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
        const tok = execSync(`az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
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

        // Boards WRITE scope — /qa-fix transitions + comments the ticket via ado.mjs, so a
        // read-only PAT (reads above PASS, but 401 on the first transition) is surfaced here as a
        // WARN (grant-this-scope heads-up), not an onboarding-blocking FAIL (writeProbeSeverity).
        // Non-mutating: PATCH a KNOWN item with an invalid body → 401/403 = no write scope, 400 =
        // scope present (rejected at validation, nothing changed). classifyWriteProbe. Reads-PASS only.
        if (okJson) {
          const apiBase = az.apiBase || `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
          const wid = await discoverAdoWorkItemId({ apiBase, authHeader });
          if (!wid) {
            add("Azure Boards write (transition)", "WARN",
              `write scope unverified — no work item found to probe (WIQL empty/denied) via ${via}; confirm the PAT has Work Items (Read & Write)`);
          } else {
            const wp = await probeAdoWorkItemsWrite({ apiBase, authHeader, workItemId: wid });
            const wDetail =
              wp.scope === "present" ? `Work Items write confirmed (probe → ${wp.status}) via ${via}`
              : wp.scope === "absent" ? `PAT/session lacks Work Items write (probe → ${wp.status}) via ${via} — /qa-fix cannot transition/comment the ticket until you grant Azure DevOps scope: Work Items (Read & Write)`
              : wp.scope === "restricted" ? `probe → 403 on the sampled work item (via ${via}) — this item is ACL-restricted, NOT proof the PAT lacks Work Items write; confirm the target area is writable`
              : `write scope unverified (probe → ${wp.status}) via ${via} — confirm Work Items (Read & Write)`;
            add("Azure Boards write (transition)", writeProbeSeverity(wp.scope), wDetail);
          }
        }
      } catch (e) { add("Azure DevOps auth", "FAIL", e.message); }
    }

    // ─── tracker bug field contract (VCST-5582 E-g) ─────────────────────────────────────
    // Read from the PROFILE (discover-tracker.mjs already scanned it) rather than re-probing:
    // this row answers "will /qa-bug be able to fill this organization's Bug correctly?", and
    // the honest answer is whatever got persisted. No contract is a WARN, not a FAIL — the
    // create path degrades to the legacy field set labelled "unverified defaults" (E-f).
    const bugType = Object.keys(profile.tracker?.fields || {}).find((t) => /^bug$/i.test(t))
      || Object.keys(profile.tracker?.fields || {})[0]
      || "Bug";
    const bugContract = profile.tracker?.fields?.[bugType] || [];
    if (!bugContract.length) {
      add("Tracker bug field contract", "WARN",
        `no field contract scanned for ${bugType} — /qa-bug will send the LEGACY field set labelled "unverified defaults" (a field this organization does not have is rejected or silently blank). Re-run /project-init (discover-tracker) with a PAT that has Work Items READ to scan it.`);
    } else {
      const slots = resolveSlots(bugContract, profile.tracker?.fieldMap || {});
      const req = bugContract.filter((f) => f.required).length;
      const base = `${bugType}: ${bugContract.length} field(s), ${req} required`;
      if (slots.unmappedRequired.length) {
        add("Tracker bug field contract", "WARN",
          `${base} — ${slots.unmappedRequired.length} required field(s) no semantic slot maps: ` +
          slots.unmappedRequired.map((f) => `${f.name} (${f.ref})${f.allowedValues?.length ? ` [${f.allowedValues.slice(0, 6).join(" | ")}]` : ""}`).join("; ") +
          ". You will be asked for each ONCE at the first bug creation, and the answer is persisted to tracker.fieldMap / tracker.fieldDefaults.");
      } else {
        add("Tracker bug field contract", "PASS", `${base} — every required field is mapped to a semantic slot`);
      }
      if (slots.staleOverrides.length) {
        add("Tracker fieldMap override", "WARN",
          `tracker.fieldMap points at field(s) this process no longer has: ${slots.staleOverrides.join(", ")} — they are IGNORED (never sent). Re-run the tracker scan or fix the map.`);
      }
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
    const p = await probeGithubUpstream({ upstreamOrg: profile.upstream.org || "VirtoCommerce", token: ghtok, via: ghVia, scopes: ghScopes });
    // ── GitHub token kind / upstream capability (VCST-5582 A) ──────────────────────────
    // The row above only checks whether the token READS the upstream — which a fine-grained PAT
    // does perfectly, while being structurally unable to fork / open a fork-PR / file an Issue
    // there. That is why a client deployment reported READY on a token that could never deliver.
    // So the token KIND gets its own row, and it is NEVER a silent green when the upstream axis
    // is actually needed. Not a FAIL: consistent with writeProbeSeverity's design call, a missing
    // capability is a WARN with the exact remedy — the operator can fix it before /qa-fix.
    const upstreamNeeded = forkMode || profile.upstream?.fileIssues === true;
    const kindLabel = "GitHub token kind / upstream capability";
    const kindBase = `${p.tokenKind}${p.tokenScopes?.length ? ` [scopes: ${p.tokenScopes.join(",")}]` : ""}`;
    // The recommended shape — ONE classic `repo` token — is called out explicitly so the operator
    // sees "nothing further to decide" rather than wondering whether a second token is needed.
    const coversBoth = p.tokenKind === "classic" && (p.tokenScopes || []).some((s) => /^repo$/i.test(s));
    if (!upstreamNeeded) {
      add(kindLabel, "SKIP", `${kindBase} — direct-PR operator with upstream issue-filing off; the upstream fork/issue path is not used`);
    } else if (coversBoth) {
      add(kindLabel, "PASS", `classic PAT with \`repo\` — the recommended single credential: covers BOTH your own org's repos and the ${profile.upstream.org || "VirtoCommerce"} upstream (fork / fork-PR / Issue). Nothing else to set up.`);
    } else if (p.forkCapable === "yes") {
      add(kindLabel, "PASS", `${kindBase} — can fork / open a fork-PR / file an upstream Issue on ${profile.upstream.org || "VirtoCommerce"}${p.tokenKind === "classic" ? '. NOTE: `public_repo` only — add the full `repo` scope if any of YOUR OWN repos are private' : ""}`);
    } else if (p.tokenKind === "fine-grained") {
      add(kindLabel, "WARN", `fine-grained PAT — CANNOT fork, open a fork-PR, or file an Issue on ${profile.upstream.org || "VirtoCommerce"} (it is read-only on public repos it does not own, so /qa-fix §1a platform delivery and /vc-self-check deliver will 403). Remedy: ${p.remedy}`);
    } else {
      add(kindLabel, "WARN", `${kindBase} — no \`repo\` / \`public_repo\` scope detected, so the upstream fork/issue path cannot be confirmed. Remedy: ${p.remedy}`);
    }
    if (p.ok && p.login) {
      // fork mode: read is enough (you PR from your OWN fork, which you can always write).
      // direct mode: /qa-fix pushes to the upstream. `${p.repo}` (vc-platform) is only a PROXY
      // probe — the ACTUAL push target is per-bug (the routed module repo) and unknown at
      // onboarding. So no-push on the proxy is a WARN, NOT a NOT-READY FAIL: a virto-engineer whose
      // token can push the routed module but not vc-platform specifically must not be blocked here
      // (the real gate is push access to the routed repo at /qa-fix Gate 1). It surfaces at G1/G5.
      // perm "unknown" = the repo read itself failed (rate limit / offline) → WARN, can't judge.
      const scopesNote = ghScopes ? ` [scopes: ${ghScopes}]` : "";
      const base = `${ghVia}, login '${p.login}'; ${p.repo}: ${p.perm}${scopesNote}`;
      if (p.perm === "unknown") add(label, "WARN", `${base} — could not read the upstream repo permission; re-run to confirm`);
      else if (forkMode || githubCanWrite(p.perm)) add(label, "PASS", base);
      else add(label, "WARN", `${base} — no push on the ${p.repo} PROXY probe; the real push target is the per-bug routed repo (checked at /qa-fix Gate 1). Grant GitHub repo/PR write on the modules you fix, or switch to fork mode`);
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
          const apiBase = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;
          const url = `${apiBase}/_apis/git/repositories/${encodeURIComponent(name)}?api-version=7.1`;
          const res = await fetch(url, { headers: { Authorization: ado.header, Accept: "application/json" } });
          const okJson = res.ok && (res.headers.get("content-type") || "").includes("application/json");
          if (!okJson) {
            // #217 — distinguish a missing/misnamed repo (404) from an auth failure (401/403):
            // they have different remedies, so don't report every non-OK as a PAT/tenant problem.
            const why =
              res.status === 404 ? `repo '${name}' not found in ${org}/${project} — check repos.client name / project`
              : res.status === 401 || res.status === 403 ? `${ado.via} not accepted — check ADO PAT Code (Read) scope or az tenant`
              : res.status < 400 ? `${ado.via} not accepted (non-JSON response, likely an ADO sign-in page — a 203 or a followed redirect) — check ADO PAT Code (Read) scope or az tenant`
              : `unexpected response — ${ado.via} probe to ${org}/${project}`;
            add(label, "FAIL", `→ ${res.status} (${why})`);
            continue;
          }
          // Reachable — now confirm PUSH scope (the /qa-fix operation), not just read. This is
          // the read-only-PAT gap: get-repo 200 but push 401. Non-mutating: empty push body → 400 when
          // authorized, 401/403 when Code-write scope is absent.
          const wp = await probeAdoCodeWrite({ apiBase, authHeader: ado.header, repo: name });
          const adoDetail =
            wp.scope === "present" ? `reachable + Code write via ${ado.via} (probe → ${wp.status})`
            : wp.scope === "absent" ? `reachable but NO Code write (push probe → ${wp.status}) — /qa-fix pushes here; grant ADO PAT scopes: Code (Read & Write) + Pull Request (contribute)`
            : wp.scope === "restricted" ? `reachable via ${ado.via}; push probe → 403 — this repo/branch is ACL-restricted, NOT proof the PAT lacks Code write; confirm branch policies / repo permissions allow the fix branch`
            : `reachable via ${ado.via}; Code write unverified (push probe → ${wp.status}) — confirm PAT Code (Read & Write)`;
          add(label, writeProbeSeverity(wp.scope), adoDetail);
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
            // Route through writeProbeSeverity (push→present/absent) so the severity mapping is the
            // SAME tested pure function as the Azure path. Missing push is a WARN (not an onboarding
            // block) — /qa-fix's Gate 1 re-checks the actual routed repo.
            add(label, writeProbeSeverity(push ? "present" : "absent"), push
              ? `push access via ${ghVia}`
              : `reachable (${ghVia}) but NO push perm — /qa-fix pushes here; grant GitHub repo/PR write on ${owner}/${name} before running it`);
          } else add(label, "FAIL", `GET repos/${owner}/${name} → ${res.status}`);
        } catch (e) { add(label, "FAIL", e.message); }
      }
    }
  }

  // 11. Storefront upstream ref — /qa-fix Gate 1b diffs a client frontend fork against
  //     `vc-frontend @ upstreamRef` to tell a client customization from a platform bug;
  //     a non-resolvable ref breaks that diff. Confirm the baked ref actually resolves in
  //     the upstream repo. WARN (not FAIL) — Gate 1b has a reconstruct/ask fallback, so a
  //     bad ref must not block deployment readiness. Native platform / no fork ⇒ SKIP.
  const feForks = clientRepos.filter((r) => r?.kind === "frontend" && r?.upstream);
  if (!feForks.length) {
    add("Storefront upstream ref", "SKIP", "no storefront fork (native platform or client without a vc-frontend fork)");
  } else {
    for (const r of feForks) {
      const bare = splitRepo(r.name).name;
      const label = feForks.length > 1 ? `Storefront upstream ref (${bare})` : "Storefront upstream ref";
      const ref = r.upstreamRef || "";
      const m = /^(\d+)\.(\d+)/.exec(ref);
      const suggest = m ? `${m[1]}.${m[2]}.0` : "the line base tag";
      const flag = r.upstreamRefResolved === false ? " [upstreamRefResolved:false]" : "";
      if (!ref) { add(label, "WARN", `${r.upstream}: upstreamRef missing — Gate 1b will reconstruct/ask`); continue; }
      if (!ghtok) { add(label, "WARN", `cannot probe ${r.upstream} @ ${ref} — no GitHub token`); continue; }
      try {
        const res = await fetch(`https://api.github.com/repos/${r.upstream}/commits/${encodeURIComponent(ref)}`, {
          headers: { "User-Agent": "vc-verify", Accept: "application/vnd.github+json", Authorization: `Bearer ${ghtok}` },
        });
        if (res.ok) add(label, "PASS", `${r.upstream} @ ${ref} resolves`);
        else add(label, "WARN", `${r.upstream} @ ${ref} does not resolve (→ ${res.status})${flag} — Gate 1b will reconstruct (try ${suggest}) or ask`);
      } catch (e) { add(label, "WARN", `probe failed for ${r.upstream} @ ${ref}: ${e.message}`); }
    }
  }

  renderTable(results);
  renderMcp();
  // ─── report the table AS TELEMETRY, not only to the screen (VCST-5582 H) ─────────────
  // One observation per NON-PASS row. Capture only: we record that the row said WARN/FAIL/SKIP
  // and what it was about; whether that matters is decided later by /vc-self-check against the
  // oracle (§1f), which knows e.g. that a WARN on the tracker field contract means /qa-bug will
  // send unverified defaults. Emitted BEFORE the completion marker so the finalize that consumes
  // that marker already sees them. Never affects the readiness verdict or the exit code.
  emitObservations(
    results
      .map((r) => ({ cls: classForStatus(r.status), r }))
      .filter((x) => x.cls)
      .map(({ cls, r }) => ({
        class: cls,
        subject: r.name,
        code: "NONE",
        evidence: { snippet: `${r.status}: ${r.detail}`, httpStatus: httpStatusFrom(r.detail) },
      })),
    { skill: "project-init" },
  );
  // Best-effort self-diagnostics COMPLETION signal. verify-access is the LAST script every
  // /project-init path runs (fresh §9, --check §C, --add-env §D), so emitting the terminal-step
  // marker HERE makes the clean self-check line ("no plugin issues detected") fire reliably —
  // WITHOUT depending on the model remembering the trailing `complete` command (it can skip that
  // silent afterthought in auto mode; observed on the client deployment 2026-07-22 → the healthy run
  // surfaced nothing). The hook gates itself on captureEnabled (selfDiagnostics:true), so this is a
  // no-op when capture is off. NEVER throws / never affects the readiness exit code. Emitted even on
  // NOT READY — a correct NOT-READY verdict is itself a completed run (see skill-expectations §complete).
  signalSelfDiagnosticsComplete();
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

// --- MCP servers report (.mcp.json + enabled set) with per-server auth status ---
function renderMcp() {
  const MCP = {
    "playwright-chrome": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "playwright-firefox": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "playwright-edge": { auth: "local", status: () => ["OK", "local browser, no auth"] },
    "Chrome DevTools": { auth: "local", status: () => ["OK", "local, no auth"] },
    github: { auth: "token", status: (entry) => {
      // A PAT axis launches the server through vc-secrets (`node ${VC_SECRETS} run github`, VCST-6402):
      // its token is whatever vc-secrets resolves, so the answer is doctor's, not this process's env.
      if (entry && Array.isArray(entry.args) && entry.args.includes("run") && entry.args.includes("github")) {
        const d = runDoctor({ cwd: outputRoot() });
        if (!d.available) return ["NOT AUTH", "vc-secrets shim not installed — /project-init --check"];
        const p = parseDoctor(d.text);
        if (p.untrustedLaunchables.includes("server github") || p.skippedUntrusted.includes("github-pat")) return ["NOT AUTH", "vc-secrets trust not given"];
        return p.resolvable.includes("github-pat") ? ["AUTHORIZED", "github-pat via vc-secrets"] : ["NOT AUTH", "github-pat not stored — vc-secrets set github-pat"];
      }
      if (entry && entry.type === "http") return ["NEEDS OAUTH", "authorize in /mcp (no PAT axis)"];
      return ["?", "unrecognised github entry — re-run gen-mcp.mjs"];
    } },
    atlassian: { auth: "oauth", status: () => ["NEEDS OAUTH", "authorize in claude.ai connectors / /mcp"] },
    "figma-remote-mcp": { auth: "oauth", status: () => ["NEEDS OAUTH", "authorize in claude.ai connectors / /mcp"] },
    "azure-mcp": { auth: "az/AAD", status: () => tryCmd("az account show") ? ["AUTHORIZED", "az login active"] : ["NOT AUTH", "run `az login`"] },
  };

  let mcp, enabled;
  try { mcp = JSON.parse(readFileSync(".mcp.json", "utf-8")); } catch { mcp = null; }
  try { enabled = JSON.parse(readFileSync(".claude/settings.local.json", "utf-8")).enabledMcpjsonServers; } catch { enabled = null; }

  console.log("  MCP servers (.mcp.json)");
  if (!mcp) { console.log("  ✗ .mcp.json not generated yet — run gen-mcp.mjs (step 6).\n"); return; }
  const names = enabled && enabled.length ? enabled : Object.keys(mcp.mcpServers || {});

  const rows = names.map((n) => {
    const meta = MCP[n] || { auth: "?", status: () => ["?", "unknown server"] };
    const [st, detail] = meta.status(mcp.mcpServers?.[n]);
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
  console.log(`  ${paint(ANSI.bold, `Plugin readiness — TEST_ENV=${resolveTestEnv("vcst")}`)}`);
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
    : paint(ANSI.bold + ANSI.green, `  ✓ READY — the project is set up.`));
  // Full, UN-truncated remediation for each FAIL — the Detail column is width-capped, so
  // an actionable command (e.g. `az login --tenant <guid>`) would otherwise be cut off.
  if (fails.length) {
    console.log(paint(ANSI.bold, "  To resolve:"));
    for (const f of fails) console.log(`   ${paint(ANSI.red, "•")} ${f.name}: ${f.detail}`);
  }
  console.log("");
}

// Guard the top-level promise: an unexpected throw before the normal exit (line ~408) must not
// become an unhandled rejection. We do NOT fire the completion marker on a crash — a crash is not a
// clean terminal step (the clean line stays withheld, the safe direction). A total-config-load
// failure is already handled by the early `process.exit(1)` above.
// Run the readiness scan ONLY as a CLI (`node verify-access.mjs`) — guarded so the pure
// probeStorefrontLogin export can be imported by a unit test without triggering the network scan +
// process.exit (repo-standard main-guard, matching ado.mjs / discover-tracker.mjs).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[verify-access] ${err?.stack || err?.message || err}`);
    process.exit(1);
  });
}
