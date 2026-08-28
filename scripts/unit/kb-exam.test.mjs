// The kb retrieval exam (VCST-5818) — the load-bearing structure of the autonomy layer.
//
// Once the human reviewer is out of the consolidation loop, the exam is the only thing
// measuring whether the corpus still ANSWERS. So its own failure modes matter more than
// most: a golden set that has quietly gone stale grades a hollow corpus as perfect, and a
// metric that cannot tell "the entry was buried" from "the entry is unreachable" hides
// which of two different diseases you have.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KB_FIXTURES, copyRoot, withTempDir, emptyRoot, kbModule } from "./_kb-helpers.mjs";

const { checkGoldens, runExam, compareMetrics, loadGoldens, appendHistory, readHistory, goldenTargets } =
  await kbModule("exam.mjs");

const PLATFORM = join(KB_FIXTURES, "platform");

/** Rewrite the goldens of a copied root. */
function setGoldens(root, goldens) {
  mkdirSync(join(root, "exam"), { recursive: true });
  writeFileSync(join(root, "exam", "goldens.json"), JSON.stringify({ schemaVersion: 1, goldens }, null, 2) + "\n", "utf8");
}

const codes = (errors) => errors.map((e) => e.code);

test("--check is green on a golden set that still matches the corpus", () => {
  const res = checkGoldens(PLATFORM, {});
  assert.deepEqual(res.errors, []);
  assert.equal(res.ok, true);
  assert.equal(res.checked, 4);
});

test("--check catches a golden pointing at an entry that does not exist", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    setGoldens(root, [{ id: "g1", q: "anything", expect: "BL-GONE-999", must: "whatever" }]);
    const res = checkGoldens(root, {});
    assert.equal(res.ok, false);
    assert.ok(codes(res.errors).includes("EXM-001"));
    assert.match(res.errors[0].message, /gone or was renumbered/);
  });
});

test("--check catches an entry that lost its must-marker — the set detects its own staleness", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    const file = join(root, "confirmed", "BL-AUTH-004.md");
    writeFileSync(file, readFileSync(file, "utf8").split("five consecutive failed").join("several failed"), "utf8");
    const res = checkGoldens(root, {});
    assert.equal(res.ok, false);
    const stale = res.errors.filter((e) => e.code === "EXM-002");
    assert.equal(stale.length, 1);
    assert.equal(stale[0].golden, "g-auth-lockout");
    assert.match(stale[0].message, /would now grade a hollow answer/);
  });
});

test("--check rejects a malformed or duplicated golden", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    setGoldens(root, [
      { id: "g1", q: "", expect: "BL-CART-010", must: "excludes tax" },
      { id: "g2", q: "a question", expect: "BL-CART-010", must: "excludes tax" },
      { id: "g2", q: "another", expect: "BL-CART-010", must: "excludes tax" },
    ]);
    const res = checkGoldens(root, {});
    assert.ok(codes(res.errors).includes("EXM-004"));
    assert.ok(codes(res.errors).includes("EXM-003"));
  });
});

test("an empty or missing golden set is an error, not a 100% score", async () => {
  await withTempDir(async (dir) => {
    const bare = emptyRoot(dir, { scope: "platform" });
    assert.ok(codes(loadGoldens(bare).errors).includes("EXM-005"));
    const root = copyRoot("platform", join(dir, "platform"));
    setGoldens(root, []);
    assert.ok(codes(loadGoldens(root).errors).includes("EXM-005"));
    assert.match(loadGoldens(root).errors.map((e) => e.message).join(" "), /scores 100% and gates nothing/);
  });
});

test("hit and MRR math on the fixture corpus", () => {
  const { metrics, perGolden } = runExam(PLATFORM, {});
  assert.equal(metrics.total, 4);
  assert.equal(metrics.hitAt1, 4);
  assert.equal(metrics.hitAt3, 4);
  assert.equal(metrics.hitAt5, 4);
  assert.equal(metrics.mrr, 1);
  assert.equal(metrics.hitRate, 1);
  assert.ok(perGolden.every((g) => g.rank === 1 && g.outcome === "hit"));
});

