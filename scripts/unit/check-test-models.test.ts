// Unit tests for scripts/maintenance/check-test-models.ts — the Test Mind Map / Test Data Model gate.
//
// WHY: every check here is a DERIVATION over several documents (graph integrity, closures, ordering,
// stable-id diffs, stamp parsing), so a wrong implementation reports something no author wrote down.
// The schema FILES and the pilot JSON are declarations — they are owned by `npm run models:check`
// itself and are deliberately not re-asserted here (.claude/knowledge/execution/when-to-write-a-test.md).
// The schema is exercised only through `compileSchemas`, to prove the checker APPLIES its conditionals.
//
// Run: npx tsx --test scripts/unit/check-test-models.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  checkModels,
  compileSchemas,
  schemaFindings,
  statusProblem,
  driftRouteProblem,
  seedPlan,
  requiresClosure,
  findCycles,
  parseStamps,
  aliasResolves,
  removedIds,
  changedNodes,
  executorOf,
  type Context,
  type MindMap,
  type DataModel,
  type MapNode,
  type Requirement,
  type CaseStamps,
} from "../maintenance/check-test-models.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const schemas = compileSchemas(
  JSON.parse(readFileSync(`${ROOT}.claude/templates/mind-map.schema.json`, "utf8")),
  JSON.parse(readFileSync(`${ROOT}.claude/templates/test-data-model.schema.json`, "utf8")),
);

const ev = (cls = "BL", ref = "BL-X-001") => [{ class: cls, ref }];

function node(id: string, extra: Partial<MapNode> = {}): MapNode {
  return { id, type: "behavior", name: `node ${id}`, status: "CONFIRMED", evidence: ev(), ...extra };
}
function req(id: string, extra: Partial<Requirement> = {}): Requirement {
  return {
    id,
    entity: "Thing",
    lifecycle: "STATIC",
    acquisition: { strategy: "EXISTING" },
    td_alias: "ALIAS_A.field",
    status: "UNVERIFIED",
    ...extra,
  } as Requirement;
}
function map(nodes: MapNode[], edges: MindMap["edges"] = []): MindMap {
  return { domain_slug: "x", domain_map_rev: 1, nodes, edges };
}
function model(requirements: Requirement[], profiles: DataModel["profiles"] = []): DataModel {
  return { domain_slug: "x", requirements, profiles };
}
function ctx(cases: [string, CaseStamps][] = []): Context {
  return {
    domainMapRevs: new Map([["x", 1]]),
    blIds: new Set(["BL-X-001"]),
    eclIds: new Set(["ECL-1.1"]),
    techniques: new Set(["FLOW", "ST", "BVA"]),
    aliases: { ALIAS_A: { field: 1 }, ALIAS_F: { fields: { email: "email" } } },
    scripts: new Set(["seed:x"]),
    specExport: (ref) => ref === "scripts/x-specs.mjs#KNOWN",
    discoverFns: new Set(["discoverFirstCart"]),
    generators: new Set(["uniqueEmail"]),
    cases: new Map(cases),
  };
}
const run = (m: MindMap, d: DataModel, c = ctx(), baseline?: Map<string, MindMap | DataModel>) =>
  checkModels({ mindMaps: [{ file: "m.json", doc: m }], dataModels: [{ file: "d.json", doc: d }], baseline }, c);
const codes = (r: ReturnType<typeof run>, sev = "error") => r.findings.filter((f) => f.severity === sev).map((f) => f.code);

// ---------------------------------------------------------------- positive / edge

test("a one-node map with a resolvable requirement produces no errors", () => {
  const r = run(map([node("x.only", { type: "feature", requires: ["data.x.a"] })]), model([req("data.x.a")]));
  assert.deepEqual(codes(r), []);
});

test("many branches and a requirement shared by several behaviours stay clean", () => {
  const branches = Array.from({ length: 12 }, (_, i) => node(`x.b.v${i}`, { type: "branch", requires: ["data.x.shared"] } as Partial<MapNode>));
  const edges = branches.map((b) => ({ from: "x.b", to: b.id, type: "branches_to" as const }));
  const r = run(map([node("x.b", { requires: ["data.x.shared"] }), ...branches], edges), model([req("data.x.shared")]));
  assert.deepEqual(codes(r), []);
});

