#!/usr/bin/env node
// driver.mjs — health/smoke harness for the vc-mcp-testing-module QA tooling repo.
//
// This repo has no GUI and no long-running server of its own. It is an agentic
// QA system: a collection of Node/tsx CLI scripts plus agent/skill/command/CSV
// definitions that DRIVE the Virto Commerce storefront via MCP browser servers.
// The only thing you can "launch" and observe here is the tooling itself.
//
// This driver runs every OFFLINE-verifiable entry point (no ANTHROPIC_API_KEY,
// no live BACK_URL, no browsers) and reports a pass/fail table. It is the fast
// way to confirm the repo's tooling still works after a change — the equivalent
// of "launching the app and clicking around".
//
// It deliberately invokes the underlying scripts directly (`npx tsx scripts/X`,
// `node scripts/X`) instead of the package.json `npm run` aliases, because some
// of those aliases use bash-isms (`> /dev/null`, inline `VAR=val`) that break
// under Windows cmd.exe. Calling the scripts directly is cross-platform.
//
// Usage:
//   node .claude/skills/run-vc-mcp-testing-module/driver.mjs            # run all checks
//   node .claude/skills/run-vc-mcp-testing-module/driver.mjs --list     # list checks, don't run
//   node .claude/skills/run-vc-mcp-testing-module/driver.mjs td scope   # run only matching checks
//
// Exit code: 0 if every check matched its expected outcome, 1 otherwise.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(SKILL_DIR, "..", "..", ".."); // <repo>/.claude/skills/run-.. → <repo>

// Each check: name, the command, and which exit codes count as "ran OK".
// `acceptExit` is a list — graphql-fixtures legitimately returns 1 when a
// fixture has drifted from the cached schema (findings, not a crash).
const CHECKS = [
  {
    name: "env:check",
    desc: "33 required env vars present (SET/EMPTY report)",
    cmd: "node",
    args: ["get_variables_env.js"],
    acceptExit: [0],
  },
  {
    name: "td-refs",
    desc: "every @td() reference in all 99 suites resolves",
    cmd: "npx",
    args: ["tsx", "scripts/validate-td-refs.ts"],
    acceptExit: [0],
  },
  {
    name: "scope",
    desc: "critical-UI-scope matrix cells map to existing test IDs",
    cmd: "npx",
    args: ["tsx", "scripts/validate-critical-ui-scope.ts"],
    acceptExit: [0],
  },
  {
    name: "suites:lint",
    desc: "test-suites.json manifest is in sync with CSVs on disk",
    cmd: "npx",
    args: ["tsx", "scripts/sync-test-suites.ts", "--check"],
    acceptExit: [0],
  },
  {
    name: "seed:dry-run",
    desc: "seed planner resolves catalog fixtures (no API writes)",
    cmd: "node",
    args: ["scripts/seed-test-data.js", "catalog", "--dry-run"],
    acceptExit: [0],
  },
  {
    name: "graphql:fixtures",
    desc: "67 .graphql fixtures validate vs cached schema (exit 1 = drift findings, not crash)",
    cmd: "npx",
    args: ["tsx", "scripts/validate-graphql-fixtures.ts"],
    acceptExit: [0, 1],
  },
  {
    name: "graphql:labels",
    desc: "runner-native GraphQL CSV has balanced step/assertion labels",
    cmd: "npx",
    args: [
      "tsx",
      "scripts/review-graphql-labels.ts",
      "regression/suites/Backend/graphql/050i-graphql-configurations.csv",
    ],
    acceptExit: [0],
  },
];

const argv = process.argv.slice(2);
if (argv.includes("--list")) {
  for (const c of CHECKS) console.log(`${c.name.padEnd(18)} ${c.desc}`);
  process.exit(0);
}

const filters = argv.filter((a) => !a.startsWith("--"));
const selected = filters.length
  ? CHECKS.filter((c) => filters.some((f) => c.name.includes(f)))
  : CHECKS;

console.log(`vc-mcp-testing-module :: running ${selected.length} offline check(s)\n`);

const results = [];
for (const c of selected) {
  process.stdout.write(`▶ ${c.name} … `);
  const r = spawnSync(c.cmd, c.args, {
    cwd: REPO,
    shell: true, // resolves npx/node on both Windows (cmd) and POSIX shells
    encoding: "utf8",
    timeout: 120000,
  });
  const code = r.status ?? (r.error ? `ERR:${r.error.code}` : "null");
  const ok = typeof code === "number" && c.acceptExit.includes(code);
  results.push({ name: c.name, code, ok });
  // Last non-empty line of output as a one-line summary.
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n");
  const last = out.reverse().find((l) => l.trim()) || "(no output)";
  console.log(`${ok ? "PASS" : "FAIL"} (exit ${code}) — ${last.slice(0, 100)}`);
}

console.log("\n── summary ──");
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"} ${r.name.padEnd(18)} exit=${r.code}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
process.exit(failed.length ? 1 : 0);
