#!/usr/bin/env node
/**
 * skills/qa-fix-routing/bug-contract.mjs
 *
 * The per-ORGANIZATION bug FIELD CONTRACT (VCST-5582 E) — discovered, not hardcoded.
 *
 * WHAT WAS WRONG. `/qa-bug` Step 5 hardcoded one organization's Azure Boards process:
 * `Custom.Environment`, `Custom.Reportedby`, `Custom.Typeofbug`, plus the ASSUMPTION that
 * `System.Description` / `Microsoft.VSTS.TCM.SystemInfo` are HTML fields. Those refs exist in
 * the LEO/OPUS-shaped process and nowhere else: on any other organization they are rejected or
 * silently blank, while THAT process's genuinely required fields are never filled. And a 200
 * from ADO means "an item was created", not "the fields are populated" — nothing verified.
 *
 * WHAT THIS IS. A tracker-agnostic contract shape plus the pure functions that use it:
 *
 *   contract  = [{ ref, name, required, type, allowedValues?, defaultValue? }]   ← discovered
 *   mapping   = { <semantic slot> : <field ref> }                                ← resolved
 *
 * The bug report has a FIXED set of semantic slots (title, body, repro, severity, …). The
 * contract says which fields THIS organization actually has, what type each is, and which are
 * required. `resolveSlots` binds one to the other. Everything downstream — payload building,
 * picklist validation, the post-create read-back — is then data-driven, so the same `/qa-bug`
 * flow populates a Bug correctly on a process it has never seen, with no code change (AC 7).
 *
 * The field TYPE also makes the HTML decision DERIVED rather than asserted: `html` ⇒ HTML body,
 * `plainText` ⇒ text. `ado-html.mjs`'s hardcoded `HTML_FIELD_REFS` stays as the fallback for
 * when no contract is available (the E-f ladder's "unverified defaults" rung).
 *
 * KNOWN BOUNDARY (documented, not worked around): `alwaysRequired` covers PROCESS-level
 * requiredness only — not conditional form rules ("required when State = X"), which live in the
 * process/layout API behind different permissions and only for inherited processes. The contract
 * is therefore "best known" and the SERVER's response is the final authority; that is exactly
 * why the caller keeps a fallback ladder + a single self-heal retry (E-f).
 *
 * Implemented for Azure Boards first. The SHAPE is tracker-agnostic by design — a Jira collector
 * (createmeta) is a follow-up; until then Jira keeps today's behaviour.
 *
 * Pure + side-effect-free: no network, no fs, no process.env. Its only import is the sibling
 * pure `ado-html.mjs` (inline-image counters, no side effects). Unit-tested against recorded
 * metadata fixtures from two DIFFERENT Azure Boards processes.
 */
import { countAttachmentImages } from "./ado-html.mjs";

// ─── semantic slots ──────────────────────────────────────────────────────────────────
// The fixed vocabulary a bug report speaks. `parent` and `attachments` are deliberately
// ABSENT: those are work-item RELATIONS, not fields, so they never appear in a field
// contract and are handled by buildBugFields' relation ops instead.
export const BUG_SLOTS = [
  "title", "body", "repro", "expected", "actual",
  "severity", "priority", "environment", "bugType", "reportedBy",
  "systemInfo", "foundIn", "sprint", "assignee", "tags", "valueArea",
];

// Slot → how to recognise its field in a discovered contract.
//   refs  — canonical reference names, tried FIRST (exact, case-insensitive)
//   names — display-name patterns, tried second
//   types — the field data types this slot can legally bind to; a name match with an
//           incompatible type is REJECTED (e.g. a `treePath` field called "Environment"
//           is an Area-Path-like tree, not the QA environment picklist)
const SLOT_SPECS = {
  title: { refs: ["System.Title"], names: [/^title$/i], types: ["string", "plaintext"] },
  body: { refs: ["System.Description"], names: [/^description$/i], types: ["html", "plaintext"] },
  repro: { refs: ["Microsoft.VSTS.TCM.ReproSteps"], names: [/repro/i, /steps to reproduce/i], types: ["html", "plaintext"] },
  expected: { refs: [], names: [/expected/i], types: ["html", "plaintext", "string"] },
  actual: { refs: [], names: [/^actual/i], types: ["html", "plaintext", "string"] },
  // Short-value slots accept `plaintext` as well as `string`: Azure reports a single-line
  // custom text field either way depending on how the process defined it (the LEO/OPUS
  // "Reported by" is plainText while "Environment" next to it is string).
  severity: { refs: ["Microsoft.VSTS.Common.Severity"], names: [/^severity$/i], types: ["string", "plaintext", "pickliststring"] },
  priority: { refs: ["Microsoft.VSTS.Common.Priority"], names: [/^priority$/i], types: ["integer", "double", "string", "picklistinteger"] },
  environment: { refs: [], names: [/^environment$/i, /^env$/i, /test ?environment/i], types: ["string", "plaintext", "pickliststring"] },
  bugType: { refs: [], names: [/type ?of ?bug/i, /bug ?type/i, /defect ?type/i], types: ["string", "plaintext", "pickliststring"] },
  reportedBy: { refs: [], names: [/reported ?by/i, /^reporter$/i, /raised ?by/i], types: ["string", "plaintext", "pickliststring", "identity"] },
  systemInfo: { refs: ["Microsoft.VSTS.TCM.SystemInfo"], names: [/system ?info/i], types: ["html", "plaintext"] },
  foundIn: { refs: ["Microsoft.VSTS.Build.FoundIn"], names: [/found ?in/i, /^build$/i], types: ["string", "plaintext", "pickliststring"] },
  sprint: { refs: ["System.IterationPath"], names: [/^iteration ?path$/i, /^sprint$/i], types: ["treepath"] },
  assignee: { refs: ["System.AssignedTo"], names: [/assigned ?to$/i], types: ["identity", "string"] },
  tags: { refs: ["System.Tags"], names: [/^tags$/i], types: ["string", "plaintext"] },
  // Value Area is a STANDARD Azure Boards field (out-of-the-box on the Agile/Scrum/CMMI Bug types).
  // Any process where an admin marked it REQUIRED otherwise surfaces it as an un-actionable
  // unmapped-required degradation on an otherwise-clean onboarding (D1). It carries a closed picklist
  // (Architectural/Business) and usually a defaultValue ("Business"), so the create path fills it from
  // the default — no operator question needed (see the unmappedRequired default-value rule below).
  valueArea: { refs: ["Microsoft.VSTS.Common.ValueArea"], names: [/value ?area/i], types: ["string", "plaintext", "pickliststring"] },
};