// ---------------------------------------------------------------- graph integrity

test("duplicate node id → TM-002", () => {
  assert.ok(codes(run(map([node("x.a"), node("x.a")]), model([req("data.x.a")]))).includes("TM-002"));
});

test("edge to an unknown node → TM-004; node outside the slug → TM-003", () => {
  const r = run(map([node("x.a"), node("y.b")], [{ from: "x.a", to: "x.missing", type: "contains" }]), model([req("data.x.a")]));
  assert.ok(codes(r).includes("TM-004"));
  assert.ok(codes(r).includes("TM-003"));
});

test("requires an id the data model does not declare → TM-005", () => {
  assert.ok(codes(run(map([node("x.a", { requires: ["data.x.nope"] })]), model([req("data.x.a")]))).includes("TM-005"));
});

test("unpromoted oracle ref → TM-006; unknown technique → TM-013", () => {
  const r = run(map([node("x.a", { oracle_refs: ["BL-X-999"], technique: "ZZ" })]), model([req("data.x.a")]));
  assert.ok(codes(r).includes("TM-006"));
  assert.ok(codes(r).includes("TM-013"));
});

test("depends_on cycle → TM-009, and findCycles names the loop", () => {
  const r = run(
    map([node("x.a"), node("x.b")], [
      { from: "x.a", to: "x.b", type: "depends_on" },
      { from: "x.b", to: "x.a", type: "depends_on" },
    ]),
    model([req("data.x.a")]),
  );
  assert.ok(codes(r).includes("TM-009"));
  assert.deepEqual(findCycles(new Map([["a", ["b"]], ["b", ["a"]]])), [["a", "b", "a"]]);
});

// ---------------------------------------------------------------- state transitions

const states = [
  node("x.s.draft", { type: "state" }),
  node("x.s.live", { type: "state" }),
  node("x.s.gone", { type: "state", terminal: true }),
];

test("a behaviour that moves state needs a transitions_to edge naming it as via", () => {
  const moves = node("x.publish", { state_before: "x.s.draft", state_after: "x.s.live" });
  assert.ok(codes(run(map([...states, moves]), model([req("data.x.a")]))).includes("TM-008"));
  const ok = run(map([...states, moves], [{ from: "x.s.draft", to: "x.s.live", type: "transitions_to", via: "x.publish" }]), model([req("data.x.a")]));
  assert.deepEqual(codes(ok), []);
});

test("a transition leaving a terminal state is impossible → TM-008", () => {
  const revive = node("x.revive");
  const r = run(map([...states, revive], [{ from: "x.s.gone", to: "x.s.live", type: "transitions_to", via: "x.revive" }]), model([req("data.x.a")]));
  assert.ok(r.findings.some((f) => f.code === "TM-008" && /terminal/.test(f.msg)));
});

test("a transition between non-state nodes → TM-008", () => {
  const r = run(map([node("x.a"), node("x.b")], [{ from: "x.a", to: "x.b", type: "transitions_to", via: "x.a" }]), model([req("data.x.a")]));
  assert.ok(codes(r).includes("TM-008"));
});

// ---------------------------------------------------------------- evidence ⇒ status

test("CONFIRMED needs non-HYPOTHESIS evidence; released behaviour needs more than SPEC", () => {
  assert.match(statusProblem("CONFIRMED", ev("HYPOTHESIS", "guess"))!, /UNVERIFIED/);
  assert.match(statusProblem("CONFIRMED", ev("SPEC", "VCST-1"))!, /released/);
  assert.equal(statusProblem("CONFIRMED", ev("SPEC", "VCST-1"), "new"), null);
  assert.equal(statusProblem("UNVERIFIED", []), null);
  assert.ok(codes(run(map([node("x.a", { evidence: ev("HYPOTHESIS", "guess") })]), model([req("data.x.a")]))).includes("TM-007"));
});

