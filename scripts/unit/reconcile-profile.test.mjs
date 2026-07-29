// Unit tests for the /project-init --check reconcile path
// (plugins/vc-fix/skills/project-init/reconcile-profile.mjs). Reconcile brings a STALE on-disk
// project-profile.json in line with the current schema (PROFILE_DEFAULTS): fill newly-ADDED plain
// fields with their safe default, DROP fields no longer in the schema, and leave the operator's
// existing answers UNTOUCHED. This is the one path that can silently clobber user values, so these
// tests pin the preserve/fill/drop contract.
//
// Deterministic — reconcile() is pure (the "rescan" managed fields are only REPORTED, never
// executed here), so no network/stubbing is needed. Drives the real script as a child process with
// VC_FIX_HOME pointed at a temp dir (reconcile reads/writes project-profile.json under outputRoot).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RECONCILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/skills/project-init/reconcile-profile.mjs");

function reconcile(home, args = []) {
  execFileSync(process.execPath, [RECONCILE, "--write", ...args], {
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
  });
  return JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
}

test("reconcile --write: preserves user answers, fills a missing plain default, drops an unknown field", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // A stale profile: NON-default user answers on plain + managed fields, an unknown legacy field,
    // and a MISSING plain block (buildVerify) to simulate a schema that gained a field since it was
    // written. (Defaults: projectType "platform", operator "virto-engineer", contributionMode
    // "fork", clientHost "github", selfDiagnostics true, feedback.mode "ask".)
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      operator: "client",
      tracker: { kind: "jira", projectKey: "ACME", baseUrl: "https://acme.atlassian.net" },
      vcs: { clientHost: "github", clientOrg: "acmecorp" },
      upstream: { contributionMode: "direct" },
      selfDiagnostics: false,   // managed (ask) but PRESENT with a user value → must survive
      feedback: { mode: "auto" }, // managed (ask) but PRESENT with a user value → must survive
      legacyRemovedField: "gone", // not in PROFILE_DEFAULTS → must be dropped
      // buildVerify intentionally omitted → reconcile must ADD it with its default
    }));

    const p = reconcile(home);

    // — user answers preserved verbatim —
    assert.equal(p.projectType, "client");
    assert.equal(p.operator, "client");
    assert.equal(p.tracker.projectKey, "ACME");
    assert.equal(p.tracker.baseUrl, "https://acme.atlassian.net");
    assert.equal(p.vcs.clientOrg, "acmecorp");
    assert.equal(p.upstream.contributionMode, "direct", "a non-default plain value must NOT be reset to the PROFILE_DEFAULTS 'fork'");
    // — managed (ask) fields present with a user value are kept, not re-defaulted —
    assert.equal(p.selfDiagnostics, false);
    assert.equal(p.feedback.mode, "auto");
    // — a newly-added plain default is filled —
    assert.ok(p.buildVerify && typeof p.buildVerify === "object", "a missing plain default block must be injected");
    // — an unknown/removed field is dropped —
    assert.equal(p.legacyRemovedField, undefined, "a field not in PROFILE_DEFAULTS must be pruned");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reconcile --write: a MISSING managed (ask) field is NOT silently defaulted — it stays pending until decided", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // An old profile predating the selfDiagnostics/feedback consent fields — both ABSENT.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "jira", projectKey: "ACME" },
      vcs: { clientHost: "github", clientOrg: "acmecorp" },
    }));

    // --set resolves the ask decision explicitly, mirroring how the /project-init skill folds the
    // operator's AskUserQuestion answer in. Without a decision the field is reported pending, not
    // guessed — so a plain --write must not fabricate a consent value.
    const p = reconcile(home, ["--set", "selfDiagnostics=false", "--set", "feedback.mode=off"]);
    assert.equal(p.selfDiagnostics, false, "the explicitly-decided ask value is applied");
    assert.equal(p.feedback.mode, "off");
    // sibling user answers still preserved through the reconcile
    assert.equal(p.projectType, "client");
    assert.equal(p.vcs.clientOrg, "acmecorp");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reconcile --write: refuses a mass-prune (>=5 removed) without --force; --force applies it", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // 5 unknown fields → removed.length >= REMOVE_GUARD (5). This usually means a leaner schema than
    // the one that wrote the profile — writing would strip live config, so it must refuse without --force.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      legacyA: 1, legacyB: 2, legacyC: 3, legacyD: 4, legacyE: 5,
    }));
    // Without --force: status needs-force, writes NOTHING.
    const out = execFileSync(process.execPath, [RECONCILE, "--write"], {
      encoding: "utf8", env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
    });
    const rep = JSON.parse(out);
    assert.equal(rep.status, "needs-force");
    assert.equal(rep.wrote, false);
    const unchanged = JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
    assert.equal(unchanged.legacyA, 1, "the profile is left UNCHANGED — the guard wrote nothing");
    // With --force: the prune is applied.
    const p = reconcile(home, ["--force"]);
    assert.equal(p.legacyA, undefined, "--force drops the obsolete fields");
    assert.equal(p.projectType, "client", "a real user value survives the forced prune");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reconcile --write: prunes the conditional azure blocks off-discriminator and adds them on", () => {
  // jira + github → tracker.azure / vcs.azure are NOT schema for this profile → a stale one is pruned
  // (and must NOT be re-added on every --check, which would churn the profile).
  const h1 = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    writeFileSync(join(h1, "project-profile.json"), JSON.stringify({
      tracker: { kind: "jira", projectKey: "ACME", azure: { organization: "stale-org" } },
      vcs: { clientHost: "github", clientOrg: "acme", azure: { organization: "stale" } },
    }));
    const p = reconcile(h1);
    assert.equal(p.tracker.azure, undefined, "tracker.azure pruned for a jira profile");
    assert.equal(p.vcs.azure, undefined, "vcs.azure pruned for a github profile");
    assert.equal(p.tracker.projectKey, "ACME", "the sibling user value survives the prune");
  } finally {
    rmSync(h1, { recursive: true, force: true });
  }
  // azure tracker + azure-repos host → the blocks ARE schema → added when missing.
  const h2 = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    writeFileSync(join(h2, "project-profile.json"), JSON.stringify({
      tracker: { kind: "azure", projectKey: "ACME" },
      vcs: { clientHost: "azure-repos", clientOrg: "acme" },
    }));
    const p = reconcile(h2);
    assert.ok(p.tracker.azure && typeof p.tracker.azure === "object", "tracker.azure added for an azure tracker");
    assert.ok(p.vcs.azure && typeof p.vcs.azure === "object", "vcs.azure added for an azure-repos host");
  } finally {
    rmSync(h2, { recursive: true, force: true });
  }
});

