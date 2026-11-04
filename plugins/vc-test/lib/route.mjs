// plugins/vc-test/lib/route.mjs — a ticket's type x status ROLE -> the job a run does, decided by script at step 0 of
// /vc-test:qa-ticket (spec §3 Routing). No status name lives here: the operator's `test.routing` (and, on Azure Boards,
// `tracker.azure.roleStates`) say which status means which role; this file only maps type x role to a job.
//   node plugins/vc-test/lib/route.mjs --key <KEY>              reads type, status, issuetype.subtask and the parent
//                                                                (and the parent's type and status): two reads at most
//   node plugins/vc-test/lib/route.mjs --bundle <bundle.json>   routes from the bundle's fields.type / fields.status; no
//                                                                parent is read, so a type named Sub-task / Subtask is
//                                                                `unresolved` (the name only refuses, never routes)
//   On Azure Boards there are no sub-tasks: the `subtask` flag is ignored, no parent is read, every type but Bug is `test`.
//   A --bundle that carries the ticket's change also reads its SHAPE (`shapeOf`; --prepare <the kept prepare.json> adds
//   the PR diffs, so a new page that git records as a rename and an extension-point registration are seen): a non-Bug `test` whose diff resolves
//   every refactor signal becomes `technical-change`, `next` = /qa-test <KEY> — that flow's scoped regression plus the
//   2a sync / update / rewrite of the existing cases (.claude/knowledge/execution/ticket-routing.md §5d). It fails
//   CLOSED: any signal unresolved, or no change in the bundle, keeps `test`.
// stdout is the result JSON: { job, role, reason, next[, shape] }, job one of test | technical-change | verify-fix |
//   hotfix-check | unresolved.
// Exit: 0 a decided job · 1 usage · 2 no readable project-profile.json (a STOP, U19) · 3 the tracker cannot be read here
//   (the $VC_RUN bridge is missing or refused it — HostGoverned — or the read failed): the command routes after step 1
//   with --bundle · 4 `unresolved` (the status names no role, the type is unknown, or a Sub-task's parent was not read).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { argOf, KEY_RE, outputRoot } from "./paths.mjs";
import { ProfileError, loadProfile } from "./profile.mjs";
import { ROUTING_ROLES } from "./init-plan.mjs";
import { resolveProfile } from "../skills/ticket-context/lib/profile.mjs";
import { HostGoverned, vcRun } from "../skills/ticket-context/lib/bridge.mjs";
import { GapError } from "../skills/ticket-context/lib/gap.mjs";
import { jiraConnector } from "../skills/ticket-context/lib/connectors/jira.mjs";
import { azureBoardsConnector } from "../skills/ticket-context/lib/connectors/azure-boards.mjs";

// vc-init's Azure role names (tracker.azure.roleStates keys) and the routing role each one means.
const AZURE_ROLE = Object.freeze({ "ready-for-test": "fix-ready", testing: "fix-ready", "in-progress": "not-fixed", "in-review": "not-fixed", reopen: "not-fixed" });

const lower = (s) => String(s ?? "").trim().toLowerCase();
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** The role a status has: the operator's `test.routing` first, then the Azure role states. null when neither names it. */
export function roleOf({ status, profile }) {
  const name = lower(status);
  if (!name) return null;
  const routing = obj(profile?.test?.routing);
  for (const role of ROUTING_ROLES) {
    if ((Array.isArray(routing[role]) ? routing[role] : []).some((s) => lower(s) === name)) return role;
  }
  for (const [azureRole, state] of Object.entries(obj(profile?.tracker?.azure?.roleStates))) {
    if (AZURE_ROLE[azureRole] && lower(state) === name) return AZURE_ROLE[azureRole];
  }
  return null;
}

const isAzure = (profile) => profile?.tracker?.kind === "azure"; // the raw profile; resolveProfile's `tracker` is the same kind
const SUBTASK_TYPE = /^sub-?task$/i; // a --bundle names the type only; used to refuse, never to route

const unresolved = (role, reason) => ({ job: "unresolved", role, reason, next: null });

