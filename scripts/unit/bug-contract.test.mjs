// Unit tests for the discovered per-organization bug FIELD CONTRACT
// (plugins/vc-fix/skills/qa-fix-routing/bug-contract.mjs — VCST-5582 E).
//
// Driven by RECORDED metadata from two DIFFERENT Azure Boards processes (see
// fixtures/ado-bug-metadata.mjs): the LEO/OPUS-shaped custom process the old code hardcoded,
// and a stock Agile Bug that has none of those Custom.* refs. Every assertion that mentions
// "portability" is AC 7: the same flow must work on a process it has never seen, no code change.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFieldContract, resolveSlots, buildContractFields, verifyAgainstContract,
  renderVerifyTable, classifyFieldRejection, isHtmlByContract, fieldOf, BUG_SLOTS,
} from "../../plugins/vc-fix/skills/qa-fix-routing/bug-contract.mjs";
import { FIELD_TYPES, LEO_OPUS_BUG_FIELDS, AGILE_BUG_FIELDS } from "./fixtures/ado-bug-metadata.mjs";

const LEO = parseFieldContract(LEO_OPUS_BUG_FIELDS, FIELD_TYPES);
const AGILE = parseFieldContract(AGILE_BUG_FIELDS, FIELD_TYPES);

// ─── E-a — contract parsing ───────────────────────────────────────────────────────
test("parseFieldContract: captures ref, name, required, type, allowedValues, defaultValue", () => {
  const env = fieldOf(LEO, "Custom.Environment");
  assert.deepEqual(env, {
    ref: "Custom.Environment", name: "Environment", required: true, type: "string",
    allowedValues: ["QA", "UAT", "PROD", "Dev", "Local"],
  });
  const sev = fieldOf(LEO, "Microsoft.VSTS.Common.Severity");
  assert.equal(sev.required, false);
  assert.equal(sev.defaultValue, "3 - Medium");
});

test("parseFieldContract: the data type comes from the ONE org-level field list", () => {
  assert.equal(fieldOf(LEO, "System.Description").type, "html");
  assert.equal(fieldOf(LEO, "Custom.Reportedby").type, "plaintext");
  assert.equal(fieldOf(LEO, "System.AssignedTo").type, "identity");
  assert.equal(fieldOf(LEO, "System.IterationPath").type, "treepath");
});

test("parseFieldContract: required fields sort first (stable, diffable output)", () => {
  const firstNonRequired = LEO.findIndex((f) => !f.required);
  assert.ok(LEO.slice(0, firstNonRequired).every((f) => f.required));
  assert.ok(LEO.slice(firstNonRequired).every((f) => !f.required));
});

test("parseFieldContract: a missing type list degrades to \"string\", never crashes", () => {
  const c = parseFieldContract(LEO_OPUS_BUG_FIELDS, []);
  assert.equal(c.length, LEO_OPUS_BUG_FIELDS.length);
  assert.ok(c.every((f) => f.type === "string"));
});

// ─── E-a — the HTML decision is DERIVED, not asserted ─────────────────────────────
test("isHtmlByContract: html ⇒ true, plainText ⇒ false, unknown field ⇒ null (legacy fallback)", () => {
  assert.equal(isHtmlByContract(LEO, "System.Description"), true);
  assert.equal(isHtmlByContract(LEO, "Custom.Reportedby"), false);
  assert.equal(isHtmlByContract(LEO, "System.AssignedTo"), null, "identity is neither — defer to the legacy set");
  assert.equal(isHtmlByContract(AGILE, "System.Description"), null, "the stock Agile Bug has no Description field at all");
});

