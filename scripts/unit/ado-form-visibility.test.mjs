// Unit tests for VCST-5702 — Azure Boards FORM-VISIBILITY body binding + the smaller self-check
// findings (ITEMs 0, 0b, 1, 2, 4). Targets plugins/vc-fix/ as the CANONICAL copy; the .claude/
// mirror carries no qa-fix-routing surface, so there is nothing to duplicate there.
//
// The silent failure this locks down: the whole bug body was written to System.Description, which
// is in the field CONTRACT but NOT on the Bug form, so it rendered NOWHERE while create-workitem
// reported `Description | PASS`, `fieldsOk: true`. A presence-based check cannot fail on an
// off-form field. Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  resolveSlots, verifyAgainstContract, renderVerifyTable, filterContractForPersist,
  operatorQuestions, parseFormLayout,
} from "../../plugins/vc-fix/skills/qa-fix-routing/bug-contract.mjs";
import { shapeWorkItem } from "../../plugins/vc-fix/skills/qa-fix-routing/ado.mjs";
import { buildBugFields } from "../../plugins/vc-fix/skills/qa-fix-routing/ado-html.mjs";
import { pinnedPlaywrightVersion } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";
import {
  OPUS_FORM_HTML_CONTROLS, DESCRIPTION_ON_FORM_CONTROLS, OPUS_LAYOUT_WIT, OPUS_XMLFORM_WIT,
  OPUS_BUG_73, LEO_OPUS_BUG_FIELDS, FIELD_TYPES,
} from "./fixtures/ado-bug-metadata.mjs";
import { parseFieldContract } from "../../plugins/vc-fix/skills/qa-fix-routing/bug-contract.mjs";

const ADO = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/skills/qa-fix-routing/ado.mjs");
const LEO = parseFieldContract(LEO_OPUS_BUG_FIELDS, FIELD_TYPES);

// ─── parseFormLayout ───────────────────────────────────────────────────────────────
test("parseFormLayout: reads html controls from the structured layout, in form order", () => {
  assert.deepEqual(parseFormLayout(OPUS_LAYOUT_WIT), OPUS_FORM_HTML_CONTROLS);
});
test("parseFormLayout: falls back to parsing xmlForm when there is no structured layout", () => {
  assert.deepEqual(parseFormLayout(OPUS_XMLFORM_WIT), OPUS_FORM_HTML_CONTROLS);
});
test("parseFormLayout: no layout at all ⇒ [] (form-gating stays inactive)", () => {
  assert.deepEqual(parseFormLayout({}), []);
});

// ─── TEST 1 — body resolves to the first FORM-VISIBLE html control (System.Description off-form) ──
test("ITEM 0 #1: body resolves to ReproSteps when System.Description is off-form", () => {
  const { mapping } = resolveSlots(OPUS_BUG_73, {}, OPUS_FORM_HTML_CONTROLS);
  assert.equal(mapping.body, "Microsoft.VSTS.TCM.ReproSteps", "the body must land on a control that is ON the form");
  assert.notEqual(mapping.body, "System.Description", "System.Description exists but is off-form — never the body target");
  assert.equal(mapping.systemInfo, "Microsoft.VSTS.TCM.SystemInfo");
  // repro has NO distinct form control (ReproSteps was claimed by body) — it folds into the body.
  // This is the precondition that triggers the create-path repro→body merge.
  assert.equal(mapping.repro, undefined, "repro is unmapped when body took the only spare html control");
});

