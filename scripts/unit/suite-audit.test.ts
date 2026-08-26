// Tests for the deterministic half of Dimension 11 (behavioral triangulation):
// the `Audited:` stamp parser + staleness window (lint-test-cases.ts), the
// suite→module→repo source-axis resolver (suite-source-map.ts), and the audit
// rotation ordering (audit-queue.ts).
//
// The load-bearing assertions here are the ones that guard against silent
// wrongness rather than crashes:
//   - suiteMatchesToken must expand the map's THREE token forms correctly, or a
//     suite resolves to the wrong module and the source axis anchors unrelated code
//   - reposForModule must NEVER invent a repo name (an earlier revision produced
//     `vc-module-b2b-features` / `vc-module-platform-core`, neither of which exists)
//   - buildQueue must key by FILE, because manifest id `092` is carried by two suites
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAuditStamp, auditStaleness, DEFAULT_STALE_DAYS } from "../test-cases/lint-test-cases.js";
import {
  parseModuleMap, suiteMatchesToken, reposForModule, resolveSuiteSource, stripForeignParentMenu,
} from "../test-cases/suite-source-map.js";
import { buildQueue } from "../test-cases/audit-queue.js";
import { COLUMNS, type Row } from "../test-cases/append-test-cases-to-suite.js";

const NOW = new Date("2026-07-31T00:00:00Z");

function row(overrides: Partial<Row> = {}): Row {
  const base = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as unknown as Row;
  return { ...base, ID: "TC-001", Assertions: "[DOM] something {OBSERVED}", ...overrides };
}

// --- parseAuditStamp ------------------------------------------------------

test("parseAuditStamp reads the stamp out of a References cell", () => {
  assert.equal(
    parseAuditStamp("VCST-5281; Audited: 2026-07-30 (TCA-2026-07-30); Source: vc-frontend/a.vue:12"),
    "2026-07-30",
  );
});

test("parseAuditStamp returns null when never audited", () => {
  assert.equal(parseAuditStamp("VCST-5281; Synced: VCST-5281 (2026-07-29)"), null);
  assert.equal(parseAuditStamp(""), null);
  assert.equal(parseAuditStamp(undefined as unknown as string), null);
});

test("parseAuditStamp does not confuse the sibling Synced:/Corrected: stamps", () => {
  // References already carries these in the same shape; picking one up as an
  // audit date would mark a never-triangulated row as fresh — a silent skip.
  assert.equal(parseAuditStamp("Synced: VCST-5177 (2026-06-26); Corrected: oracle (2026-06-26)"), null);
});

test("parseAuditStamp takes the LATEST stamp when a bad merge left two", () => {
  assert.equal(
    parseAuditStamp("Audited: 2026-01-05 (TCA-2026-01-05); Audited: 2026-06-20 (TCA-2026-06-20)"),
    "2026-06-20",
  );
});

// --- auditStaleness -------------------------------------------------------

test("auditStaleness classifies unstamped / stale / fresh and finds the oldest", () => {
  const rows = [
    row({ ID: "A-001", References: "VCST-1" }),                                  // unstamped
    row({ ID: "A-002", References: "Audited: 2025-01-01 (TCA-2025-01-01)" }),     // stale
    row({ ID: "A-003", References: "Audited: 2026-07-20 (TCA-2026-07-20)" }),     // fresh
  ];
  const st = auditStaleness(rows, NOW, 180);
  assert.equal(st.unstamped, 1);
  assert.equal(st.stale, 1);
  assert.equal(st.fresh, 1);
  assert.equal(st.oldestStamp, "2025-01-01");
});

test("auditStaleness treats the window boundary as not-yet-stale", () => {
  // Exactly `staleDays` old is still inside the window; only `> staleDays` is stale.
  const rows = [row({ References: "Audited: 2026-07-30 (TCA-2026-07-30)" })];
  assert.equal(auditStaleness(rows, NOW, 1).stale, 0);
  assert.equal(auditStaleness(rows, NOW, 0).stale, 1);
});

test("auditStaleness ignores a malformed stamp date rather than crashing", () => {
  const st = auditStaleness([row({ References: "Audited: 2026-13-45" })], NOW, 180);
  // Not a real date → not counted as a stamp at all.
  assert.equal(st.unstamped, 1);
  assert.equal(st.oldestStamp, null);
});

