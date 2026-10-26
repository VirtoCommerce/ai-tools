// plugins/vc-test/lib/route.mjs — a ticket's type x status ROLE -> the job a run does, decided by script at step 0 of
// /vc-test:qa-ticket (spec §3 Routing). No status name lives here: the operator's `test.routing` (and, on Azure Boards,
// `tracker.azure.roleStates`) say which status means which role; this file only maps type x role to a job.
//   node plugins/vc-test/lib/route.mjs --key <KEY>              reads type, status, issuetype.subtask and the parent
//                                                                (and the parent's type and status): two reads at most
//   node plugins/vc-test/lib/route.mjs --bundle <bundle.json>   routes from the bundle's fields.type / fields.status; no
//                                                                parent is read, so a Sub-task is `unresolved`
// stdout is the result JSON: { job, role, reason, next }, job one of test | verify-fix | hotfix-check | unresolved.
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
  if (!subtask) return decide({ key, type, status, profile });
  if (!parent) return unresolved(null, "a Sub-task is routed by its parent and no parent was read");
  if (parent.subtask) return unresolved(null, `a Sub-task is routed by its parent, and ${parent.key ?? "its parent"} is a Sub-task too`);
  const r = decide({ key: parent.key, type: parent.type, status: parent.status, profile });
  return { ...r, reason: `Sub-task of ${parent.key ?? "its parent"} (${parent.type ?? "no type"}, "${parent.status ?? "no status"}"): ${r.reason}` };
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
  if (own.subtask && parentKey) {
    try { parent = { ...snapshot(await tracker.issue(parentKey, ["issuetype", "status"])), key: parentKey }; } catch (e) { if (e instanceof HostGoverned) throw e; }
  }
  return { ...own, key, parent };
}

function usage(msg) {
  console.error(`${msg}\nusage: route.mjs --key <KEY> | --bundle <bundle.json>`);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const key = argOf(argv, "key");
  const bundle = argOf(argv, "bundle");
  if ((key === undefined) === (bundle === undefined) || key?.startsWith("--") || bundle?.startsWith("--")) usage("give exactly one of --key or --bundle");
  if (key !== undefined && !KEY_RE.test(key)) usage(`not a ticket key: "${key}"`);
  const root = outputRoot();
  let raw;
  try { raw = loadProfile({ root }); } catch (e) {
    if (!(e instanceof ProfileError)) throw e;
    console.error(e.message);
    process.exit(2);
  }
  let input;
  if (bundle !== undefined) {
    let b;
    try { b = JSON.parse(readFileSync(bundle, "utf8")); } catch (e) { usage(`${bundle}: ${e.message}`); }
    input = { key: typeof b.ticket === "string" ? b.ticket : null, type: b.fields?.type ?? null, status: b.fields?.status ?? null, subtask: !!b.fields?.subtask };
  } else {
    try { input = await readTicket({ key, raw, root }); } catch (e) {
      if (e instanceof ProfileError) { console.error(e.message); process.exit(2); }
      if (!(e instanceof HostGoverned) && !(e instanceof GapError)) throw e;
      console.log(JSON.stringify({ error: e instanceof HostGoverned ? "host-governed" : e.reason, detail: e.detail ?? e.message }, null, 2));
      process.exit(3);
    }
  }
  const result = route({ ...input, profile: raw });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.job === "unresolved" ? 4 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