// ─── E-b — semantic slot mapping ──────────────────────────────────────────────────
test("resolveSlots (LEO/OPUS): auto-maps every slot the old code hardcoded, by NAME not by ref", () => {
  const { mapping, source, unmappedRequired } = resolveSlots(LEO, {});
  assert.equal(mapping.environment, "Custom.Environment");
  assert.equal(mapping.reportedBy, "Custom.Reportedby");
  assert.equal(mapping.bugType, "Custom.Typeofbug");
  assert.equal(mapping.body, "System.Description");
  assert.equal(mapping.severity, "Microsoft.VSTS.Common.Severity");
  assert.equal(source.environment, "auto");
  // System.State is required but SERVER-DEFAULTED on create (and covered by roleStates), so it is
  // deliberately excluded from unmappedRequired (VCST-5582 E2) — it is not a bug-report slot and the
  // operator cannot act on it. Every other required LEO field auto-mapped, so nothing is unmapped.
  assert.deepEqual(unmappedRequired.map((f) => f.ref), []);
});

test("resolveSlots: server-defaulted required fields never surface as unmappedRequired (E2)", () => {
  // A synthetic contract whose ONLY required fields are the three Azure server-defaults + a Title
  // (which auto-maps). A healthy onboarding must report ZERO unmapped-required — the old behaviour
  // flagged all three as an un-actionable degradation on every Azure project.
  const contract = [
    { ref: "System.Title", name: "Title", required: true, type: "string" },
    { ref: "System.AreaId", name: "Area", required: true, type: "integer" },
    { ref: "System.IterationId", name: "Iteration", required: true, type: "integer" },
    { ref: "System.State", name: "State", required: true, type: "string", defaultValue: "New" },
  ];
  const { unmappedRequired } = resolveSlots(contract, {});
  assert.deepEqual(unmappedRequired.map((f) => f.ref), [], "AreaId/IterationId/State are server-defaulted — not the operator's to map");
});

test("resolveSlots: a name match with an INCOMPATIBLE type is rejected (the treePath trap)", () => {
  // Custom.EnvironmentTree is literally named "Environment" but is a treePath. A name-only
  // matcher would bind it; the type gate must keep the real picklist.
  assert.equal(resolveSlots(LEO, {}).mapping.environment, "Custom.Environment");
});

test("resolveSlots (stock Agile): PORTABILITY — no Custom.* exists, other fields bind instead (AC 7)", () => {
  const { mapping, unmappedRequired } = resolveSlots(AGILE, {});
  assert.equal(mapping.environment, undefined, "this process simply has no Environment field");
  assert.equal(mapping.bugType, undefined);
  assert.equal(mapping.reportedBy, undefined);
  assert.equal(mapping.repro, "Microsoft.VSTS.TCM.ReproSteps");
  assert.equal(mapping.foundIn, "Microsoft.VSTS.Build.FoundIn");
  assert.equal(mapping.systemInfo, "Microsoft.VSTS.TCM.SystemInfo");
  // Its OWN required fields are surfaced — including one the LEO process doesn't have.
  assert.ok(unmappedRequired.some((f) => f.ref === "System.AreaPath"), "the Agile Bug's required Area Path is reported");
});

test("resolveSlots: an explicit tracker.fieldMap override is the operator's LAST WORD", () => {
  const { mapping, source } = resolveSlots(LEO, { environment: "Custom.Typeofbug" });
  assert.equal(mapping.environment, "Custom.Typeofbug", "the override wins over auto-matching");
  assert.equal(source.environment, "override");
  assert.notEqual(mapping.bugType, "Custom.Typeofbug", "…and the field is not double-bound");
});

test("resolveSlots: a STALE override (a field this process no longer has) is dropped, not sent", () => {
  const { mapping, staleOverrides } = resolveSlots(AGILE, { environment: "Custom.Environment" });
  assert.equal(mapping.environment, undefined);
  assert.deepEqual(staleOverrides, ["environment=Custom.Environment"]);
});

test("resolveSlots: one field is never bound to two slots", () => {
  const { mapping } = resolveSlots(LEO, {});
  const refs = Object.values(mapping);
  assert.equal(refs.length, new Set(refs.map((r) => r.toLowerCase())).size);
});