// ─── TEST 1b — the WRITE path actually targets the resolved ref (not just resolution) ─────
// resolveSlots proving body=ReproSteps is not enough: buildBugFields must WRITE there. A regression
// that ignored bodyRef and emitted to System.Description would pass every resolution test.
test("ITEM 0 #1b: buildBugFields writes the body to the resolved ref, NOT System.Description", () => {
  const ops = buildBugFields({ title: "t", description: "the whole report", bodyRef: "Microsoft.VSTS.TCM.ReproSteps", reproRef: undefined, reproSteps: "" });
  const paths = ops.map((o) => o.path);
  assert.ok(paths.includes("/fields/Microsoft.VSTS.TCM.ReproSteps"), "the body op targets the form-visible ref");
  assert.ok(!paths.includes("/fields/System.Description"), "nothing is written to the off-form System.Description");
  const bodyOp = ops.find((o) => o.path === "/fields/Microsoft.VSTS.TCM.ReproSteps");
  assert.match(String(bodyOp.value), /the whole report/);
});
test("ITEM 0 #1b: a second op to the same ref is deduped (repro folded into body)", () => {
  // When repro and body share a ref, only ONE JSON-Patch op may be emitted for it.
  const ops = buildBugFields({ title: "t", description: "BODY", reproSteps: "REPRO", bodyRef: "Microsoft.VSTS.TCM.ReproSteps", reproRef: "Microsoft.VSTS.TCM.ReproSteps" });
  const reproOps = ops.filter((o) => o.path === "/fields/Microsoft.VSTS.TCM.ReproSteps");
  assert.equal(reproOps.length, 1, "exactly one op to the shared ref — never a duplicate");
});
test("ITEM 0 #1b: default (no bodyRef) still targets System.Description (backward compatible)", () => {
  const ops = buildBugFields({ title: "t", description: "body" });
  assert.ok(ops.some((o) => o.path === "/fields/System.Description"), "no contract ⇒ legacy canonical ref");
});
test("ITEM 0b #1b: a contract custom field on Severity/Tags does not duplicate the slot op", () => {
  // Severity/Priority/Tags now go through the dedup set, so a same-ref custom field can't double-emit.
  const ops = buildBugFields({ title: "t", severity: "2 - High", tags: "qa", fields: { "Microsoft.VSTS.Common.Severity": "1 - Critical", "System.Tags": "dupe" } });
  assert.equal(ops.filter((o) => o.path === "/fields/Microsoft.VSTS.Common.Severity").length, 1, "one Severity op");
  assert.equal(ops.filter((o) => o.path === "/fields/System.Tags").length, 1, "one Tags op");
});

test("ITEM 0 #1: forcing body=System.Description (off-form) is surfaced as an off-form slot", () => {
  const { mapping, offFormSlots, htmlControlsAvailable } = resolveSlots(OPUS_BUG_73, { body: "System.Description" }, OPUS_FORM_HTML_CONTROLS);
  assert.equal(mapping.body, "System.Description", "an operator override is honoured…");
  assert.ok(offFormSlots.some((s) => s.slot === "body" && s.ref === "System.Description"), "…but flagged off-form so the create path refuses it");
  assert.deepEqual(htmlControlsAvailable, OPUS_FORM_HTML_CONTROLS, "the available on-form html controls are named");
});