function decide({ key, type, status, profile }) {
  if (!lower(type)) return unresolved(null, "the ticket's type was not read");
  if (lower(type) !== "bug") return { job: "test", role: roleOf({ status, profile }), reason: `${type} ticket: tested against its acceptance criteria`, next: null };
  const role = roleOf({ status, profile });
  const k = key ?? "<KEY>";
  if (role === "fix-ready") return { job: "verify-fix", role, reason: `Bug in "${status}" (fix-ready): the fix is verified`, next: `/vc-fix:qa-verify-fix ${k}` };
  if (role === "hotfix-ready") return { job: "hotfix-check", role, reason: `Bug in "${status}" (hotfix-ready): the hotfix is delivered and checked`, next: `/qa-hotfix-check ${k}` };
  if (role === "not-fixed") return { job: "test", role, reason: `Bug in "${status}" (not-fixed): reproduce and characterize`, next: `/vc-fix:qa-fix ${k}` };
  return unresolved(null, `Bug in "${status ?? "no status"}": test.routing does not list that status under fix-ready, hotfix-ready or not-fixed (nor does the tracker's role states) — add it with /vc-test:init`);
}

/**
 * type x status role -> { job, role, reason, next }. A Sub-task is routed by its parent: the parent's type and status
 * re-enter the table, and `next` names the parent (the Bug the verify or the fix is about). `parent` is
 * { key, type, subtask, status } or null when none was read.
 */
export function route({ key = null, type = null, subtask = false, status = null, parent = null, profile = {} }) {
  if (!subtask || isAzure(profile)) return decide({ key, type, status, profile });
  if (!parent) return unresolved(null, "a Sub-task is routed by its parent and no parent was read");
  if (parent.subtask) return unresolved(null, `a Sub-task is routed by its parent, and ${parent.key ?? "its parent"} is a Sub-task too`);
  const r = decide({ key: parent.key, type: parent.type, status: parent.status, profile });
  return { ...r, reason: `Sub-task of ${parent.key ?? "its parent"} (${parent.type ?? "no type"}, "${parent.status ?? "no status"}"): ${r.reason}` };
}