test("conflicting evidence is carried as DRIFT, and the schema requires the drift record", () => {
  const drift = { id: "x.a", type: "behavior", name: "a behaviour", status: "DRIFT", evidence: ev() };
  const doc = { schema_version: "1.0", domain_slug: "x", domain_map_rev: 1, generated: "2026-01-01", nodes: [drift], edges: [] };
  assert.ok(schemaFindings(schemas.map, doc, "m", "TM-001").some((f) => /drift/.test(f.msg)));
  const withRecord = { ...doc, nodes: [{ ...drift, drift: { expected: "BL says X", observed: "platform does Y" } }] };
  assert.deepEqual(schemaFindings(schemas.map, withRecord, "m", "TM-001"), []);
});

test("a DRIFT route must reach a trackable owner → TM-018 (warn), and an oracle id is not an owner", () => {
  for (const ok of ["VCST-6097 (vc-frontend)", "/qa-review-oracles BL-SRCH-003", "kb dispute KB-1A", "https://example.test/x", "PO question (VCST-2622 AC)"]) {
    assert.equal(driftRouteProblem(ok), null, ok);
  }
  assert.match(driftRouteProblem(undefined)!, /no route/);
  assert.match(driftRouteProblem("open product defect; BL-LOY-019 violated, see ECL-3.1")!, /no trackable owner/);
  assert.match(driftRouteProblem("draft reports/bugs/open/medium/BUG-x.md (filing deferred)")!, /unfiled draft/);
  const drift = (route?: string) => node("x.a", { status: "DRIFT", drift: { expected: "BL says X", observed: "Y", ...(route ? { route } : {}) } });
  assert.ok(codes(run(map([drift("vc-module-catalog (PR #909)")]), model([req("data.x.a")])), "warn").includes("TM-018"));
  assert.ok(!codes(run(map([drift("VCST-1")]), model([req("data.x.a")])), "warn").includes("TM-018"));
});

// ---------------------------------------------------------------- data model rules

const modelDoc = (r: object) => ({ schema_version: "1.0", domain_slug: "x", generated: "2026-01-01", requirements: [r], profiles: [] });
const base = { id: "data.x.a", entity: "Order", purpose: "an order", required_state: { status: "Paid" }, cleanup: { required: false }, status: "UNVERIFIED" };

test("TRANSITION without from_state/transition fails the schema; with them it passes", () => {
  const bad = { ...base, lifecycle: "STATIC", acquisition: { strategy: "TRANSITION", executor: "case" } };
  assert.ok(schemaFindings(schemas.model, modelDoc(bad), "d", "TM-020").length > 0);
  const good = { ...bad, acquisition: { strategy: "TRANSITION", executor: "case", from_state: { status: "Pending" }, transition: "Pay" } };
  assert.deepEqual(schemaFindings(schemas.model, modelDoc(good), "d", "TM-020"), []);
});

test("DERIVED without a source fails the schema", () => {
  const bad = { ...base, lifecycle: "DERIVED", acquisition: { strategy: "DERIVE", executor: "case" }, discriminates: "its own total is the oracle" };
  assert.ok(schemaFindings(schemas.model, modelDoc(bad), "d", "TM-020").some((f) => /source/.test(f.msg)));
});

test("an invalid acquisition strategy fails the schema", () => {
  const bad = { ...base, lifecycle: "STATIC", acquisition: { strategy: "TELEPORT" } };
  assert.ok(schemaFindings(schemas.model, modelDoc(bad), "d", "TM-020").length > 0);
});

test("a seeder-executed CREATE must name its seed_capability; a case-executed one need not", () => {
  const seedless = { ...base, lifecycle: "STATIC", acquisition: { strategy: "CREATE" } };
  assert.ok(schemaFindings(schemas.model, modelDoc(seedless), "d", "TM-020").some((f) => /seed_capability/.test(f.msg)));
  const byCase = { ...base, lifecycle: "STATIC", acquisition: { strategy: "CREATE", executor: "case" } };
  assert.deepEqual(schemaFindings(schemas.model, modelDoc(byCase), "d", "TM-020"), []);
});

