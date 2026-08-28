// The autonomous consolidation pipeline (VCST-5818) — the whole autonomy layer.
//
// Five mechanical gates replace the human reviewer, and each one is proven here against a
// real corpus rather than asserted: the evidence bar, supersede-with-quote, the layer
// guard, the quarantine threshold, and the exam gate with auto-revert.
//
// The exam-gate test runs in an ACTUAL temporary git repository and asserts on real
// commits, because the revert is a `git revert` — a stubbed git would prove only that the
// code calls a function, not that the corpus ends up where it started. It also asserts the
// drafts come BACK: an entry the gate rejects must return to drafts/, not evaporate.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { copyRoot, withTempDir, initGitRepo, observation, emptyRoot, kbModule } from "./_kb-helpers.mjs";

const { consolidate, planBatch, evidenceBar, layerCounts, daysBetween, DEFAULT_QUARANTINE_THRESHOLD } =
  await kbModule("consolidate.mjs");
const { capture, readTombstones } = await kbModule("capture.mjs");
const { parseEntry } = await kbModule("entry.mjs");
const { KbContainmentError } = await kbModule("kb-paths.mjs");

const NOW = "2026-08-28";
/** Tolerate a missing directory: nothing captured (or nothing confirmed) yet is zero, not a crash. */
const listMd = (dir) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".md"));
const drafts = (root) => listMd(join(root, "drafts"));
const confirmed = (root) => listMd(join(root, "confirmed"));

/** A writable brain seeded from the platform fixture, in a real git repo. */
function brain(dir, scope = "platform") {
  const root = copyRoot("platform", join(dir, "brain"), { scope, readOnly: false });
  const git = initGitRepo(root);
  return { root, git };
}

/** A platform-scope observation that satisfies the evidence bar. */
const good = (overrides) => observation(Object.assign({ scope: "platform", evidence: { method: "live", at: "2026-08-27", ref: "run/1" } }, overrides));

test("the evidence bar routes on evidence, freshness and triangulation", () => {
  const base = { evidence: { method: "live", at: "2026-08-27", ref: "run/1" }, triangulation: ["live", "source"] };
  assert.equal(evidenceBar(base, { now: NOW }).pass, true);

  const noEvidence = evidenceBar({ triangulation: ["live", "docs"] }, { now: NOW });
  assert.equal(noEvidence.pass, false);
  assert.match(noEvidence.reasons[0], /no environment to verify a claim in/);

  const stale = evidenceBar({ ...base, evidence: { method: "live", at: "2026-01-01", ref: "r" } }, { now: NOW });
  assert.equal(stale.pass, false);
  assert.match(stale.reasons[0], /days old/);

  const oneAxis = evidenceBar({ ...base, triangulation: ["live"] }, { now: NOW });
  assert.equal(oneAxis.pass, false);
  assert.match(oneAxis.reasons[0], /one axis is an observation, not a confirmed fact/);

  // Two mentions of the same axis are ONE axis.
  assert.equal(evidenceBar({ ...base, triangulation: ["live", "live"] }, { now: NOW }).pass, false);
  // A clock that disagrees with itself is not trusted.
  assert.equal(evidenceBar({ ...base, evidence: { method: "live", at: "2026-12-01", ref: "r" } }, { now: NOW }).pass, false);
  assert.equal(daysBetween("2026-08-01", "2026-08-28"), 27);
});

test("a passing draft is applied and a failing one is HELD, not deleted", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    capture(root, good({ kind: "quirk", subject: "cart-coupon", claim: "An expired coupon shows a generic error instead of naming the expiry" }), { now: NOW });
    const held = capture(root, good({ kind: "quirk", subject: "search-facets", claim: "Search facets collapse on a narrow viewport", triangulation: ["live"] }), { now: NOW });

    const digest = consolidate(root, { runId: "run-1", now: NOW });
    assert.equal(digest.counts.applied, 1);
    assert.equal(digest.counts.held, 1);
    assert.equal(digest.exam.reverted, false);

    assert.ok(existsSync(join(root, "drafts", held.fingerprint + ".md")), "a held draft stays visible as unverified, and can pass on a later run");
    assert.equal(readTombstones(root).tombstones[held.fingerprint], undefined, "a held draft is NOT tombstoned — it was never settled");
  });
});

