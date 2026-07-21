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
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

test("gen-profile: without consent flags the safe defaults hold (true / ask)", () => {
  const home = mkdtempSync(join(tmpdir(), "vc-fix-genprofile-"));
  try {
    const p = genProfile(home, ["--tracker", "jira"]);
    assert.equal(p.selfDiagnostics, true, "capture defaults on");
    assert.equal(p.feedback.mode, "ask", "delivery defaults to ask (dry-run + confirm)");
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
