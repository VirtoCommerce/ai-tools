// Unit tests for scripts/test-cases/scaffold-rows.ts — the KEEP gate + the
// derived-column scaffolder behind `npm run tc:scaffold`.
//
// Two things are being pinned here, and they fail in opposite directions:
//
//  1. The GATE must reject. Its whole value is refusing a row that cannot name
//     its observable, its customer-visible defect, and why that defect is
//     plausible here. A gate that quietly passes everything is worse than none:
//     it launders an ungrounded case as a reviewed one.
//  2. The SWEEP PARSERS must fail CLOSED. They read four markdown tables that
//     other people edit. If a heading moves or a table gains a column, the
//     honest outcome is a loud non-zero exit — never a sweep that silently
//     expands to nothing while the run reports "UIP sweep resolved".
//
// The live-source tests at the bottom are the drift guard: they parse the REAL
// markdown, so reshaping a table or adding a `UIP-*` probe breaks here rather
// than in a run three weeks later.
// Run: `npx tsx --test scripts/unit/scaffold-rows.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDesignVocabulary, type DesignVocabulary } from "../test-cases/append-test-cases-to-suite.js";
import {
  SWEEP_KINDS,
  SWEEP_SOURCES,
  buildRows,
  checkKeep,
  crossLayerFor,
  expandSweep,
  failureSignalsFor,
  loadSweep,
  normalisePriority,
  parseHypothesisTable,
  parseIdBlock,
  parseStateStress,
  parseUip,
  sliceSection,
  tableRows,
  type Plan,
  type PlanCase,
  type SweepKind,
  type SweepRow,
} from "../test-cases/scaffold-rows.js";

const VOCAB: DesignVocabulary = {
  archetypes: new Set(["SILENT", "CONFIG", "BOUNDARY", "RENDER", "REPLAY"]),
  nonDefectArchetypes: new Set(["BY-DESIGN", "CONVENTION"]),
  techniques: new Set(["FLOW", "EP", "DT", "BVA", "EG"]),
};

/** A case that is valid in every respect except what the test under it varies. */
function planCase(over: Partial<PlanCase> = {}): PlanCase {
  return {
    title: "Mission target — save persists the edited target",
    archetype: "SILENT",
    technique: "EG",
    observable: "the goal target returned by the blade after save + reload",
    defect: "the merchant saves a new target, the blade says Saved, and customers keep progressing against the old one",
    plausible: "mechanism: the blade PUTs a partial body and the module replaces the entity, dropping omitted fields",
    ...over,
  };
}

function plan(over: Partial<Plan> = {}): Plan {
  return {
    ticket: "VCST-5320",
    idPrefix: "MSNA",
    idStart: 24,
    defaults: { layer: "admin", priority: "High", section: "Loyalty > Missions > Admin" },
    cases: [planCase()],
    ...over,
  };
}

const noSweeps = (_k: SweepKind): SweepRow[] => [];

/* ------------------------------------------------------------------ *
 * The KEEP gate
 * ------------------------------------------------------------------ */

test("checkKeep passes a fully answered case", () => {
  assert.deepEqual(checkKeep(planCase(), "c1"), []);
});

test("checkKeep rejects a thin observable and a thin defect", () => {
  const errs = checkKeep(planCase({ observable: "the page", defect: "it fails" }), "c1");
  assert.equal(errs.length, 2);
  assert.ok(errs.some((e) => e.includes("`observable`")));
  assert.ok(errs.some((e) => e.includes("`defect`")));
});

test("checkKeep rejects the null hypothesis even when it is long enough", () => {
  // Long, fluent, and says nothing: exactly the shape the length floor misses.
  const errs = checkKeep(
    planCase({ defect: "the mission card could fail to render on the account page for some customers" }),
    "c1",
  );
  assert.equal(errs.length, 1);
  assert.match(errs[0], /null hypothesis/);
});

test("checkKeep accepts each of the three admissible plausibility grounds", () => {
  for (const why of [
    "VC-LOY-004 records exactly this on the sibling surface",
    "already filed once as VCST-5104 on the mixed-cart path",
    "reports/bugs/open/BUG-loyalty-progress-stale.md",
    "mechanism: progress is projected asynchronously, so the read can outrun the write",
  ]) {
    assert.deepEqual(checkKeep(planCase({ plausible: why }), "c1"), [], `should accept: ${why}`);
  }
});

