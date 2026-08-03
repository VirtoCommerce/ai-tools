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
 * Pure + side-effect-free: no network, no fs, no process.env. Unit-tested against recorded
 * metadata fixtures from two DIFFERENT Azure Boards processes.
 */

// ─── semantic slots ──────────────────────────────────────────────────────────────────
// The fixed vocabulary a bug report speaks. `parent` and `attachments` are deliberately
// ABSENT: those are work-item RELATIONS, not fields, so they never appear in a field
// contract and are handled by buildBugFields' relation ops instead.
export const BUG_SLOTS = [
  "title", "body", "repro", "expected", "actual",
  "severity", "priority", "environment", "bugType", "reportedBy",
  "systemInfo", "foundIn", "sprint", "assignee", "tags",
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
};

const lc = (v) => String(v ?? "").toLowerCase();

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
export function resolveSlots(contract, fieldMap = {}) {
  const list = contract || [];
  const mapping = {};
  const source = {};
  const staleOverrides = [];
  const taken = new Set();

  // (1) explicit overrides
  for (const [slot, ref] of Object.entries(fieldMap || {})) {
    if (!BUG_SLOTS.includes(slot) || !ref) continue;
    const f = fieldOf(list, ref);
    if (!f) { staleOverrides.push(`${slot}=${ref}`); continue; }
    mapping[slot] = f.ref;
    source[slot] = "override";
    taken.add(lc(f.ref));
  }

  // (2) auto-match — canonical refs first, then display names; both TYPE-gated. One field is
  // bound to at most one slot (`taken`), so a name that could satisfy two slots goes to the
  // one resolved first (BUG_SLOTS order = specificity order).
  for (const slot of BUG_SLOTS) {
    if (mapping[slot]) continue;
    const spec = SLOT_SPECS[slot];
    if (!spec) continue;
    const typeOk = (f) => !spec.types || spec.types.includes(f.type);
    let hit = list.find((f) => !taken.has(lc(f.ref)) && spec.refs.some((r) => lc(r) === lc(f.ref)));
    if (!hit) hit = list.find((f) => !taken.has(lc(f.ref)) && typeOk(f) && spec.names.some((rx) => rx.test(f.name)));
    if (hit) { mapping[slot] = hit.ref; source[slot] = "auto"; taken.add(lc(hit.ref)); }
  }

  const unmapped = BUG_SLOTS.filter((s) => !mapping[s]);
  const requiredRefs = list.filter((f) => f.required).map((f) => f.ref);
  // (3) The set that BLOCKS a POST: required by the process, and nothing bound it — EXCLUDING the
  // fields Azure DevOps server-defaults on create (System.AreaId/IterationId/State). Those are
  // `alwaysRequired` in the contract but need no semantic slot, so counting them would make every
  // healthy Azure onboarding report an un-actionable degradation (VCST-5582 E2).
  const unmappedRequired = list.filter(
    (f) => f.required && !taken.has(lc(f.ref)) && !SERVER_DEFAULTED_REQUIRED.has(lc(f.ref)),
  );
  return { mapping, source, unmapped, unmappedRequired, requiredRefs, staleOverrides };
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
 * @returns {{ rows: Array, missing: Array, ok: boolean }}
 *   rows: [{ ref, name, slot, required, status: "PASS"|"MISSING"|"SKIP", value }]
 */
export function verifyAgainstContract(contract, mapping, itemFields = {}, sent = {}) {
  const list = contract || [];
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
    // A non-required, unmapped-value field we never intended to send is not a failure.
    const status = present ? "PASS" : (f.required || intended) ? "MISSING" : "SKIP";
    rows.push({
      ref: f.ref,
      name: f.name,
      slot: bySlot.get(lc(f.ref)) || "",
      required: !!f.required,
      status,
      value: present ? String(typeof raw === "object" ? (raw.displayName ?? "") : raw).slice(0, 60) : "",
    });
  }
  rows.sort((a, b) => (Number(b.required) - Number(a.required)) || a.ref.localeCompare(b.ref));
  const missing = rows.filter((r) => r.status === "MISSING");
  return { rows, missing, ok: missing.length === 0 };
}

/** Render the read-back result as the operator-facing PASS/MISSING table (E-e). */
export function renderVerifyTable(rows) {
  const head = ["| Field | Ref | Slot | Required | Status |", "|---|---|---|---|---|"];
  const body = (rows || []).map((r) => `| ${r.name} | \`${r.ref}\` | ${r.slot || "—"} | ${r.required ? "yes" : "no"} | ${r.status} |`);
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
