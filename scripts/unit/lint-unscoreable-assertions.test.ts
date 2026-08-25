// Unit tests for T-005 — "unscoreable prose assertion", the authoring-time gate
// for the defect REG-2026-08-25-1128 surfaced at RUN time: 5 of 14 non-passing
// new cases failed on an assertion line that was never scoreable, which produced
// a false red AND masked the real assertions in the same case that passed.
//
// Two layers, matching where the logic lives:
//   * scripts/lib/graphql-assertions.ts  — classifyPredicateScoreability(), the
//     static twin of the runner's own evaluator (grammar single-sourced there).
//   * scripts/test-cases/lint-test-cases.ts — the T-005 rule that decides WHICH
//     cells and WHICH cases the classifier is allowed to judge.
//
// Run: `npx tsx --test scripts/unit/lint-unscoreable-assertions.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPredicateScoreability,
  parseAssertions,
  type PredicateScoreability,
} from "../lib/graphql-assertions.ts";
import { COLUMNS, parseSuite } from "../test-cases/append-test-cases-to-suite.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const LINTER = join(repoRoot, "scripts", "test-cases", "lint-test-cases.ts");
const GOLD_SUITE = join(
  repoRoot,
  "regression",
  "suites",
  "Backend",
  "graphql",
  "050i-graphql-configurations.csv",
);

/** Classify a single raw assertion line through the same parser the runner uses. */
function verdictOf(line: string): PredicateScoreability {
  const { assertions } = parseAssertions(line);
  assert.equal(assertions.length, 1, `not a verdict-affecting assertion line: ${line}`);
  return classifyPredicateScoreability(assertions[0]);
}

const notScoreable = (line: string) =>
  assert.notEqual(verdictOf(line), "scoreable", `expected T-005 to flag: ${line}`);
const scoreable = (line: string) =>
  assert.equal(verdictOf(line), "scoreable", `expected T-005 to accept: ${line}`);

/* ------------------------------------------------------------------ */
/* 1. The real REG-2026-08-25-1128 offenders — must all be flagged.    */
/* ------------------------------------------------------------------ */

test("flags the prose assertions that reddened REG-2026-08-25-1128", () => {
  // SR-GQL-119 (050m) — 8 of 9 assertions passed; the case failed on this line.
  // Quoted from the follow-up note the triage left in its Cross_Layer_Checks.
  notScoreable(
    "[DATA label=stats_currency_a] verify whether selectedItemQuantity differs between " +
      "currency_a and currency_b when a cart exists in only one currency {HYPOTHESIS}",
  );

  // PUSH-39 / PUSH-40 / PUSH-41 (050l) — prose {HYPOTHESIS} lines; every {SPEC}
  // assertion in those cases passed.
  notScoreable(
    "[DATA label=after_inbox] verify whether data.pushMessages.totalCount increased relative to " +
      "baseline_inbox after the share — no confirmed backend wiring links changeWishlist to " +
      "push-message creation in the schemas introspected this session {HYPOTHESIS}",
  );
  notScoreable(
    '[DATA label=after_inbox] verify whether data.pushMessages.items.0.shortMessage contains ' +
      '"{{list_name}}" or a resolvable path segment to the list — no confirmed message-body ' +
      "template was found in the schemas introspected this session {HYPOTHESIS}",
  );
  notScoreable(
    "[DATA label=after_buyer2] verify whether data.pushMessages.totalCount increased relative to " +
      "baseline_buyer2 — if ONLY buyer1 moves and buyer2 does not, the share is reaching a single " +
      "contact rather than the organization, contradicting VCST-5332's org-scoped sharing model {HYPOTHESIS}",
  );

  // SR-GQL-118 (050m) — same shape as SR-GQL-119.
  notScoreable(
    "[DATA label=stats_wide] verify whether the cancelled bucket is excluded from all_count " +
      "when the window straddles two months {HYPOTHESIS}",
  );

  // WISH-029 (050h) — reported as an unrecognized DATA predicate; 3 of 4 passed.
  notScoreable(
    "[DATA label=add_duplicate] verify whether the second add increments the existing line's " +
      "quantity to 2 (cart-like dedupe, BL-CART-007 analogue) OR creates a second distinct line " +
      "(itemsCount = 2) — no confirmed wishlist contract exists {HYPOTHESIS}",
  );

  // CAT-GQL-124 (050a) — a prose conditional the runner grammar can't parse; it
  // DOES match a branch, then degrades to `lhs=undefined rhs=undefined`.
  notScoreable(
    "[DATA label=get_product_loyalty] data.product.loyaltyPoints is present (loyaltyPoints is " +
      "MoneyType — requires subselection); WHEN a per-product factor is configured for this " +
      "product: data.product.loyaltyPoints.amount >= 0 and data.product.loyaltyPoints.currency.code " +
      "= @td(LOYALTY_SETTINGS.currency_code); WHEN no factor row exists: loyaltyPoints may be null (acceptable)",
  );
});

