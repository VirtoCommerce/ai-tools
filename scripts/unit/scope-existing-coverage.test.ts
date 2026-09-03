// Unit tests for scripts/test-cases/scope-existing-coverage.ts — the deterministic core
// behind `npm run tc:scope`, which answers "which EXISTING rows does this change put at
// risk, and will any of them actually run?".
//
// What this protects. `/qa-test` could only reach a stale case by having it FAIL at Step 4,
// and three things measured on VCST-5733 (2026-09-02) stop that failure happening:
// `regression:select` misses the sales-rep suites entirely for a `company/customer-orders`
// path (no path segment is the token `sales-rep`) while reporting `unmappedPaths: []`;
// `--cases critical` then drops the High rows where the label assertions live; and a row
// that never runs is never triaged. The corpus held 62 assertions on the pre-rename widget
// label. So the tests below pin the three properties that make the tool able to see that:
//
//   1. scope comes from the manifest VOCABULARY, and a path token can only ADD (never filter)
//   2. exact-token scope matching, so `order` cannot capture the corpus
//   3. `runFate` — a stale row that will not run is the invisible class, and it is reported
//
// The delegation tests matter as much as the logic: the priority tier decision goes through
// `filterRows` and the audit stamp through `parseAuditStamp`, because a second copy of either
// would drift and silently change what the report predicts about the run.
//
// Run: `npx tsx --test scripts/unit/scope-existing-coverage.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyRunFate,
  matchObservables,
  matchOracles,
  parseArgs,
  pathTokensForPaths,
  resolveScopeSuites,
  scanExistingCoverage,
  SEARCHED_COLUMNS,
  type ScopeSuite,
} from "../test-cases/scope-existing-coverage.js";
import { COLUMNS, type Row } from "../test-cases/append-test-cases-to-suite.js";

const SUITES: ScopeSuite[] = [
  {
    id: "091",
    name: "Sales Rep — Customer Profile",
    file: "s/091.csv",
    domain: "sales-rep",
    layer: "frontend",
    tags: ["sales-rep", "storefront", "b2b"],
    requiresModules: ["sales-rep"],
  },
  {
    id: "093",
    name: "Sales Rep — Hub Dashboard",
    file: "s/093.csv",
    domain: "sales-rep",
    layer: "frontend",
    tags: ["sales-rep", "hub-dashboard"],
    requiresModules: ["sales-rep"],
  },
  {
    id: "014",
    name: "Orders (storefront)",
    file: "s/014.csv",
    domain: "orders",
    layer: "frontend",
    tags: ["orders", "storefront"],
  },
  {
    id: "042",
    name: "Smoke",
    file: "s/042.csv",
    domain: "smoke",
    layer: "frontend",
    tags: ["smoke"],
  },
];

function row(over: Partial<Row> = {}): Row {
  const base = Object.fromEntries(COLUMNS.map((c) => [c, ""])) as Row;
  return { ...base, ID: "X-001", Title: "t", Priority: "High", Automation_Status: "Automated", ...over };
}