test("DEFAULT_STALE_DAYS is a sane positive window", () => {
  assert.ok(DEFAULT_STALE_DAYS > 0 && DEFAULT_STALE_DAYS <= 365);
});

// --- suiteMatchesToken ----------------------------------------------------

test("suiteMatchesToken: exact id", () => {
  assert.ok(suiteMatchesToken("050m", "050m"));
  assert.ok(!suiteMatchesToken("050m", "050n"));
});

test("suiteMatchesToken: bare 3-digit token is a FAMILY prefix", () => {
  // The map lists the whole GraphQL family as one token `050`, and `048` must
  // pick up `048c`. Without family expansion 16 GraphQL suites resolve to nothing.
  assert.ok(suiteMatchesToken("050a", "050"));
  assert.ok(suiteMatchesToken("050b3", "050"));
  assert.ok(suiteMatchesToken("048c", "048"));
  assert.ok(!suiteMatchesToken("051", "050"));
});

test("suiteMatchesToken: numeric range covers lettered members but not neighbours", () => {
  assert.ok(suiteMatchesToken("042", "042-048"));
  assert.ok(suiteMatchesToken("048c", "042-048"), "048c shares the 048 prefix, so it is in range");
  assert.ok(!suiteMatchesToken("049", "042-048"));
  // `006-010` must NOT swallow `011b` — the bug a naive string range would have.
  assert.ok(suiteMatchesToken("010", "006-010"));
  assert.ok(!suiteMatchesToken("011b", "006-010"));
});

// --- parseModuleMap -------------------------------------------------------

const MAP_FIXTURE = `
## Module Map

| Module | Frontend Suites | Backend Suites | Admin UI Sections | REST API Path | xAPI Module |
|--------|----------------|----------------|-------------------|---------------|-------------|
| **Catalog** | 001, 002, 003 | 051, 053 | Catalog → Products | \`/api/catalog/\` | xCatalog |
| **Cart** | 028, 029, 030 | — | — (storefront-only) | — | xCart |
| **Cross-cutting** | 042-048 | — | — | — | — |

## Selection Groups (module-based)

| Group | Suites |
|-------|--------|
| **catalog** | 001 |
`;

test("parseModuleMap reads the Module Map table and stops at the next heading", () => {
  const rows = parseModuleMap(MAP_FIXTURE);
  assert.deepEqual(rows.map((r) => r.module), ["Catalog", "Cart", "Cross-cutting"]);
  // "**catalog**" from the Selection Groups table must NOT leak in.
  assert.ok(!rows.some((r) => r.module === "catalog"));
});

test("parseModuleMap merges the Frontend + Backend suite columns and drops em-dashes", () => {
  const [catalog, cart] = parseModuleMap(MAP_FIXTURE);
  assert.deepEqual(catalog.suiteTokens, ["001", "002", "003", "051", "053"]);
  assert.deepEqual(cart.suiteTokens, ["028", "029", "030"]);
  assert.equal(cart.xapiModule, "xCart");
});

test("parseModuleMap returns [] for text with no Module Map", () => {
  assert.deepEqual(parseModuleMap("# Nothing here\n\nsome prose"), []);
});

// --- reposForModule -------------------------------------------------------

const ROUTING = [
  { name: "vc-module-catalog", match: "\\bcatalog\\b" },
  { name: "vc-module-x-cart", match: "\\bxcart\\b" },
];

test("reposForModule returns router matches", () => {
  const [catalog] = parseModuleMap(MAP_FIXTURE);
  assert.deepEqual(reposForModule(catalog, ROUTING), ["vc-module-catalog"]);
});

test("reposForModule returns EMPTY rather than inventing a repo name", () => {
  // The regression this guards: a slug fallback produced `vc-module-b2b-features`
  // and `vc-module-platform-core`, neither of which exists. A wrong repo still
  // yields a confident file:line anchor => a FALSE CONFIRMED, which is strictly
  // worse than no anchor (triangulation-criteria.md §2).
  const row2 = { module: "B2B Features", suiteTokens: [], adminSections: "", restPath: "", xapiModule: "" };
  assert.deepEqual(reposForModule(row2, ROUTING), []);
});

