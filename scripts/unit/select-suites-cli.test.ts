/**
 * select-suites CLI — argument handling and the history reader.
 *
 * The CLI is thin on purpose (all the judgement lives in `suite-selection.ts`), so what these
 * tests defend is that it cannot silently do the wrong thing: a missing `--repo` must be an
 * error rather than an unplaceable diff, and a missing or malformed `history.json` must not
 * decide a selection either way.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadHistory, parseArgs } from "../regression/select-suites.ts";

const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../regression/select-suites.ts", import.meta.url));

/** process.execPath + the resolved tsx CLI: `spawnSync("npx", …)` ENOENTs on win32. */
function run(args: readonly string[]) {
  return spawnSync(process.execPath, [TSX_CLI, CLI, ...args], { encoding: "utf-8", env: process.env });
}

test("--repo is required: a diff that cannot be placed is an error, not an empty selection", () => {
  const bad = parseArgs(["--path", "x.ts"]);
  assert.ok("error" in bad && /--repo/.test(bad.error));
});

test("a diff source is required", () => {
  const bad = parseArgs(["--repo", "vc-frontend"]);
  assert.ok("error" in bad && /--diff|--changed-files|--path/.test(bad.error));
});

test("--target must be a positive number of minutes", () => {
  for (const t of ["0", "-5", "abc"]) {
    const bad = parseArgs(["--repo", "r", "--path", "x", "--target", t]);
    assert.ok("error" in bad, `--target ${t} should be rejected`);
  }
  const good = parseArgs(["--repo", "r", "--path", "x", "--target", "60"]);
  assert.ok(!("error" in good) && good.target === 60);
});

test("an unknown argument is named rather than ignored", () => {
  const bad = parseArgs(["--repo", "r", "--path", "x", "--wat"]);
  assert.ok("error" in bad && /--wat/.test(bad.error));
});

test("repeated --path accumulates", () => {
  const a = parseArgs(["--repo", "r", "--path", "x", "--path", "y"]);
  assert.ok(!("error" in a) && a.paths.length === 2);
});

test("loadHistory reports its own absence instead of pretending to have data", () => {
  // A4 un-ignored history.json but no run has written one, so the history rule is inert. That
  // has to be visible: a silent empty result looks identical to "no suite is flaky".
  const h = loadHistory();
  assert.ok(Array.isArray(h.signals));
  assert.ok(h.note.length > 0, "the note is how the inert state is stated");
});

test("CLI: bad usage exits 1 and says why", () => {
  const r = run(["--path", "x.ts"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--repo/);
});

test("CLI: a real module change prints a narrowed selection and the shadow warning", () => {
  const r = run([
    "--repo", "vc-module-catalog",
    "--path", "src/VirtoCommerce.CatalogModule.Data/Services/ProductService.cs",
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Suite selection/);
  assert.match(r.stdout, /suite\(s\) selected/);
  // Never the default for a pipeline until a shadow comparison exists — the output says so.
  assert.match(r.stdout, /SHADOW tool/);
});

test("CLI: --json emits a parseable object carrying the excluded list", () => {
  const r = run([
    "--repo", "vc-module-catalog",
    "--path", "src/VirtoCommerce.CatalogModule.Data/Services/ProductService.cs",
    "--target", "60",
    "--json",
  ]);
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout) as {
    selected: unknown[];
    excluded: unknown[];
    predictedMakespanMinutes: number;
    fullMakespanMinutes: number;
    selectorVersion: string;
  };
  assert.ok(parsed.selected.length > 0);
  assert.ok(parsed.excluded.length > 0, "a 60-minute target on a catalog change has to drop something");
  assert.ok(parsed.predictedMakespanMinutes < parsed.fullMakespanMinutes);
  assert.match(parsed.selectorVersion, /^\d+\.\d+\.\d+$/);
});

test("CLI: an unknown repo still yields the risk floor and names the unmapped path", () => {
  const r = run(["--repo", "vc-module-doesnotexist", "--path", "zzz/qqq.xyz", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout) as { selected: unknown[]; unmappedPaths: string[] };
  assert.ok(parsed.selected.length > 0, "the P0 gate still runs");
  assert.deepEqual(parsed.unmappedPaths, ["vc-module-doesnotexist/zzz/qqq.xyz"]);
});