test("BUG_SLOTS excludes parent/attachments — those are RELATIONS, not fields", () => {
  assert.ok(!BUG_SLOTS.includes("parent"));
  assert.ok(!BUG_SLOTS.includes("attachments"));
});

// ─── E-c — payload build + picklist validation BEFORE the POST ────────────────────
test("buildContractFields: a picklist value outside allowedValues is an ERROR (nothing is sent)", () => {
  const { mapping } = resolveSlots(LEO, {});
  const r = buildContractFields(LEO, mapping, { severity: "9 - Apocalyptic" }, { "Custom.Environment": "QA", "Custom.Reportedby": "QA team" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /not an allowed value/);
  assert.match(r.errors[0], /1 - Critical, 2 - High/, "the message lists what IS allowed");
});

test("buildContractFields: a picklist value is normalized to the ORGANIZATION's exact casing", () => {
  const r = buildContractFields(LEO, resolveSlots(LEO, {}).mapping, {}, { "Custom.Environment": "qa", "Custom.Reportedby": "QA team" });
  assert.equal(r.fields["Custom.Environment"], "QA");
  assert.deepEqual(r.errors, []);
});

test("buildContractFields: a field this organization does NOT have is dropped, never sent (AC 7)", () => {
  // The exact LEO-only set the old code hardcoded, aimed at a stock Agile process.
  const r = buildContractFields(AGILE, resolveSlots(AGILE, {}).mapping, {}, {
    "Custom.Environment": "QA", "Custom.Reportedby": "QA team", "Custom.Typeofbug": "Functional",
  });
  assert.deepEqual(r.dropped.sort(), ["Custom.Environment", "Custom.Reportedby", "Custom.Typeofbug"]);
  assert.equal(Object.keys(r.fields).some((k) => k.startsWith("Custom.")), false);
});

test("buildContractFields: a required field with no value BLOCKS the request", () => {
  const r = buildContractFields(LEO, resolveSlots(LEO, {}).mapping, {}, {});
  const missing = r.missingRequired.map((f) => f.ref).sort();
  assert.deepEqual(missing, ["Custom.Environment", "Custom.Reportedby", "System.IterationPath", "System.Title"]);
  assert.ok(r.missingRequired.find((f) => f.ref === "Custom.Environment").allowedValues.includes("QA"),
    "the blocked field carries its allowedValues so the operator question can offer them");
});

test("buildContractFields: a required field with a defaultValue is filled from it, not asked", () => {
  // System.State is required in both processes and ships a default.
  const r = buildContractFields(AGILE, resolveSlots(AGILE, {}).mapping, {}, {
    "System.Title": "x", "System.AreaPath": "Proj", "System.IterationPath": "Proj\\Sprint 1",
  });
  assert.equal(r.fields["System.State"], "New");
  assert.deepEqual(r.missingRequired, []);
});

test("buildContractFields: satisfiedRefs — a field the CALLER emits itself is not reported missing", () => {
  // buildBugFields writes title/description/repro/systemInfo/tags/assignee/iteration through its
  // OWN dedicated JSON-Patch ops. Without this, a perfectly good POST was blocked on
  // "System.Title has no value" while --title was right there, and emitting it here too would
  // duplicate the op.
  const r = buildContractFields(LEO, LEO_MAP, {}, { "Custom.Environment": "QA", "Custom.Reportedby": "QA team" },
    ["System.Title", "System.IterationPath"]);
  assert.deepEqual(r.missingRequired, []);
  assert.equal(r.fields["System.Title"], undefined, "a satisfied ref must NOT enter the field set (no duplicate op)");
});

test("buildContractFields: satisfiedRefs does not mask a genuinely unset required field", () => {
  const r = buildContractFields(LEO, LEO_MAP, {}, { "Custom.Environment": "QA" }, ["System.Title", "System.IterationPath"]);
  assert.deepEqual(r.missingRequired.map((f) => f.ref), ["Custom.Reportedby"]);
});

test("buildContractFields: no contract at all ⇒ everything passes through (the legacy fallback)", () => {
  const r = buildContractFields([], {}, {}, { "Custom.Anything": "v" });
  assert.deepEqual(r.fields, { "Custom.Anything": "v" });
  assert.deepEqual(r.dropped, []);
  assert.deepEqual(r.errors, []);
});

// ─── E-e — read back and verify ───────────────────────────────────────────────────
const LEO_MAP = resolveSlots(LEO, {}).mapping;

test("verifyAgainstContract: every required + mapped field populated ⇒ ok, all PASS", () => {
  const sent = { "Custom.Environment": "QA", "Custom.Reportedby": "QA team", "System.Title": "t" };
  const item = {
    "System.Title": "t", "System.State": "New", "System.IterationPath": "P\\S1",
    "Custom.Environment": "QA", "Custom.Reportedby": "QA team",
    "System.Description": "<p>body</p>", "Microsoft.VSTS.Common.Severity": "2 - High",
    "Microsoft.VSTS.Common.Priority": 2, "Microsoft.VSTS.TCM.SystemInfo": "<p>info</p>",
    "Custom.Typeofbug": "Functional", "System.Tags": "qa", "System.AssignedTo": { displayName: "QA Bot" },
    "Custom.EnvironmentTree": "P",
  };
  const v = verifyAgainstContract(LEO, LEO_MAP, item, sent);
  assert.equal(v.ok, true, `unexpected MISSING: ${v.missing.map((r) => r.ref).join(", ")}`);
  assert.ok(v.rows.every((r) => r.status !== "MISSING"));
});

test("verifyAgainstContract: a 200 with EMPTY fields is caught — this is the OPUS symptom", () => {
  // Exactly the failure the old code could not see: the item exists, the fields are unset.
  const v = verifyAgainstContract(LEO, LEO_MAP, { "System.Title": "t", "System.State": "New" },
    { "Custom.Environment": "QA", "Custom.Reportedby": "QA team" });
  assert.equal(v.ok, false);
  const missing = v.missing.map((r) => r.ref);
  assert.ok(missing.includes("Custom.Environment"));
  assert.ok(missing.includes("Custom.Reportedby"));
  assert.ok(missing.includes("System.IterationPath"), "a required field is MISSING even if we never sent it");
});

test("verifyAgainstContract: an identity field object counts as populated", () => {
  const v = verifyAgainstContract(LEO, LEO_MAP, { "System.AssignedTo": { displayName: "QA Bot" } }, { "System.AssignedTo": "qa@x" });
  assert.equal(v.rows.find((r) => r.ref === "System.AssignedTo").status, "PASS");
});

test("verifyAgainstContract: an optional field we never intended to send is SKIP, not MISSING", () => {
  const v = verifyAgainstContract(LEO, LEO_MAP, { "System.Title": "t" }, { "System.Title": "t" });
  assert.equal(v.rows.find((r) => r.ref === "Custom.Typeofbug").status, "SKIP");
});

test("renderVerifyTable: the operator sees a per-field PASS/MISSING table, not just the key", () => {
  const v = verifyAgainstContract(LEO, LEO_MAP, { "System.Title": "t" }, { "System.Title": "t" });
  const md = renderVerifyTable(v.rows);
  assert.match(md, /\| Field \| Ref \| Slot \| Required \| Status \|/);
  assert.match(md, /Custom\.Environment.*MISSING/);
  assert.match(md, /System\.Title.*PASS/);
});

// ─── E-f — fallback ladder + single self-heal ─────────────────────────────────────
test("classifyFieldRejection: an unknown-field rejection on an OPTIONAL field is droppable", () => {
  const r = classifyFieldRejection("TF401326: Invalid field status for field 'Custom.Typeofbug'.", LEO);
  assert.equal(r.ref, "Custom.Typeofbug");
  assert.equal(r.reason, "not-a-field");
  assert.equal(r.required, false);
  assert.equal(r.droppable, true);
});

test("classifyFieldRejection: a REQUIRED field is NEVER droppable — STOP and ask", () => {
  const r = classifyFieldRejection("VS402625: The field 'Environment' contains the value 'STAGE' which is not in the list of supported values.", LEO);
  assert.equal(r.ref, "Custom.Environment");
  assert.equal(r.reason, "invalid-value");
  assert.equal(r.required, true);
  assert.equal(r.droppable, false, "dropping a required field to make the POST succeed is exactly the bug");
});

test("classifyFieldRejection: a display-name-only message still resolves to the ref", () => {
  const r = classifyFieldRejection("The field \"Type of bug\" contains an invalid value.", LEO);
  assert.equal(r.ref, "Custom.Typeofbug");
});

test("classifyFieldRejection: an unrecognisable message is never droppable", () => {
  const r = classifyFieldRejection("TF400813: The user is not authorized to access this resource.", LEO);
  assert.equal(r.droppable, false);
  assert.equal(r.reason, "unknown");
});

// ─── AC 5 — no organization-specific field ref survives as a HARDCODED value ───────
test("AC 5: qa-bug.md and the payload builder carry NO hardcoded Custom.* field ref", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const files = [
    "plugins/vc-fix/commands/qa-bug.md",
    "plugins/vc-fix/skills/qa-fix-routing/ado-html.mjs", // the payload builder
  ];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    for (const line of text.split("\n")) {
      const hit = line.match(/Custom\.[A-Za-z]\w*/g);
      if (!hit) continue;
      // A ref is allowed ONLY inside prose that tells you NOT to hardcode it, or in a comment
      // naming the historical defect / a generic example of a plaintext custom field.
      const allowed = /Do \*\*NOT\*\* hardcode|do not hardcode|hardcoded|Custom\.ProblemDescription|Custom\.EnvSystemInfo/i.test(line);
      assert.ok(allowed, `${rel} still hardcodes ${hit.join(", ")}:\n  ${line.trim()}`);
    }
  }
});