const lc = (v) => String(v ?? "").toLowerCase();

// The long-text slots whose field is an HtmlFieldControl on the Azure Boards form. Their target
// must be a control that is actually ON THE FORM (VCST-5702 ITEM 0): a field can exist in the
// contract yet be absent from the form's layout, and a body written there is INVISIBLE while a
// presence-based check still passes. `body`/`systemInfo` are the two the create path writes; the
// others fold into `body` when they have no distinct form control of their own.
const FORM_GATED_HTML_SLOTS = new Set(["body", "repro", "expected", "actual", "systemInfo"]);

// Required fields Azure DevOps SERVER-DEFAULTS on create, so they need no semantic slot and must
// never appear in `unmappedRequired` (VCST-5582 E2). `System.AreaId` / `System.IterationId` default
// to the project's root area/iteration, and `System.State` defaults to the process's initial state
// (also covered by the profile's roleStates). Left in `unmappedRequired`, each one made a perfectly
// healthy Azure onboarding report a degradation the operator could not act on. They are matched by
// reference name (case-insensitive); note ADO reports them on the CONTRACT as `System.AreaId` /
// `System.IterationId` even though the create payload uses `System.AreaPath` / `System.IterationPath`.
const SERVER_DEFAULTED_REQUIRED = new Set([
  "system.areaid", "system.iterationid", "system.state",
]);

// ─── contract parsing (E-a) ──────────────────────────────────────────────────────────
/**
 * Build the contract from the two Azure Boards metadata responses.
 * @param {Array} typeFields  `GET {project}/_apis/wit/workitemtypes/{type}/fields?$expand=Properties`
 *                            → `value[]` with { referenceName, name, alwaysRequired,
 *                              allowedValues?, defaultValue? }
 * @param {Object|Map|Array} fieldTypes  ref → data type, from the ONE org-level
 *                            `GET _apis/wit/fields` list (cheaper than one call per field).
 *                            Accepts the raw `value[]` array too.
 * @returns {Array} contract, sorted required-first then by ref (stable output for diffing)
 */
export function parseFieldContract(typeFields, fieldTypes) {
  const types = new Map();
  const src = Array.isArray(fieldTypes) ? fieldTypes : fieldTypes instanceof Map ? [...fieldTypes] : Object.entries(fieldTypes || {});
  for (const e of src) {
    if (Array.isArray(e)) types.set(lc(e[0]), lc(e[1]));
    else if (e && typeof e === "object") types.set(lc(e.referenceName), lc(e.type));
  }
  const out = [];
  for (const f of Array.isArray(typeFields) ? typeFields : []) {
    const ref = f?.referenceName;
    if (!ref) continue;
    const entry = {
      ref,
      name: f.name || ref,
      required: f.alwaysRequired === true,
      // Prefer the org-level field list's type; fall back to a type carried inline.
      type: types.get(lc(ref)) || lc(f.type) || "string",
    };
    const allowed = Array.isArray(f.allowedValues) ? f.allowedValues.map((v) => String(v)) : [];
    if (allowed.length) entry.allowedValues = allowed;
    if (f.defaultValue !== undefined && f.defaultValue !== null && f.defaultValue !== "") {
      entry.defaultValue = String(f.defaultValue);
    }
    out.push(entry);
  }
  out.sort((a, b) => (Number(b.required) - Number(a.required)) || a.ref.localeCompare(b.ref));
  return out;
}

/** The contract entry for a ref (case-insensitive), or null. */
export function fieldOf(contract, ref) {
  const want = lc(ref);
  return (contract || []).find((f) => lc(f.ref) === want) || null;
}

/**
 * Pick the best on-form html control to receive the BODY when the canonical body target is
 * off-form. RANKED, not positional (review MED-4): a control whose contract name OR ref looks like
 * the primary description/repro/steps area wins over a bare first-in-form-order pick, so the whole
 * bug body never greedily lands in an unrelated on-form html control (e.g. Acceptance Criteria)
 * that merely happens to appear first. Works with or without a field contract — with none, only the
 * ref string is available to rank on (`parseFormLayout` already returns HtmlFieldControls only, so
 * every form ref is a valid html target).
 * @param {string[]} formRefs   html control refs, in form order
 * @param {Array} [contract]    field contract (for names/types); may be empty
 * @param {Set<string>} [taken] lowercased refs already claimed by another slot
 * @returns {string|null}
 */
