// Unit tests for `applyCaseJsonl` in scripts/regression/generate-regression-html-report.ts.
//
// This is the reader half of a writer change. The runner agents used to rewrite the whole
// `suite-{ID}-results.json` envelope after EVERY case, which is O(n²) as the payload grows —
// suite 050m (119 cases) cost roughly 7,000 case-entry writes, ~285k output tokens spent on
// bookkeeping rather than on testing. They now append one line per case to
// `suite-{ID}-cases.jsonl` and write the envelope once at the end.
//
// The live dashboard is the thing that could silently break: if the reporter does not fold the
// JSONL, an in-flight suite shows every case PENDING forever and the run looks frozen — which is
// exactly the symptom the watcher-ownership rules were written to stop. So the folding is tested
// directly, including the ugly cases (torn last line, unlisted case, retry).
//
// Run: `npx tsx --test scripts/unit/case-jsonl-fold.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCaseJsonl } from "../regression/generate-regression-html-report.ts";

const scratch = mkdtempSync(join(tmpdir(), "case-jsonl-"));
let seq = 0;

/** A pre-seeded, in-flight envelope: every case PENDING, `completedAt` empty. */
function seeded(ids: string[], completedAt = ""): Record<string, unknown> {
  return {
    suiteId: "042",
    suiteName: "Smoke Tests",
    completedAt,
    testCases: ids.map((id) => ({ id, title: `title ${id}`, status: "PENDING" })),
  };
}

/** Write a JSONL for suite 042 in a fresh dir and return that dir. */
function withJsonl(lines: string[]): string {
  const dir = join(scratch, `run${seq++}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "suite-042-cases.jsonl"), lines.join("\n") + "\n", "utf-8");
  return dir;
}

function statusOf(raw: Record<string, unknown>, id: string): string | undefined {
  const cases = raw.testCases as Array<Record<string, unknown>>;
  return cases.find((c) => c.id === id)?.status as string | undefined;
}

// ---- the core behaviour ------------------------------------------------------------

test("a JSONL row flips its PENDING placeholder", () => {
  const raw = seeded(["A-001", "A-002"]);
  const dir = withJsonl([JSON.stringify({ id: "A-001", status: "PASS", durationMs: 100 })]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal(statusOf(raw, "A-001"), "PASS");
  assert.equal(statusOf(raw, "A-002"), "PENDING", "a case not yet reached stays PENDING");
});

test("the placeholder's title survives when the row omits it", () => {
  const raw = seeded(["A-001"]);
  const dir = withJsonl([JSON.stringify({ id: "A-001", status: "FAIL" })]);
  applyCaseJsonl(raw, dir, "042");
  const c = (raw.testCases as Array<Record<string, unknown>>)[0];
  assert.equal(c.title, "title A-001", "a minimal row must not blank the seeded title");
  assert.equal(c.status, "FAIL");
});

test("evidence and trace fields carry through", () => {
  const raw = seeded(["A-001"]);
  const dir = withJsonl([
    JSON.stringify({
      id: "A-001",
      status: "FAIL",
      evidence: ["screenshots/A-001-FAIL.png"],
      trace: "traces/A-001-FAIL-trace.json",
    }),
  ]);
  applyCaseJsonl(raw, dir, "042");
  const c = (raw.testCases as Array<Record<string, unknown>>)[0];
  assert.deepEqual(c.evidence, ["screenshots/A-001-FAIL.png"]);
  assert.equal(c.trace, "traces/A-001-FAIL-trace.json");
});

// ---- the ugly cases ---------------------------------------------------------------

test("a torn final line is skipped, not fatal", () => {
  // A hard kill mid-append leaves a partial line. Losing the whole report over it would be
  // strictly worse than losing one case.
  const raw = seeded(["A-001", "A-002"]);
  const dir = withJsonl([
    JSON.stringify({ id: "A-001", status: "PASS" }),
    '{"id":"A-002","status":"PA',
  ]);
  assert.doesNotThrow(() => applyCaseJsonl(raw, dir, "042"));
  assert.equal(statusOf(raw, "A-001"), "PASS");
  assert.equal(statusOf(raw, "A-002"), "PENDING");
});

test("a case the envelope never listed is APPENDED, not dropped", () => {
  // A case that actually ran is more trustworthy than a plan that failed to mention it.
  const raw = seeded(["A-001"]);
  const dir = withJsonl([
    JSON.stringify({ id: "A-001", status: "PASS" }),
    JSON.stringify({ id: "A-099", status: "FAIL", title: "late addition" }),
  ]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal((raw.testCases as unknown[]).length, 2);
  assert.equal(statusOf(raw, "A-099"), "FAIL");
});

test("a later row wins — a retried case reports its final verdict", () => {
  const raw = seeded(["A-001"]);
  const dir = withJsonl([
    JSON.stringify({ id: "A-001", status: "FAIL" }),
    JSON.stringify({ id: "A-001", status: "PASS", notes: "passed on retry" }),
  ]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal(statusOf(raw, "A-001"), "PASS");
});

test("rows without an id are ignored", () => {
  const raw = seeded(["A-001"]);
  const dir = withJsonl([JSON.stringify({ status: "PASS" }), JSON.stringify({ id: 42, status: "PASS" })]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal(statusOf(raw, "A-001"), "PENDING");
  assert.equal((raw.testCases as unknown[]).length, 1);
});

// ---- when NOT to fold -------------------------------------------------------------

test("a COMPLETED envelope is authoritative — the JSONL is ignored", () => {
  // At Phase 5 the runner writes the final envelope with counts recomputed from the rows. A
  // stale JSONL must not be able to reopen a closed suite.
  const raw = seeded(["A-001"], "2026-08-26T10:00:00Z");
  (raw.testCases as Array<Record<string, unknown>>)[0].status = "FAIL";
  const dir = withJsonl([JSON.stringify({ id: "A-001", status: "PASS" })]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal(statusOf(raw, "A-001"), "FAIL", "the final envelope wins");
});

test("no JSONL present is a no-op, not an error", () => {
  const raw = seeded(["A-001"]);
  const dir = join(scratch, "empty-run");
  mkdirSync(dir, { recursive: true });
  assert.doesNotThrow(() => applyCaseJsonl(raw, dir, "042"));
  assert.equal(statusOf(raw, "A-001"), "PENDING");
});

test("an empty JSONL is a no-op", () => {
  const raw = seeded(["A-001"]);
  const dir = withJsonl([]);
  applyCaseJsonl(raw, dir, "042");
  assert.equal(statusOf(raw, "A-001"), "PENDING");
});

test("an envelope with no testCases array is handled", () => {
  const raw: Record<string, unknown> = { suiteId: "042", completedAt: "" };
  const dir = withJsonl([JSON.stringify({ id: "A-001", status: "PASS" })]);
  assert.doesNotThrow(() => applyCaseJsonl(raw, dir, "042"));
  assert.equal(statusOf(raw, "A-001"), "PASS", "the row is still recorded");
});