// The refactor vocabulary a ticket's summary or description uses for a mechanical change (§5d "the ticket").
const REFACTOR_WORDS = /\b(refactor|deprecat|migrat|replac|renam|extract|upgrad|bump|consolidat)\w*|\bmov(e|es|ed|ing)\b|\bclean[- ]?up\b/i;
// An added file that is a runtime surface someone can exercise: a page, a route, a menu entry, an extension point, a
// GraphQL operation or schema, a REST controller, a module manifest (§5d "exported surface"). Tests and stories never count.
const SURFACE_FILE = /(^|\/)(pages?|views|routes?|router)\/|(^|\/)(routes?|router)\.[cm]?[jt]s$|menu\.json$|extension|\.graphql$|(^|\/)module\.manifest$|Controller\.cs$|Schema\.cs$/i;
// Navigation: a menu or router file CHANGED in any way (added, renamed, or modified) moves what a user can reach —
// VCST-4386 modified `config/menu.json` and `router/routes/account.ts` while its new page came in as a git rename.
const NAV_FILE = /(^|\/)menu\.json$|(^|\/)(routes?|router)(\/|\.[cm]?[jt]s$)/i;
// An added diff line that registers into an extension point (`register("cartPayment", …)`).
const EXTENSION_REGISTER = /^\+(?!\+).*\bregister\(\s*["'`][\w-]+["'`]/m;

/** The new (`new file` / `rename to`) and changed paths of a unified diff, and whether it registers an extension. */
export function diffFacts(patch) {
  const created = [], changed = [];
  let file = null;
  for (const line of String(patch ?? "").split("\n")) {
    const m = /^diff --git a\/\S+ b\/(\S+)/.exec(line);
    if (m) { file = m[1]; changed.push(file); continue; }
    if (file && /^new file mode/.test(line)) created.push(file);
    const r = /^rename to (.+)$/.exec(line);
    if (r) created.push(r[1].trim());
  }
  return { created, changed, registers: EXTENSION_REGISTER.test(String(patch ?? "")) };
}
const TEST_FILE = /\.(test|spec|stories)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?)\//i;
const NON_PRODUCT_LAYERS = new Set(["test", "tests", "docs", "ci", "build"]);
// Contract flags of the CHANGE analyst's hidden_behaviour checklist that put the change outside a mechanical refactor.
const CONTRACT_ITEMS = ["db-migrations", "feature-flags", "rest-contract", "search-indexing", "background-jobs"];

/**
 * The change's shape, from a ticket-context bundle: `technical-change` only when every signal resolves affirmatively,
 * else `feature` (fail closed). A deleted PR (gap reason `deleted`) and a context-only PR are not the change; any other
 * gap is an unread change and refuses. On a single storefront layer a `graphql-schema: yes` is the client's own queries,
 * not the server schema, so it does not refuse; on a backend layer it does.
 */
export function shapeOf(bundle, { diffs = {} } = {}) {
  const signals = [];
  const sig = (name, ok, detail) => { signals.push({ name, ok, detail }); return ok; };
  const text = `${bundle?.fields?.summary ?? ""}\n${bundle?.fields?.description ?? ""}`;
  const word = REFACTOR_WORDS.exec(text)?.[0];
  sig("intent", !!word, word ? `the ticket says "${word}"` : "no refactor wording in the summary or description");
  const prs = Array.isArray(bundle?.change?.prs) ? bundle.change.prs : [];
  const unread = prs.filter((p) => p.gap && p.gap.reason !== "deleted");
  const product = prs.filter((p) => !p.gap && !p.context_only);
  sig("one-change", product.length === 1 && unread.length === 0,
    unread.length ? `${unread.length} PR(s) not read` : `${product.length} product PR(s)`);
  const pr = product.length === 1 ? product[0] : null;
  const layers = Object.keys(pr?.layers ?? {}).filter((l) => !NON_PRODUCT_LAYERS.has(lower(l)));
  sig("one-layer", layers.length === 1, layers.length ? `layers: ${layers.join(", ")}` : "no product layer read");
  // With the PR's diff, created = new files and rename targets, changed = every file; without it, the PR's `added`
  // list and the CHANGE analyst's per-layer file lists (which name a rename target as a plain path).
  const diff = pr ? diffs[`${pr.repo}#${pr.number}`] : undefined;
  const facts = typeof diff === "string" ? diffFacts(diff) : null;
  const created = facts ? facts.created : (pr?.added ?? []);
  const changed = facts ? facts.changed : [...created, ...Object.values(pr?.layers ?? {}).flat().map((f) => String(f).replace(/\s*\(removed\)$/, ""))];
  const productFile = (f) => !TEST_FILE.test(f);
  const surfaces = [
    ...created.filter((f) => SURFACE_FILE.test(f) && productFile(f)),
    ...changed.filter((f) => NAV_FILE.test(f) && productFile(f)),
    ...(facts?.registers ? ["an extension-point registration"] : []),
  ];
  const endpoints = pr?.endpoints ?? [];
  const hits = [...new Set([...surfaces, ...endpoints])];
  sig("no-new-surface", !!pr && hits.length === 0,
    !pr ? "no single product PR to read" : hits.length ? `new runtime surface (${hits.length}): ${hits.slice(0, 3).join(", ")}`
      : `no page, route, menu, extension point, operation or endpoint added${facts ? "" : " (no diff: file lists only)"}`);
  const hidden = (bundle?.change?.hidden_behaviour ?? []).filter((h) => !pr || h.pr === undefined || h.pr === `${pr.repo}#${pr.number}`);
  const yes = (item) => hidden.some((h) => h.item === item && lower(h.answer) === "yes");
  const storefrontOnly = layers.length === 1 && /storefront|frontend/i.test(layers[0]);
  const contract = [...CONTRACT_ITEMS, ...(storefrontOnly ? [] : ["graphql-schema"])].filter(yes);
  sig("contract-unchanged", hidden.length > 0 && contract.length === 0,
    hidden.length === 0 ? "no hidden-behaviour answers to read" : contract.length ? `changes: ${contract.join(", ")}` : "no migration, flag, REST, index, job or server-schema change");
  return { shape: signals.every((s) => s.ok) ? "technical-change" : "feature", signals };
}

/** A non-Bug `test` routed from a bundle takes its change's shape; every other job is left as it is. */
export function withShape(result, bundle, type, { diffs = {} } = {}) {
  if (result.job !== "test" || lower(type) === "bug" || !bundle?.change) return result;
  const shape = shapeOf(bundle, { diffs });
  if (shape.shape !== "technical-change") return { ...result, shape };
  const k = typeof bundle.ticket === "string" ? bundle.ticket : "<KEY>";
  return {
    job: "technical-change", role: result.role, shape, next: `/qa-test ${k}`,
    reason: `${type} ticket whose change is a mechanical refactor (${shape.signals.map((s) => s.detail).join("; ")}): scoped regression plus the sync of the existing cases, not a scenario hunt`,
  };
}

const snapshot = (issue) => ({
  key: issue?.key ?? null,
  type: issue?.fields?.issuetype?.name ?? null,
  subtask: !!issue?.fields?.issuetype?.subtask,
  status: issue?.fields?.status?.name ?? null,
});

/** The ticket, and for a Sub-task its parent (a second read), through the profile's tracker connector. */
async function readTicket({ key, raw, root }) {
  const profile = resolveProfile(raw);
  if (!profile.trackerBase) throw new GapError("no-credential", "project-profile.json has no tracker base URL — run /project-init --check");
  if (!vcRun()) throw new GapError("no-credential", "VC_RUN is not set — run /project-init");
  const tracker = profile.tracker === "azure" ? azureBoardsConnector({ profile, key, root }) : jiraConnector({ base: profile.trackerBase, key, root });
  const fields = ["issuetype", "status", "parent"];
  const issue = await tracker.issue(key, fields);
  const own = snapshot(issue);
  const parentKey = issue.fields?.parent?.key;
  let parent = null;
  if (profile.tracker !== "azure" && own.subtask && parentKey) { // the Azure connector flags a Task a sub-task; on Azure it is not one
    try { parent = { ...snapshot(await tracker.issue(parentKey, ["issuetype", "status"])), key: parentKey }; } catch (e) { if (e instanceof HostGoverned) throw e; }
  }
  return { ...own, key, parent };
}

/** The kept prepare's PR diffs, keyed `repo#number`; a PR whose diff cannot be read is simply absent. */
function readDiffs(path) {
  let p;
  try { p = JSON.parse(readFileSync(path, "utf8")); } catch (e) { usage(`${path}: ${e.message}`); }
  const out = {};
  for (const pr of Array.isArray(p.prs) ? p.prs : []) {
    if (!pr.diff_path) continue;
    try { out[`${pr.repo}#${pr.number}`] = readFileSync(pr.diff_path, "utf8"); } catch { /* unread: the file lists are used */ }
  }
  return out;
}

function usage(msg) {
  console.error(`${msg}\nusage: route.mjs --key <KEY> | --bundle <bundle.json> [--prepare <prepare.json>]`);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const key = argOf(argv, "key");
  const bundle = argOf(argv, "bundle");
  const prepare = argOf(argv, "prepare");
  if ((key === undefined) === (bundle === undefined) || key?.startsWith("--") || bundle?.startsWith("--")) usage("give exactly one of --key or --bundle");
  if (prepare !== undefined && (bundle === undefined || prepare.startsWith("--"))) usage("--prepare goes with --bundle");
  if (key !== undefined && !KEY_RE.test(key)) usage(`not a ticket key: "${key}"`);
  const root = outputRoot();
  let raw;
  try { raw = loadProfile({ root }); } catch (e) {
    if (!(e instanceof ProfileError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
  let input;
  let b = null;
  if (bundle !== undefined) {
    try { b = JSON.parse(readFileSync(bundle, "utf8")); } catch (e) { usage(`${bundle}: ${e.message}`); }
    input = { key: typeof b.ticket === "string" ? b.ticket : null, type: b.fields?.type ?? null, status: b.fields?.status ?? null, subtask: SUBTASK_TYPE.test(b.fields?.type ?? "") };
  } else {
    try { input = await readTicket({ key, raw, root }); } catch (e) {
      if (e instanceof ProfileError) { console.error(e.message); process.exit(2); }
      if (!(e instanceof HostGoverned) && !(e instanceof GapError)) throw e;
      console.log(JSON.stringify({ error: e instanceof HostGoverned ? "host-governed" : e.reason, detail: e.detail ?? e.message }, null, 2));
      process.exit(3);
    }
  }
  const routed = route({ ...input, profile: raw });
  const result = b ? withShape(routed, b, input.type, { diffs: prepare ? readDiffs(prepare) : {} }) : routed;
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.job === "unresolved" ? 4 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