export function rankFormBodyRef(formRefs, contract = [], taken = new Set()) {
  const list = contract || [];
  const avail = (Array.isArray(formRefs) ? formRefs : [])
    .filter((ref) => ref && !taken.has(lc(ref)))
    // With a contract, only an html-typed control is a valid body target; with none, every form
    // control qualifies (parseFormLayout emitted only HtmlFieldControls).
    .filter((ref) => { const f = fieldOf(list, ref); return !list.length || (f && f.type === "html"); });
  const BODYISH = /repro|description|steps|details/i;
  const nameOf = (ref) => { const f = fieldOf(list, ref); return (f && f.name) || ""; };
  const preferred = avail.find((ref) => BODYISH.test(nameOf(ref)) || BODYISH.test(String(ref)));
  return preferred || avail[0] || null;
}

/**
 * Bind the long-text slots (body / repro / systemInfo) to FORM-VISIBLE html controls, folding a
 * slot with no distinct on-form control INTO the body so nothing is dropped, and returning an
 * `offForm` descriptor when a content-carrying slot is STILL off-form (the create path REFUSES to
 * POST then). Extracted PURE from ado.mjs `create-workitem` (VCST-5702 ITEM 0.3; review HIGH-1/MED-3)
 * so the fold/rebind decision is unit-testable and the create path can never re-derive it slightly
 * differently. Runs only when a form layout was scanned (`formHtmlControls` non-empty); with none
 * the caller keeps the legacy targets and this is a pass-through.
 *
 * @param {Object}   p
 * @param {string[]} p.formHtmlControls        ordered html control refs on the form (gate — empty ⇒ inactive)
 * @param {Array}    [p.contract]              field contract (name-ranking); may be empty
 * @param {Object}   [p.fieldMap]              operator overrides — an explicitly-mapped slot is never rebound
 * @param {string[]} [p.htmlControlsAvailable] contract-derived on-form controls; falls back to formHtmlControls
 * @param {string}   [p.bodyRef]               incoming body target
 * @param {string}   [p.reproRef]              incoming repro target (may be undefined)
 * @param {string}   [p.systemInfoRef]         incoming systemInfo target
 * @param {string}   [p.bodyContent]           body text
 * @param {string}   [p.reproContent]          repro text
 * @param {string}   [p.systemInfo]            systemInfo text
 * @returns {{ bodyRef:string, reproRef:(string|undefined), systemInfoRef:(string|undefined),
 *            bodyContent:string, reproContent:string, systemInfoFolded:boolean, controls:string[],
 *            offForm:({label:string,ref:(string|undefined),content:string}|null) }}
 */
export function bindFormVisibleLongText(p = {}) {
  const formHtmlControls = Array.isArray(p.formHtmlControls) ? p.formHtmlControls : [];
  let bodyRef = p.bodyRef;
  let reproRef = p.reproRef;
  let systemInfoRef = p.systemInfoRef;
  let bodyContent = p.bodyContent || "";
  let reproContent = p.reproContent || "";
  let systemInfoFolded = false;
  const systemInfo = p.systemInfo || "";
  const fieldMap = p.fieldMap || {};
  const contract = p.contract || [];
  const htmlControlsAvailable = Array.isArray(p.htmlControlsAvailable) ? p.htmlControlsAvailable : [];
  const controls = htmlControlsAvailable.length ? htmlControlsAvailable : formHtmlControls;
  if (!formHtmlControls.length) {
    return { bodyRef, reproRef, systemInfoRef, bodyContent, reproContent, systemInfoFolded, controls, offForm: null };
  }
  const onForm = (ref) => !!ref && formHtmlControls.some((r) => lc(r) === lc(ref));
  const same = (a, b) => !!a && !!b && lc(a) === lc(b);
  // A body target off-form and NOT an explicit override is rebound to the best RANKED on-form html
  // control (never a bare positional pick). An explicit `fieldMap.body` override is trusted and
  // instead refused below if off-form, never silently rebound.
  if (!onForm(bodyRef) && !fieldMap.body) {
    const rebound = rankFormBodyRef(controls, contract);
    if (rebound) bodyRef = rebound;
  }
  // repro / systemInfo with no distinct on-form control (or one that collapsed onto the body ref)
  // fold INTO the body — never dropped, never a whole-create abort over an optional metadata field.
  if (reproContent && !fieldMap.repro && (!onForm(reproRef) || same(reproRef, bodyRef))) {
    bodyContent = [bodyContent, reproContent].filter(Boolean).join("\n\n");
    reproContent = "";
    reproRef = undefined;
  }
  if (systemInfo && !fieldMap.systemInfo && (!onForm(systemInfoRef) || same(systemInfoRef, bodyRef))) {
    bodyContent = [bodyContent, systemInfo].filter(Boolean).join("\n\n");
    systemInfoFolded = true;
    systemInfoRef = undefined;
  }
  // Refuse ONLY if a content-carrying slot is STILL off-form: an explicit override onto an off-form
  // field, or a type with no on-form html control at all.
  const offForm =
    [
      { label: "body", ref: bodyRef, content: bodyContent },
      { label: "repro", ref: reproRef, content: reproContent },
      { label: "systemInfo", ref: systemInfoRef, content: systemInfoFolded ? "" : systemInfo },
    ].find((c) => c.content && !onForm(c.ref)) || null;
  return { bodyRef, reproRef, systemInfoRef, bodyContent, reproContent, systemInfoFolded, controls, offForm };
}