test("unresolved td_alias / seed_capability / discover_fn → TM-023 / TM-024 / TM-025", () => {
  const r = run(
    map([node("x.a", { requires: ["data.x.a", "data.x.b", "data.x.c"] })]),
    model([
      req("data.x.a", { td_alias: "NOPE.field" }),
      req("data.x.b", { acquisition: { strategy: "CREATE" }, seed_capability: "scripts/x-specs.mjs#MISSING", td_alias: undefined }),
      req("data.x.c", { acquisition: { strategy: "DISCOVER", discover_fn: "discoverUnicorn" }, td_alias: undefined }),
    ]),
  );
  for (const c of ["TM-023", "TM-024", "TM-025"]) assert.ok(codes(r).includes(c), c);
});

test("aliasResolves reads both the inline and the `fields` alias shapes", () => {
  const a = ctx().aliases!;
  assert.equal(aliasResolves(a, "ALIAS_A.field"), true);
  assert.equal(aliasResolves(a, "ALIAS_F.email"), true);
  assert.equal(aliasResolves(a, "ALIAS_F.password"), false);
  assert.equal(aliasResolves(a, "NOPE.x"), false);
});

test("source.produced_by must be a node that lists the requirement in produces → TM-026", () => {
  const derived = req("data.x.out", { lifecycle: "DERIVED", acquisition: { strategy: "DERIVE", executor: "case" }, source: { produced_by: "x.a" }, td_alias: undefined });
  const r = run(map([node("x.a")]), model([derived]));
  assert.ok(codes(r).includes("TM-026"));
});

test("a requirement some behaviour produces but that is not DERIVED → TM-031 warning", () => {
  const r = run(map([node("x.a", { produces: ["data.x.a"] })]), model([req("data.x.a")]));
  assert.ok(r.findings.some((f) => f.code === "TM-031" && f.severity === "warn"));
});

test("a requirement dependency cycle → TM-027, and seedPlan still terminates", () => {
  const a = req("data.x.a", { relationships: [{ requirement: "data.x.b", required: true }] });
  const b = req("data.x.b", { relationships: [{ requirement: "data.x.a", required: true }] });
  const r = run(map([node("x.n", { requires: ["data.x.a"] })]), model([a, b]));
  assert.ok(codes(r).includes("TM-027"));
  const plan = seedPlan({ id: "profile.x.p", behavior: "x.n", requirements: ["data.x.a"] }, new Map(), [], new Map([["data.x.a", a], ["data.x.b", b]]));
  assert.equal(plan.order.length, 2);
});

// ---------------------------------------------------------------- produced → required, closures, profiles

const producer = node("x.grant", { requires: ["data.x.account"], produces: ["data.x.reward"] });
const consumer = node("x.spend", { requires: ["data.x.reward"] });
const account = req("data.x.account");
const reward = req("data.x.reward", { lifecycle: "DERIVED", acquisition: { strategy: "DERIVE", executor: "case" }, source: { produced_by: "x.grant" }, td_alias: undefined });
const nodes = new Map([producer, consumer].map((n) => [n.id, n]));
const reqs = new Map([account, reward].map((r) => [r.id, r]));

test("one behaviour producing data another requires: the plan seeds the producer's needs first", () => {
  const plan = seedPlan({ id: "profile.x.spend", behavior: "x.spend", requirements: ["data.x.reward"] }, nodes, [], reqs);
  assert.deepEqual(plan.order.map((r) => r.id), ["data.x.account", "data.x.reward"]);
  assert.deepEqual([...requiresClosure("x.spend", nodes, [], reqs)].sort(), ["data.x.account", "data.x.reward"]);
});

test("a branch inherits its behaviour's requirements through branches_to", () => {
  const parent = node("x.p", { requires: ["data.x.account"] });
  const branch = node("x.p.neg", { type: "branch" });
  const closure = requiresClosure("x.p.neg", new Map([parent, branch].map((n) => [n.id, n])), [{ from: "x.p", to: "x.p.neg", type: "branches_to" }], reqs);
  assert.deepEqual([...closure], ["data.x.account"]);
});

