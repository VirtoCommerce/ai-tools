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

test("reconcile --write: the MISSING managed (ask) selfDiagnostics stays pending; feedback fills as a safe default (item 4)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // An old profile predating the consent fields — both ABSENT.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "jira", projectKey: "ACME" },
      vcs: { clientHost: "github", clientOrg: "acmecorp" },
    }));

    // selfDiagnostics is STILL a managed (ask) capture opt-in — --set folds the operator's answer in.
    // feedback.mode is NO LONGER managed (PR #172 item 4): it fills silently from PROFILE_DEFAULTS
    // ("ask") and is never a pending decision. --check no longer asks it.
    const p = reconcile(home, ["--set", "selfDiagnostics=false"]);
    assert.equal(p.selfDiagnostics, false, "the explicitly-decided capture opt-in is applied");
    assert.equal(p.feedback.mode, "ask", "delivery consent fills as a safe default, not a pending ask");
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

test("reconcile --write WITHOUT a --set decision leaves the CAPTURE opt-in ABSENT; delivery consent safe-defaults (item 4)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // Old profile predating the consent fields — selfDiagnostics + feedback ABSENT, and NO --set.
    // selfDiagnostics is the CAPTURE opt-in and stays managed/ask: a plain --write must NOT fabricate
    // it (a mutation doing `out[k] = managed.default` would set selfDiagnostics=true — fail-open).
    // feedback.mode is the DELIVERY consent and is now a plain safe default (PR #172 item 4): it fills
    // to "ask" — which is fail-SAFE (a per-finding offer + explicit yes, never an unattended send).
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "jira", projectKey: "ACME" },
      vcs: { clientHost: "github", clientOrg: "acmecorp" },
    }));
    const p = reconcile(home); // NO --set
    assert.equal(p.selfDiagnostics, undefined, "capture consent must NOT be fabricated by a plain --write");
    assert.equal(p.feedback.mode, "ask", "delivery consent fills to the fail-safe 'ask', not a fabricated 'auto'");
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

test("reconcile --print: an Azure profile with an EMPTY tracker.fields is reported under rescan (E5)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-rescan-"));
  try {
    // A profile whose Azure scan predates the `$expand=all` fix (E1) — tracker.fields is empty, so
    // /qa-bug would send the legacy "unverified defaults" field set. --check must surface it under
    // `rescan` so the skill re-derives the contract without a full re-onboarding.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      tracker: { kind: "azure", fields: {}, azure: { organization: "acme", project: "Web" } },
    }));
    const out = execFileSync(process.execPath, [RECONCILE, "--print"], {
      encoding: "utf8",
      env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
    });
    const report = JSON.parse(out);
    assert.ok(
      report.rescan.some((r) => r.path === "tracker.fields" && r.source === "discover-tracker"),
      "an empty Azure tracker.fields must be listed under rescan",
    );
    assert.equal(report.status, "changes", "a pending rescan makes the profile 'changes', not 'current'");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("reconcile --print: a POPULATED tracker.fields is NOT flagged for rescan, and Jira never is", () => {
  const run = (profile, dir) => {
    const home = mkdtempSync(join(tmpdir(), dir));
    try {
      writeFileSync(join(home, "project-profile.json"), JSON.stringify(profile));
      const out = execFileSync(process.execPath, [RECONCILE, "--print"], {
        encoding: "utf8",
        env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
      });
      return JSON.parse(out);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };
  const azurePopulated = run({
    projectType: "client",
    tracker: { kind: "azure", fields: { Bug: [{ ref: "System.Title", name: "Title", required: true, type: "string" }] }, azure: { organization: "acme", project: "Web" } },
  }, "vc-fix-reconcile-populated-");
  assert.ok(!azurePopulated.rescan.some((r) => r.path === "tracker.fields"), "a populated contract needs no rescan");

  const jiraEmpty = run({ projectType: "platform", tracker: { kind: "jira", projectKey: "VCST" } }, "vc-fix-reconcile-jira-");
  assert.ok(!jiraEmpty.rescan.some((r) => r.path === "tracker.fields"), "Jira bakes no field contract — empty tracker.fields is correct there");
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

// ─── VCST-5582 A3 / A4 — the fieldDefaults time-bomb guard + --unset ─────────────────────
// A helper that captures the JSON REPORT on stdout (not just the written file), for the reject/unset
// paths whose effect is visible in the report.
function reconcileReport(home, args = []) {
  const out = execFileSync(process.execPath, [RECONCILE, "--write", ...args], {
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
  });
  return JSON.parse(out);
}
function seedAzure(home, over = {}) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({
    projectType: "client", operator: "client",
    tracker: { kind: "azure", baseUrl: "https://dev.azure.com/acme", fieldDefaults: over.fieldDefaults ?? {} },
    vcs: { clientHost: "github", clientOrg: "acmecorp" },
  }));
}

test("A3 reconcile --set: REFUSES to persist System.IterationId into tracker.fieldDefaults", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    seedAzure(home);
    const rep = reconcileReport(home, ["--set", 'tracker.fieldDefaults.System.IterationId=22']);
    const rejected = rep.rejected.map((r) => r.path);
    assert.ok(rejected.includes("tracker.fieldDefaults.System.IterationId"), `rejected: ${JSON.stringify(rep.rejected)}`);
    const p = JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
    assert.equal(p.tracker.fieldDefaults["System.IterationId"], undefined, "the time-varying id must NOT be written");
    assert.match(rep.rejected[0].reason, /closed sprint|System\.IterationPath/i);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("A3 reconcile --set: System.AreaId is refused too; a legit fieldDefault (Custom.Environment) is written", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    seedAzure(home);
    const rep = reconcileReport(home, ["--set", "tracker.fieldDefaults.System.AreaId=4", "--set", "tracker.fieldDefaults.Custom.Environment=QA"]);
    assert.deepEqual(rep.rejected.map((r) => r.path), ["tracker.fieldDefaults.System.AreaId"]);
    const p = JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
    assert.equal(p.tracker.fieldDefaults["System.AreaId"], undefined);
    assert.equal(p.tracker.fieldDefaults["Custom.Environment"], "QA", "a non-time-varying default is fine");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("A4 reconcile --unset: removes a fieldDefaults entry without hand-editing the profile (item 9)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    // A profile that ALREADY carries the stale workaround (hand-planted before the A3 guard existed).
    seedAzure(home, { fieldDefaults: { "System.IterationId": 22, "Custom.Environment": "QA" } });
    const rep = reconcileReport(home, ["--unset", "tracker.fieldDefaults.System.IterationId"]);
    assert.deepEqual(rep.unset.map((u) => u.path), ["tracker.fieldDefaults.System.IterationId"]);
    const p = JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
    assert.equal(p.tracker.fieldDefaults["System.IterationId"], undefined, "the stale key is gone");
    assert.equal(p.tracker.fieldDefaults["Custom.Environment"], "QA", "sibling defaults untouched");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("A4 reconcile --unset: a path outside a writable open map is REJECTED, never strips a schema field", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-reconcile-"));
  try {
    seedAzure(home);
    const rep = reconcileReport(home, ["--unset", "tracker.kind"]);
    assert.equal(rep.unset.length, 0);
    assert.ok(rep.rejected.some((r) => r.path === "tracker.kind"), `rejected: ${JSON.stringify(rep.rejected)}`);
    const p = JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
    assert.equal(p.tracker.kind, "azure", "a fixed-shape schema field is never removed by --unset");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