/**
 * Is this field stored as HTML? DERIVED from the contract's data type when we have one —
 * replacing the hardcoded assumption in azure-html-format.md / ado-html.mjs. With no
 * contract entry the caller falls back to `isHtmlField(ref)` (the legacy known-refs set).
 * @returns {boolean|null} null = unknown, use the legacy fallback
 */
export function isHtmlByContract(contract, ref) {
  const f = fieldOf(contract, ref);
  if (!f) return null;
  if (f.type === "html") return true;
  // Only `plainText` is a DEFINITIVE non-HTML. `string` is ADO's ambiguous single-line-text type
  // AND the value `parseFieldContract` falls back to when the org-level field-types call failed
  // (discover-tracker.mjs degrades every type to "string") — returning a hard `false` there would
  // suppress the legacy `isHtmlField` fallback and POST System.Description/ReproSteps/SystemInfo as
  // raw markdown. Return null so those defer to HTML_FIELD_REFS; a genuine non-HTML custom field
  // reporting `string` is still handled correctly (it isn't in the legacy set → false).
  if (f.type === "plaintext") return false;
  return null;
}

// ─── slot resolution (E-b) ───────────────────────────────────────────────────────────
/**
 * Bind semantic slots to this organization's field refs, in the documented priority order:
 *   1. an explicit `tracker.fieldMap` override in the profile — the operator's LAST WORD,
 *      always wins, even over a canonical ref;
 *   2. auto-match on ref, then on display name, gated by TYPE compatibility;
 *   3. anything still unmapped is reported — the caller asks the operator once, at the FIRST
 *      bug creation (not at onboarding), and persists the answer.
 *
 * A slot whose bound field does not exist in the contract is dropped (a stale override on a
 * process that has since changed must not silently send a rejected field).
 *
 * @returns {{ mapping: Object, source: Object, unmapped: string[], unmappedRequired: Array,
 *             requiredRefs: string[], staleOverrides: string[] }}
 *   `unmappedRequired` = contract fields that are `required` and that NO slot bound —
 *   exactly the set the operator must be asked about before the first POST.
 */
export function resolveSlots(contract, fieldMap = {}, formHtmlControls = []) {
  const list = contract || [];
  const mapping = {};
  const source = {};
  const staleOverrides = [];
  const taken = new Set();

  // Form-visibility gate (VCST-5702 ITEM 0). When a form layout was scanned (a non-empty ordered
  // list of html control refs), an html-typed field that is NOT on the form cannot auto-bind to a
  // long-text slot — that is exactly how the body landed on the off-form System.Description. With
  // no layout the gate is INACTIVE and resolution is byte-for-byte the pre-5702 behaviour.
  const formRefs = (Array.isArray(formHtmlControls) ? formHtmlControls : []).map(String);
  const formSet = new Set(formRefs.map(lc));
  const formActive = formSet.size > 0;
  const onForm = (ref) => !formActive || formSet.has(lc(ref));
  // A candidate is form-eligible unless it is an html field the layout does not surface.
  const formEligible = (f) => !formActive || f.type !== "html" || onForm(f.ref);

  // (1) explicit overrides — the operator's LAST WORD, and deliberately NOT form-gated: an
  // operator who names a field is trusted over the layout heuristic (a stale/off-form override is
  // instead surfaced via `offFormSlots` below so the create path can refuse it, not silently send).
  for (const [slot, ref] of Object.entries(fieldMap || {})) {
    if (!BUG_SLOTS.includes(slot) || !ref) continue;
    const f = fieldOf(list, ref);
    if (!f) { staleOverrides.push(`${slot}=${ref}`); continue; }
    mapping[slot] = f.ref;
    source[slot] = "override";
    taken.add(lc(f.ref));
  }

  // (2) auto-match — canonical refs first, then display names; TYPE-gated AND form-gated. One field
  // is bound to at most one slot (`taken`), so a name that could satisfy two slots goes to the one
  // resolved first (BUG_SLOTS order = specificity order).
  for (const slot of BUG_SLOTS) {
    if (mapping[slot]) continue;
    const spec = SLOT_SPECS[slot];
    if (!spec) continue;
    const typeOk = (f) => !spec.types || spec.types.includes(f.type);
    let hit = list.find((f) => !taken.has(lc(f.ref)) && formEligible(f) && spec.refs.some((r) => lc(r) === lc(f.ref)));
    if (!hit) hit = list.find((f) => !taken.has(lc(f.ref)) && typeOk(f) && formEligible(f) && spec.names.some((rx) => rx.test(f.name)));
    // body fallback (VCST-5702 ITEM 0): a process whose form does NOT surface System.Description
    // (the OPUS Bug: ReproSteps + SystemInfo only) has no canonical body target. Bind `body` to the
    // FIRST form-visible html control instead — in form order, so the operator's primary text area
    // is chosen. repro/systemInfo, resolved later/earlier, then take what remains.
    if (!hit && slot === "body" && formActive) {
      // Ranked pick (review MED-4): prefer a description/repro/steps-named on-form html control
      // over a bare positional one, so the body never greedily claims an unrelated first control.
      const pickRef = rankFormBodyRef(formRefs, list, taken);
      if (pickRef) hit = fieldOf(list, pickRef);
    }
    if (hit) { mapping[slot] = hit.ref; source[slot] = "auto"; taken.add(lc(hit.ref)); }
  }

  const unmapped = BUG_SLOTS.filter((s) => !mapping[s]);
  const requiredRefs = list.filter((f) => f.required).map((f) => f.ref);
  // (3) The set that BLOCKS a POST: required by the process, and nothing bound it — EXCLUDING the
  // fields Azure DevOps server-defaults on create (System.AreaId/IterationId/State). Those are
  // `alwaysRequired` in the contract but need no semantic slot, so counting them would make every
  // healthy Azure onboarding report an un-actionable degradation (VCST-5582 E2).
  const unmappedRequired = list.filter(
    (f) => f.required && !taken.has(lc(f.ref)) && !SERVER_DEFAULTED_REQUIRED.has(lc(f.ref))
        // D1 — a required field the BOARD already answers needs no operator question and is no
        // degradation: a discovered `defaultValue` that is a member of a CLOSED `allowedValues` set
        // fully satisfies it (the create path fills it from the default). General rule — applies to
        // ANY such field (e.g. Microsoft.VSTS.Common.ValueArea = "Business"), not a special case.
        // MEMBERSHIP is required, not mere presence: a defaultValue that is NOT one of its own
        // allowedValues is a misconfiguration ADO would still reject on create, so keep asking.
        && !(f.defaultValue && Array.isArray(f.allowedValues)
             && f.allowedValues.some((v) => lc(v) === lc(f.defaultValue))),
  );
  // Form-gated slots whose bound field is NOT on the form — reachable only via an override (auto
  // never binds off-form). The create path REFUSES to POST a body to an off-form target and names
  // the available controls (ITEM 0.3). Empty when no layout was scanned.
  const offFormSlots = formActive
    ? Object.entries(mapping)
        .filter(([slot, ref]) => FORM_GATED_HTML_SLOTS.has(slot) && !onForm(ref))
        .map(([slot, ref]) => ({ slot, ref }))
    : [];
  // The html controls THIS form actually surfaces, in form order — the actionable list to show
  // when a body target is off-form or missing. The `f.type === "html"` re-filter is a DEFENSIVE
  // cross-check against the contract (parseFormLayout already returns only HtmlFieldControls); it
  // drops a form control that the field-types list disagrees is html.
  const htmlControlsAvailable = formRefs.filter((ref) => {
    const f = fieldOf(list, ref);
    return !list.length || (f && f.type === "html");
  });
  return { mapping, source, unmapped, unmappedRequired, requiredRefs, staleOverrides, offFormSlots, htmlControlsAvailable };
}

