#!/usr/bin/env node
/**
 * scripts/verify-plugin-paths.mjs
 *
 * Guards against the class of bug found in PR #91's review (VCST — "off-by-one
 * relative import"): `plugins/vc-fix/skills/**` scripts are nested one level
 * deeper than their `vc-qa` source (`skills/<name>/*.mjs` → repo root is `../..`,
 * not `../../..`), so a copy-pasted import/`REPO_ROOT` resolve silently points
 * at the wrong directory instead of failing loudly. `check-imports.mjs` (the
 * prior ad-hoc verification, run from the scratchpad) only covered `.ts` files;
 * this script is the permanent, committed equivalent and covers `.mjs`/`.js`/`.ts`
 * uniformly, so a future edit that reintroduces a bad relative path fails
 * `npm run verify:paths` instead of shipping silently.
 *
 * Walks every source file under the plugin, extracts static relative-import
 * specifiers, and resolves each. TypeScript sources import sibling `.ts` files
 * with a `.js` specifier (the standard ESM-TS convention, resolved by the
 * `.ts`/`.mjs`/`.js` loader) — so a `.js`-suffixed specifier that doesn't exist
 * verbatim is retried against `.ts` and `.mjs` before being reported missing.
 * Exits non-zero and lists every unresolved import if any are found.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_EXTENSIONS = new Set([".mjs", ".js", ".ts"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".fix-workspace"]);

const IMPORT_RE = /(?:from|import|require)\s*\(?\s*["'](\.\.?\/[^"']+)["']\)?/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

/** Extensions to retry, in order, when the specifier's own extension doesn't resolve. */
const FALLBACK_EXTENSIONS = [".ts", ".mjs", ".js"];

function resolves(resolved) {
  if (existsSync(resolved)) return true;
  const dot = resolved.lastIndexOf(".");
  if (dot === -1) return false;
  const base = resolved.slice(0, dot);
  return FALLBACK_EXTENSIONS.some((ext) => existsSync(base + ext));
}

function checkFile(file, problems) {
  const src = readFileSync(file, "utf-8");
  for (const match of src.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const resolved = resolve(dirname(file), spec);
    if (!resolves(resolved)) {
      problems.push({ file, spec, resolved });
    }
  }
}

function main() {
  const files = walk(PLUGIN_ROOT);
  const problems = [];
  for (const file of files) checkFile(file, problems);

  if (problems.length === 0) {
    console.log(`[verify-plugin-paths] OK — ${files.length} files scanned, all relative imports resolve.`);
    process.exit(0);
  }

  console.error(`[verify-plugin-paths] FAILED — ${problems.length} unresolved relative import(s):\n`);
  for (const p of problems) {
    console.error(`  ${p.file.replace(PLUGIN_ROOT, "plugins/vc-fix")}`);
    console.error(`    imports "${p.spec}" → resolves to ${p.resolved.replace(PLUGIN_ROOT, "plugins/vc-fix")} (missing)\n`);
  }
  process.exit(1);
}

main();