function csv(rows: Row[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [
    COLUMNS.join(","),
    ...rows.map((r) => COLUMNS.map((c) => esc(r[c] ?? "")).join(",")),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------------------------

test("scope comes from domain and tags, which every suite carries", () => {
  const got = resolveScopeSuites(SUITES, { domains: ["sales-rep"] });
  assert.deepEqual(got.map((s) => s.id), ["091", "093"]);
  // Both signals are recorded, because the report has to say WHY a suite is in scope.
  assert.ok(got[0].reasons.some((r) => r.kind === "domain"));
  assert.ok(got[0].reasons.some((r) => r.kind === "tag"));
});

test("a path token ADDS a suite and can never filter one out", () => {
  // This is the asymmetry `selectSuites` applies to its incomplete repo index. Here it is what
  // stops a path-driven signal — the one that demonstrably missed 089/091/093 — from narrowing a
  // vocabulary hit it disagrees with.
  const withToken = resolveScopeSuites(SUITES, { domains: ["sales-rep"], pathTokens: ["orders"] });
  assert.deepEqual(withToken.map((s) => s.id), ["014", "091", "093"]);
  assert.ok(withToken.find((s) => s.id === "014")!.reasons.some((r) => r.kind === "path"));

  // A path token that matches nothing leaves the vocabulary result exactly as it was.
  const noise = resolveScopeSuites(SUITES, { domains: ["sales-rep"], pathTokens: ["useorderview"] });
  assert.deepEqual(noise.map((s) => s.id), ["091", "093"]);
});

test("scope matching is exact, so a short term cannot capture the corpus", () => {
  // `order` must not select the `orders` suite: a prefix/substring rule here is how a triage
  // worklist becomes the whole tree, which is the same reason `pathTokens` matches exactly.
  assert.deepEqual(resolveScopeSuites(SUITES, { domains: ["order"] }).map((s) => s.id), []);
  assert.deepEqual(resolveScopeSuites(SUITES, { domains: ["orders"] }).map((s) => s.id), ["014"]);
});

test("--suite names a suite the vocabulary would not have reached", () => {
  const got = resolveScopeSuites(SUITES, { suiteIds: ["042"] });
  assert.deepEqual(got.map((s) => s.id), ["042"]);
  assert.equal(got[0].reasons[0].kind, "named");
});

test("a module hit scopes a suite whose domain does not match", () => {
  const suites: ScopeSuite[] = [
    { id: "075d", name: "Loyalty missions", file: "s/075d.csv", domain: "loyalty", requiresModules: ["loyalty"] },
  ];
  assert.deepEqual(resolveScopeSuites(suites, { modules: ["loyalty"] }).map((s) => s.id), ["075d"]);
});

// ---------------------------------------------------------------------------------------------
// Row matching
// ---------------------------------------------------------------------------------------------

test("observable matching is case-insensitive across the spellings the corpus really uses", () => {
  // 091 and 093 carry `Recent orders`, `Recent Orders` and `"Recent orders` — all the same
  // assertion. An exact-case rule would have found a third of the 62 at-risk rows.
  for (const spelling of ["Recent orders", "Recent Orders", "recent orders"]) {
    const hits = matchObservables(row({ Assertions: `Widget header reads "${spelling}"` }), [
      "recent orders",
    ]);
    assert.equal(hits.length, 1, spelling);
    assert.equal(hits[0].column, "Assertions");
  }
});

test("only assertion-bearing columns are searched — a metadata stamp is not an assertion", () => {
  // A term hitting `References` (Archetype/Technique/Promoted stamps) or `Cleanup` says nothing
  // about what the row asserts, so it must not manufacture a triage line.
  assert.equal(matchObservables(row({ References: "Archetype:STALE · recent orders" }), ["recent orders"]).length, 0);
  assert.equal(matchObservables(row({ Cleanup: "reset recent orders widget" }), ["recent orders"]).length, 0);
  assert.ok(!(SEARCHED_COLUMNS as readonly string[]).includes("References"));
  assert.ok(!(SEARCHED_COLUMNS as readonly string[]).includes("Cleanup"));
});

test("oracle citations are word-bounded, so BL-SR-002 does not match BL-SR-0021", () => {
  assert.deepEqual(matchOracles(row({ Business_Rule: "BL-SR-002" }), ["BL-SR-002"]), ["BL-SR-002"]);
  assert.deepEqual(matchOracles(row({ Business_Rule: "BL-SR-0021" }), ["BL-SR-002"]), []);
  // A citation in any of the three citing columns counts.
  assert.deepEqual(matchOracles(row({ Edge_Case_Refs: "ECL-3.2, BL-SR-002" }), ["BL-SR-002"]), ["BL-SR-002"]);
  assert.deepEqual(matchOracles(row({ References: "Synced: BL-SR-002 (2026-08-01)" }), ["BL-SR-002"]), ["BL-SR-002"]);
});

// ---------------------------------------------------------------------------------------------
// runFate — the column the whole tool exists for
// ---------------------------------------------------------------------------------------------

test("runFate separates the invisible class from the self-announcing one", () => {
  const plan = { tiers: ["critical"] };
  assert.equal(classifyRunFate(row({ Priority: "Critical" }), plan), "WILL_RUN");
  // The invisible class: stale, and nothing will ever execute it to find out.
  assert.equal(classifyRunFate(row({ Priority: "High" }), plan), "FILTERED_OUT");
  assert.equal(classifyRunFate(row({ Priority: "Medium" }), plan), "FILTERED_OUT");
});

test("runFate delegates the tier table, including the P0..P3 aliases", () => {
  // Read through `filterRows` rather than a local table, so `critical`/`P0` cannot come to mean
  // different things in the scope report and in the run it predicts.
  assert.equal(classifyRunFate(row({ Priority: "P0" }), { tiers: ["critical"] }), "WILL_RUN");
  assert.equal(classifyRunFate(row({ Priority: "P1" }), { tiers: ["critical"] }), "FILTERED_OUT");
  assert.equal(classifyRunFate(row({ Priority: "P1" }), { tiers: ["critical", "high"] }), "WILL_RUN");
});

test("an unreadable Priority is not provably in the tier, so it does not run — and is still a hit", () => {
  // Same fail-open-but-named rule as `filter-cases.ts`: it does not run, but the row is reported.
  assert.equal(classifyRunFate(row({ Priority: "urgent-ish" }), { tiers: ["critical"] }), "FILTERED_OUT");
});

test("--also-ids rescues a filtered row, which is the disposition the report recommends", () => {
  assert.equal(
    classifyRunFate(row({ ID: "SR-HD-034", Priority: "High" }), { tiers: ["critical"], alsoIds: ["SR-HD-034"] }),
    "WILL_RUN",
  );
});

test("Manual and Deprecated are NOT_EXECUTING, never a coverage hole", () => {
  // EX-200/EX-201 are opt-outs by intent: "it will not run" is correct there, and folding them
  // into FILTERED_OUT would make the number that counts real holes lie.
  assert.equal(classifyRunFate(row({ Priority: "Critical", Automation_Status: "Manual" }), { tiers: ["critical"] }), "NOT_EXECUTING");
  assert.equal(classifyRunFate(row({ Priority: "Critical", Automation_Status: "Deprecated" }), { tiers: ["critical"] }), "NOT_EXECUTING");
  // Exact match only, mirroring the classifier: 'Deprecated pending review' is not an opt-out.
  assert.equal(classifyRunFate(row({ Priority: "Critical", Automation_Status: "Deprecated pending review" }), { tiers: ["critical"] }), "WILL_RUN");
});

// ---------------------------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------------------------

test("the scan reports hits with their run fate and audit state", () => {
  const files: Record<string, string> = {
    "s/091.csv": csv([
      row({ ID: "SR-CP-001", Priority: "Critical", Assertions: 'header reads "Recent orders"' }),
      row({ ID: "SR-CP-002", Priority: "High", Assertions: 'header reads "Recent Orders"', References: "Audited: 2026-05-01" }),
      row({ ID: "SR-CP-003", Priority: "Critical", Assertions: "unrelated" }),
    ]),
    "s/093.csv": csv([row({ ID: "SR-HD-001", Priority: "Medium", Business_Rule: "BL-SR-002" })]),
  };
  const r = scanExistingCoverage({
    suites: SUITES,
    domains: ["sales-rep"],
    observables: ["recent orders"],
    oracles: ["BL-SR-002"],
    tiers: ["critical"],
    readSuite: (f) => files[f] ?? null,
  });

  assert.deepEqual(r.hits.map((h) => h.caseId), ["SR-CP-001", "SR-CP-002", "SR-HD-001"]);
  assert.equal(r.counts.rowsScanned, 4);
  assert.equal(r.counts.willRun, 1);
  assert.equal(r.counts.filteredOut, 2);
  // The stamp is read through `parseAuditStamp`, so the report and the TRI-000 rotation agree.
  assert.equal(r.hits[0].lastAudited, null);
  assert.equal(r.hits[1].lastAudited, "2026-05-01");
  assert.equal(r.counts.neverAudited, 2);
  // An oracle-only hit needs no observable match.
  assert.deepEqual(r.hits[2].oracles, ["BL-SR-002"]);
  assert.equal(r.hits[2].matches.length, 0);
});

test("a legacy 11-column suite is REFUSED and named, never scanned", () => {
  // `parseSuite` maps positionally, so on a legacy header `Steps` lands in `Test_Data` and
  // `Priority` is not `Priority` — scanning would report the right rows for the wrong reasons
  // and predict runFate off the wrong column. Same refusal as filter-cases/plan-lanes.
  const r = scanExistingCoverage({
    suites: SUITES,
    domains: ["sales-rep"],
    observables: ["recent orders"],
    readSuite: (f) =>
      f === "s/091.csv"
        ? 'ID,Title,Section,Priority,Preconditions,Steps,Expected Result,Test_Data,References,Automation_Status,Notes\nA-1,t,s,High,,,recent orders,,,,\n'
        : csv([]),
  });
  assert.equal(r.hits.length, 0);
  assert.equal(r.unscannable.length, 1);
  assert.equal(r.unscannable[0].suiteId, "091");
  assert.match(r.unscannable[0].reason, /legacy header/);
});

test("a missing file is unscannable, not an absence of risk", () => {
  const r = scanExistingCoverage({
    suites: SUITES,
    suiteIds: ["091"],
    observables: ["x"],
    readSuite: () => null,
  });
  assert.deepEqual(r.unscannable.map((u) => u.reason), ["file not found"]);
});

// A NAMED suite that is not in the manifest at all used to vanish: it never entered `scoped`, so
// it reached neither `hits[]` nor `unscannable[]`, the run exited 0, and an empty worklist read as
// "no stale rows found". Suite 093 was historically found in exactly that state (present on disk,
// absent from the manifest), and `91` is the plausible typo for `091`.
test("a --suite id absent from the manifest is REPORTED, never silently dropped", () => {
  const r = scanExistingCoverage({
    suites: SUITES,
    suiteIds: ["091", "999"],
    observables: ["x"],
    readSuite: () => csv([row({ ID: "SR-CP-001", Assertions: "x" })]),
  });
  const missing = r.unscannable.filter((u) => u.suiteId === "999");
  assert.equal(missing.length, 1, "the unknown id must appear in unscannable[]");
  assert.match(missing[0].reason, /not in config\/test-suites\.json/);
});

test("an unknown --suite id does not suppress the real hits from the known one", () => {
  // Fail-open: the worklist for the suite that DOES exist still has to be produced.
  const r = scanExistingCoverage({
    suites: SUITES,
    suiteIds: ["091", "999"],
    observables: ["recent orders"],
    readSuite: () => csv([row({ ID: "SR-CP-001", Assertions: "Recent orders" })]),
  });
  assert.equal(r.hits.length, 1);
  assert.equal(r.unscannable.length, 1);
});

test("an observable that matched nothing is reported rather than read as clean", () => {
  // Either the corpus genuinely never asserts it (a gap) or the diff words it differently. The
  // two need different responses, so the tool must not silently pick one.
  const r = scanExistingCoverage({
    suites: SUITES,
    domains: ["sales-rep"],
    observables: ["recent orders", "a phrase nothing carries"],
    readSuite: () => csv([row({ ID: "SR-CP-001", Assertions: "Recent orders" })]),
  });
  assert.deepEqual(r.unmatchedObservables, ["a phrase nothing carries"]);
});

// ---------------------------------------------------------------------------------------------
// CLI contract
// ---------------------------------------------------------------------------------------------

test("a scan with no observable and no oracle is refused, not silently widened", () => {
  // Without one it would list every row in scope — that is a suite audit
  // (/qa-review-tests --triangulate), not a change-scoped triage, and 358 undifferentiated rows
  // is the shape of a report nobody reads.
  const r = parseArgs(["--domain", "sales-rep"]);
  assert.ok("error" in r && /observable or --oracle/.test(r.error));
});

test("a scan with no scope is refused", () => {
  const r = parseArgs(["--observable", "recent orders"]);
  assert.ok("error" in r && /--domain \/ --suite \/ --module/.test(r.error));
});

test("a value-taking flag as the final token errors instead of binding undefined", () => {
  // `tc:promote --ids` shipped without this lookahead and scoped to `undefined`, exiting 0 and
  // looking like a clean no-op. Here it would have matched every row in scope.
  assert.ok("error" in parseArgs(["--domain", "sales-rep", "--observable"]));
  assert.ok("error" in parseArgs(["--domain"]));
  // And a flag directly followed by another flag is the same mistake.
  assert.ok("error" in parseArgs(["--domain", "--observable", "x"]));
});

test("--cases rejects a tier spelling it does not know", () => {
  assert.ok("error" in parseArgs(["--domain", "d", "--observable", "o", "--cases", "P0"]));
  const ok = parseArgs(["--domain", "d", "--observable", "o", "--cases", "critical,high"]);
  assert.ok(!("error" in ok) && ok.tiers.length === 2);
});

test("lists split on commas; --observable takes one phrase so a comma stays part of it", () => {
  const a = parseArgs([
    "--domain", "sales-rep,orders",
    "--oracle", "BL-SR-002,BL-SR-012",
    "--observable", "All orders, newest first",
  ]);
  assert.ok(!("error" in a));
  assert.deepEqual(a.domains, ["sales-rep", "orders"]);
  assert.deepEqual(a.oracles, ["BL-SR-002", "BL-SR-012"]);
  assert.deepEqual(a.observables, ["All orders, newest first"]);
});

// ---- --changed-files: the flag the header documented before it existed -------------------------
// The path pathway (ScanInput.pathTokens, the token branch, the "path" reason kind) was reachable
// ONLY from this test file, because parseArgs had no case for the flag and its default: rejected
// it. A documented capability an operator cannot invoke is a defect, so these pin the CLI seam.

test("parseArgs accepts --changed-files and its aliases", () => {
  for (const flag of ["--changed-files", "--path", "--paths"]) {
    const a = parseArgs(["--domain", "sales-rep", "--observable", "x", flag, "a/b/c.vue"]);
    assert.ok(!("error" in a), `${flag} must be accepted`);
    assert.deepEqual((a as { paths: string[] }).paths, ["a/b/c.vue"]);
  }
});

test("--changed-files takes a comma list and looks ahead for its value", () => {
  const a = parseArgs(["--domain", "d", "--observable", "x", "--changed-files", "a.vue,b/c.ts"]);
  assert.deepEqual((a as { paths: string[] }).paths, ["a.vue", "b/c.ts"]);
  // as the final token with no value it must fail loudly, not bind undefined
  const bad = parseArgs(["--domain", "d", "--observable", "x", "--changed-files"]);
  assert.ok("error" in bad && /needs a value/.test(bad.error));
});

test("paths alone do NOT scope a scan — they are additive to a vocabulary scope", () => {
  const a = parseArgs(["--observable", "x", "--changed-files", "a/b/customer-orders.vue"]);
  assert.ok("error" in a, "a path-only invocation must still demand --domain/--suite/--module");
  assert.match((a as { error: string }).error, /--domain \/ --suite \/ --module/);
});

test("pathTokensForPaths derives tokens from the manifest vocabulary, matching EXACTLY", () => {
  const tokens = pathTokensForPaths(["client-app/pages/company/customer-orders.vue"], SUITES);
  // 'orders' is a tag the fixture suites carry; 'order' (singular) must never be produced from it
  assert.ok(!tokens.includes("order"), "an exact-match tokenizer must not emit 'order'");
  // a path whose segments match no suite vocabulary yields nothing rather than widening blindly
  assert.deepEqual(pathTokensForPaths(["some/unrelated/path.txt"], SUITES), []);
  // and no paths means no tokens at all
  assert.deepEqual(pathTokensForPaths([], SUITES), []);
});

test("a path token can ADD a suite the vocabulary missed but never remove one it found", () => {
  const viaVocab = resolveScopeSuites(SUITES, { domains: ["sales-rep"] });
  const viaBoth = resolveScopeSuites(SUITES, {
    domains: ["sales-rep"],
    pathTokens: ["orders"],
  });
  const idsOf = (r: ReadonlyArray<{ id: string }>) => r.map((s) => s.id);
  for (const id of idsOf(viaVocab)) {
    assert.ok(idsOf(viaBoth).includes(id), `path tokens removed ${id} — they must only add`);
  }
});
