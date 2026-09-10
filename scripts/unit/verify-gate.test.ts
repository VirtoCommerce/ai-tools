// Unit tests for scripts/regression/verify-gate.ts — the re-derivation half of /qa-test's
// independent verifier.
//
// The point of the script is to let a verifier spend its context on judgment instead of on
// recomputing machine-checkable evidence. Two properties keep that from becoming a loss of rigour,
// and both are tested here:
//
//   * every gate names what it did NOT check, so an APPROVE cannot rest on a silently partial sheet;
//   * the promotion diff is right, because a wrong one is worse than none — a verifier is told that
//     a non-`Draft` row in the diff "is itself a REJECT", so a false positive costs a real revise
//     loop and a false negative passes a hand-edited cell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPromotion, illegalPromotions, GATES, type GateId } from "../regression/verify-gate.ts";

const csv = (rows: string[]): string =>
  ['"ID","Steps","Automation_Status"', ...rows].join("\r\n") + "\r\n";

test("a legal promotion is Draft -> Automated and nothing else", () => {
  const before = csv(['"A-1","go","Draft"', '"A-2","go","Automated"']);
  const after = csv(['"A-1","go","Automated"', '"A-2","go","Automated"']);
  const d = diffPromotion(before, after);
  assert.deepEqual(d.statusChanges, [{ id: "A-1", before: "Draft", after: "Automated" }]);
  assert.deepEqual(illegalPromotions(d), []);
  assert.deepEqual(d.otherColumnChanges, []);
});

test("a promotion off a non-Draft row is surfaced — the hand-edited-cell REJECT", () => {
  const before = csv(['"A-1","go","Reviewed"']);
  const after = csv(['"A-1","go","Automated"']);
  const illegal = illegalPromotions(diffPromotion(before, after));
  assert.equal(illegal.length, 1);
  assert.deepEqual(illegal[0], { id: "A-1", before: "Reviewed", after: "Automated" });
});

test("a status written to something other than Automated is surfaced too", () => {
  const before = csv(['"A-1","go","Draft"']);
  const after = csv(['"A-1","go","Manual"']);
  assert.equal(illegalPromotions(diffPromotion(before, after)).length, 1);
});

test("a content edit smuggled in alongside a promotion is caught", () => {
  const before = csv(['"A-1","go","Draft"']);
  const after = csv(['"A-1","go somewhere else","Automated"']);
  const d = diffPromotion(before, after);
  assert.deepEqual(illegalPromotions(d), [], "the status flip itself is legal");
  assert.deepEqual(d.otherColumnChanges, [{ id: "A-1", column: "Steps" }], "but the Steps edit is not");
});

test("CRLF vs LF is normalised, or every multi-line row reads as edited", () => {
  // This is not hypothetical: `.gitattributes` pins these CSVs to `text eol=crlf`, so `git show`
  // returns LF and the working tree is CRLF, and the endings live INSIDE multi-line cells.
  const lf = '"ID","Steps","Automation_Status"\n"A-1","one\nvery long\nstep","Draft"\n';
  const crlf = '"ID","Steps","Automation_Status"\r\n"A-1","one\r\nvery long\r\nstep","Automated"\r\n';
  const d = diffPromotion(lf, crlf);
  assert.deepEqual(d.otherColumnChanges, [], "line endings are not a content change");
  assert.deepEqual(d.statusChanges, [{ id: "A-1", before: "Draft", after: "Automated" }]);
});

test("added and removed rows are reported, not silently folded into 'no change'", () => {
  const before = csv(['"A-1","go","Draft"', '"A-2","go","Draft"']);
  const after = csv(['"A-1","go","Draft"', '"A-3","go","Draft"']);
  const d = diffPromotion(before, after);
  assert.deepEqual(d.removedIds, ["A-2"]);
  assert.deepEqual(d.addedIds, ["A-3"]);
});

test("every gate declares what it did NOT check", () => {
  for (const id of Object.keys(GATES) as GateId[]) {
    assert.ok(GATES[id].unchecked.length > 0, `gate ${id} must name its blind spots`);
    assert.ok(GATES[id].title.length > 0);
  }
});

test("no gate spec contains a verdict word — the sheet is evidence, never a ruling", () => {
  const banned = /\b(APPROVE|REJECT|PASS(ED)?|FAIL(ED)?)\b/;
  for (const id of Object.keys(GATES) as GateId[]) {
    const text = [GATES[id].title, ...GATES[id].unchecked].join(" ");
    // "REJECT" may appear only where it instructs the verifier, never as this script's own output.
    const offending = text.match(banned)?.[0];
    assert.ok(
      offending === undefined || /a claimed PASS|is a REJECT/.test(text),
      `gate ${id} must not read as a verdict (found "${offending}")`,
    );
  }
});

test("every gate a verifier can be dispatched to has a spec", () => {
  // 3-exec releases the EXECUTION agents and is INLINE (no fresh-verifier dispatch); 3 releases C1
  // and is the hard STOP. 5g is no longer a /qa-test step (promotion moved to /qa-test-lifecycle 6P,
  // 2026-09-10) but the gate is still reachable from there, so its spec stays.
  assert.deepEqual(Object.keys(GATES).sort(), ["3", "3-exec", "5b", "5e", "5g"]);
});

test("3-exec is runnable without a suite — Artifact A does not exist yet when it fires", () => {
  // The regression this guards: gate 3 threw on a missing --suite, which is why a checklist-only
  // gate was not runnable at all before 2026-09-10. 3-exec must never grow that requirement.
  const spec = GATES["3-exec"];
  assert.ok(/inline/i.test(spec.title), "3-exec is inline, and its title must say so");
  assert.ok(
    spec.unchecked.some((u) => /PENDING-A/.test(u)),
    "3-exec must name PENDING-A — the disposition gate 3 is then obliged to close",
  );
  assert.ok(
    GATES["3"].unchecked.some((u) => /PENDING-A/.test(u)),
    "gate 3 must close every PENDING-A that 3-exec allowed through",
  );
});
