// The kb capture layer (VCST-5818): fingerprint dedup, tombstones, evidence, containment.
//
// Capture is where the pipeline's honesty starts. Three of its properties are load-bearing
// and each is asserted below rather than trusted:
//
//   DEDUP ACROSS PHRASINGS. Two agents describing the same fact in different words must
//   land on ONE draft with count 2, not two rival drafts that both later pass the evidence
//   bar and become two confirmed entries saying the same thing.
//
//   TOMBSTONES ARE FINAL. A settled fingerprint cannot be resurrected. Without this, a
//   rejected observation returns every run and the evidence bar re-litigates it forever.
//
//   EVIDENCE AT CAPTURE TIME. Consolidation runs later in a container with no browser and
//   no environment, so an observation with no evidence block can never be checked. It is
//   refused here, where the agent still has the environment in front of it.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { KB_FIXTURES, copyRoot, withTempDir, observation, kbModule } from "./_kb-helpers.mjs";

const { capture, buildDraft, readTombstones, tombstone, OBSERVATION_CAP } = await kbModule("capture.mjs");
const { fingerprint, claimTokens, normalizeSubject, fingerprintParts } = await kbModule("fingerprint.mjs");
const { parseEntry } = await kbModule("entry.mjs");
const { KbContainmentError } = await kbModule("kb-paths.mjs");

/** Drafts on disk. Tolerates a missing directory: nothing captured yet is zero drafts, not a crash. */
const draftsOf = (root) => (existsSync(join(root, "drafts")) ? readdirSync(join(root, "drafts")) : []).filter((f) => f.endsWith(".md"));

test("the fingerprint survives rephrasing but separates different knowledge", () => {
  const base = { kind: "invariant", scope: "platform", subject: "cart-tax" };
  const a = fingerprint({ ...base, claim: "The cart total excludes tax until an address is known" });
  const b = fingerprint({ ...base, claim: "cart totals exclude the tax until an address is known" });
  assert.equal(a, b, "plural, article and word order must not fork a draft");

  // A different subject, kind or scope is different knowledge with a different lifetime.
  assert.notEqual(a, fingerprint({ ...base, subject: "checkout-tax", claim: "The cart total excludes tax until an address is known" }));
  assert.notEqual(a, fingerprint({ ...base, kind: "quirk", claim: "The cart total excludes tax until an address is known" }));
  assert.notEqual(a, fingerprint({ ...base, scope: "client", claim: "The cart total excludes tax until an address is known" }));
  // A negation is NOT a rephrasing — "not"/"never" are deliberately kept out of the stopword list.
  assert.notEqual(a, fingerprint({ ...base, claim: "The cart total does not exclude tax until an address is known" }));
});

test("the fingerprint is stable, 16 hex chars, and reports what it saw", () => {
  const obs = observation();
  assert.match(fingerprint(obs), /^[0-9a-f]{16}$/);
  assert.equal(fingerprint(obs), fingerprint(obs));
  const parts = fingerprintParts(obs);
  assert.equal(parts.subject, "checkout-payment");
  assert.equal(parts.fingerprint, fingerprint(obs));
  assert.equal(normalizeSubject("Checkout / Payment!"), "checkout-payment");
  assert.deepEqual(claimTokens("The carts, the addresses"), ["address", "cart"]);
});

test("a repeat observation increments count instead of creating a second file", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("client", join(dir, "client"));
    const first = capture(root, observation(), { now: "2026-08-28" });
    assert.equal(first.outcome, "created");
    assert.equal(first.count, 1);

    const second = capture(root, observation({
      subject: "Checkout Payment",
      claim: "Place order buttons stay disabled until billing addresses are confirmed",
      evidence: { method: "live", at: "2026-08-29", ref: "acme/run-10/CHK-014" },
    }), { now: "2026-08-29" });
    assert.equal(second.outcome, "deduped");
    assert.equal(second.count, 2);
    assert.equal(second.fingerprint, first.fingerprint);
    assert.equal(draftsOf(root).length, 1);

    const { entry, errors } = parseEntry(readFileSync(second.file, "utf8"), { file: "d.md", profile: "draft" });
    assert.deepEqual(errors, []);
    assert.equal(entry.count, 2);
    assert.equal(entry.firstSeen, "2026-08-28");
    assert.equal(entry.lastSeen, "2026-08-29", "the freshest sighting is what the evidence-freshness bar reads");
    assert.equal(entry.evidence.ref, "acme/run-10/CHK-014");
    assert.equal(entry.observations.length, 2, "every distinct phrasing is kept, so a wrong merge is visible");
  });
});