test("AC 5: qa-bug.md tells the operator to read tracker.fields, and to show the PASS/MISSING table", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const md = readFileSync(join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), "plugins/vc-fix/commands/qa-bug.md"), "utf8");
  assert.match(md, /tracker\.fields\.Bug\[\]/, "the contract is the source of the field set");
  assert.match(md, /PASS\/MISSING/, "the read-back table is reported to the operator");
  assert.match(md, /unverified defaults/, "the fallback rung is named out loud");
  assert.match(md, /never retry with fields removed/i, "the no-degrade rule is explicit");
});

// ─── the whole point, end to end ──────────────────────────────────────────────────
test("AC 7: the SAME slot values produce a correct payload on BOTH processes, no code change", () => {
  const slotValues = { severity: "2 - High", priority: "2" };
  const leo = buildContractFields(LEO, resolveSlots(LEO, {}).mapping, slotValues, {
    "System.Title": "t", "System.IterationPath": "P\\S1", "Custom.Environment": "QA", "Custom.Reportedby": "QA team",
  });
  const agile = buildContractFields(AGILE, resolveSlots(AGILE, {}).mapping, slotValues, {
    "System.Title": "t", "System.IterationPath": "P\\S1", "System.AreaPath": "P",
  });
  assert.deepEqual(leo.errors, []);
  assert.deepEqual(leo.missingRequired, []);
  assert.deepEqual(agile.errors, []);
  assert.deepEqual(agile.missingRequired, []);
  // Each payload carries only fields its OWN process has.
  assert.ok("Custom.Environment" in leo.fields);
  assert.ok(!("Custom.Environment" in agile.fields));
  assert.equal(leo.fields["Microsoft.VSTS.Common.Severity"], "2 - High");
  assert.equal(agile.fields["Microsoft.VSTS.Common.Severity"], "2 - High");
});