test("checkKeep rejects plausibility that cites nothing", () => {
  const errs = checkKeep(planCase({ plausible: "this area of the product is complex and changes often" }), "c1");
  assert.equal(errs.length, 1);
  assert.match(errs[0], /`plausible` must cite/);
});

test("checkKeep rejects a `mechanism:` prefix with no mechanism behind it", () => {
  assert.equal(checkKeep(planCase({ plausible: "mechanism: bugs" }), "c1").length, 1);
});

/* ------------------------------------------------------------------ *
 * Derived columns
 * ------------------------------------------------------------------ */

test("every layer derives at least two failure signals and a cross-layer check", () => {
  for (const layer of ["api", "graphql", "admin", "storefront", "e2e"] as const) {
    assert.ok(failureSignalsFor(layer).split(",").length >= 2, `${layer} needs >=2 failure signals`);
    assert.ok(crossLayerFor(layer).trim().length > 0, `${layer} needs a cross-layer check`);
  }
});

test("graphql and e2e always carry the errors[] invariant", () => {
  for (const layer of ["graphql", "e2e"] as const) assert.match(crossLayerFor(layer), /errors\[\] is empty/);
});

test("normalisePriority maps the P0-P3 aliases and rejects anything else", () => {
  assert.equal(normalisePriority("P0"), "Critical");
  assert.equal(normalisePriority("p1"), "High");
  assert.equal(normalisePriority("Medium"), "Medium");
  assert.equal(normalisePriority("Urgent"), null);
});

/* ------------------------------------------------------------------ *
 * buildRows
 * ------------------------------------------------------------------ */

test("buildRows derives the ten boilerplate columns and leaves the authored three empty", () => {
  const { rows, errors } = buildRows(plan(), VOCAB, noSweeps);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.ID, "MSNA-024");
  assert.equal(r.Section, "Loyalty > Missions > Admin");
  assert.equal(r.Priority, "High");
  assert.equal(r.Automation_Status, "Draft");
  assert.equal(r.Cleanup, "none");
  assert.match(r.References, /VCST-5320/);
  assert.match(r.References, /Archetype:SILENT/);
  assert.match(r.References, /Technique:EG/);
  // The authored half must stay empty — the linter names each gap per row.
  assert.equal(r.Steps, "");
  assert.equal(r.Assertions, "");
});

test("buildRows numbers ids sequentially from idStart", () => {
  const { rows } = buildRows(plan({ cases: [planCase(), planCase({ title: "Second" })] }), VOCAB, noSweeps);
  assert.deepEqual(
    rows.map((r) => r.ID),
    ["MSNA-024", "MSNA-025"],
  );
});

test("buildRows stamps a Probe only when the plan supplies one, and validates its shape", () => {
  const ok = buildRows(plan({ cases: [planCase({ probe: "VC-LOY-004" })] }), VOCAB, noSweeps);
  assert.deepEqual(ok.errors, []);
  assert.match(ok.rows[0].References, /Probe:VC-LOY-004/);

  const bad = buildRows(plan({ cases: [planCase({ probe: "LOY-4" })] }), VOCAB, noSweeps);
  assert.ok(bad.errors.some((e) => e.includes("is not a VC-*-NNN id")));
});