// ─── payload build + validation (E-c) ────────────────────────────────────────────────
/**
 * Turn slot VALUES into the concrete `{ ref: value }` set to send, validating against the
 * contract BEFORE any POST:
 *   - a slot whose field does not exist in this organization is DROPPED (never sent);
 *   - a picklist value outside `allowedValues` is an ERROR (a doomed request is not sent);
 *   - a contract-required field with no value and no `defaultValue` is an ERROR — the caller
 *     surfaces the E-b question instead of POSTing;
 *   - a required field with a `defaultValue` is filled from it (a per-deployment constant is a
 *     stored default, never a per-bug guess).
 *
 * @param {Array} contract
 * @param {Object} mapping    slot → ref (from resolveSlots)
 * @param {Object} slotValues slot → value
 * @param {Object} [extraFields] ref → value, already-resolved answers (the persisted
 *                            operator answers for unmapped required fields)
 * @param {Iterable<string>} [satisfiedRefs] refs the CALLER emits itself and must therefore
 *                            count as filled for the required sweep, WITHOUT entering `fields`.
 *                            `buildBugFields` writes title/description/repro/systemInfo/tags/
 *                            assignee/iteration through its own dedicated ops; without this they
 *                            would be reported missing-required and block a perfectly good POST
 *                            (and emitting them here too would duplicate the JSON-Patch op).
 * @returns {{ fields: Object, dropped: string[], errors: string[], missingRequired: Array }}
 */
export function buildContractFields(contract, mapping, slotValues = {}, extraFields = {}, satisfiedRefs = []) {
  const list = contract || [];
  const fields = {};
  const dropped = [];
  const errors = [];

  const put = (ref, value) => {
    const f = fieldOf(list, ref);
    if (list.length && !f) { dropped.push(ref); return; } // not a field of THIS organization
    if (value === undefined || value === null || value === "") return;
    if (f?.allowedValues?.length) {
      const ok = f.allowedValues.some((a) => lc(a) === lc(value));
      if (!ok) {
        errors.push(`${f.name} (${f.ref}): "${value}" is not an allowed value — pick one of: ${f.allowedValues.join(", ")}`);
        return;
      }
      // Send the value with the ORGANIZATION's exact casing, not the caller's.
      value = f.allowedValues.find((a) => lc(a) === lc(value));
    }
    fields[f ? f.ref : ref] = value;
  };

  for (const [slot, ref] of Object.entries(mapping || {})) {
    if (slotValues[slot] === undefined) continue;
    put(ref, slotValues[slot]);
  }
  for (const [ref, value] of Object.entries(extraFields || {})) put(ref, value);

  // Required-field sweep — after everything above, so a defaultValue only fills a real gap.
  const satisfied = new Set([...(satisfiedRefs || [])].map((r) => lc(r)));
  const filledPath = (pathRef) =>
    satisfied.has(lc(pathRef)) || Object.keys(fields).some((k) => lc(k) === lc(pathRef) && fields[k] !== undefined && fields[k] !== "");
  const missingRequired = [];
  for (const f of list) {
    if (!f.required) continue;
    if (fields[f.ref] !== undefined && fields[f.ref] !== "") continue;
    if (satisfied.has(lc(f.ref))) continue; // the caller emits this one itself
    if (f.defaultValue) { fields[f.ref] = f.defaultValue; continue; } // e.g. System.State → "New"
    // VCST-5582 A2 — the pre-flight must NOT block on a required field that will nonetheless be
    // populated. A contract-required field with no value AND no default is still satisfied when:
    //  (1) Azure server-defaults it on create (System.AreaId / System.IterationId — the same
    //      SERVER_DEFAULTED_REQUIRED set `resolveSlots` already honours); OR
    //  (2) its governing *Path field will be sent (System.IterationPath via `--iteration current`,
    //      System.AreaPath), which is exactly how ADO derives the corresponding *Id. Before this,
    //      `System.IterationId` (alwaysRequired, no defaultValue, bound by no slot) BLOCKED a POST
    //      that carried `--iteration current` and would have set System.IterationPath.
    if (SERVER_DEFAULTED_REQUIRED.has(lc(f.ref))) continue;
    if (/id$/i.test(f.ref) && filledPath(f.ref.replace(/Id$/i, "Path"))) continue;
    missingRequired.push(f);
  }
  return { fields, dropped, errors, missingRequired };
}