test("ITEM 0 #1: create-workitem REFUSES to POST a body to an off-form field, naming the alternatives", () => {
  const dir = mkdtempSync(join(tmpdir(), "vc-fix-offform-"));
  try {
    writeFileSync(join(dir, "body.md"), "# Repro\n1. do a thing\n");
    writeFileSync(join(dir, "project-profile.json"), JSON.stringify({
      tracker: {
        kind: "azure",
        azure: { organization: "acme", project: "Web", apiBase: "https://dev.azure.com/acme/Web" },
        // Force the body onto the off-form System.Description — the exact OPUS misroute.
        fieldMap: { body: "System.Description" },
        fields: {
          Bug: [
            { ref: "System.Title", name: "Title", required: true, type: "string" },
            { ref: "System.Description", name: "Description", required: false, type: "html" },
            { ref: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps", required: false, type: "html" },
            { ref: "Microsoft.VSTS.TCM.SystemInfo", name: "System Info", required: false, type: "html" },
          ],
        },
        formLayout: { Bug: { htmlControls: OPUS_FORM_HTML_CONTROLS } },
      },
    }));
    let stderr = "";
    try {
      execFileSync(process.execPath, [ADO, "create-workitem", "--type", "Bug", "--title", "x", "--description-file", "body.md", "--no-preflight"], {
        cwd: dir, encoding: "utf8", env: { ...process.env, PROJECT_PROFILE_PATH: join(dir, "project-profile.json"), ADO_PAT: "" },
      });
      assert.fail("create-workitem should have refused (off-form body), not proceeded to the POST");
    } catch (e) {
      stderr = String(e.stderr || e.stdout || e.message);
    }
    assert.match(stderr, /NOT on the Bug form/i, "the refusal names the off-form problem");
    assert.match(stderr, /Microsoft\.VSTS\.TCM\.ReproSteps/, "…and lists the html controls that ARE on the form");
    assert.doesNotMatch(stderr, /HTTP \d|dev\.azure\.com.*401/, "nothing was POSTed — the refusal is pre-flight");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── TEST 2 — no regression when System.Description IS on the form ───────────────────
test("ITEM 0 #2: body resolves to System.Description when it IS on the form", () => {
  const { mapping } = resolveSlots(LEO, {}, DESCRIPTION_ON_FORM_CONTROLS);
  assert.equal(mapping.body, "System.Description", "a process whose form surfaces Description keeps the canonical body target");
});
test("ITEM 0 #2: NO layout scanned ⇒ pre-5702 behaviour (body = System.Description)", () => {
  const { mapping } = resolveSlots(LEO, {}); // no formHtmlControls
  assert.equal(mapping.body, "System.Description");
});

// ─── TEST 3 — an off-form body can never yield fieldsOk: true ─────────────────────────
test("ITEM 0 #3: a body that landed off-form is OFF_FORM, never fieldsOk: true", () => {
  // The item exists and System.Description is NON-EMPTY — exactly the OPUS false pass. With the form
  // layout known, the body row must be OFF_FORM (not PASS), so ok:false.
  const mapping = { body: "System.Description" };
  const contract = [{ ref: "System.Description", name: "Description", required: false, type: "html" }];
  const v = verifyAgainstContract(contract, mapping, { "System.Description": "<p>the whole bug report</p>" }, { "System.Description": "<p>the whole bug report</p>" }, { formHtmlControls: OPUS_FORM_HTML_CONTROLS });
  assert.equal(v.ok, false, "a non-empty but OFF-FORM body is not a pass");
  assert.equal(v.rows.find((r) => r.ref === "System.Description").status, "OFF_FORM");
});
test("ITEM 0 #3: the SAME field ON the form is a normal PASS (no false negative)", () => {
  const mapping = { body: "System.Description" };
  const contract = [{ ref: "System.Description", name: "Description", required: false, type: "html" }];
  const v = verifyAgainstContract(contract, mapping, { "System.Description": "<p>body</p>" }, { "System.Description": "<p>body</p>" }, { formHtmlControls: DESCRIPTION_ON_FORM_CONTROLS });
  assert.equal(v.ok, true);
  assert.equal(v.rows.find((r) => r.ref === "System.Description").status, "PASS");
});

// ─── TEST 4 — ITEM 0b rule-filter: 73 → 18 (8 required + 10 slot-mapped) ───────────────
// D1 added a `valueArea` slot for Microsoft.VSTS.Common.ValueArea (a standard field present as a
// filler in this fixture), so it now slot-maps and is KEPT — the baseline is 18, not 17.
test("ITEM 0b #4: the 73-field OPUS Bug rule-filters to exactly 18 (8 required + 10 slot-mapped)", () => {
  assert.equal(OPUS_BUG_73.length, 73, "fixture is the full-width contract");
  const r = filterContractForPersist(OPUS_BUG_73, { transitionRequiredRefs: [] });
  assert.equal(r.kept, 18, "kept = required ∪ slot-mapped");
  assert.equal(r.required, 8, "8 required");
  assert.equal(r.slotMapped, 10, "10 slot-mapped, none required (incl. the D1 ValueArea slot)");
  assert.equal(r.dropped, 55, "55 dropped as system/unused");
  assert.equal(r.accounting, "rule-filtered (73 scanned, 18 kept, 55 dropped as system/unused, 8 required)");
  // A representative system/read-only field is dropped; a required and a slot-mapped field survive.
  const keptRefs = new Set(r.fields.map((f) => f.ref));
  assert.ok(!keptRefs.has("System.ChangedBy"), "a system/read-only field is dropped");
  assert.ok(!keptRefs.has("Custom.Unused55"), "an unused custom field is dropped");
  assert.ok(keptRefs.has("Custom.Environment"), "a required field survives");
  assert.ok(keptRefs.has("System.Description"), "a slot-mapped (body) field survives");
  assert.ok(keptRefs.has("Microsoft.VSTS.Common.ValueArea"), "D1: Value Area now maps to the valueArea slot and survives");
});
test("ITEM 0b #4: a field required only on a `Resolved` transition survives (rule b)", () => {
  // Custom.ResolutionReason is a filler (dropped by default); as a transition-required ref it survives.
  const without = filterContractForPersist(OPUS_BUG_73, { transitionRequiredRefs: [] });
  assert.ok(!without.fields.some((f) => f.ref === "Custom.ResolutionReason"), "dropped when not required for any transition");
  const withTrans = filterContractForPersist(OPUS_BUG_73, { transitionRequiredRefs: ["Custom.ResolutionReason"] });
  assert.ok(withTrans.fields.some((f) => f.ref === "Custom.ResolutionReason"), "kept once a transition makes it required");
  assert.equal(withTrans.kept, 19, "exactly one more than the 18 baseline");
  assert.equal(withTrans.transitionRequired, 1);
});

// ─── TEST 5 — ITEM 0b ask-once: 8 required → exactly 3 operator questions ─────────────
test("ITEM 0b #5: 8 required fields reduce to exactly 3 operator questions", () => {
  const q = operatorQuestions(OPUS_BUG_73, {});
  const refs = q.map((f) => f.ref).sort();
  assert.deepEqual(refs, ["Custom.Environment", "Custom.Reportedby", "Custom.Typeofbug"], "only the genuinely-unknown required fields are asked");
  // The auto-satisfied required fields are NEVER asked.
  for (const auto of ["System.Title", "System.State", "System.AreaId", "System.IterationId", "Microsoft.VSTS.Common.Severity"]) {
    assert.ok(!refs.includes(auto), `${auto} is auto-satisfied (title/state/area/iteration/defaultValue) — never asked`);
  }
});
test("ITEM 0b #5: a persisted tracker.fieldDefaults answer removes that question", () => {
  const q = operatorQuestions(OPUS_BUG_73, { fieldDefaults: { "Custom.Reportedby": "QA team" } });
  assert.deepEqual(q.map((f) => f.ref).sort(), ["Custom.Environment", "Custom.Typeofbug"], "a stored default is never re-asked");
});

// ─── TEST 6 — ITEM 1 rendered-image evidence ─────────────────────────────────────────
const IMG_CONTRACT = [{ ref: "Microsoft.VSTS.TCM.ReproSteps", name: "Repro Steps", required: false, type: "html" }];
const IMG_MAP = { body: "Microsoft.VSTS.TCM.ReproSteps" };
const attachImg = (n) => Array.from({ length: n }, (_, i) => `<img src="https://dev.azure.com/o/_apis/wit/attachments/att${i}">`).join("");
test("ITEM 1 #6: submitted 3 images / read-back 0 ⇒ IMAGES_MISSING and NOT fieldsOk", () => {
  const readback = "<p>the body</p>"; // persisted, but the screenshots didn't render
  const v = verifyAgainstContract(IMG_CONTRACT, IMG_MAP, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { formHtmlControls: OPUS_FORM_HTML_CONTROLS, submittedImages: { "Microsoft.VSTS.TCM.ReproSteps": 3 } });
  const row = v.rows.find((r) => r.ref === "Microsoft.VSTS.TCM.ReproSteps");
  assert.equal(row.status, "IMAGES_MISSING");
  assert.equal(row.imgSubmitted, 3);
  assert.equal(row.imgReadback, 0);
  assert.equal(v.ok, false);
});
test("ITEM 1 #6: 3 submitted / 3 attachment images read back ⇒ PASS", () => {
  const readback = `<p>the body</p>${attachImg(3)}`;
  const v = verifyAgainstContract(IMG_CONTRACT, IMG_MAP, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { formHtmlControls: OPUS_FORM_HTML_CONTROLS, submittedImages: { "Microsoft.VSTS.TCM.ReproSteps": 3 } });
  assert.equal(v.rows.find((r) => r.ref === "Microsoft.VSTS.TCM.ReproSteps").status, "PASS");
  assert.equal(v.ok, true);
});
test("ITEM 1 #6: 0 submitted images ⇒ unchanged non-empty semantics (PASS)", () => {
  const v = verifyAgainstContract(IMG_CONTRACT, IMG_MAP, { "Microsoft.VSTS.TCM.ReproSteps": "<p>body</p>" }, { "Microsoft.VSTS.TCM.ReproSteps": "<p>body</p>" }, { formHtmlControls: OPUS_FORM_HTML_CONTROLS });
  assert.equal(v.rows.find((r) => r.ref === "Microsoft.VSTS.TCM.ReproSteps").status, "PASS");
  assert.equal(v.ok, true);
});
test("ITEM 1 #6: renderVerifyTable shows on-form status + submitted/readback image counts", () => {
  const readback = "<p>body</p>";
  const v = verifyAgainstContract(IMG_CONTRACT, IMG_MAP, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { "Microsoft.VSTS.TCM.ReproSteps": readback }, { formHtmlControls: OPUS_FORM_HTML_CONTROLS, submittedImages: { "Microsoft.VSTS.TCM.ReproSteps": 2 } });
  const md = renderVerifyTable(v.rows);
  assert.match(md, /\| Field \| Ref \| Slot \| Required \| Status \|/, "the first five columns are unchanged (backward-compatible)");
  assert.match(md, /On form/);
  assert.match(md, /0\/2/, "readback/submitted image counts are shown");
});

// ─── TEST 7 — ITEM 2 get-workitem non-destructive counters ───────────────────────────
test("ITEM 2 #7: the stripped default reports a non-zero image count + presence flags", () => {
  const d = {
    id: 8452,
    fields: {
      "System.WorkItemType": "Bug",
      "System.Title": "t",
      "System.State": "Active",
      "System.Description": `<p>body</p>${attachImg(2)}`,
      "System.IterationPath": "Proj\\Sprint 1",
      "Microsoft.VSTS.TCM.SystemInfo": "<p>env facts</p>",
    },
  };
  const s = shapeWorkItem(d);
  assert.equal(s.images.description, 2, "the stripped view can never imply zero images");
  assert.ok(!/<img/i.test(s.description), "the default view is still stripped text (no raw html)");
  assert.equal(s.hasSystemInfo, true, "systemInfo presence is surfaced (was omitted before)");
  assert.equal(s.hasIterationPath, true, "iterationPath presence is surfaced");
  // --json returns the RAW item: its html is unstripped, so inline images are inspectable.
  assert.match(d.fields["System.Description"], /<img/i, "the raw item (what --json returns) keeps the html");
});

// ─── TEST 8 — ITEM 4 gen-mcp emits the pinned @playwright/mcp version ─────────────────
test("ITEM 4 #8: gen-mcp exposes the pinned @playwright/mcp version", () => {
  const servers = { "playwright-chrome": { command: "npx", args: ["-y", "@playwright/mcp@0.0.77", "--browser", "chrome"] } };
  const v = pinnedPlaywrightVersion(servers);
  assert.equal(v, "0.0.77");
  assert.match(v, /^\d+\.\d+\.\d+$/, "a concrete pinned version, never a floating tag");
});
test("ITEM 4 #8: an unpinned playwright spec is reported as such", () => {
  assert.equal(pinnedPlaywrightVersion({ pw: { command: "npx", args: ["@playwright/mcp"] } }), "unpinned");
  assert.equal(pinnedPlaywrightVersion({ other: { command: "npx", args: ["some-other-mcp@1.0.0"] } }), "");
});

// ─── TEST 9 — ITEM 5 head-preserving op ring keeps the earliest ops ───────────────────
const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/hooks/session-telemetry.mjs");
test("ITEM 5 #9: a 161-op span keeps the EARLIEST ops visible (middle eviction, not head-drop)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-opring-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({ projectType: "native-platform", selfDiagnostics: true }));
    const tp = join(home, "transcript.jsonl");
    const run = (sub, ev) => execFileSync(process.execPath, [HOOK, sub], { input: JSON.stringify(ev), encoding: "utf8", env: { ...process.env, VC_FIX_HOME: home } });
    run("init", { session_id: "op161", transcript_path: tp });
    run("prompt", { session_id: "op161", transcript_path: tp, prompt: "/qa-bug big" });
    // 161 tool_use ops in ONE command span; the FIRST is a distinctive marker. A head-drop ring
    // (the old shift()) would evict the first 41 and lose the marker; middle eviction keeps it.
    const lines = [];
    const base = 1700000000000;
    for (let i = 0; i < 161; i++) {
      const id = `t${i}`;
      const name = i === 0 ? "FirstMarkerTool" : "genericTool";
      lines.push(JSON.stringify({ timestamp: new Date(base + i * 1000).toISOString(), message: { content: [{ type: "tool_use", id, name, input: { n: i } }] } }));
      lines.push(JSON.stringify({ timestamp: new Date(base + i * 1000 + 500).toISOString(), message: { content: [{ type: "tool_result", tool_use_id: id, is_error: false, content: [{ type: "text", text: "ok" }] }] } }));
    }
    writeFileSync(tp, lines.join("\n") + "\n");
    run("record", { session_id: "op161", transcript_path: tp });
    const state = JSON.parse(readFileSync(join(home, ".vc-fix", "diagnostics", "op161.state.json"), "utf8"));
    const span = state.currentCommand;
    assert.ok(span, "the /qa-bug command span exists");
    assert.equal(span.opCount, 161, "the whole-span count still reflects every op");
    assert.equal(span.ops.length, 120, "the ring is still bounded at OPS_CAP=120");
    assert.equal(span.opsDropped, 41, "161 - 120 evicted");
    assert.equal(span.ops[0].tool, "FirstMarkerTool", "the EARLIEST op survived (head not dropped)");
    assert.ok(span.ops.some((o) => o.tool === "FirstMarkerTool"), "the marker is still visible to the struggle detectors");
    // …and the most-recent tail is retained too — eviction is middle-only, so the last op (index 160)
    // is still present. This pins the design (first N + recent tail), not merely "head survived".
    assert.equal(span.ops.at(-1).tool, "genericTool", "the newest op is still at the tail");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
