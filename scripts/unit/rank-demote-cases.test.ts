// Unit tests for rank-cases.ts / demote-cases.ts — the cost-vs-detection ranking
// and the one-way-out-of-the-lane demotion.
//
// The property that matters most here is FAIL-CLOSED IN THE EXPENSIVE DIRECTION:
// a wrong demotion silently removes coverage, a wrong keep costs minutes. So the
// tests below spend most of their effort proving the guards HOLD — a Critical
// case, a cheap case, and a deliberately-designed case must never be demoted no
// matter how weak their assertions are.
// Run: `npx tsx --test scripts/unit/rank-demote-cases.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, type Row } from "../test-cases/append-test-cases-to-suite.js";
import { rankCase, bestStrength, EXPENSIVE_STEPS } from "../test-cases/rank-cases.js";
import { decideDemotion, stampDemotion, DEMOTION_TARGET } from "../test-cases/demote-cases.js";

const WEAK = "[DOM] price is visible\n[DOM] title is displayed";
const STRONG = "[DOM] price is visible\n[REL] PDP price == listing price for the same SKU";
const steps = (n: number): string =>
  Array.from({ length: n }, (_, i) => `[ACT] step ${i + 1}`).join("\n");

function row(over: Partial<Row> = {}): Row {
  const r = {} as Row;
  for (const c of COLUMNS) r[c] = "";
  r.ID = "CART-901";
  r.Title = "t";
  r.Section = "Cart";
  r.Priority = "Medium";
  r.Automation_Status = "Automated";
  r.Steps = steps(EXPENSIVE_STEPS + 2);
  r.Assertions = WEAK;
  return Object.assign(r, over);
}

test("bestStrength reports the strongest class present", () => {
  assert.equal(bestStrength(["[DOM] visible", "[REL] a == b"]), "REL");
  assert.equal(bestStrength(["[DOM] visible"]), "PRES");
  assert.equal(bestStrength(["[SHIFT] topDelta == 0", "[DOM] visible"]), "INV");
  assert.equal(bestStrength([]), "NONE");
});

test("expensive + presence-only + ordinary priority = DEMOTE", () => {
  const r = rankCase(row(), "s.csv");
  assert.equal(r.verdict, "DEMOTE");
  assert.match(r.reasons.join(" "), /presence-only/);
  assert.match(r.reasons.join(" "), /steps to run/);
});

test("one discriminating assertion flips it to KEEP", () => {
  assert.equal(rankCase(row({ Assertions: STRONG }), "s.csv").verdict, "KEEP");
});

// --- The three guards. Each must hold on its own. ---
test("GUARD: a risk-floor case is never demoted, only strengthened", () => {
  for (const p of ["Critical", "P0"]) {
    const r = rankCase(row({ Priority: p }), "s.csv");
    assert.equal(r.verdict, "STRENGTHEN", p);
    assert.match(r.reasons.join(" "), /risk floor/);
  }
});

test("GUARD: a cheap case is strengthened, not demoted", () => {
  const r = rankCase(row({ Steps: steps(EXPENSIVE_STEPS - 1) }), "s.csv");
  assert.equal(r.verdict, "STRENGTHEN");
  assert.match(r.reasons.join(" "), /cheap to keep and fix/);
});

test("GUARD: a deliberate Archetype stamp blocks demotion", () => {
  const r = rankCase(row({ References: "VCST-1 · Archetype:SCOPE · Technique:EP" }), "s.csv");
  assert.equal(r.verdict, "STRENGTHEN");
  assert.match(r.reasons.join(" "), /deliberate Archetype stamp/);
});

test("a case with no assertions at all is demoted, unless it is risk-floor", () => {
  assert.equal(rankCase(row({ Assertions: "" }), "s.csv").verdict, "DEMOTE");
  assert.equal(rankCase(row({ Assertions: "", Priority: "Critical" }), "s.csv").verdict, "STRENGTHEN");
});

test("a case already out of the lane is KEEP — nothing to reclaim", () => {
  for (const st of ["Manual", "Deprecated"]) {
    const r = rankCase(row({ Automation_Status: st }), "s.csv");
    assert.equal(r.verdict, "KEEP", st);
  }
});

// --- decideDemotion ---
test("decideDemotion only acts on a DEMOTE verdict, and says why when it does not", () => {
  const keep = decideDemotion(rankCase(row({ Assertions: STRONG }), "s.csv"));
  assert.equal(keep.demote, false);
  assert.match(keep.reason, /DM-001/);

  const go = decideDemotion(rankCase(row(), "s.csv"));
  assert.equal(go.demote, true);
});

test("decideDemotion refuses a row with no usable ID", () => {
  const r = rankCase(row(), "s.csv");
  const d = decideDemotion({ ...r, id: "<no id>" });
  assert.equal(d.demote, false);
  assert.match(d.reason, /DM-004/);
});

