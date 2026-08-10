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
import { fileURLToPath } from "url";
import { resolveAdoAuth } from "./probe-lib.mjs";
import { outputRoot } from "./lib/paths.mjs";
// Layer .env.defaults → .env.<env> → .env.local into process.env before reading ADO_PAT.
// resolveAdoAuth() reads a bare process.env.ADO_PAT, which the shell rarely exports — the token
// lives in .env.local. Siblings (discover-repos/verify-access/ensure-session) already load it;
// without this call the ADO scan authed against an empty PAT and 302'd to sign-in (VCST-5582).
import { loadLayeredEnv } from "../../scripts/lib/load-layered-env.mjs";
// Self-diagnostics CAPTURE channel (VCST-5582 H). Every scan step below degrades GRACEFULLY —
// warn to stderr, write a partial result, exit 0 — which is correct onboarding behaviour and was
// also a total blind spot: the field-contract scan 400s, `fields` comes out `{}`, /qa-bug silently
// falls back to "unverified defaults", and self-diagnostics reported the run clean. Each catch
// site now ALSO records a structured observation. Capture only — severity is decided later.
import { emitObservations, httpStatusFrom, scrubUrls } from "./lib/diag-obs.mjs";
// The contract PARSER lives with its consumers (the create path) so the scan and the payload
// builder can never disagree about the shape. Pure — see that file's header.
import { parseFieldContract, resolveSlots, parseFormLayout, filterContractForPersist, operatorQuestions } from "../qa-fix-routing/bug-contract.mjs";

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
  // Observations collected across the scan and emitted in ONE batch at the end (one child
  // process, not one per finding). A failure here can never affect the scan: `obs` pushes are
  // plain array writes and emitObservations is fully swallowed.
  const obs = [];
  const obsHttp = (subject, e) => obs.push({
    class: "http_non2xx", subject,
    code: "NONE",
    evidence: { snippet: scrubUrls(e?.message ?? e), httpStatus: httpStatusFrom(e?.message ?? "") },
  });

  if (kind === "jira") {
    // Jira: format facts only; transitions are discovered live at runtime.
    emit({ kind: "jira", ticketKeyFormat: "prefixed", crossLinkToken: "" }, args);
    return;
  }

  // Azure path: bring .env.local's ADO_PAT (and any ADO_ORG/ADO_PROJECT) into process.env before
  // the reads below. Best-effort — the explicit org/project/auth guards still fire on a real miss.
  try {
    loadLayeredEnv("vcst");
  } catch (e) {
    console.error(`[discover-tracker] env load skipped: ${e.message}`);
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
    obsHttp("ado_project_id", e);
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

  // ─── field data types, ONE org-level call (VCST-5582 E-a) ─────────────────────────
  // `_apis/wit/fields` lists every field in the org with its data type (html / plainText /
  // string / picklistString / identity / treePath / integer / …). One call beats one per
  // field, and the TYPE is what makes the HTML decision DERIVED instead of asserted.
  // Best-effort: a failure here degrades the contract's `type` to "string", it never aborts
  // the scan (read-only Work Items scope is enough; a restricted PAT just yields fewer facts).
  let fieldTypes = [];
  try {
    fieldTypes = ((await adoGet(`https://dev.azure.com/${org}/_apis/wit/fields?api-version=7.1`, authHeader)).value || [])
      .map((f) => ({ referenceName: f.referenceName, type: f.type }));
  } catch (e) {
    console.error(`[discover-tracker] org field-type list failed (types degrade to "string"): ${e.message}`);
    obsHttp("ado_field_types", e);
    // The degradation itself, not just the HTTP failure: every field's `type` silently becomes
    // "string", which is what makes the HTML decision an assertion again instead of derived.
    obs.push({ class: "self_reported_fallback", subject: "ado_field_types", code: "NONE", evidence: { snippet: 'field types degrade to "string"' } });
  }

  const workItemTypes = {};
  const fields = {};
  // Per-type form layout (VCST-5702 ITEM 0): the ORDERED html controls actually ON the form. A field
  // can exist in the contract yet be off-form; a body written there is invisible. Persisted so the
  // create path binds `body` to a form-visible control instead of assuming System.Description.
  const formLayout = {};
  // Per-type rule-filter accounting (VCST-5702 ITEM 0b) — how many fields the scan kept vs dropped.
  const fieldsMeta = {};
  for (const t of scan) {
    try {
      const states = ((await adoGet(`${apiBase}/_apis/wit/workitemtypes/${encodeURIComponent(t)}/states?api-version=7.1`, authHeader)).value || [])
        .map((s) => ({ name: s.name, category: s.category }));
      workItemTypes[t] = { states: states.map((s) => s.name) };
      workItemTypes[t]._categories = Object.fromEntries(states.map((s) => [s.name, s.category]));
    } catch (e) {
      console.error(`[discover-tracker] states for '${t}' failed: ${e.message}`);
      obsHttp("workitem_states", e);
    }
    // The FORM LAYOUT for this type (VCST-5702 ITEM 0). `$expand=layout` returns the page/section/
    // group/control tree; parseFormLayout extracts the html controls in form order (falling back to
    // the legacy `xmlForm` string). Best-effort: no layout ⇒ form-gating is inactive at create time
    // and the body keeps its legacy System.Description target — the pre-5702 behaviour.
    let formHtmlControls = [];
    try {
      const wit = await adoGet(`${apiBase}/_apis/wit/workitemtypes/${encodeURIComponent(t)}?$expand=layout&api-version=7.1`, authHeader);
      formHtmlControls = parseFormLayout(wit);
      if (formHtmlControls.length) formLayout[t] = { htmlControls: formHtmlControls };
    } catch (e) {
      console.error(`[discover-tracker] form layout for '${t}' failed (body binding falls back to System.Description): ${e.message}`);
      obsHttp("workitem_form_layout", e);
    }
    // The FIELD CONTRACT for this type — what this organization's process actually requires
    // and allows. `$expand=all` returns allowedValues / defaultValue alongside alwaysRequired.
    // `all` (WorkItemTypeFieldsExpandLevel.All) is a MEMBER of the enum Azure DevOps accepts —
    // None / AllowedValues / DependentFields / All — and All subsumes AllowedValues, so
    // parseFieldContract()/resolveSlots() get the full contract with no other change. Best-effort:
    // no contract ⇒ the create path falls back to the legacy field set, clearly labelled
    // "unverified defaults" (the E-f ladder).
    try {
      const typeFields = (await adoGet(`${apiBase}/_apis/wit/workitemtypes/${encodeURIComponent(t)}/fields?$expand=all&api-version=7.1`, authHeader)).value || [];
      const contract = parseFieldContract(typeFields, fieldTypes);
      if (contract.length) {
        // Rule-filter for PERSISTENCE (VCST-5702 ITEM 0b): keep only fields that are required for
        // creation, required for a state transition, or bound to a semantic slot — never a name
        // whitelist. The scan still read EVERYTHING (`contract`); only the slim set is persisted.
        // transitionRequiredRefs is best-effort empty until a process-rules collector lands: a field
        // that is alwaysRequired OR slot-mappable already survives, which covers the common cases.
        const filtered = filterContractForPersist(contract, { formHtmlControls, transitionRequiredRefs: [] });
        fields[t] = filtered.fields;
        fieldsMeta[t] = {
          accounting: filtered.accounting,
          scanned: filtered.scanned, kept: filtered.kept, dropped: filtered.dropped,
          required: filtered.required, slotMapped: filtered.slotMapped, transitionRequired: filtered.transitionRequired,
        };
        console.error(`[discover-tracker] ${t} contract: ${filtered.accounting}`);
      }
    } catch (e) {
      console.error(`[discover-tracker] field contract for '${t}' failed (create falls back to unverified defaults): ${e.message}`);
      // A genuine field-contract failure now (permissions, transport). This is NOT the old
      // "reference defect": that HTTP 400 came from a MALFORMED request the plugin itself sent —
      // `$expand=Properties`, which is not a member of WorkItemTypeFieldsExpandLevel — so the scan
      // failed on EVERY Azure deployment and tracker.fields was always empty, silently sending the
      // legacy "unverified defaults" field set. That request bug is fixed above (`$expand=all`); a
      // failure reaching this catch is now a real environmental/permission issue, still recorded as
      // the transport failure plus its functional consequence (a field set this org never confirmed).
      obsHttp("tracker_field_contract", e);
      obs.push({ class: "self_reported_fallback", subject: "tracker_field_contract", code: "NONE", evidence: { snippet: `${t}: create falls back to the legacy field set labelled "unverified defaults"` } });
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

  // Slot resolution for the PRIMARY type (the one /qa-bug files) — reported now so the
  // readiness table can say whether every semantic slot is bound and which required fields
  // will be asked about at the first bug creation (E-g). The mapping itself is NOT baked:
  // resolveSlots is deterministic over the contract, so recomputing it at create time keeps
  // one source of truth and lets an operator `tracker.fieldMap` override take effect without
  // a re-scan.
  const primaryContract = fields[primary] || [];
  const primaryForm = (formLayout[primary] && formLayout[primary].htmlControls) || [];
  const slots = resolveSlots(primaryContract, {}, primaryForm);
  // The required fields the operator must ACTUALLY be asked at the first bug creation (VCST-5702
  // ITEM 0b) — required fields minus the auto-satisfied ones (Title / State / Area / Iteration /
  // any defaultValue). This is what makes "ask once" explicit rather than incidental.
  const questions = operatorQuestions(primaryContract, {});
  const contractSummary = {
    type: primary,
    fieldCount: primaryContract.length,
    requiredCount: primaryContract.filter((f) => f.required).length,
    accounting: fieldsMeta[primary] ? fieldsMeta[primary].accounting : "",
    // The body field resolves to a FORM-VISIBLE control (ITEM 0) — reported so the readiness table
    // shows WHERE the body lands (and on-form status) rather than assuming System.Description.
    bodyField: slots.mapping.body || "",
    bodyOnForm: primaryForm.length ? primaryForm.some((r) => r.toLowerCase() === String(slots.mapping.body || "").toLowerCase()) : null,
    htmlControlsAvailable: slots.htmlControlsAvailable,
    unmappedRequired: slots.unmappedRequired.map((f) => ({ ref: f.ref, name: f.name, allowedValues: f.allowedValues || [] })),
    unmappedSlots: slots.unmapped,
    operatorQuestions: questions.map((f) => ({ ref: f.ref, name: f.name, allowedValues: f.allowedValues || [] })),
  };

  const out = {
    kind: "azure",
    ticketKeyFormat: "numeric",
    crossLinkToken: "AB#",
    apiBase,
    projectId,
    workItemTypes,
    // Per-type BUG FIELD CONTRACT (VCST-5582 E-a): [{ ref, name, required, type,
    // allowedValues?, defaultValue? }]. Empty/absent ⇒ metadata was unreachable and the create
    // path uses the legacy field set labelled "unverified defaults" (E-f). Rule-filtered for
    // persistence (VCST-5702 ITEM 0b) — see fieldsMeta for the accounting.
    fields,
    // Per-type form layout (VCST-5702 ITEM 0): { <Type>: { htmlControls: [ref, …] } }, in form
    // order. Consumed by the create path to bind `body` to a form-visible control.
    formLayout,
    // Per-type rule-filter accounting (VCST-5702 ITEM 0b).
    fieldsMeta,
    contractSummary,
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
  console.error(
    primaryContract.length
      ? `[discover-tracker] ${primary} field contract: ${contractSummary.fieldCount} field(s), ${contractSummary.requiredCount} required` +
        (contractSummary.unmappedRequired.length
          ? ` — ${contractSummary.unmappedRequired.length} required field(s) no semantic slot maps: ${contractSummary.unmappedRequired.map((f) => f.name).join(", ")} (asked ONCE at the first bug creation, then persisted)`
          : " — every required field is mapped")
      : `[discover-tracker] no ${primary} field contract discovered — /qa-bug will fall back to the legacy field set, labelled "unverified defaults".`,
  );
  if (missingQaRoles.length) {
    console.error(
      `[discover-tracker] QA-side role(s) not auto-derived (used by /qa-verify-fix, optional): ${missingQaRoles.join(", ")}` +
        ` — confirm/hand-edit if you run /qa-verify-fix on this deployment.`,
    );
  }
  // ─── the ARTIFACT'S OWN SHAPE is a signal (VCST-5582 H) ──────────────────────────────
  // A scan can fail without any HTTP error reaching a catch above (an empty `value`, a filtered
  // response, a partial permission). What matters downstream is the SHAPE of what we are about to
  // write, so assert on the result itself rather than on the calls that produced it. Each of these
  // is a real, named degradation of /qa-fix or /qa-bug — recorded, never judged here.
  if (!primaryContract.length) {
    obs.push({ class: "degraded_artifact", subject: "tracker_field_contract", code: "NONE", evidence: { snippet: `tracker.fields['${primary}'] is empty — /qa-bug will send the legacy "unverified defaults" field set` } });
  } else if (slots.unmappedRequired.length) {
    obs.push({ class: "degraded_artifact", subject: "tracker_required_fields_unmapped", code: "NONE", evidence: { snippet: `${slots.unmappedRequired.length} required field(s) map to no semantic slot` } });
  }
  if (missingRoles.length) {
    obs.push({ class: "degraded_artifact", subject: "tracker_role_states", code: "NONE", evidence: { snippet: `roleStatesComplete:false — missing ${missingRoles.join(", ")}; /qa-fix cannot transition by role` } });
  }
  if (missingQaRoles.length) {
    obs.push({ class: "degraded_artifact", subject: "tracker_qa_role_states", code: "NONE", evidence: { snippet: `qaRoleStatesComplete:false — missing ${missingQaRoles.join(", ")}; affects /qa-verify-fix only` } });
  }
  emitObservations(obs, { skill: "project-init" });
  emit(out, args);
}

// CLI only — the pure helpers above are imported by the unit tests (repo-standard main-guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