// ─── post-create verification (E-e) ──────────────────────────────────────────────────
/**
 * Compare the CREATED work item against the contract: every contract-required field and
 * every mapped slot must be non-empty. A 200 from ADO means "an item exists", not "the
 * fields are populated" — this is what turns that into a checkable claim.
 *
 * @param {Array} contract
 * @param {Object} mapping    slot → ref
 * @param {Object} itemFields the created item's `fields` object (from get-workitem)
 * @param {Object} [sent]     ref → value we intended to send (so a field we never sent is
 *                            reported as MISSING rather than silently passing)
 * @param {Object} [opts]     { formHtmlControls?: string[], submittedImages?: Record<ref,number> }
 *   formHtmlControls — the ordered html controls on THIS type's form. A form-gated long-text slot
 *     whose field is off-form can never PASS, even non-empty (the OPUS false pass — VCST-5702 ITEM 0).
 *   submittedImages — ref → count of `<img>` we SUBMITTED. The read-back must contain that many
 *     `<img>` pointing at `_apis/wit/attachments/` or the field is IMAGES_MISSING (ITEM 1). A field
 *     with zero submitted images keeps the plain non-empty semantics.
 * @returns {{ rows: Array, missing: Array, ok: boolean }}
 *   rows: [{ ref, name, slot, required, status, value, onForm, imgSubmitted, imgReadback }]
 *   status ∈ "PASS" | "MISSING" | "SKIP" | "OFF_FORM" | "IMAGES_MISSING"
 */
export function verifyAgainstContract(contract, mapping, itemFields = {}, sent = {}, opts = {}) {
  const list = contract || [];
  const formSet = new Set((Array.isArray(opts.formHtmlControls) ? opts.formHtmlControls : []).map(lc));
  const formActive = formSet.size > 0;
  const submittedImages = opts.submittedImages || {};
  const bySlot = new Map(Object.entries(mapping || {}).map(([s, r]) => [lc(r), s]));
  const check = new Map();
  for (const f of list) if (f.required) check.set(lc(f.ref), f);
  for (const ref of Object.values(mapping || {})) {
    const f = fieldOf(list, ref) || { ref, name: ref, required: false, type: "string" };
    if (!check.has(lc(ref))) check.set(lc(ref), f);
  }

  const rows = [];
  for (const f of check.values()) {
    const raw = itemFields[f.ref];
    // ADO returns identity fields as an object — non-empty is what matters, not the shape.
    const present = raw !== undefined && raw !== null && String(typeof raw === "object" ? (raw.displayName ?? JSON.stringify(raw)) : raw).trim() !== "";
    const intended = sent[f.ref] !== undefined && sent[f.ref] !== "";
    const slot = bySlot.get(lc(f.ref)) || "";
    // Form visibility of this field — null when no layout was scanned (the check is inert).
    const onForm = formActive ? formSet.has(lc(f.ref)) : null;
    // Image evidence: only assert when this field carried submitted images. NOTE the asymmetry is
    // deliberate — `submittedImages` counts EVERY submitted `<img>` (the caller's countImages),
    // while the read-back counts only attachment-backed `<img>` (…/_apis/wit/attachments/…). An
    // inline bug screenshot is meant to become an ADO attachment, so a submitted external/`data:`
    // image that never became one is intentionally reported as not-yet-rendered (IMAGES_MISSING).
    const imgSubmitted = Number(submittedImages[f.ref] || 0) || 0;
    const imgReadback = imgSubmitted > 0 ? countAttachmentImages(typeof raw === "string" ? raw : "") : 0;
    let status;
    if (formActive && FORM_GATED_HTML_SLOTS.has(slot) && onForm === false) {
      // A body written to an OFF-FORM field is never a PASS, even non-empty — the OPUS symptom
      // (fieldsOk:true on an invisible body). ITEM 0.
      status = "OFF_FORM";
    } else if (!present) {
      // A non-required, unmapped-value field we never intended to send is not a failure.
      status = (f.required || intended) ? "MISSING" : "SKIP";
    } else if (imgSubmitted > 0 && imgReadback < imgSubmitted) {
      // Persisted but the screenshots didn't render — "persisted != rendered". ITEM 1.
      status = "IMAGES_MISSING";
    } else {
      status = "PASS";
    }
    rows.push({
      ref: f.ref,
      name: f.name,
      slot,
      required: !!f.required,
      status,
      value: present ? String(typeof raw === "object" ? (raw.displayName ?? "") : raw).slice(0, 60) : "",
      onForm,
      imgSubmitted,
      imgReadback,
    });
  }
  rows.sort((a, b) => (Number(b.required) - Number(a.required)) || a.ref.localeCompare(b.ref));
  const missing = rows.filter((r) => r.status === "MISSING" || r.status === "OFF_FORM" || r.status === "IMAGES_MISSING");
  return { rows, missing, ok: missing.length === 0 };
}