test("a profile missing a direct requirement is an error; one outside the closure is a warning", () => {
  const m = map([producer, consumer]);
  const d = model([account, reward, req("data.x.extra")], [
    { id: "profile.x.short", behavior: "x.spend", requirements: ["data.x.account"] },
    { id: "profile.x.fat", behavior: "x.spend", requirements: ["data.x.reward", "data.x.extra"] },
  ]);
  const r = run(m, d);
  assert.ok(r.findings.some((f) => f.code === "TM-028" && f.severity === "error" && f.id === "profile.x.short"));
  assert.ok(r.findings.some((f) => f.code === "TM-028" && f.severity === "warn" && f.id === "profile.x.fat"));
});

test("executorOf: resolver-backed strategies never claim a seeder", () => {
  assert.equal(executorOf(req("data.x.a")), "resolve");
  assert.equal(executorOf(req("data.x.a", { acquisition: { strategy: "CREATE" } })), "seed");
  assert.equal(executorOf(req("data.x.a", { acquisition: { strategy: "TRANSITION", executor: "case" } })), "case");
});

// ---------------------------------------------------------------- stamps, stable ids, staleness

test("parseStamps reads Behavior: and DataProfile: stamps and ignores prose", () => {
  const s = parseStamps("VCST-1 | Radio Behavior: Applying B | Behavior:x.a.b | DataProfile:profile.x.p | Behavior: x.c.d");
  assert.deepEqual(s, { behaviors: ["x.a.b", "x.c.d"], profiles: ["profile.x.p"] });
});

test("a stamp naming an unknown node or profile is an error; an OBSOLETE node only warns", () => {
  const obsolete = node("x.old", { status: "OBSOLETE", obsolete: { date: "2026-01-01", reason: "feature removed" } } as Partial<MapNode>);
  const c = ctx([
    ["C-1", { suite: "s.csv", behaviors: ["x.ghost"], profiles: ["profile.x.ghost"] }],
    ["C-2", { suite: "s.csv", behaviors: ["x.old"], profiles: [] }],
  ]);
  const r = run(map([obsolete]), model([req("data.x.a")]), c);
  assert.ok(r.findings.some((f) => f.code === "TM-015" && f.severity === "error" && f.id === "C-1"));
  assert.ok(r.findings.some((f) => f.code === "TM-016" && f.id === "C-1"));
  assert.ok(r.findings.some((f) => f.code === "TM-015" && f.severity === "warn" && f.id === "C-2"));
  assert.deepEqual(r.coverage["x.old"], ["C-2"]);
});

test("removing a stable id vs the baseline → TM-030; marking it OBSOLETE instead passes", () => {
  const prev = map([node("x.a"), node("x.b")]);
  assert.deepEqual(removedIds(["x.a", "x.b"], ["x.a"]), ["x.b"]);
  const dropped = run(map([node("x.a")]), model([req("data.x.a")]), ctx(), new Map([["m.json", prev]]));
  assert.ok(codes(dropped).includes("TM-030"));
  const kept = run(
    map([node("x.a"), node("x.b", { status: "OBSOLETE", obsolete: { date: "2026-01-01", reason: "gone" } } as Partial<MapNode>)]),
    model([req("data.x.a")]),
    ctx(),
    new Map([["m.json", prev]]),
  );
  assert.ok(!codes(kept).includes("TM-030"));
});

test("a changed behaviour with a stable id makes its linked cases suspect; last_verified alone does not", () => {
  const prev = map([node("x.a", { name: "old wording" })]);
  const next = map([node("x.a", { name: "new wording" })]);
  assert.deepEqual(changedNodes(prev, next), ["x.a"]);
  assert.deepEqual(changedNodes(prev, map([node("x.a", { name: "old wording", last_verified: "2026-09-01" })])), []);
  const c = ctx([["C-1", { suite: "s.csv", behaviors: ["x.a"], profiles: [] }]]);
  const r = run(next, model([req("data.x.a")]), c, new Map([["m.json", prev]]));
  assert.deepEqual(r.suspects, [{ caseId: "C-1", node: "x.a", why: "node changed since baseline" }]);
});

test("partial information: an UNVERIFIED node with no evidence is legal and reported as a coverage gap only", () => {
  const r = run(map([node("x.a", { status: "UNVERIFIED", evidence: [] })]), model([req("data.x.a")]));
  assert.deepEqual(codes(r), []);
  assert.ok(r.findings.some((f) => f.code === "TM-014" && f.severity === "info"));
});
