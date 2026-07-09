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
import { execSync } from "child_process";
import { ADO_RESOURCE } from "./probe-lib.mjs";

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

function adoAuthHeaderSync() {
  const pat = process.env.ADO_PAT || "";
  if (pat) return "Basic " + Buffer.from(":" + pat).toString("base64");
  try {
    const tok = execSync(
      `az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`,
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim();
    if (tok) return "Bearer " + tok;
  } catch { /* no az session */ }
  return "";
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
 * category-based fallback (Proposed / InProgress / Resolved / Completed).
 * states: [{ name, category }]
 */
export function deriveRoleStates(states) {
  const list = (states || []).map((s) => ({ name: s.name, category: s.category || "" }));
  const byName = (rx) => list.find((s) => rx.test(s.name))?.name;
  const byCat = (cat) => list.find((s) => (s.category || "").toLowerCase() === cat)?.name;
  // in-progress = the CANONICAL "work started" entry to the InProgress category = "Active"
  // (or "In Progress"). Do NOT pick "On Dev" here: in these custom VC processes "On Dev" /
  // "On Review" / "Ready for QA" are DOWNSTREAM sub-states that map to the in-review /
  // ready-for-test roles — the start-of-work role is Active. (Confirmed against the LEO board:
  // New → Active is correct; New → On Dev is wrong.)
  const inProgress =
    byName(/\bactive\b|\bin ?progress\b|\bstarted\b/i) || byCat("inprogress");
  const inReview = byName(/\bon review\b|in review|code ?review|reviewing/i) || byName(/review/i) || inProgress;
  const readyForTest =
    byName(/ready for (qa|test)/i) || byName(/on qa|to test|testing|ready for/i) || byName(/resolved/i) || byCat("resolved");
  const done = byName(/closed|done|complete/i) || byCat("completed");
  const out = {};
  if (inProgress) out["in-progress"] = inProgress;
  if (inReview) out["in-review"] = inReview;
  if (readyForTest) out["ready-for-test"] = readyForTest;
  if (done) out["done"] = done;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const kind = args.tracker || "azure";

  if (kind === "jira") {
    // Jira: format facts only; transitions are discovered live at runtime.
    console.log(JSON.stringify({ kind: "jira", ticketKeyFormat: "prefixed", crossLinkToken: "" }, null, 2));
    return;
  }

  const org = args.org || process.env.ADO_ORG || "";
  const project = args.project || process.env.ADO_PROJECT || "";
  if (!org || !project) {
    console.error("[discover-tracker] need --org/--project (or ADO_ORG/ADO_PROJECT).");
    process.exit(2);
  }
  const authHeader = adoAuthHeaderSync();
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
  };
  console.error(
    `[discover-tracker] scanned ${Object.keys(workItemTypes).length} type(s); roleStates(${primary}): ` +
      JSON.stringify(roleStates),
  );
  console.log(JSON.stringify(out, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("discover-tracker.mjs")) {
  main();
}