test("the kept-phrasing list is capped, and says so rather than truncating silently", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("client", join(dir, "client"));
    for (let i = 0; i < OBSERVATION_CAP + 3; i++) {
      // Same token bag, different surface wording: extra articles are stopwords, so they
      // change the raw phrasing without changing what is hashed.
      capture(root, observation({ claim: "the ".repeat(i) + "place order button stays disabled until a billing address is confirmed" }), { now: "2026-08-28" });
    }
    assert.equal(draftsOf(root).length, 1, "every rephrasing must land on the SAME draft");
    const file = join(root, "drafts", draftsOf(root)[0]);
    const { entry } = parseEntry(readFileSync(file, "utf8"), { file: "d.md", profile: "draft" });
    assert.ok(entry.count >= OBSERVATION_CAP);
    assert.equal(entry.observations.length, OBSERVATION_CAP);
    assert.match(entry.observations[OBSERVATION_CAP - 1], /capped at/);
  });
});

test("a settled fingerprint cannot be resurrected by seeing it again", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("client", join(dir, "client"));
    const obs = observation();
    const fp = fingerprint(obs);
    tombstone(root, fp, { disposition: "rejected", runId: "run-1", at: "2026-08-20" });

    const res = capture(root, obs, { now: "2026-08-28" });
    assert.equal(res.outcome, "tombstoned");
    assert.match(res.reason, /already settled \(rejected by run-1\)/);
    assert.equal(draftsOf(root).length, 0, "a tombstoned observation writes nothing at all");
    assert.ok(readTombstones(root).tombstones[fp]);
  });
});

test("an observation with no evidence block is refused where the environment still exists", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("client", join(dir, "client"));
    const res = capture(root, { kind: "quirk", scope: "client", subject: "checkout", claim: "something happened" }, { now: "2026-08-28" });
    assert.equal(res.outcome, "rejected");
    assert.ok(res.errors.some((e) => e.code === "KBE-012" || e.code === "KBE-001"));
    assert.match(res.reason, /no environment to check it in/);
    assert.equal(draftsOf(root).length, 0);
  });
});

test("the evidence block shape is enforced field by field", () => {
  const bad = (evidence) => buildDraft(observation({ evidence }), { now: "2026-08-28" }).errors.map((e) => e.code);
  assert.ok(bad({ method: "live", at: "2026-08-27" }).includes("KBE-012"), "ref is required");
  assert.ok(bad({ method: "live", at: "yesterday", ref: "r" }).includes("KBE-012"), "at must be a date stamp");
  assert.ok(bad({ method: "hunch", at: "2026-08-27", ref: "r" }).includes("KBE-012"), "method is a closed vocabulary");
  assert.deepEqual(buildDraft(observation(), { now: "2026-08-28" }).errors, []);
});

test("a read-only root refuses every write — the boundary is in the data, not the caller", async () => {
  await withTempDir(async (dir) => {
    // The fixture platform root ships readOnly:true, exactly like a pinned platform cache.
    assert.throws(() => capture(join(KB_FIXTURES, "platform"), observation(), { now: "2026-08-28" }), (err) => {
      assert.ok(err instanceof KbContainmentError);
      assert.match(err.message, /readOnly:true/);
      return true;
    });
    // And a directory that is not a knowledge root at all is refused too.
    assert.throws(() => capture(dir, observation(), { now: "2026-08-28" }), KbContainmentError);
  });
});

test("a client-scope observation is refused by a platform brain even when it is writable", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("platform", join(dir, "platform"), { scope: "platform", readOnly: false });
    assert.throws(() => capture(root, observation({ scope: "client" }), { now: "2026-08-28" }), (err) => {
      assert.ok(err instanceof KbContainmentError);
      assert.match(err.message, /promotion contract/);
      return true;
    });
    // A platform-scope observation into the same root is fine.
    assert.equal(capture(root, observation({ scope: "platform" }), { now: "2026-08-28" }).outcome, "created");
  });
});

test("a created draft is a valid draft-profile entry on disk", async () => {
  await withTempDir(async (dir) => {
    const root = copyRoot("client", join(dir, "client"));
    const res = capture(root, observation({ tags: ["checkout", "billing"], proposedId: "CL-CHK-020" }), { now: "2026-08-28" });
    assert.equal(res.outcome, "created");
    assert.ok(existsSync(res.file));
    const { entry, errors } = parseEntry(readFileSync(res.file, "utf8"), { file: "d.md", profile: "draft" });
    assert.deepEqual(errors, []);
    assert.equal(entry.status, "draft");
    assert.equal(entry.proposedId, "CL-CHK-020");
    assert.equal(entry.id, undefined, "a draft has no id — ids are minted only when knowledge is confirmed");
    assert.deepEqual(entry.tags, ["billing", "checkout"]);
    assert.deepEqual(entry.triangulation, ["live", "source"]);
  });
});
