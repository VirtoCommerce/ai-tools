// The SessionStart platform-brain sync hook (VCST-5818).
//
// The decision this hook makes is pure and is tested as such — no remote, no clock: given
// a pin, the newest commit and a drift report, what should happen? The IO half (fetch,
// checkout, pin write) is thin by design, and its only hard requirement is the one
// asserted at the bottom: EVERY degenerate condition ends in exit 0 with no output. A
// session must never fail to start because a knowledge cache could not be refreshed.
//
// One decision worth stating plainly: on conflicts the pin advances anyway. The cache is
// pinned to a COMMIT, so there is no partial fast-forward — holding it back would freeze
// the whole platform layer because ONE client override went stale. What is held back is
// the DECISION about those overrides, which is knowledge about the deployment and the one
// thing this toolchain has no authority to guess.
//
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { HOOKS_DIR, withTempDir, hookModule } from "./_kb-helpers.mjs";

const { planSync, loadKnowledgeConfig, lastConsolidateAgeDays, DEFAULT_STALE_DAYS } = await hookModule("kb-sync.mjs");

const PIN = "a".repeat(40);
const LATEST = "b".repeat(40);
const driftWith = (verdicts) => ({ results: verdicts.map((v, i) => ({ id: "CL-X-" + i, verdict: v })) });

test("an unchanged pin says nothing at all", () => {
  const plan = planSync({ pin: PIN, latest: PIN, lastConsolidateDays: 1 });
  assert.equal(plan.action, "up-to-date");
  assert.equal(plan.contextLine, "", "a no-op must not spend a line of the operator's context");
});

test("a clean fast-forward bumps the pin and says so in one line", () => {
  const plan = planSync({ pin: PIN, latest: LATEST, drift: driftWith(["ok", "ok"]), lastConsolidateDays: 0 });
  assert.equal(plan.action, "fast-forward");
  assert.equal(plan.pin, LATEST);
  assert.deepEqual(plan.holdBack, []);
  assert.match(plan.contextLine, /^vc-fix kb: platform brain updated to bbbbbbbb/);
  assert.equal(plan.contextLine.split("\n").length, 1);
});

test("conflicting overrides are named for review, and everything else still updates", () => {
  const plan = planSync({ pin: PIN, latest: LATEST, drift: driftWith(["ok", "changed", "retired"]), lastConsolidateDays: 0 });
  assert.equal(plan.action, "fast-forward-with-review");
  assert.equal(plan.pin, LATEST, "the pin advances: a commit-pinned cache has no partial fast-forward");
  assert.deepEqual(plan.holdBack, ["CL-X-1", "CL-X-2"]);
  assert.match(plan.contextLine, /2 client override\(s\) need review/);
  assert.match(plan.contextLine, /CL-X-1, CL-X-2/);
  assert.match(plan.contextLine, /kb:drift/, "the operator is told how to see the detail");
});

test("a long review list is summarized rather than dumped", () => {
  const plan = planSync({ pin: PIN, latest: LATEST, drift: driftWith(["changed", "changed", "changed", "changed", "retired"]) });
  assert.equal(plan.holdBack.length, 5);
  assert.match(plan.contextLine, /and 2 more/);
});

test("no network keeps the current pin and stays silent", () => {
  const plan = planSync({ offline: true, pin: PIN, lastConsolidateDays: 1 });
  assert.equal(plan.action, "offline");
  assert.equal(plan.pin, PIN);
  assert.equal(plan.contextLine, "");
  assert.match(plan.reason, /could not be reached/);
});

test("a disabled knowledge block does nothing, including no consolidation", () => {
  const plan = planSync({ enabled: false, pin: PIN, latest: LATEST, lastConsolidateDays: 999 });
  assert.equal(plan.action, "disabled");
  assert.equal(plan.runConsolidate, false);
  assert.equal(plan.contextLine, "");
});