test("processed drafts are deleted and their fingerprints kept as tombstones", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    const a = capture(root, good({ kind: "flow", subject: "wishlist", claim: "A wishlist can be shared by link with any contact of the same organization" }), { now: NOW });
    const digest = consolidate(root, { runId: "run-1", now: NOW });

    assert.equal(digest.counts.applied, 1);
    assert.equal(drafts(root).length, 0);
    const t = readTombstones(root).tombstones[a.fingerprint];
    assert.equal(t.disposition, "applied");
    assert.equal(t.runId, "run-1");
    assert.ok(t.id.startsWith("KB-FLO-"));

    // The tombstone is what stops a settled observation coming back.
    assert.equal(capture(root, good({ kind: "flow", subject: "wishlist", claim: "wishlists can be shared by link with any contact of the same organization" }), { now: NOW }).outcome, "tombstoned");
  });
});

test("a promoted entry is a valid confirmed entry carrying its provenance", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    const res = capture(root, good({ kind: "invariant", subject: "quote-expiry", claim: "A quote expires thirty days after it is issued", tags: ["quotes"], appliesTo: ">=3.900.0" }), { now: NOW });
    consolidate(root, { runId: "run-1", now: NOW });

    const file = confirmed(root).find((f) => f.startsWith("KB-INV-"));
    const { entry, errors } = parseEntry(readFileSync(join(root, "confirmed", file), "utf8"), { file });
    assert.deepEqual(errors, []);
    assert.equal(entry.status, "active");
    assert.equal(entry.relation, "new");
    assert.equal(entry.appliesTo, ">=3.900.0");
    assert.deepEqual(entry.audited, { date: "2026-08-27", source: "live", ref: "run/1" });
    assert.equal(entry.fingerprint, res.fingerprint, "the entry stays traceable to the observation it came from");
    assert.equal(entry.runId, "run-1");
  });
});

test("an id is minted from max+1 across every file, so a retired id is never reused", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    // A retired entry occupying KB-QRK-007: minting must step over it, not recycle it.
    writeFileSync(join(root, "confirmed", "KB-QRK-007.md"), [
      "---", "id: KB-QRK-007", "title: A retired quirk", "scope: platform", "kind: quirk",
      'appliesTo: "*"', "relation: new", "status: retired", "retiredReason: the control was removed",
      "audited:", "  date: 2026-01-01", "  source: live", "  ref: old/run", "---", "", "Body.", "",
    ].join("\n"), "utf8");
    capture(root, good({ kind: "quirk", subject: "new-quirk", claim: "Something new and quirky happens on this page" }), { now: NOW });

    const digest = consolidate(root, { runId: "run-1", now: NOW });
    assert.equal(digest.applied[0].id, "KB-QRK-008");
    assert.ok(existsSync(join(root, "confirmed", "KB-QRK-007.md")), "the retired entry keeps its file and its id");
  });
});

test("a contradiction supersedes with a quote — the old entry keeps its file, id and body", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    capture(root, good({
      kind: "invariant", subject: "cart-tax", proposedId: "BL-CART-010",
      title: "Cart total now includes an estimated tax line before an address is known",
      claim: "The cart shows an estimated tax line from the store default jurisdiction before any address is entered",
    }), { now: NOW });

    const digest = consolidate(root, { runId: "run-s", now: NOW });
    assert.equal(digest.counts.superseded, 1);
    assert.equal(digest.superseded[0].oldId, "BL-CART-010");
    const newId = digest.superseded[0].newId;

    const old = parseEntry(readFileSync(join(root, "confirmed", "BL-CART-010.md"), "utf8"), { file: "old" }).entry;
    assert.equal(old.status, "superseded");
    assert.equal(old.supersededBy, newId);
    assert.match(old.body, /excludes tax from the grand total/, "supersede never deletes: the old wording is still readable");

    const fresh = parseEntry(readFileSync(join(root, "confirmed", newId + ".md"), "utf8"), { file: "new" }).entry;
    assert.equal(fresh.supersedes, "BL-CART-010");
    assert.match(fresh.quotes, /excludes tax from the grand total/, 'the replacement quotes what it replaced, so "was it applied?" is a string comparison');
  });
});

