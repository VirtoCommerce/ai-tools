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