test("reconcile --write WITHOUT a --set decision leaves the consent fields ABSENT — never guesses (T2)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // Old profile predating the consent fields — selfDiagnostics + feedback ABSENT, and NO --set
    // decision provided. The security-critical contract: a plain --write must NOT fabricate a consent
    // value (a mutation doing `out[k] = managed.default` would set selfDiagnostics=true here). This is
    // the "leave pending until decided" branch the sibling test never exercises (it always --sets).
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "jira", projectKey: "ACME" },
      vcs: { clientHost: "github", clientOrg: "acmecorp" },
    }));
    const p = reconcile(home); // NO --set for the managed/ask consent fields
    assert.equal(p.selfDiagnostics, undefined, "capture consent must NOT be fabricated by a plain --write");
    assert.ok(!p.feedback || p.feedback.mode === undefined, "delivery consent must NOT be fabricated");
    assert.equal(p.projectType, "client"); // sibling answers still preserved through reconcile
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── `--set` into an OPEN MAP (VCST-5582 E-b) ──────────────────────────────────────
// The persistence mechanism for "which field is this process's Environment?", asked ONCE at the
// first bug creation. The open maps' KEYS are data — and an Azure field ref contains dots, so a
// naive split-on-every-dot would write {Custom:{Environment:"QA"}} instead of the flat key.
test("reconcile --set: a dotted FIELD REF lands as ONE key in an open map, not nested objects", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-openmap-"));
  try {
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "azure", azure: { organization: "acme", project: "Web" } },
    }));
    const p = reconcile(home, [
      "--set", "tracker.fieldDefaults.Custom.Environment=QA",
      "--set", "tracker.fieldMap.environment=Custom.Environment",
    ]);
    assert.deepEqual(p.tracker.fieldDefaults, { "Custom.Environment": "QA" }, "the ref is ONE flat key");
    assert.equal(p.tracker.fieldDefaults.Custom, undefined, "never split into nested objects");
    assert.deepEqual(p.tracker.fieldMap, { environment: "Custom.Environment" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reconcile: a discovered tracker.fields contract survives reconcile untouched (open map)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-contract-"));
  try {
    const contract = [{ ref: "Custom.Environment", name: "Environment", required: true, type: "string", allowedValues: ["QA", "PROD"] }];
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "azure", fields: { Bug: contract }, azure: { organization: "acme", project: "Web" } },
    }));
    const p = reconcile(home, ["--set", "selfDiagnostics=true"]);
    assert.deepEqual(p.tracker.fields.Bug, contract, "the scanned contract is DATA — never pruned as schema");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