test("a draft that merely restates a confirmed entry is settled, not promoted", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    const res = capture(root, good({
      kind: "invariant", subject: "auth-lockout", proposedId: "BL-AUTH-004",
      claim: "The account is locked after five consecutive failed sign-in attempts and stays locked for fifteen minutes. A successful sign-in resets the counter.",
    }), { now: NOW });

    const digest = consolidate(root, { runId: "run-1", now: NOW });
    assert.equal(digest.counts.rejected, 1);
    assert.equal(digest.counts.applied, 0);
    assert.match(digest.rejected[0].reason, /restates confirmed entry BL-AUTH-004/);
    assert.equal(readTombstones(root).tombstones[res.fingerprint].disposition, "rejected");
    assert.equal(drafts(root).length, 0, "settled means settled — it stops coming back");
  });
});

test("a batch larger than the quarantine threshold applies NOTHING and says why", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    for (let i = 0; i < 5; i++) {
      capture(root, good({ kind: "quirk", subject: "subject-" + i, claim: "Observation number " + i + " about a distinctly different page area" }), { now: NOW });
    }
    const before = confirmed(root).length;
    const digest = consolidate(root, { runId: "run-q", now: NOW, threshold: 3 });

    assert.equal(digest.quarantined.triggered, true);
    assert.equal(digest.quarantined.changes, 5);
    assert.match(digest.quarantined.reason, /exceeds the quarantine threshold of 3/);
    assert.equal(digest.counts.applied, 0);
    assert.equal(confirmed(root).length, before, "quarantine means nothing landed");
    assert.equal(drafts(root).length, 5, "and nothing was consumed either");
    assert.equal(DEFAULT_QUARANTINE_THRESHOLD, 20);
  });
});

test("a root with no goldens gets no autonomy — the batch is held rather than applied ungated", async () => {
  await withTempDir(async (dir) => {
    const root = emptyRoot(dir, { scope: "client", readOnly: false });
    mkdirSync(join(root, "confirmed"), { recursive: true });
    initGitRepo(root);
    capture(root, observation(), { now: NOW });

    const digest = consolidate(root, { runId: "run-1", now: NOW });
    assert.equal(digest.quarantined.triggered, true);
    assert.match(digest.quarantined.reason, /the exam gate cannot measure/);
    assert.equal(digest.exam.gated, false);
    assert.equal(digest.counts.applied, 0);
    assert.equal(drafts(root).length, 1);
  });
});

test("the exam gate auto-reverts a degrading batch in a real git repo, and the drafts come back", async () => {
  await withTempDir(async (dir) => {
    const { root, git } = brain(dir);

    // Round 1: a harmless entry lands, and the exam is unchanged.
    const kept = capture(root, good({ kind: "quirk", subject: "cart-coupon", claim: "An expired coupon shows a generic error instead of naming the expiry" }), { now: NOW });
    const first = consolidate(root, { runId: "run-1", now: NOW });
    assert.equal(first.counts.applied, 1);
    assert.equal(first.exam.reverted, false);
    assert.ok(first.commit, "the batch is ONE commit, so the gate can revert it as a unit");
    const commitsAfterFirst = git.log().length;

    // Round 2: an entry engineered to outrank the lockout golden — retrieval gets worse.
    const bad = capture(root, good({
      kind: "invariant", subject: "auth-lockout-note", tags: ["auth", "lockout"],
      title: "how many failed sign-in attempts lock an account",
      claim: "how many failed sign-in attempts lock an account is a question about lockout attempts sign-in failed account",
    }), { now: NOW });

    const digest = consolidate(root, { runId: "run-2", now: NOW });
    assert.equal(digest.exam.regressed, true);
    assert.equal(digest.exam.reverted, true);
    assert.match(digest.exam.reasons.join("; "), /hitAt1 fell|MRR fell/);
    assert.equal(digest.counts.applied, 0, "a reverted batch reports nothing as applied");

    // The corpus is exactly where it started, and the observation is back in drafts.
    assert.ok(existsSync(join(root, "drafts", bad.fingerprint + ".md")), "the rejected entry returns to drafts/ rather than evaporating");
    assert.equal(confirmed(root).filter((f) => f.startsWith("KB-INV-")).length, 0, "the degrading entry is gone from confirmed/");
    assert.ok(existsSync(join(root, "confirmed", "KB-QRK-001.md")), "round 1's entry is untouched — only THIS batch was reverted");
    assert.ok(readTombstones(root).tombstones[kept.fingerprint], "and its tombstone survives");
    assert.equal(readTombstones(root).tombstones[bad.fingerprint], undefined, "the reverted observation is not tombstoned, so it can be re-examined");

    // The revert is a real commit on top, not a rewrite of history.
    assert.ok(git.log().length > commitsAfterFirst);
    assert.match(git.git("log", "-1", "--pretty=%s"), /Revert/);
    assert.equal(git.git("status", "--porcelain", "--untracked-files=no").trim(), "", "the working tree is clean after the revert");
  });
});

