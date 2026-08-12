// Unit tests for the shared iteration date-range validation
// (plugins/vc-fix/skills/qa-fix-routing/iteration-dates.mjs).
//
// The silent failure this locks down: `ado.mjs current-iteration` trusted Azure's
// `timeFrame:"current"` flag, which stays set on a DORMANT team's long-dead sprint — so a bug on
// OPUS was stamped into "Sprint 12.5 Launch" (2023-06-07..2023-06-20) on 2026-08-11. An iteration is
// current ONLY when its dates bracket today, compared DATE-ONLY so the sprint's FINAL day
// (finishDate stored at T00:00:00Z) is not wrongly rejected.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIterationCurrent, iterationDateOnly, localTodayYMD, iterationRange, selectTeamWithCurrentSprint,
} from "../../plugins/vc-fix/skills/qa-fix-routing/iteration-dates.mjs";

const it = (start, finish, timeFrame = "current") => ({ attributes: { startDate: start, finishDate: finish, timeFrame } });

test("iterationDateOnly: strips the time component to YYYY-MM-DD", () => {
  assert.equal(iterationDateOnly("2026-08-11T00:00:00Z"), "2026-08-11");
  assert.equal(iterationDateOnly("2026-08-11"), "2026-08-11");
  assert.equal(iterationDateOnly(""), "");
  assert.equal(iterationDateOnly(undefined), "");
});

test("isIterationCurrent: today INSIDE the range is current", () => {
  assert.equal(isIterationCurrent(it("2026-07-29T00:00:00Z", "2026-08-11T00:00:00Z"), "2026-08-05"), true);
});

test("isIterationCurrent: the FINAL day is inclusive (finishDate T00:00:00Z is NOT rejected)", () => {
  // The exact OPUS case: Ph5 Sprint 16 ends 2026-08-11 and today IS 2026-08-11 — must be current.
  assert.equal(isIterationCurrent(it("2026-07-29T00:00:00Z", "2026-08-11T00:00:00Z"), "2026-08-11"), true);
});

test("isIterationCurrent: the FIRST day is inclusive", () => {
  assert.equal(isIterationCurrent(it("2026-07-29T00:00:00Z", "2026-08-11T00:00:00Z"), "2026-07-29"), true);
});

test("isIterationCurrent: a stale sprint (today AFTER finish) is NOT current, even flagged current", () => {
  // Sprint 12.5 Launch 2023-06-07..2023-06-20, with ADO STILL flagging it timeFrame:"current".
  assert.equal(isIterationCurrent(it("2023-06-07T00:00:00Z", "2023-06-20T00:00:00Z", "current"), "2026-08-11"), false);
});

test("isIterationCurrent: today BEFORE start is NOT current", () => {
  assert.equal(isIterationCurrent(it("2026-09-01T00:00:00Z", "2026-09-14T00:00:00Z"), "2026-08-11"), false);
});

test("isIterationCurrent: a sprint with no dates is never current (the dormant-team case)", () => {
  assert.equal(isIterationCurrent(it(undefined, undefined, "current"), "2026-08-11"), false);
  assert.equal(isIterationCurrent({}, "2026-08-11"), false);
  assert.equal(isIterationCurrent(null, "2026-08-11"), false);
});

test("localTodayYMD: formats a LOCAL date as YYYY-MM-DD (month is 0-indexed)", () => {
  assert.equal(localTodayYMD(new Date(2026, 7, 11)), "2026-08-11"); // 7 = August
  assert.equal(localTodayYMD(new Date(2026, 0, 5)), "2026-01-05");
  assert.match(localTodayYMD(), /^\d{4}-\d{2}-\d{2}$/);
});

test("iterationRange: renders the date-only range for loud errors / notes", () => {
  assert.equal(iterationRange(it("2026-07-29T00:00:00Z", "2026-08-11T00:00:00Z")), "2026-07-29..2026-08-11");
  assert.equal(iterationRange({}), "?..?");
});

// ─── selectTeamWithCurrentSprint — the SHARED team-selection decision ──────────────────────────
// Extracted so the runtime resolver (ado.mjs resolveCurrentIteration) and the onboarding scan
// (discover-tracker.mjs discoverTeam) apply the SAME ambiguity rule and can't drift.
const m = (team, path, name = path) => ({ team, iteration: { id: path, name, path } });

test("selectTeamWithCurrentSprint: exactly one team with a current sprint → ok, that team", () => {
  const r = selectTeamWithCurrentSprint([m("Alpha", "Proj\Sprint 5")]);
  assert.equal(r.ok, true);
  assert.equal(r.ambiguous, false);
  assert.equal(r.team, "Alpha");
  assert.equal(r.iteration.path, "Proj\Sprint 5");
});
test("selectTeamWithCurrentSprint: several teams SHARING one sprint path → no ambiguity (dedup)", () => {
  const r = selectTeamWithCurrentSprint([m("Alpha", "Proj\Sprint 5"), m("Beta", "Proj\Sprint 5")]);
  assert.equal(r.ok, true, "one distinct path ⇒ the stamped IterationPath is identical either way");
  assert.equal(r.distinctPaths.length, 1);
  assert.equal(r.team, "Alpha", "the first match wins when the path is shared");
});
test("selectTeamWithCurrentSprint: DIFFERENT sprints across teams → ambiguous, pick one", () => {
  const r = selectTeamWithCurrentSprint([m("Alpha", "Proj\Sprint 5"), m("Beta", "Proj\Sprint 6")]);
  assert.equal(r.ok, false);
  assert.equal(r.ambiguous, true);
  assert.equal(r.distinctPaths.length, 2);
  assert.deepEqual(r.matches.map((x) => x.team), ["Alpha", "Beta"]);
});
test("selectTeamWithCurrentSprint: no team with a current sprint → not ok, not ambiguous", () => {
  const r = selectTeamWithCurrentSprint([]);
  assert.equal(r.ok, false);
  assert.equal(r.ambiguous, false);
  assert.deepEqual(r.matches, []);
});
test("selectTeamWithCurrentSprint: malformed matches (no iteration path) are ignored", () => {
  const r = selectTeamWithCurrentSprint([{ team: "X" }, { team: "Y", iteration: {} }, m("Z", "Proj\S1")]);
  assert.equal(r.ok, true);
  assert.equal(r.team, "Z", "only the well-formed match counts");
});