test("the demotion stamp appends and is idempotent, never clobbering existing stamps", () => {
  const existing = "VCST-5281 | Synced: 2026-08-01 | Promoted: REG-1 (2026-08-10)";
  const once = stampDemotion(existing, "rank", "2026-08-27");
  assert.ok(once.includes("Synced: 2026-08-01"), "existing stamps preserved");
  assert.ok(once.includes("Promoted: REG-1"), "existing stamps preserved");
  assert.ok(once.includes("Demoted: rank (2026-08-27)"));
  assert.equal(stampDemotion(once, "rank", "2026-08-27"), once, "idempotent");
  // Empty References must not produce a leading separator.
  assert.equal(stampDemotion("", "rank", "2026-08-27"), "Demoted: rank (2026-08-27) presence-only");
});

test("the demotion target is Manual and never Deprecated", () => {
  // Deprecation is destructive and is always a human call (TRI-006). This is a
  // guard against someone 'optimising' the target later.
  assert.equal(DEMOTION_TARGET, "Manual");
  assert.notEqual(DEMOTION_TARGET as string, "Deprecated");
});

// --- Regression guards for the code-review findings.

// The one piece of GROUND TRUTH in the repo was never consulted. Measured at the
// time: 10 of the 36 cases proven to have caught a bug were marked DEMOTE —
// among them the tests that caught a nested-impersonation privilege escalation,
// a stored XSS, two open P0s and a cross-org role leak. A case that has caught a
// bug is not a candidate for anything but KEEP, whatever its assertions look like.
test("GUARD: a case that has caught a real bug is never demoted", () => {
  const proven = new Set(["CART-901"]);
  const r = rankCase(row(), "s.csv", proven);
  assert.notEqual(r.verdict, "DEMOTE");
  assert.match(r.reasons.join(" "), /has caught a real bug/);
});

test("the same case with no proof is demotable — the guard is what changes it", () => {
  assert.equal(rankCase(row(), "s.csv", new Set()).verdict, "DEMOTE");
});

// UNKNOWN is a gap in the classifier, not evidence about the case. Folding it
// into "presence-only" put 158 candidates (117 Backend) on the demotion list and
// printed a reason that was factually false.
test("GUARD: a case the classifier cannot read is never demoted", () => {
  const r = rankCase(row({ Assertions: "[WIDGET] the frobnicator reconciles the ledger" }), "s.csv", new Set());
  assert.equal(r.verdict, "STRENGTHEN");
  assert.match(r.reasons.join(" "), /cannot read/);
  assert.doesNotMatch(r.reasons.join(" "), /presence-only/, "must not claim it is presence-only");
});

// The zero-assertion branch checked only the risk floor, ignoring step count and
// the design stamp — so a 1-step, deliberately-stamped case whose author had not
// yet filled Assertions was demoted, against the documented contract.
test("GUARD: the zero-assertion branch obeys the same blockers as the weak branch", () => {
  const cheap = rankCase(row({ Assertions: "", Steps: steps(1) }), "s.csv", new Set());
  assert.equal(cheap.verdict, "STRENGTHEN", "1 step is cheap to fix");
  const stamped = rankCase(
    row({ Assertions: "", References: "VCST-1 · Archetype:SCOPE · Technique:EP" }),
    "s.csv", new Set());
  assert.equal(stamped.verdict, "STRENGTHEN", "a deliberate stamp blocks demotion");
  // ...and with no blocker at all it is still DEMOTE.
  assert.equal(rankCase(row({ Assertions: "" }), "s.csv", new Set()).verdict, "DEMOTE");
});

// bestStrength kept a private copy of the ladder and silently lost NEG when that
// class was added: 49 cases reported best:UNKNOWN while being judged
// discriminating — the explanation contradicting the verdict.
test("bestStrength ranks NEG, the class the ladder was extended with", () => {
  assert.equal(bestStrength(["[STATE] order NOT created — cart still intact"]), "NEG");
  assert.equal(bestStrength(["[DOM] price is visible", "[STATE] order NOT created"]), "NEG");
});

// rank advertised candidates demote structurally could not act on: 386 of 795
// (48%) differed only by a BLANK status being in one literal and not the other.
test("what rank calls DEMOTE, demote can act on — one source of truth for status", () => {
  for (const st of ["", "Automated", "Draft", "Reviewed", "Semi-Automated"]) {
    const r = rankCase(row({ Automation_Status: st }), "s.csv", new Set());
    assert.equal(r.verdict, "DEMOTE", `status "${st}" should rank DEMOTE`);
    assert.equal(decideDemotion(r).demote, true, `status "${st}" should be actionable`);
  }
});

test("a non-executing status is KEEP on both sides, case-insensitively", () => {
  for (const st of ["Manual", "manual", "Deprecated", "DEPRECATED"]) {
    const r = rankCase(row({ Automation_Status: st }), "s.csv", new Set());
    assert.equal(r.verdict, "KEEP", st);
    assert.equal(decideDemotion(r).demote, false, st);
  }
});