test("distinguishes the two failure modes so the message can name the right one", () => {
  assert.equal(
    verdictOf("[DATA label=q] verify whether the total went up after the share {HYPOTHESIS}"),
    "unparseable",
  );
  assert.equal(
    verdictOf(
      "[DATA label=q] data.a.count is present (see note); WHEN seeded: data.a.count >= 0 and data.b.code = X",
    ),
    "prose-operand",
  );
});

/* ------------------------------------------------------------------ */
/* 2. Legitimate grammar — must NOT be flagged.                        */
/* ------------------------------------------------------------------ */

test("accepts every documented predicate shape (runner contract §4)", () => {
  [
    "[ERRORS label=q] errors[] empty",
    "[ERRORS label=q] errors[] non-empty",
    "[ERRORS label=rest_upload] HTTP 200",
    "[DATA label=bogus] data is null",
    "[DATA label=q] data.me.id is non-null",
    "[DATA label=cre] data.createOrganization.id is non-empty GUID",
    "[DATA label=cre] data.createOrganization.name matches /^AT&T/i",
    "[DATA label=cre] data.createConfiguredLineItem.extendedPrice.amount > 0",
    "[DATA label=q] data.me.email = ORG_USER@example.com",
    "[DATA label=x] data.x.extendedPrice.amount = data.x.listPrice.amount * data.x.quantity",
    "[DATA label=x] (1111 - data.x.subTotal.amount) ≈ 100",
    "[DATA label=x] data.items.0.publishDate >= data.items.1.publishDate",
    "[DATA label=x] data.X is non-null OR errors[] non-empty",
    "[DATA label=x] data.X.id is non-empty GUID AND data.X.name = Foo",
    "[DATA label=q] data.products.items[*?type=Product].0.name is non-null",
    "[DATA label=noauth] errors[0].extensions.code = Unauthorized",
    "[NULL label=q] data.acceptOrganizationInvite",
    "[COUNT label=read_back] data.configurationItems.configurationItems.length = 2",
    "[COUNT label=results] data.products.items[*?type=Product].length > 0",
    "[VAR] {{SECTION_TYPE}} = Text",
    "[PERF label=read_back] elapsed_ms < 500",
    "[PERF label=heavy_query] elapsed_ms < 1500ms",
    "[PERF label=introspection] elapsed_ms < 1s",
  ].forEach(scoreable);
});

test("accepts runtime placeholders the runner resolves before evaluating", () => {
  // {{VAR}} is substituted from the capture bag and @td() from the test-data
  // registry BEFORE dispatch, so a static reader must treat both as scalars.
  scoreable("[COUNT label=q] data.salesRepOrders.items.length > {{STOREA_COUNT}}");
  scoreable("[COUNT label=q] data.customerReviews.items.length = @td(REVIEW_PRODUCT.approved_count)");
  scoreable("[DATA label=q] data.organization.id = @td(ORG_TECHFLOW.platform_id) {DOC}");
  scoreable("[DATA label=x] ({{BASE_LIST_PRICE}} - data.x.items.0.listPrice.amount) ≈ {{RAM_OPTION_PRICE}}");
});

test("accepts a trailing rationale after a well-formed predicate", () => {
  // The evaluator's branches are prefix-anchored, so the trailing prose is not
  // read. Flagging these would have hit ~90 correct lines across the corpus.
  scoreable("[ERRORS label=q] errors[] empty — every Product field must resolve");
  scoreable("[DATA label=q] data.wishlist is null — private list not exposed to other users");
  scoreable("[DATA label=q] data.me.memberId is null — anonymous caller has no member (BL-GQL-004)");
});

test("{HYPOTHESIS} on a real predicate is NOT the defect", () => {
  // A tagged hypothesis is legitimate during authoring — that is GRD-001's
  // business (and only in a promoted case). T-005 judges scoreability, not
  // grounding, so a {HYPOTHESIS} line that IS a predicate must stay green.
  scoreable("[DATA label=after_inbox] data.pushMessages.totalCount > 0 {HYPOTHESIS}");
  scoreable("[COUNT label=q] data.pushMessages.items.length >= 1 {HYPOTHESIS}");
  // ...and conversely, prose with no provenance tag at all is still the defect.
  notScoreable("[DATA label=q] check that the badge count went up after the share");
});

test("the gold-standard suite 050i has no unscoreable assertion", () => {
  // Corpus-grounded, so the rule cannot silently drift away from the reference
  // suite the runner contract points authors at.
  const { rows } = parseSuite(readFileSync(GOLD_SUITE, "utf8").replace(/^﻿/, ""));
  assert.ok(rows.length > 0, "050i parsed to zero rows");
  const offenders: string[] = [];
  for (const row of rows) {
    for (const a of parseAssertions(row.Assertions ?? "").assertions) {
      if (classifyPredicateScoreability(a) !== "scoreable") offenders.push(`${row.ID}: ${a.raw}`);
    }
  }
  assert.deepEqual(offenders, []);
});