test("the digest records what happened, and is written to the root", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    capture(root, good({ kind: "quirk", subject: "cart-coupon", claim: "An expired coupon shows a generic error instead of naming the expiry" }), { now: NOW });
    capture(root, good({ kind: "quirk", subject: "search-facets", claim: "Search facets collapse on a narrow viewport", triangulation: ["docs"] }), { now: NOW });
    const digest = consolidate(root, { runId: "run-d", now: NOW });

    assert.equal(digest.runId, "run-d");
    assert.deepEqual(Object.keys(digest.counts).sort(), ["applied", "drafts", "held", "rejected", "superseded"]);
    assert.equal(digest.counts.drafts, 2);
    assert.equal(digest.applied[0].kind, "quirk");
    assert.ok(digest.held[0].reasons.length);
    assert.ok(digest.exam.before && digest.exam.after);
    assert.equal(digest.layerGuard.ok, true);

    const onDisk = JSON.parse(readFileSync(join(root, "digest", "run-d.json"), "utf8"));
    assert.equal(onDisk.runId, "run-d");
    assert.equal(onDisk.counts.applied, 1);
  });
});

test("a dry run plans everything and writes nothing", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    capture(root, good({ kind: "quirk", subject: "cart-coupon", claim: "An expired coupon shows a generic error instead of naming the expiry" }), { now: NOW });
    const before = confirmed(root).length;

    const digest = consolidate(root, { runId: "run-dry", now: NOW, dryRun: true });
    assert.equal(digest.counts.applied, 1);
    assert.equal(confirmed(root).length, before);
    assert.equal(drafts(root).length, 1);
    assert.equal(existsSync(join(root, "digest", "run-dry.json")), false);
  });
});

test("planBatch is deterministic — the same drafts mint the same ids", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    capture(root, good({ kind: "quirk", subject: "a-subject", claim: "First distinct observation about one page area" }), { now: NOW });
    capture(root, good({ kind: "quirk", subject: "b-subject", claim: "Second distinct observation about another page area" }), { now: NOW });
    const one = planBatch(root, { now: NOW, runId: "r" }).applied.map((a) => [a.fingerprint, a.id]);
    const two = planBatch(root, { now: NOW, runId: "r" }).applied.map((a) => [a.fingerprint, a.id]);
    assert.deepEqual(one, two);
  });
});

test("the layer guard measures confirmed entries per scope", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    assert.deepEqual(layerCounts(root), { platform: 6 });
    capture(root, good({ kind: "quirk", subject: "cart-coupon", claim: "An expired coupon shows a generic error instead of naming the expiry" }), { now: NOW });
    consolidate(root, { runId: "run-1", now: NOW });
    assert.deepEqual(layerCounts(root), { platform: 7 }, "consolidation only ever adds or supersedes; a fall is a bug, which is what the guard catches");
  });
});

test("a read-only root refuses consolidation outright", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "brain"), { scope: "platform", readOnly: true });
    assert.throws(() => consolidate(root, { runId: "run-1", now: NOW }), KbContainmentError);
  });
});

test("with no drafts the run is a no-op that says so", async () => {
  await withTempDir(async (dir) => {
    const { root } = brain(dir);
    const digest = consolidate(root, { runId: "run-0", now: NOW });
    assert.equal(digest.counts.drafts, 0);
    assert.equal(digest.counts.applied, 0);
    assert.match(digest.note, /nothing passed the evidence bar/);
  });
});