test("buildRows rejects an archetype outside the live vocabulary", () => {
  const { errors } = buildRows(plan({ cases: [planCase({ archetype: "FLAKY" })] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("not in the vc-bug-catalog vocabulary")));
});

test("buildRows rejects a non-defect archetype with the reason, not the generic message", () => {
  const { errors } = buildRows(plan({ cases: [planCase({ archetype: "BY-DESIGN" })] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("never a scenario candidate")));
});

test("buildRows rejects an unknown technique", () => {
  const { errors } = buildRows(plan({ cases: [planCase({ technique: "SMOKE" })] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("not in the §0 vocabulary")));
});

test("buildRows rejects a Test_Data literal — the no-hardcode rule, one step before the CSV", () => {
  const { errors } = buildRows(plan({ cases: [planCase({ data: ["missionId=8f3c-2211"] })] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("has no {{VAR}} or @td()")));
});

test("buildRows accepts both binding forms", () => {
  const { errors } = buildRows(
    plan({ cases: [planCase({ data: ["user={{B2B_USER_EMAIL}}", "missionId=@td(MISSION_A.id)"] })] }),
    VOCAB,
    noSweeps,
  );
  assert.deepEqual(errors, []);
});

test("buildRows rejects a Title+Section duplicate inside the same batch", () => {
  const { errors } = buildRows(plan({ cases: [planCase(), planCase()] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("duplicates an earlier row in this batch")));
});

test("buildRows refuses an empty plan rather than emitting an empty CSV", () => {
  const { errors } = buildRows(plan({ cases: [] }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("nothing to scaffold")));
});

test("buildRows requires a ticket — Critical/High rows must cite a source of demand", () => {
  const { errors } = buildRows(plan({ ticket: "" }), VOCAB, noSweeps);
  assert.ok(errors.some((e) => e.includes("`ticket` is required")));
});

test("the sidecar records the three KEEP answers per row", () => {
  const { sidecar } = buildRows(plan(), VOCAB, noSweeps);
  assert.match(sidecar, /MSNA-024/);
  assert.match(sidecar, /the goal target returned by the blade/);
  assert.match(sidecar, /keep progressing against the old one/);
});

/* ------------------------------------------------------------------ *
 * Sweeps
 * ------------------------------------------------------------------ */

const SWEEP_FIXTURE: SweepRow[] = [
  { key: "1", scenario: "Item disabled -> storefront must not show it", defect: "the filter is missing in one layer" },
  { key: "2", scenario: "Toggle off -> save -> reload -> still off", defect: "the toggle is not persisted" },
];

test("expandSweep turns each source row into a gate-satisfying case", () => {
  const { cases, errors } = expandSweep({ kind: "toggle", surface: "Mission active flag" }, SWEEP_FIXTURE, "admin");
  assert.deepEqual(errors, []);
  assert.equal(cases.length, 2);
  for (const c of cases) assert.deepEqual(checkKeep(c, "sweep"), []);
  assert.match(cases[0].title, /^Mission active flag — /);
});

test("waiving a sweep item needs a reason, and the reason is reported", () => {
  const bad = expandSweep({ kind: "toggle", surface: "S", waive: { "1": "  " } }, SWEEP_FIXTURE, "admin");
  assert.ok(bad.errors.some((e) => e.includes("needs a reason")));

  const ok = expandSweep({ kind: "toggle", surface: "S", waive: { "1": "no storefront surface" } }, SWEEP_FIXTURE, "admin");
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.cases.length, 1);
  assert.deepEqual(ok.waived, ["1 — no storefront surface"]);
});

test("`only` and `waive` naming a key the source does not define is an error, not a silent no-op", () => {
  const r = expandSweep({ kind: "toggle", surface: "S", only: ["9"], waive: { "8": "n/a" } }, SWEEP_FIXTURE, "admin");
  assert.equal(r.errors.length, 2);
  assert.ok(r.errors.every((e) => e.includes("the source does not define")));
});

test("a UIP probe with no archetype mapping is an error — never a wrong default shape", () => {
  const r = expandSweep({ kind: "uip", surface: "Checkout" }, [{ key: "UIP-NEW", scenario: "s", defect: "d" }], "storefront");
  assert.equal(r.cases.length, 0);
  assert.ok(r.errors.some((e) => e.includes("no archetype mapping")));
});

test("an explicit sweep archetype overrides the per-probe map", () => {
  const r = expandSweep(
    { kind: "uip", surface: "Checkout", archetype: "RENDER" },
    [{ key: "UIP-NEW", scenario: "s", defect: "d" }],
    "storefront",
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.cases[0].archetype, "RENDER");
});

/* ------------------------------------------------------------------ *
 * Markdown parsing
 * ------------------------------------------------------------------ */

test("tableRows drops the header and the separator, and splits cells", () => {
  const md = ["| A | B |", "|---|---|", "| one | two |", "| three | four |"].join("\n");
  assert.deepEqual(tableRows(md), [
    ["one", "two"],
    ["three", "four"],
  ]);
});

test("sliceSection stops at the next heading of the same or a higher level", () => {
  const md = "## One\nbody one\n\n### Sub\nsub body\n\n## Two\nbody two\n";
  const s = sliceSection(md, "## One");
  assert.match(s, /body one/);
  assert.match(s, /sub body/); // a deeper heading belongs to the section
  assert.doesNotMatch(s, /body two/);
});

test("parseUip reads the token, the trigger and the pre-written defect", () => {
  const md = [
    "| Probe | Trigger | Refs | Typical defect |",
    "|---|---|---|---|",
    "| `UIP-BACK` | browser Back after a completed submit | §4.1 | duplicate order |",
    "| not-a-probe | x | y | z |",
  ].join("\n");
  const rows = parseUip(md);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    key: "UIP-BACK",
    scenario: "browser Back after a completed submit",
    defect: "duplicate order",
  });
});

test("parseStateStress names the state and says why a default-only audit misses it", () => {
  const md = [
    "| State | Trigger | Audits to re-run |",
    "|---|---|---|",
    "| **Empty** | account with no orders | BL-UI-002, BL-UI-006 |",
  ].join("\n");
  const rows = parseStateStress(md);
  assert.equal(rows[0].key, "Empty");
  assert.match(rows[0].defect, /BL-UI-002/);
  assert.match(rows[0].defect, /default-state-only audit reports the surface as clean/);
});

test("parseHypothesisTable carries the source's own priority", () => {
  const md = ["| Scenario | Bug Hypothesis | Priority |", "|---|---|---|", "| disabled hidden | filter missing | P0 |"].join(
    "\n",
  );
  assert.deepEqual(parseHypothesisTable(md), [
    { key: "1", scenario: "disabled hidden", defect: "filter missing", priority: "P0" },
  ]);
});

test("loadSweep fails closed when the heading is gone", () => {
  assert.throws(() => loadSweep("uip", () => "# something else entirely"), /has no .* section/);
});

test("loadSweep fails closed when the table shape changed to zero parsable rows", () => {
  const md = "## The `UIP-*` sweep\n\nprose only, no table\n";
  assert.throws(() => loadSweep("uip", () => md), /Parsed 0 rows/);
});

/* ------------------------------------------------------------------ *
 * Live sources — the drift guard
 * ------------------------------------------------------------------ */

test("every sweep loads from its real markdown and yields rows", () => {
  for (const kind of SWEEP_KINDS) {
    const rows = loadSweep(kind);
    assert.ok(rows.length > 0, `${kind} yielded no rows from ${SWEEP_SOURCES[kind].file}`);
    for (const r of rows) {
      assert.ok(r.key.trim(), `${kind}: a row has no key`);
      assert.ok(r.scenario.trim(), `${kind}: ${r.key} has no scenario`);
      assert.ok(r.defect.trim(), `${kind}: ${r.key} has no defect hypothesis`);
    }
  }
});

test("every real sweep expands into cases that pass the KEEP gate and the live vocabularies", () => {
  const live = loadDesignVocabulary();
  for (const kind of SWEEP_KINDS) {
    const { cases, errors } = expandSweep({ kind, surface: "Some surface" }, loadSweep(kind), "storefront");
    assert.deepEqual(errors, [], `${kind} expansion reported errors`);
    assert.ok(cases.length > 0, `${kind} expanded to nothing`);
    for (const c of cases) {
      assert.deepEqual(checkKeep(c, `${kind}:${c.link}`), [], `${kind} ${c.link} fails the KEEP gate`);
      assert.ok(live.archetypes.has(c.archetype), `${kind} ${c.link} uses archetype ${c.archetype}, not in the catalog`);
      assert.ok(live.techniques.has(c.technique), `${kind} ${c.link} uses technique ${c.technique}, not in §0`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * ID blocks — the contract with tc:alloc
 * ------------------------------------------------------------------ */

test("parseIdBlock accepts both spellings and computes the count inclusively", () => {
  assert.deepEqual(parseIdBlock("MSNA-024..MSNA-029"), { prefix: "MSNA", start: 24, count: 6 });
  assert.deepEqual(parseIdBlock("MSNA-024..029"), { prefix: "MSNA", start: 24, count: 6 });
});

test("parseIdBlock rejects a reversed or malformed block", () => {
  assert.throws(() => parseIdBlock("MSNA-029..MSNA-024"), /ends before it starts/);
  assert.throws(() => parseIdBlock("24..29"), /is not PREFIX-NNN/);
});
