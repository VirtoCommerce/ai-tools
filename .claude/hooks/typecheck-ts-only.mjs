#!/usr/bin/env node
// PostToolUse[Edit] hook — runs the ci/tsconfig.json typecheck ONLY for edits to
// TypeScript files.
//
// Why this exists: hook `matcher` keys match the TOOL name, not the edited path,
// so a bare `"matcher": "Edit"` fired `npx tsc --noEmit` after EVERY Edit —
// including .md, .csv and .json files, which cannot affect a TypeScript program.
// Measured over one 5.9-day window: 870 runs at ~1,235 ms average ≈ 18 minutes of
// blocked turns, the large majority of them on non-TS edits (this repo's day-to-day
// work is regression CSVs and markdown reports). The tool-name matcher can't
// express the filter, so the guard lives here instead.
//
// Scope mirrors ci/tsconfig.json `include` (["*.ts", "lib/*.ts", "../scripts/**/*.ts"]):
// any .ts/.tsx edit triggers the check and tsc itself decides what's in the program.
// Anything else exits 0 immediately and silently.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_OUTPUT_LINES = 20;

try {
  const raw = readFileSync(0, "utf8");
  const event = raw.trim() ? JSON.parse(raw) : {};
  const filePath = event?.tool_input?.file_path ?? "";

  // Not TypeScript → nothing tsc could possibly report. Exit before paying the
  // ~1.2 s compiler startup.
  if (!/\.tsx?$/i.test(filePath)) {
    process.exit(0);
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const tsconfig = `${projectDir}/ci/tsconfig.json`;
  // shell:true is required on Windows to resolve the `npx` shim, but it also means
  // the args are re-parsed by cmd — so the project path MUST be quoted or a
  // directory containing a space (e.g. "My Projects") splits into two arguments and
  // tsc fails with "TS5042: Option 'project' cannot be mixed with source files".
  const useShell = process.platform === "win32";
  const result = spawnSync(
    "npx",
    ["tsc", "--noEmit", "-p", useShell ? `"${tsconfig}"` : tsconfig, "--pretty"],
    { encoding: "utf8", shell: useShell },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output) {
    process.stdout.write(
      output.split("\n").slice(0, MAX_OUTPUT_LINES).join("\n") + "\n",
    );
  }
  process.exit(0);
} catch (err) {
  // Fail open, exactly like enforce-real-user.mjs: a hook bug must never block
  // legitimate edits. Surface the reason on stderr and let the turn continue.
  process.stderr.write(`typecheck-ts-only hook error: ${err?.message ?? err}\n`);
  process.exit(0);
}
