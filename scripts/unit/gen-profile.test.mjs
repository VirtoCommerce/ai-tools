// Unit tests for the self-diagnostics consent flags on
// plugins/vc-fix/skills/project-init/gen-profile.mjs (VCST diag-observability):
// the fresh /project-init interview now asks BOTH selfDiagnostics (local capture) and
// feedback.mode (upstream delivery), symmetric with the `--check` reconcile path, and
// passes them as `--self-diagnostics <true|false>` / `--feedback-mode <ask|auto|off>`.
//
// Drives the real writer as a child process with VC_FIX_HOME pointed at a temp dir (so it
// writes an isolated project-profile.json there, per resolveOutPath → outputRoot). Run:
// `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const GEN = resolve(dirname(fileURLToPath(import.meta.url)), "../../plugins/vc-fix/skills/project-init/gen-profile.mjs");

function genProfile(home, args) {
  execFileSync(process.execPath, [GEN, ...args], {
    encoding: "utf8",
    env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
  });
  return JSON.parse(readFileSync(join(home, "project-profile.json"), "utf8"));
}

test("gen-profile: --self-diagnostics false --feedback-mode off is written verbatim", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    const p = genProfile(home, ["--tracker", "jira", "--self-diagnostics", "false", "--feedback-mode", "off"]);
    assert.equal(p.selfDiagnostics, false);
    assert.equal(p.feedback.mode, "off");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile: WITHOUT a consent flag, selfDiagnostics is written false (opt-in fails safe)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    const p = genProfile(home, ["--tracker", "jira"]);
    // NA-4 (PR #143 R2): a flag-less gen-profile means the consent question was NOT answered, so
    // the written value must be the SAFE opt-in default (false) — never a silent `true`. The
    // interview still *recommends* Yes, but recommending ≠ consenting; the real consent paths
    // (§0b stub, step-6 rewrite) pass `--self-diagnostics <answer>` explicitly (see the tests below).
    assert.equal(p.selfDiagnostics, false, "no consent answer ⇒ capture stays opt-out (false)");
    assert.equal(p.feedback.mode, "ask", "delivery defaults to ask (dry-run + confirm)");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile: the §0b consent stub — `--self-diagnostics true` alone writes an opt-in profile", () => {
  // /project-init §0b writes the flag IMMEDIATELY on Yes, before the interview, so its own
  // remaining run is captured. That stub is just `gen-profile --self-diagnostics true` — a
  // complete-but-default profile carrying selfDiagnostics:true (step 6 rewrites it fully later).
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-stub-"));
  try {
    const p = genProfile(home, ["--self-diagnostics", "true"]);
    assert.equal(p.selfDiagnostics, true, "the stub opts capture in immediately");
    assert.ok(p.projectType, "the stub is a complete profile (defaults filled), not a fragment");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile: --self-diagnostics true --feedback-mode auto is written verbatim", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    const p = genProfile(home, ["--tracker", "jira", "--self-diagnostics", "true", "--feedback-mode", "auto"]);
    assert.equal(p.selfDiagnostics, true);
    assert.equal(p.feedback.mode, "auto");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile: an invalid --feedback-mode is rejected (non-zero exit)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    let err;
    try {
      execFileSync(process.execPath, [GEN, "--tracker", "jira", "--feedback-mode", "bogus"], {
        encoding: "utf8",
        env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
        stdio: "pipe",
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err, "gen-profile must exit non-zero on an invalid enum");
    assert.equal(err.status, 1);
    assert.match(String(err.stderr || ""), /Invalid --feedback-mode/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile --merge: layers the provided flag over an existing profile WITHOUT resetting unspecified user values", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    // A prior profile carrying several NON-default user answers (defaults are: projectType
    // "platform", selfDiagnostics true, feedback.mode "ask", clientHost "github", contributionMode
    // "fork"). --merge must preserve every one that the new invocation does not explicitly set.
    writeFileSync(join(home, "project-profile.json"), JSON.stringify({
      projectType: "client",
      selfDiagnostics: false,
      feedback: { mode: "auto" },
      vcs: { clientHost: "azure-repos", clientOrg: "acme" },
      upstream: { contributionMode: "direct" },
    }));
    // Re-run with --merge and ONE unrelated flag (change only vcs.clientOrg).
    const p = genProfile(home, ["--merge", "--client-org", "newcorp"]);
    // the single provided field changed…
    assert.equal(p.vcs.clientOrg, "newcorp");
    // …and every unspecified user value SURVIVED. A deepMerge/patch-builder regression that reset
    // unspecified fields to PROFILE_DEFAULTS would flip each of these back to its default.
    assert.equal(p.projectType, "client", "projectType preserved (not reset to 'platform')");
    assert.equal(p.selfDiagnostics, false, "selfDiagnostics preserved (not reset to true)");
    assert.equal(p.feedback.mode, "auto", "feedback.mode preserved (not reset to 'ask')");
    assert.equal(p.vcs.clientHost, "azure-repos", "clientHost preserved (not reset to 'github')");
    assert.equal(p.upstream.contributionMode, "direct", "contributionMode preserved (not reset to 'fork')");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("gen-profile: a malformed --self-diagnostics value is rejected, not silently coerced to false", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    let err;
    try {
      // "yes"/"True"/"1" used to fall through to selfDiagnostics:false with no error — a plausible
      // typo silently writing the opt-OUT value when the operator meant to opt IN.
      execFileSync(process.execPath, [GEN, "--tracker", "jira", "--self-diagnostics", "yes"], {
        encoding: "utf8",
        env: { ...process.env, VC_FIX_HOME: home, CLAUDE_PLUGIN_ROOT: "" },
        stdio: "pipe",
      });
    } catch (e) {
      err = e;
    }
    assert.ok(err, "gen-profile must exit non-zero on a malformed --self-diagnostics");
    assert.equal(err.status, 1);
    assert.match(String(err.stderr || ""), /Invalid --self-diagnostics/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─── VCST-5582 A3 — gen-profile FILTERS an illegal fieldDefault from a scan ──────────────
test("A3 gen-profile: a scan-carried System.IterationId/AreaId fieldDefault is filtered; legit ones kept", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-a3-"));
  try {
    // A tracker-json (discover-tracker output shape) that carries a fieldDefaults map with the
    // time-varying ids alongside a legitimate per-deployment constant.
    writeFileSync(join(home, "tracker.json"), JSON.stringify({
      ticketKeyFormat: "numeric",
      fieldDefaults: { "System.IterationId": 22, "System.AreaId": 4, "Custom.Environment": "QA" },
    }));
    const p = genProfile(home, ["--tracker", "azure", "--azure-org", "acme", "--azure-project", "Web", "--tracker-json", "tracker.json"]);
    assert.equal(p.tracker.fieldDefaults["System.IterationId"], undefined, "time-varying sprint id filtered");
    assert.equal(p.tracker.fieldDefaults["System.AreaId"], undefined, "time-varying area id filtered");
    assert.equal(p.tracker.fieldDefaults["Custom.Environment"], "QA", "a real per-deployment default is kept");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
