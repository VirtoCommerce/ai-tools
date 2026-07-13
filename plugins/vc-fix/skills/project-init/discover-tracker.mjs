#!/usr/bin/env node
/**
 * skills/project-init/discover-tracker.mjs
 *
 * Scan the configured bug tracker and BAKE its status model into the deployment profile,
 * so /qa-fix transitions tickets by lifecycle ROLE (in-progress / in-review /
 * ready-for-test / done) without ever hardcoding a workflow name and WITHOUT asking the
 * operator. This is the "tracker is the source of its own states" step of the redesign.
 *
 * Azure Boards: reads the work-item TYPES and, per type, its allowed STATES (different
 * types have different sets — Bug vs Task vs User story), then derives a role→state map
 * from the primary type's states via category + name heuristics. Also captures apiBase,
 * projectId, ticketKeyFormat="numeric", crossLinkToken="AB#".
 *
 * Jira: emits the format facts (prefixed keys, no cross-link token) — Jira transitions are
 * discovered LIVE at runtime (getTransitionsForJiraIssue), so no state list is baked.
 *
 * Emits ONE JSON object on stdout (notes on stderr) for `gen-profile.mjs --tracker-json`.
 *
 * Usage:
 *   node discover-tracker.mjs --tracker azure --org Lakeshirt-LEO --project LEO [--types Bug,Task,"User story"] [--primary Bug]
 *   node discover-tracker.mjs --tracker jira
 * Auth (azure): ADO_PAT (Basic) or an `az login` session. NEVER prints the token.
 */
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { resolveAdoAuth } from "./probe-lib.mjs";
import { outputRoot } from "./lib/paths.mjs";

/** Write the result to --out (relative to the deployment project) and/or print it. */
function emit(out, args) {
  if (args.out) {
    const p = resolve(outputRoot(), args.out);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
    console.error(`[discover-tracker] wrote ${p}`);
  }
  if (args.print || !args.out) console.log(JSON.stringify(out, null, 2));
}

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