test("stale consolidation triggers the local fallback, and a fresh one does not", () => {
  assert.equal(planSync({ pin: PIN, latest: PIN, lastConsolidateDays: 30, staleDays: 7 }).runConsolidate, true);
  assert.equal(planSync({ pin: PIN, latest: PIN, lastConsolidateDays: 3, staleDays: 7 }).runConsolidate, false);
  assert.equal(planSync({ pin: PIN, latest: PIN, lastConsolidateDays: 7, staleDays: 7 }).runConsolidate, false, "exactly at the window is not yet stale");
  // Never consolidated at all: nothing has happened yet, so nothing is overdue.
  assert.equal(planSync({ pin: PIN, latest: PIN, lastConsolidateDays: null }).runConsolidate, false);
  // The fallback fires even offline — it is local work that needs no remote.
  assert.equal(planSync({ offline: true, pin: PIN, lastConsolidateDays: 30, staleDays: 7 }).runConsolidate, true);
  assert.equal(DEFAULT_STALE_DAYS, 7);
});

test("an empty latest is treated as up-to-date rather than as a fast-forward to nowhere", () => {
  assert.equal(planSync({ pin: PIN, latest: "" }).action, "up-to-date");
});

test("the knowledge config falls back to defaults on a missing or malformed profile", async () => {
  await withTempDir(async (dir) => {
    const missing = loadKnowledgeConfig(dir);
    assert.equal(missing.enabled, true);
    assert.equal(missing.staleDays, DEFAULT_STALE_DAYS);

    writeFileSync(join(dir, "project-profile.json"), "{ not json at all", "utf8");
    assert.equal(loadKnowledgeConfig(dir).enabled, true, "a malformed profile must not stop a session");

    writeFileSync(join(dir, "project-profile.json"), JSON.stringify({
      knowledge: { enabled: false, platformRoot: ".knowledge/platform", pin: PIN, consolidateStaleDays: 30 },
    }), "utf8");
    const cfg = loadKnowledgeConfig(dir);
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.pin, PIN);
    assert.equal(cfg.staleDays, 30);
    assert.equal(cfg.platformRoot, join(dir, ".knowledge/platform"));
  });
});

test("consolidation age is read from the newest digest, and is null when there is none", async () => {
  await withTempDir(async (dir) => {
    assert.equal(lastConsolidateAgeDays(dir), null);
    mkdirSync(join(dir, "digest"), { recursive: true });
    writeFileSync(join(dir, "digest", "old.json"), JSON.stringify({ at: "2026-08-01T00:00:00.000Z" }), "utf8");
    writeFileSync(join(dir, "digest", "new.json"), JSON.stringify({ at: "2026-08-20T00:00:00.000Z" }), "utf8");
    const now = Date.parse("2026-08-28T00:00:00.000Z");
    assert.equal(lastConsolidateAgeDays(dir, now), 8, "the NEWEST run is what counts");

    writeFileSync(join(dir, "digest", "broken.json"), "{ not json", "utf8");
    assert.equal(lastConsolidateAgeDays(dir, now), 8, "an unreadable digest is skipped, not fatal");
  });
});

test("the hook exits 0 and stays silent with no project, no cache and no remote", async () => {
  await withTempDir(async (dir) => {
    const script = join(HOOKS_DIR, "kb-sync.mjs");
    const run = (env) => execFileSync(process.execPath, [script], {
      cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
      env: Object.assign({}, process.env, { VC_FIX_HOME: dir }, env),
      input: JSON.stringify({ session_id: "s1", cwd: dir }),
    });
    assert.equal(run({}), "", "nothing onboarded yet — say nothing");
    assert.equal(run({ VC_FIX_KB_SYNC: "off" }), "", "and the env opt-out is silent too");

    // A knowledge root that exists but has no git remote: still silent, still exit 0.
    mkdirSync(join(dir, ".knowledge", "platform"), { recursive: true });
    writeFileSync(join(dir, ".knowledge", "platform", "brain.json"), JSON.stringify({ scope: "platform", readOnly: true }), "utf8");
    assert.equal(run({}), "", "no git repo, no remote, no network — fail open and quiet");
  });
});