/**
 * Render the read-back result as the operator-facing table (E-e). Beyond PASS/MISSING it now shows
 * the receiving field's ON-FORM status and the submitted-vs-readback image counts (VCST-5702
 * ITEM 0 / ITEM 1), so an off-form body or a dropped screenshot is visible at a glance. The first
 * five columns are unchanged for backward compatibility.
 */
export function renderVerifyTable(rows) {
  const head = ["| Field | Ref | Slot | Required | Status | On form | Images |", "|---|---|---|---|---|---|---|"];
  const body = (rows || []).map((r) => {
    const onForm = r.onForm === true ? "yes" : r.onForm === false ? "NO" : "—";
    const imgs = (r.imgSubmitted || r.imgReadback) ? `${r.imgReadback}/${r.imgSubmitted}` : "—";
    return `| ${r.name} | \`${r.ref}\` | ${r.slot || "—"} | ${r.required ? "yes" : "no"} | ${r.status} | ${onForm} | ${imgs} |`;
  });
  return [...head, ...body].join("\n");
}

// ─── self-heal (E-f) ─────────────────────────────────────────────────────────────────
/**
 * Parse an Azure Boards rejection to find WHICH field it is about, so the caller can fix or
 * drop exactly that field and retry ONCE — instead of the natural-but-wrong reaction of
 * re-POSTing with fewer fields until something sticks (which is how the OPUS bug ended up
 * with its fields unset).
 *
 * A REQUIRED field is never droppable: the caller must STOP and ask.
 *
 * @returns {{ ref: string|null, name: string, required: boolean, droppable: boolean,
 *             reason: "not-a-field"|"invalid-value"|"required"|"unknown" }}
 */
export function classifyFieldRejection(message, contract) {
  const msg = String(message || "");
  // ADO error texts name the field by reference name or by display name, in quotes or bare:
  //   "TF401326: Invalid field status ... field 'Custom.Typeofbug'"
  //   "VS402625: ... The field 'Environment' contains the value 'QA' which is not in the list"
  //   "Value cannot be null. Parameter name: Custom.Reportedby"
  let ref = null;
  const refLike = msg.match(/\b((?:System|Microsoft|Custom|WEF)[\w.]*\.[\w]+)\b/);
  if (refLike) ref = refLike[1];
  let entry = ref ? fieldOf(contract, ref) : null;
  if (!entry) {
    // Fall back to a quoted display name matched against the contract.
    for (const q of msg.match(/'([^']{1,60})'|"([^"]{1,60})"/g) || []) {
      const bare = q.slice(1, -1);
      const hit = (contract || []).find((f) => lc(f.name) === lc(bare) || lc(f.ref) === lc(bare));
      if (hit) { entry = hit; ref = hit.ref; break; }
    }
  }
  const reason = /not.*(a )?(valid )?field|does not exist|unknown field|TF401326/i.test(msg) ? "not-a-field"
    : /not in the list|invalid value|allowed values|VS402625/i.test(msg) ? "invalid-value"
    : /required|cannot be null|cannot be empty/i.test(msg) ? "required"
    : "unknown";
  const required = !!entry?.required || reason === "required";
  return {
    ref: entry?.ref ?? ref ?? null,
    name: entry?.name ?? ref ?? "",
    required,
    // Only an OPTIONAL field the server rejected may be dropped for the single retry.
    droppable: Boolean(ref) && !required && (reason === "not-a-field" || reason === "invalid-value"),
    reason,
  };
}

// ─── form layout (VCST-5702 ITEM 0) ────────────────────────────────────────────────────
/**
 * The ORDERED list of html field-control refs actually ON a work-item type's form, from
 * `GET .../workitemtypes/{type}?$expand=layout`. A field can exist in the contract yet be absent
 * from the form; a body written to such a field is INVISIBLE while a presence check still passes,
 * which is the silent-failure this closes. Prefers the structured `layout`; falls back to parsing
 * the legacy `xmlForm` string. Returns refs in form (document) order — the create path binds the
 * `body` slot to the FIRST of these. Pure.
 * @param {Object} workItemType  the type object (with `.layout` and/or `.xmlForm`)
 * @returns {string[]} html control field refs, in form order (deduped, visible only)
 */
