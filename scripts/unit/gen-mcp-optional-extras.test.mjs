// Unit tests for optional-extra gating in
// plugins/vc-init/skills/project-init/gen-mcp.mjs.
//
// The original defect (self-diagnostics `project-init/mcp_config`, DEGRADED): every `--with` extra was
// enabled with no check that its token had resolved, so `.mcp.json` shipped context7 with a literal
// `<CONTEXT7_API_KEY>`. Since VCST-6402 the key-taking extras (postman, context7) are gone altogether —
// no token is read from a file — so what is left to guard is that a removed extra never ships and a
// key-less extra is enabled as asked.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { unresolvedPlaceholders } from "../../plugins/vc-init/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-init/skills/project-init/gen-mcp.mjs");

function runGenMcp(dir, args = [], extraEnv = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    // VC_FIX_HOME is outputRoot(); the dummy PAT keeps github resolvable so the test never shells
    // out to the host `gh`. CONTEXT7_API_KEY is cleared per-test by passing "" explicitly.
    env: { ...process.env, VC_FIX_HOME: dir, GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test", ...extraEnv },
  });
}
const enabledOf = (dir) =>
  JSON.parse(readFileSync(join(dir, ".claude", "settings.local.json"), "utf8")).enabledMcpjsonServers;
const serversOf = (dir) => JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8")).mcpServers;

// ─── the helper ───────────────────────────────────────────────────────────────────
test("unresolvedPlaceholders: reports each unresolved name once, and nothing when resolved", () => {
  assert.deepEqual(unresolvedPlaceholders({ url: "https://x/<CONTEXT7_API_KEY>" }), ["<CONTEXT7_API_KEY>"]);
  // deduped across nesting, and a substituted value leaves no placeholder behind
  assert.deepEqual(
    unresolvedPlaceholders({ a: "<K>", env: { B: "<K>", C: "<OTHER>" } }),
    ["<K>", "<OTHER>"],
  );
  assert.deepEqual(unresolvedPlaceholders({ headers: { Authorization: "Bearer ctx7_real" } }), []);
  assert.deepEqual(unresolvedPlaceholders(undefined), []);
});

// ─── the regression: blank optional key ⇒ defined but dormant ─────────────────────
test("--with context7: removed in VCST-6402 — not defined, not enabled, and the run says so", () => {
  withTempDir((dir) => {
    const out = runGenMcp(dir, ["--tracker", "azure", "--client-vcs", "azure-repos", "--with", "context7"], {
      CONTEXT7_API_KEY: "ctx7_real",
    });
    assert.ok(!enabledOf(dir).includes("context7"), `enabled: ${enabledOf(dir).join(", ")}`);
    assert.equal(serversOf(dir).context7, undefined, "a removed server is not even defined");
    assert.match(out, /--with context7: that server was removed/);
    assert.doesNotMatch(out, /unresolved </);
  });
});

test("--with devtools: enabled without any key (no placeholder to resolve)", () => {
  withTempDir((dir) => {
    runGenMcp(dir, ["--tracker", "azure", "--client-vcs", "azure-repos", "--with", "devtools"], {
      CONTEXT7_API_KEY: "",
    });
    assert.ok(enabledOf(dir).includes("Chrome DevTools"), `enabled: ${enabledOf(dir).join(", ")}`);
  });
});

// The core servers are not extras and must keep their existing behaviour.
test("core servers stay enabled regardless of the optional keys", () => {
  withTempDir((dir) => {
    runGenMcp(dir, ["--tracker", "azure", "--client-vcs", "azure-repos", "--with", "context7"], {
      CONTEXT7_API_KEY: "",
    });
    const enabled = enabledOf(dir);
    for (const name of ["playwright-chrome", "github", "azure-mcp"]) {
      assert.ok(enabled.includes(name), `${name} enabled (got: ${enabled.join(", ")})`);
    }
  });
});