test("reposForModule lets the module NAME outrank a neighbour named in the context cells", () => {
  // The regression this guards: the Sales Rep row's Admin UI cell ends
  // "…; store setting `SalesRep.Enabled`", which matched vc-module-store's
  // `\bstore (setting|management|rounding)\b` rule — so all seven sales-rep suites
  // (050m, 089-091, 092, 092b, 093) resolved to the STORE module. A confident wrong
  // repo yields a plausible file:line for unrelated code => a FALSE CONFIRMED,
  // which triangulation-criteria.md §2 rates worse than no anchor at all.
  const routing = [
    { name: "vc-module-sales-rep", match: "\\bsales ?reps?\\b|\\bsalesrep\\b" },
    { name: "vc-module-store", match: "\\bstore (setting|management|rounding)\\b" },
  ];
  const salesRep = {
    module: "Sales Rep",
    suiteTokens: ["050m"],
    adminSections: "Embedded App (`vc-sales-rep`) → Sales Reps; store setting `SalesRep.Enabled`",
    restPath: "—",
    xapiModule: "salesRep (scoped `/graphql/sales-rep`)",
  };
  assert.deepEqual(reposForModule(salesRep, routing), ["vc-module-sales-rep"]);
});

test("reposForModule still falls back to the context cells when the name routes to nothing", () => {
  // Name precedence must not cost resolution: the Cart row's name matches no rule,
  // so its "— (storefront-only)" cell is what supplies vc-frontend.
  const [, cart] = parseModuleMap(MAP_FIXTURE);
  assert.deepEqual(reposForModule(cart, [{ name: "vc-frontend", match: "\\bstorefront\\b" }]), ["vc-frontend"]);
});

// --- stripForeignParentMenu ----------------------------------------------
//
// The Admin UI cell is written `Parent → Child, Child`, where Parent is where the blade
// LIVES in the menu — frequently another module. Dropping a FOREIGN parent is what stops
// `Payment` resolving to the Orders module; keeping a parent that is NOT another module
// is what stops Authentication losing vc-platform. The stop-list is derived from the
// map's own module names, so a rename in the table changes this with no code edit.

const NAMES = ["Catalog", "Orders", "Marketing", "Store", "Payment", "SEO", "Returns", "Channels"];

test("stripForeignParentMenu drops a parent segment that names ANOTHER module", () => {
  const row = { module: "Payment", suiteTokens: [], adminSections: "Orders → Payments", restPath: "`/api/payments/`", xapiModule: "—" };
  assert.equal(stripForeignParentMenu(row, NAMES).trim(), "Payments");
});

test("stripForeignParentMenu KEEPS a parent that is the row's own name, singular or plural", () => {
  // "Stores → Configuration, Rounding" — the parent is this module's own menu, so the
  // token stays. Plural/singular is normalized, not synonym-tabled.
  const row = { module: "Store", suiteTokens: [], adminSections: "Stores → Configuration, Rounding", restPath: "`/api/stores/`", xapiModule: "—" };
  assert.equal(stripForeignParentMenu(row, NAMES), "Stores → Configuration, Rounding");
});

test("stripForeignParentMenu KEEPS a parent that is not a module at all", () => {
  // "Settings → Security, OAuth" is the ONLY thing anchoring Authentication to
  // vc-platform. Stripping every parent unconditionally would silently lose it.
  const row = { module: "Authentication", suiteTokens: [], adminSections: "Settings → Security, OAuth", restPath: "`/connect/token`", xapiModule: "—" };
  assert.equal(stripForeignParentMenu(row, NAMES), "Settings → Security, OAuth");
});

test("stripForeignParentMenu leaves a cell with no arrow alone", () => {
  const row = { module: "Cart", suiteTokens: [], adminSections: "— (storefront-only)", restPath: "—", xapiModule: "xCart" };
  assert.equal(stripForeignParentMenu(row, NAMES), "— (storefront-only)");
});

// --- the eight rows fixed alongside Sales Rep -----------------------------
//
// One test per row, against the REAL routing rules and the REAL map, because the defect
// lives in the INTERACTION between the two: a future edit to either side could quietly
// reintroduce a confident-wrong anchor, and a fixture-only test would not notice.
// Every repo asserted here was confirmed to exist under org:VirtoCommerce.