export function parseFormLayout(workItemType) {
  const refs = [];
  const seen = new Set();
  const add = (ref) => { if (ref && !seen.has(lc(ref))) { seen.add(lc(ref)); refs.push(ref); } };
  const layout = workItemType?.layout;
  if (layout && Array.isArray(layout.pages)) {
    for (const page of layout.pages) {
      if (page?.visible === false) continue;
      for (const section of page?.sections || []) {
        for (const group of section?.groups || []) {
          if (group?.visible === false) continue;
          for (const ctrl of group?.controls || []) {
            if (ctrl?.visible === false) continue;
            if (String(ctrl?.controlType || "") === "HtmlFieldControl") add(ctrl.id);
          }
        }
      }
    }
    return refs;
  }
  // Fallback: the older process definition exposes an `xmlForm` string. Scan its <Control> tags in
  // document order for the HtmlFieldControl type; `FieldName` is the field ref.
  const xml = typeof workItemType?.xmlForm === "string" ? workItemType.xmlForm : "";
  if (xml) {
    for (const tag of xml.match(/<Control\b[^>]*>/gi) || []) {
      if (!/Type\s*=\s*"HtmlFieldControl"/i.test(tag)) continue;
      const m = /FieldName\s*=\s*"([^"]+)"/i.exec(tag);
      if (m) add(m[1]);
    }
  }
  return refs;
}

// ─── persisted-contract slimming (VCST-5702 ITEM 0b) ───────────────────────────────────
/**
 * Reduce a scanned contract to the fields worth PERSISTING, BY RULE — never by a whitelist of
 * "main" field names (that name-list hardcoding is the very defect this plugin already fixed). The
 * scan still reads EVERYTHING once at project-init; only fields that earn their place survive:
 *   (a) required for creation of the type; OR
 *   (b) required for ANY state transition of the type (`transitionRequiredRefs` — /qa-fix and
 *       /qa-verify-fix transition items, so a field that becomes required on e.g. `Resolved`
 *       must survive); OR
 *   (c) bound to a semantic slot (resolveSlots over the FULL contract).
 * Everything else — system-maintained / read-only / unused — is dropped. `allowedValues` ride
 * along on the kept picklists unchanged. Pure.
 * @returns {{ fields, scanned, kept, dropped, required, slotMapped, transitionRequired, formVisible, accounting }}
 */
export function filterContractForPersist(contract, opts = {}) {
  const list = contract || [];
  const transitionRequired = new Set((opts.transitionRequiredRefs || []).map(lc));
  const { mapping } = resolveSlots(list, opts.fieldMap || {}, opts.formHtmlControls || []);
  const slotRefs = new Set(Object.values(mapping).map(lc));
  // (d) EVERY form-visible html control is a candidate body/repro/systemInfo override target — keep
  //     them all, even ones no slot auto-bound, so the create path can NAME them when a body is
  //     off-form and a `tracker.fieldMap` body override can RESOLVE against one. Dropping an on-form
  //     control made the documented remediation unactionable (review HIGH-2).
  // (e) any ref the operator already pinned via `tracker.fieldMap` / `tracker.fieldDefaults` must
  //     survive, so its value is contract-validated (not silently dropped) at create time. Empty at
  //     onboarding (the operator sets them at the first bug) — a no-op then, load-bearing after.
  const formRefs = new Set((opts.formHtmlControls || []).map(lc));
  const pinnedRefs = new Set(
    [...Object.values(opts.fieldMap || {}), ...Object.keys(opts.fieldDefaults || {})].filter(Boolean).map(lc),
  );
  const kept = [];
  let keptRequired = 0, keptSlotMapped = 0, keptTransition = 0, keptForm = 0;
  for (const f of list) {
    const r = lc(f.ref);
    const isReq = f.required === true;
    const isSlot = slotRefs.has(r);
    const isTrans = transitionRequired.has(r);
    const isForm = formRefs.has(r) || pinnedRefs.has(r);
    if (!(isReq || isSlot || isTrans || isForm)) continue; // system/unused — dropped
    kept.push(f);
    if (isReq) keptRequired++;            // count each kept field under exactly ONE reason, in
    else if (isSlot) keptSlotMapped++;    // priority order (required → slot → transition → form),
    else if (isTrans) keptTransition++;   // so the reasons sum to `kept` with no double-count.
    else keptForm++;
  }
  const scanned = list.length;
  const dropped = scanned - kept.length;
  const accounting = `rule-filtered (${scanned} scanned, ${kept.length} kept, ${dropped} dropped as system/unused, ${keptRequired} required)`;
  return { fields: kept, scanned, kept: kept.length, dropped, required: keptRequired, slotMapped: keptSlotMapped, transitionRequired: keptTransition, formVisible: keptForm, accounting };
}

/**
 * The required fields the operator must actually be ASKED about at the first bug creation — made
 * EXPLICIT rather than incidental (VCST-5702 ITEM 0b). A required field is NOT asked when it is
 * already auto-satisfied:
 *   - System.Title (always supplied via --title);
 *   - System.State / System.AreaId / System.IterationId (server-defaulted, or set via
 *     defaultValue / AreaPath / --iteration current — the SERVER_DEFAULTED_REQUIRED set);
 *   - any field carrying a contract `defaultValue`;
 *   - any field with a persisted `tracker.fieldDefaults` entry.
 * On the omnia-opus/OPUS Bug that reduces 8 required fields to exactly 3 questions. Pure.
 * @returns {Array} contract entries the operator must answer, in contract order.
 */
export function operatorQuestions(contract, opts = {}) {
  const list = contract || [];
  const fieldDefaults = new Set(Object.keys(opts.fieldDefaults || {}).map(lc));
  const out = [];
  for (const f of list) {
    if (!f.required) continue;
    const r = lc(f.ref);
    if (r === "system.title") continue;
    if (SERVER_DEFAULTED_REQUIRED.has(r)) continue;
    if (f.defaultValue) continue;
    if (fieldDefaults.has(r)) continue;
    out.push(f);
  }
  return out;
}