test('"found in the wrong place" and "not found at all" are counted separately', async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    setGoldens(root, [
      // Ranks below BL-CART-012 for this question: present, but buried — a RANKING problem.
      { id: "g-buried", q: "when is a minimum order quantity violation reported", expect: "FLOW-CHECKOUT-001", must: "order confirmation" },
      // No token of this question touches the entry at all — a COVERAGE problem.
      { id: "g-unreachable", q: "zzzqqq unrelated vocabulary nobody wrote down", expect: "BL-AUTH-004", must: "five consecutive failed" },
      { id: "g-hit", q: "does the cart show tax before a shipping address is entered", expect: "BL-CART-010", must: "excludes tax" },
    ]);
    const { metrics, perGolden } = runExam(root, {});
    assert.equal(metrics.total, 3);
    assert.equal(metrics.hitAt1, 1);
    assert.equal(metrics.wrongPlace, 1);
    assert.equal(metrics.notFound, 1);

    const buried = perGolden.find((g) => g.id === "g-buried");
    assert.equal(buried.outcome, "wrongPlace");
    assert.equal(buried.rank, 3);
    const unreachable = perGolden.find((g) => g.id === "g-unreachable");
    assert.equal(unreachable.outcome, "notFound");
    assert.equal(unreachable.rank, null);
    // MRR over ranks 3, 1 and a miss.
    assert.equal(metrics.mrr, Math.round(((1 / 3 + 1 + 0) / 3) * 10000) / 10000);
  });
});

test("compareMetrics flags any fall in hits, MRR, or the notFound count", () => {
  const before = { k: 5, hitAt1: 4, hitAt3: 4, hitAt5: 4, mrr: 1, notFound: 0 };
  assert.equal(compareMetrics(before, before).regressed, false);
  assert.equal(compareMetrics(before, { ...before, hitAt1: 3 }).regressed, true);
  assert.equal(compareMetrics(before, { ...before, mrr: 0.9 }).regressed, true);
  assert.equal(compareMetrics(before, { ...before, notFound: 1 }).regressed, true);
  // An improvement is never a regression.
  assert.equal(compareMetrics({ ...before, hitAt1: 2, mrr: 0.7 }, before).regressed, false);
  assert.match(compareMetrics(before, { ...before, hitAt1: 3 }).reasons.join(" "), /hitAt1 fell 4 -> 3/);
});

test("a golden follows a supersede pointer — an identity migration the corpus itself declares", () => {
  const byId = new Map([
    ["A-1", { id: "A-1", supersededBy: "A-2" }],
    ["A-2", { id: "A-2", supersededBy: "A-3" }],
    ["A-3", { id: "A-3" }],
  ]);
  assert.deepEqual(goldenTargets("A-1", byId), ["A-1", "A-2", "A-3"]);
  assert.deepEqual(goldenTargets("A-3", byId), ["A-3"]);
  // A cycle must terminate rather than hang the exam.
  const cyclic = new Map([["B-1", { id: "B-1", supersededBy: "B-2" }], ["B-2", { id: "B-2", supersededBy: "B-1" }]]);
  assert.deepEqual(goldenTargets("B-1", cyclic), ["B-1", "B-2"]);
});

test("a superseded entry keeps its golden satisfied through the replacement", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    const oldFile = join(root, "confirmed", "BL-AUTH-004.md");
    writeFileSync(oldFile, readFileSync(oldFile, "utf8").replace("status: active", "status: superseded\nsupersededBy: BL-AUTH-005"), "utf8");
    writeFileSync(join(root, "confirmed", "BL-AUTH-005.md"), [
      "---", "id: BL-AUTH-005", "title: An account locks after three consecutive failed sign-in attempts",
      "scope: platform", "kind: invariant", 'appliesTo: "*"', "relation: new", "status: active",
      "tags: [auth, lockout]", "audited:", "  date: 2026-08-28", "  source: source", "  ref: repo/file.cs:1",
      "supersedes: BL-AUTH-004", "---", "", "Three consecutive failed sign-in attempts lock the account.", "",
    ].join("\n"), "utf8");

    const { metrics, perGolden } = runExam(root, {});
    const g = perGolden.find((x) => x.id === "g-auth-lockout");
    assert.equal(g.rank, 1);
    assert.equal(g.matchedId, "BL-AUTH-005", "the golden names the knowledge; supersede is a declared redirect");
    assert.equal(metrics.hitAt1, 4);
  });
});

test("history is appended one line per run and read back", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"));
    assert.deepEqual(readHistory(root), []);
    appendHistory(root, { runId: "r1", metrics: { hitAt1: 4 } });
    appendHistory(root, { runId: "r2", metrics: { hitAt1: 3 } });
    const history = readHistory(root);
    assert.equal(history.length, 2);
    assert.equal(history[1].runId, "r2");
  });
});
