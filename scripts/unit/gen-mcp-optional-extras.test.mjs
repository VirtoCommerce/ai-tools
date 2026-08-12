// Unit tests for optional-extra gating in
// plugins/vc-fix/skills/project-init/gen-mcp.mjs.
//
// The defect (self-diagnostics `project-init/mcp_config`, DEGRADED): the enable loop did
// `for (const e of extras) if (extraMap[e]) enabled.add(extraMap[e])` — every `--with` extra was
// enabled with no check that its token had resolved. scaffold-secrets.mjs emits POSTMAN_API_KEY /
// CONTEXT7_API_KEY as OPTIONAL placeholders and documents "blank ⇒ that MCP server stays disabled",
// so onboarding shipped `.mcp.json` with context7 enabled and a literal `<CONTEXT7_API_KEY>` — a
// server that cannot start — and then reported it as a degraded artifact against a key the operator
// deliberately left blank. An unresolved optional extra now stays DEFINED but dormant.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withTempDir } from "./_test-helpers.mjs";
import { unresolvedPlaceholders } from "../../plugins/vc-fix/skills/project-init/gen-mcp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(ROOT, "plugins/vc-fix/skills/project-init/gen-mcp.mjs");

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
test("--with context7 + blank key: NOT enabled, still defined, no degraded-artifact warn", () => {
  withTempDir((dir) => {
    const out = runGenMcp(dir, ["--tracker", "azure", "--client-vcs", "azure-repos", "--with", "context7"], {
      CONTEXT7_API_KEY: "",
    });
    assert.ok(!enabledOf(dir).includes("context7"), `enabled: ${enabledOf(dir).join(", ")}`);
    // dormant, not deleted — filling the key and re-running is all it takes
    assert.ok(serversOf(dir).context7, "context7 stays DEFINED in .mcp.json");
    // the blank optional key is the documented outcome, so it must not be reported as degraded
    assert.doesNotMatch(out, /unresolved <CONTEXT7_API_KEY>/);
    assert.match(out, /context7: defined but NOT enabled/);
  });
});

test("--with context7 + a real key: enabled, and the placeholder is substituted", () => {
  withTempDir((dir) => {
    const out = runGenMcp(dir, ["--tracker", "azure", "--client-vcs", "azure-repos", "--with", "context7"], {
      CONTEXT7_API_KEY: "ctx7_real",
    });
    assert.ok(enabledOf(dir).includes("context7"), `enabled: ${enabledOf(dir).join(", ")}`);
    assert.deepEqual(unresolvedPlaceholders(serversOf(dir).context7), []);
    assert.doesNotMatch(out, /context7: defined but NOT enabled/);
  });
});

// A key-less extra must be unaffected — the gate keys off placeholders, not off "is an extra".
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