function realRow(moduleName: string) {
  const mapText = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".claude", "knowledge", "execution", "module-suite-map.md"),
    "utf-8",
  );
  const rows = parseModuleMap(mapText);
  const row = rows.find((r) => r.module === moduleName);
  assert.ok(row, `module-suite-map.md has no "${moduleName}" row`);
  return { row: row!, names: rows.map((r) => r.module) };
}

const REAL_ROUTING: Array<{ name: string; match: string }> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ci", "config", "fix-repos.json"), "utf-8"),
).routing;

function realRepos(moduleName: string): string[] {
  const { row, names } = realRow(moduleName);
  return reposForModule(row, REAL_ROUTING, names);
}

test("Payment resolves to vc-module-payment, NOT the Orders module", () => {
  // "Orders → Payments" made all five payment suites (039, 040a-c, 041) anchor on
  // vc-module-order.
  assert.deepEqual(realRepos("Payment"), ["vc-module-payment"]);
});

test("Orders is NOT contaminated in reverse by its own 'Payment Requests' sub-blade", () => {
  // The mirror image, and the reason the API tier is consulted BEFORE the admin cell:
  // "Orders → All Orders, Payment Requests" would otherwise add vc-module-payment to
  // suites 014/017/018/019.
  assert.deepEqual(realRepos("Orders"), ["vc-module-order"]);
});

test("SEO resolves to vc-module-seo, NOT the Marketing module", () => {
  // "Marketing → SEO, Redirects" made suite 066 anchor on vc-module-marketing.
  assert.deepEqual(realRepos("SEO"), ["vc-module-seo"]);
});

test("Returns resolves to vc-module-return (singular repo), NOT the Orders module", () => {
  // "Orders → Returns, RMA" made suite 073 anchor on vc-module-order. The repo is
  // `vc-module-return` — singular; guessing the plural would be the same defect again.
  assert.deepEqual(realRepos("Returns"), ["vc-module-return"]);
});

test("Store resolves to vc-module-store — its own rule used to miss its own row", () => {
  // The irony that exposed the class: `\bstore (setting|management|rounding)\b` never
  // matched "Stores → Configuration, Rounding", so suites 034/035 got NOTHING while
  // the rule fired on Sales Rep instead.
  assert.deepEqual(realRepos("Store"), ["vc-module-store"]);
});

test("xMarketing resolves to the x-marketing repo only, not also plain vc-module-marketing", () => {
  assert.deepEqual(realRepos("xMarketing"), ["vc-module-marketing-experience-api"]);
});

test("Channels resolves to NOTHING — vc-module-channels does not exist", () => {
  // "Catalog → Publishing, Data Quality" made suite 076 anchor on vc-module-catalog.
  // There is no `vc-module-channels` under org:VirtoCommerce (404, and zero search
  // hits), so the ONLY correct answer is an empty list => the caller scores the source
  // axis ABSENT/UNGROUNDED. Pointing it at the nearest plausible neighbour
  // (vc-module-catalog, or vc-module-catalog-publishing) is exactly the banned guess.
  // NOTE: .claude/agents/ba-system-analyzer.md still documents `vc-module-channels`.
  assert.deepEqual(realRepos("Channels"), []);
});

test("Sales Rep still resolves to vc-module-sales-rep under the real rules", () => {
  assert.deepEqual(realRepos("Sales Rep"), ["vc-module-sales-rep"]);
});

test("reposForModule survives a malformed routing regex", () => {
  const [catalog] = parseModuleMap(MAP_FIXTURE);
  const bad = [{ name: "vc-module-oops", match: "([unclosed" }, ...ROUTING];
  assert.deepEqual(reposForModule(catalog, bad), ["vc-module-catalog"]);
});

// --- resolveSuiteSource ---------------------------------------------------

test("resolveSuiteSource resolves via the map when the manifest is silent", () => {
  const s = resolveSuiteSource("002", [], { mapText: MAP_FIXTURE, routing: ROUTING });
  assert.equal(s.via, "module-suite-map");
  assert.deepEqual(s.modules, ["Catalog"]);
  assert.deepEqual(s.repos, ["vc-module-catalog"]);
  assert.deepEqual(s.restPaths, ["/api/catalog/"]);
});