async function adoGet(url, authHeader) {
  const res = await fetch(url, { headers: { Authorization: authHeader, Accept: "application/json" }, redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`sign-in redirect (${res.status}) — ADO auth not accepted (ADO_PAT empty/invalid?)`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Derive a lifecycle role → state map from a type's states. Pure. Name heuristics first
 * (a rich custom process like LEO's has "On Dev" / "On Review" / "Ready for QA"), with a
 * category-based fallback (Proposed / InProgress / Resolved / Completed). Also derives
 * best-effort QA-side roles (testing / tested / reopen) used by /qa-verify-fix — optional,
 * emitted only when found, and NOT part of the /qa-fix completeness gate.
 * states: [{ name, category }]
 */
export function deriveRoleStates(states) {
  const list = (states || []).map((s) => ({ name: s.name, category: s.category || "" }));
  // Claim-once: a state name maps to AT MOST ONE role. `pick` returns the first UNCLAIMED
  // state matching the regex (or, for pickCat, the category) and marks it claimed — so
  // overlapping heuristics (e.g. "QA Done" matching both `tested` and `done`, or "Tested on
  // QA" matching both `tested` and `testing`) can't map one state to two roles. The
  // resolution ORDER below therefore encodes priority: a more specific role is resolved
  // BEFORE a broader one that could also match its state.
  const claimed = new Set();
  const pick = (rx) => {
    const hit = list.find((s) => !claimed.has(s.name) && rx.test(s.name))?.name;
    if (hit) claimed.add(hit);
    return hit;
  };
  const pickCat = (cat) => {
    const hit = list.find((s) => !claimed.has(s.name) && (s.category || "").toLowerCase() === cat)?.name;
    if (hit) claimed.add(hit);
    return hit;
  };
  // in-progress = the CANONICAL "work started" entry to the InProgress category = "Active"
  // (or "In Progress"). Do NOT pick "On Dev" here: in these custom VC processes "On Dev" /
  // "On Review" / "Ready for QA" are DOWNSTREAM sub-states that map to the in-review /
  // ready-for-test roles — the start-of-work role is Active. (Confirmed against the LEO board:
  // New → Active is correct; New → On Dev is wrong.)
  const inProgress = pick(/\bactive\b|\bin ?progress\b|\bstarted\b/i) || pickCat("inprogress");
  // Deliberately NO fallback to `inProgress` here. Aliasing in-review to whatever
  // in-progress resolved to would silently collapse two distinct pipeline milestones
  // ("still being fixed" vs "PR open, awaiting human review") onto the same state —
  // a wrong-but-plausible mapping that transitionPolicy:"auto" would then apply with
  // no human catching it. Leaving the role unset when no review-like state exists is
  // the correct signal: callers (gen-profile.mjs, tracker-ops.md's fallback) treat a
  // missing role as "ask the operator", not "guess".
  const inReview = pick(/\bon review\b|in review|code ?review|reviewing/i) || pick(/review/i);
  // ready-for-test = the "awaiting human/QA" milestone. TIGHT preference (explicit
  // "Ready for QA/Test", else "Resolved", else category) so the broad "testing"/"on qa"
  // wording below maps to a DISTINCT `testing` state instead of colliding here.
  const readyForTest = pick(/ready for (qa|test)/i) || pick(/\bresolved\b/i) || pickCat("resolved");
  // QA-side roles (consumed by /qa-verify-fix). `tested` is resolved BEFORE `testing` so a
  // "Tested on QA"-style state is claimed by `tested`, leaving the plain "On QA" for
  // `testing`; both are resolved BEFORE `done` so a "QA Done" state isn't swallowed by
  // done's broad /done/. Claim-once makes the testing-vs-ready-for-test dedup automatic too.
  // `\bverified\b` is word-bounded — an unbounded /verified/i would also match an unrelated
  // state like "Unverified" (a common early-triage name, not a QA-pass milestone).
  const tested = pick(/\btested\b|qa (passed|done)|\bverified\b/i);
  const testing = pick(/\btesting\b|on qa|in test|qa in progress/i);
  // reopen: keep patterns anchored to review/QA-rejection wording; `\brejected\b` /
  // `\bfailed\b` are word-bounded to reduce false-positives on unrelated custom states.
  const reopen = pick(/reopen|re-?open|need fixes|need to recheck|\brejected\b|\bfailed\b/i);
  // done LAST — after tested/reopen have claimed their states.
  const done = pick(/closed|\bdone\b|complete/i) || pickCat("completed");
  const out = {};
  if (inProgress) out["in-progress"] = inProgress;
  if (inReview) out["in-review"] = inReview;
  if (readyForTest) out["ready-for-test"] = readyForTest;
  if (testing) out["testing"] = testing;
  if (tested) out["tested"] = tested;
  if (reopen) out["reopen"] = reopen;
  if (done) out["done"] = done;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const kind = args.tracker || "azure";

  if (kind === "jira") {
    // Jira: format facts only; transitions are discovered live at runtime.
    emit({ kind: "jira", ticketKeyFormat: "prefixed", crossLinkToken: "" }, args);
    return;
  }

  const org = args.org || process.env.ADO_ORG || "";
  const project = args.project || process.env.ADO_PROJECT || "";
  if (!org || !project) {
    console.error("[discover-tracker] need --org/--project (or ADO_ORG/ADO_PROJECT).");
    process.exit(2);
  }
  const { authHeader } = resolveAdoAuth();
  if (!authHeader) {
    console.error("[discover-tracker] need ADO_PAT or an `az login` session.");
    process.exit(2);
  }
  const apiBase = `https://dev.azure.com/${org}/${encodeURIComponent(project)}`;

  // projectId (for policy-evaluation artifactIds etc.)
  let projectId = "";
  try {
    projectId = (await adoGet(`https://dev.azure.com/${org}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`, authHeader)).id || "";
  } catch (e) {
    console.error(`[discover-tracker] projectId lookup failed: ${e.message}`);
  }

  // which types to scan
  let allTypes = [];
  try {
    allTypes = ((await adoGet(`${apiBase}/_apis/wit/workitemtypes?api-version=7.1`, authHeader)).value || []).map((t) => t.name);
  } catch (e) {
    console.error(`[discover-tracker] work item types lookup failed: ${e.message}`);
    process.exit(2);
  }
  const requested = args.types
    ? String(args.types).split(",").map((s) => s.trim()).filter(Boolean)
    : ["Bug", "Task", "User story"];
  // case-insensitive intersect with actual types
  const lc = new Map(allTypes.map((t) => [t.toLowerCase(), t]));
  const scan = requested.map((r) => lc.get(r.toLowerCase())).filter(Boolean);
  if (!scan.length) scan.push(...allTypes.slice(0, 1));

  const workItemTypes = {};
  for (const t of scan) {
    try {
      const states = ((await adoGet(`${apiBase}/_apis/wit/workitemtypes/${encodeURIComponent(t)}/states?api-version=7.1`, authHeader)).value || [])
        .map((s) => ({ name: s.name, category: s.category }));
      workItemTypes[t] = { states: states.map((s) => s.name) };
      workItemTypes[t]._categories = Object.fromEntries(states.map((s) => [s.name, s.category]));
    } catch (e) {
      console.error(`[discover-tracker] states for '${t}' failed: ${e.message}`);
    }
  }

  // roleStates from the primary type (default Bug) — the type /qa-fix drives.
  const primary = lc.get(String(args.primary || "Bug").toLowerCase()) || scan[0];
  const primaryStates = ((workItemTypes[primary]?.states) || []).map((name) => ({
    name,
    category: workItemTypes[primary]?._categories?.[name] || "",
  }));
  const roleStates = deriveRoleStates(primaryStates);
  const ALL_ROLES = ["in-progress", "in-review", "ready-for-test", "done"];
  const missingRoles = ALL_ROLES.filter((r) => !roleStates[r]);
  // QA-side roles are best-effort — surfaced but deliberately kept OUT of ALL_ROLES /
  // roleStatesComplete: adding them would regress gen-profile.mjs's auto-transition
  // enablement and affect the native /qa-fix flow (which only needs the 4 fix roles).
  const QA_ROLES = ["testing", "tested", "reopen"];
  const missingQaRoles = QA_ROLES.filter((r) => !roleStates[r]);
  // Separate completeness signal for the QA-side roles, so a caller (gen-profile.mjs,
  // /qa-verify-fix) can gate QA-specific "auto" transitions on QA-role confidence WITHOUT
  // touching `roleStatesComplete` (fix-side only) — a heuristic mismatch on `testing`/
  // `tested`/`reopen` must never silently ride along on the fix-side completeness signal.
  const qaRoleStatesComplete = missingQaRoles.length === 0;

  // drop the helper _categories before emitting
  for (const t of Object.keys(workItemTypes)) delete workItemTypes[t]._categories;

  const out = {
    kind: "azure",
    ticketKeyFormat: "numeric",
    crossLinkToken: "AB#",
    apiBase,
    projectId,
    workItemTypes,
    roleStates,
    // Surfaced so gen-profile.mjs can require a COMPLETE map before enabling silent
    // "auto" transitions (a partial map — e.g. no distinct review state — should keep
    // asking, not guess).
    roleStatesComplete: missingRoles.length === 0,
    // QA-side counterpart, consumed only by the QA-side auto-transition gate (never mixed
    // into roleStatesComplete — see the comment on QA_ROLES above).
    qaRoleStatesComplete,
  };
  console.error(
    `[discover-tracker] scanned ${Object.keys(workItemTypes).length} type(s); roleStates(${primary}): ` +
      JSON.stringify(roleStates) +
      (missingRoles.length
        ? ` — MISSING role(s): ${missingRoles.join(", ")} (no matching state found; confirm/hand-edit before relying on auto transitions)`
        : ""),
  );
  if (missingQaRoles.length) {
    console.error(
      `[discover-tracker] QA-side role(s) not auto-derived (used by /qa-verify-fix, optional): ${missingQaRoles.join(", ")}` +
        ` — confirm/hand-edit if you run /qa-verify-fix on this deployment.`,
    );
  }
  emit(out, args);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("discover-tracker.mjs")) {
  main();
}