/* ------------------------------------------------------------------ */
/* 3. Rule scoping — which cells and which cases T-005 may judge.      */
/* ------------------------------------------------------------------ */

type Fixture = Partial<Record<(typeof COLUMNS)[number], string>>;

function writeSuite(rows: Fixture[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows
    .map((r) => COLUMNS.map((c) => esc(r[c] ?? "")).join(","))
    .join("\n");
  const dir = mkdtempSync(join(tmpdir(), "t005-"));
  const file = join(dir, "999-fixture.csv");
  writeFileSync(file, `${COLUMNS.join(",")}\n${body}\n`, "utf8");
  return file;
}

function lintFindings(rows: Fixture[]): Array<{ rule: string; severity: string; caseId: string }> {
  const file = writeSuite(rows);
  let stdout: string;
  try {
    stdout = execFileSync(process.execPath, ["--import", "tsx", LINTER, file, "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch (e) {
    // The linter exits 1 whenever anything at/above --fail-on=High is found,
    // which every fixture below trips on unrelated rules (C-001, REQ-001, …).
    stdout = (e as { stdout?: string }).stdout ?? "";
  }
  return JSON.parse(stdout).findings;
}

const GQL_STEPS = [
  "[AUTH role=ORG_USER]",
  "[GQL-OP probe] query { me { id } }",
  "[GQL-EXEC probe]",
].join("\n");

const BASE: Fixture = {
  Section: "Push > Sharing",
  Priority: "Medium",
  Preconditions: "A signed-in org user",
  Test_Data: "none",
  Failure_Signals: "errors[] non-empty; totalCount unchanged",
  Cleanup: "none",
  References: "VCST-5332",
  Automation_Status: "Draft",
};

const PROSE = "verify whether the inbox total went up after the share {HYPOTHESIS}";

test("T-005 fires on a runner-native case, at Critical", () => {
  const findings = lintFindings([
    {
      ...BASE,
      ID: "FIX-001",
      Title: "Sharing raises the inbox count",
      Steps: GQL_STEPS,
      Assertions: `[ERRORS label=probe] errors[] empty\n[DATA label=probe] ${PROSE}`,
    },
  ]);
  const t005 = findings.filter((f) => f.rule === "T-005");
  assert.equal(t005.length, 1);
  assert.equal(t005[0].severity, "Critical");
  assert.equal(t005[0].caseId, "FIX-001");
});

test("T-005 ignores prose in the prose-tolerant columns", () => {
  // Moving the line into Cross_Layer_Checks is the documented fix for several of
  // the REG-2026-08-25-1128 cases — the gate must not follow it there. Same for
  // Failure_Signals / Preconditions / References, which are never evaluated.
  const findings = lintFindings([
    {
      ...BASE,
      ID: "FIX-002",
      Title: "Sharing raises the inbox count",
      Steps: GQL_STEPS,
      Assertions: "[ERRORS label=probe] errors[] empty\n[DATA label=probe] data.me.id is non-null",
      Cross_Layer_Checks: `[EVIDENCE] FOLLOW-UP: ${PROSE}`,
      Preconditions: `A signed-in org user; ${PROSE}`,
      Failure_Signals: `${PROSE}; errors[] non-empty`,
      References: `VCST-5332 — ${PROSE}`,
    },
  ]);
  assert.deepEqual(findings.filter((f) => f.rule === "T-005"), []);
});

test("T-005 ignores info-only assertion tags, which are FOR prose", () => {
  const findings = lintFindings([
    {
      ...BASE,
      ID: "FIX-003",
      Title: "Sharing raises the inbox count",
      Steps: GQL_STEPS,
      Assertions: [
        "[ERRORS label=probe] errors[] empty",
        "[DATA label=probe] data.me.id is non-null",
        `[EVIDENCE] ${PROSE}`,
        "[MATH] base $999 + RAM $100 = $1099 × 3 = $3297",
        `[ROUNDTRIP] ${PROSE}`,
        `[ADMIN] ${PROSE}`,
      ].join("\n"),
    },
  ]);
  assert.deepEqual(findings.filter((f) => f.rule === "T-005"), []);
});

test("T-005 ignores non-runner cases, whose assertions an agent reads", () => {
  const findings = lintFindings([
    {
      ...BASE,
      ID: "FIX-004",
      Title: "Shared list appears in the storefront inbox",
      Steps: "[NAV] {{FRONT_URL}}/account/lists\n[ACT] click 'Share'\n[WAIT] list saved",
      Assertions: `[DOM] the notification badge shows a new item\n[DATA] ${PROSE}`,
    },
  ]);
  assert.deepEqual(findings.filter((f) => f.rule === "T-005"), []);
});