test("resolveSuiteSource prefers an explicit manifest declaration", () => {
  const s = resolveSuiteSource("002", ["orders"], { mapText: MAP_FIXTURE, routing: ROUTING });
  assert.equal(s.via, "manifest");
  assert.deepEqual(s.modules, ["orders"]);
  // No slug->repo synthesis: `["platform"]` would wrongly give `vc-module-platform`.
  assert.ok(!s.repos.includes("vc-module-orders"));
});

test("resolveSuiteSource reports unresolved instead of guessing", () => {
  const s = resolveSuiteSource("999", [], { mapText: MAP_FIXTURE, routing: ROUTING });
  assert.equal(s.via, "unresolved");
  assert.deepEqual(s.modules, []);
  assert.deepEqual(s.repos, []);
});

test("resolveSuiteSource expands a range token to a lettered suite", () => {
  const s = resolveSuiteSource("048c", [], { mapText: MAP_FIXTURE, routing: ROUTING });
  assert.deepEqual(s.modules, ["Cross-cutting"]);
});

// --- buildQueue ordering --------------------------------------------------

const manifestSuite = (o: Partial<{ id: string; name: string; file: string; priority: string; testCount: number; tags: string[]; agent: string; estimatedMinutes: number }> = {}) => ({
  id: "001", name: "S", file: "does/not/exist.csv", domain: "d",
  priority: "P1", testCount: 10, estimatedMinutes: 10, agent: "qa-frontend-expert",
  tags: [] as string[], ...o,
});

test("buildQueue keys by FILE so a duplicate manifest id is not collapsed", () => {
  // Real defect this guards: manifest id `092` is carried by two different suites.
  // Keying by id would schedule one and silently never audit the other.
  const { queue, duplicateIds } = buildQueue([
    manifestSuite({ id: "092", file: "a/092-one.csv" }),
    manifestSuite({ id: "092", file: "a/092-two.csv" }),
  ], NOW);
  assert.equal(queue.length, 2);
  assert.deepEqual(duplicateIds, ["092"]);
});

test("buildQueue puts P0 and revenue-critical ahead of P1", () => {
  const { queue } = buildQueue([
    manifestSuite({ id: "p1", file: "a/p1.csv", priority: "P1" }),
    manifestSuite({ id: "p0", file: "a/p0.csv", priority: "P0" }),
    manifestSuite({ id: "rev", file: "a/rev.csv", priority: "P1", tags: ["revenue-critical"] }),
  ], NOW);
  // p0 and rev are both tier 0; p1 is tier 1 and must come last.
  assert.equal(queue[2].id, "p1");
  assert.deepEqual(queue.slice(0, 2).map((q) => q.id).sort(), ["p0", "rev"]);
});

test("buildQueue deprioritises an unresolvable source axis within its tier", () => {
  // Both tier 0 and both never audited; the one whose SOURCE axis resolves must
  // lead, because an unresolvable suite can only produce UNGROUNDED — leading the
  // rotation with it would spend run #1 applying nothing.
  const { queue } = buildQueue([
    manifestSuite({ id: "999", file: "a/999.csv", priority: "P0", testCount: 99 }),
    manifestSuite({ id: "002", file: "a/002.csv", priority: "P0", testCount: 1 }),
  ], NOW);
  assert.equal(queue[0].id, "002", "resolvable source axis leads despite the lower testCount");
  assert.equal(queue[1].source.via, "unresolved");
});

test("buildQueue flags a long suite for chunking and a missing CSV", () => {
  const { queue } = buildQueue([
    manifestSuite({ id: "050m", file: "a/050m.csv", estimatedMinutes: 245 }),
  ], NOW);
  assert.ok(queue[0].caveats.some((c) => /chunk/i.test(c)));
  assert.ok(queue[0].caveats.some((c) => /CSV not found/i.test(c)));
});

test("buildQueue flags a runner-native suite as having no live axis", () => {
  const { queue } = buildQueue([
    manifestSuite({ id: "048c", file: "a/048c.csv", agent: "none" }),
  ], NOW);
  assert.ok(queue[0].caveats.some((c) => /LIVE axis structurally unavailable/i.test(c)));
});

test("buildQueue reports an unreadable suite's full testCount as due, not zero", () => {
  // Reporting 0 due would bury a suite that has certainly never been audited.
  const { queue } = buildQueue([manifestSuite({ testCount: 42 })], NOW);
  assert.equal(queue[0].dueCases, 42);
});
