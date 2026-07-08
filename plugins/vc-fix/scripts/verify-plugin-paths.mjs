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
 *
 * Existence alone doesn't prove IDENTITY — a miscounted `..` could resolve to
 * a wrong-but-existing file that happens to share a name. For the common
 * `import { a, b } from "spec"` form this also does a best-effort check that
 * each named symbol is actually exported by the resolved file (regex-based,
 * not a real module graph — it can't see re-exports or computed exports, but
 * it catches the case existence-only checking is blind to: importing a real
 * symbol from the wrong file). Default/namespace/side-effect imports and
 * `require()`/dynamic `import()` are still existence-checked only.
 *
 * Exits non-zero and lists every unresolved import or missing export found.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_EXTENSIONS = new Set([".mjs", ".js", ".ts"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".fix-workspace"]);

const IMPORT_RE = /(?:from|import|require)\s*\(?\s*["'](\.\.?\/[^"']+)["']\)?/g;
// Only the named-import form (`import { a, b as c } from "spec"`) — the one shape
// where "which symbols does the caller expect" is cheap to extract statically.
const NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'](\.\.?\/[^"']+)["']/g;
const EXPORT_NAME_RE =
  /export\s+(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_BLOCK_RE = /export\s*\{([^}]*)\}(?!\s*from)/g;

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

/** Resolve a `.js`/`.ts`/`.mjs`-fallback specifier to the real file that exists, or null. */
function resolveReal(resolved) {
  if (existsSync(resolved)) return resolved;
  const dot = resolved.lastIndexOf(".");
  if (dot === -1) return null;
  const base = resolved.slice(0, dot);
  for (const ext of FALLBACK_EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** Every top-level name this file exports, as far as a regex can tell (best-effort). */
function exportedNames(file) {
  const src = readFileSync(file, "utf-8");
  const names = new Set();
  for (const m of src.matchAll(EXPORT_NAME_RE)) names.add(m[1]);
  for (const m of src.matchAll(EXPORT_BLOCK_RE)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function checkFile(file, problems, exportMisses) {
  const src = readFileSync(file, "utf-8");
  for (const match of src.matchAll(IMPORT_RE)) {
    const spec = match[1];
    const resolved = resolve(dirname(file), spec);
    if (!resolves(resolved)) {
      problems.push({ file, spec, resolved });
    }
  }

  for (const match of src.matchAll(NAMED_IMPORT_RE)) {
    const [, clause, spec] = match;
    const resolved = resolve(dirname(file), spec);
    const real = resolveReal(resolved);
    if (!real) continue; // already reported by the existence pass above
    const wanted = clause
      .split(",")
      .map((s) => s.split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const available = exportedNames(real);
    for (const name of wanted) {
      if (!available.has(name)) {
        exportMisses.push({ file, spec, real, name });
      }
    }
  }
}

function main() {
  const files = walk(PLUGIN_ROOT);
  const problems = [];
  const exportMisses = [];
  for (const file of files) checkFile(file, problems, exportMisses);

  if (problems.length === 0 && exportMisses.length === 0) {
    console.log(`[verify-plugin-paths] OK — ${files.length} files scanned, all relative imports resolve to the right exports.`);
    process.exit(0);
  }

  if (problems.length) {
    console.error(`[verify-plugin-paths] FAILED — ${problems.length} unresolved relative import(s):\n`);
    for (const p of problems) {
      console.error(`  ${p.file.replace(PLUGIN_ROOT, "plugins/vc-fix")}`);
      console.error(`    imports "${p.spec}" → resolves to ${p.resolved.replace(PLUGIN_ROOT, "plugins/vc-fix")} (missing)\n`);
    }
  }
  if (exportMisses.length) {
    console.error(`[verify-plugin-paths] FAILED — ${exportMisses.length} named import(s) not found in the resolved file (best-effort — the file exists, but doesn't export this symbol; may indicate an off-by-one path landing on the wrong same-named file):\n`);
    for (const m of exportMisses) {
      console.error(`  ${m.file.replace(PLUGIN_ROOT, "plugins/vc-fix")}`);
      console.error(`    imports "{ ${m.name} }" from "${m.spec}" → ${m.real.replace(PLUGIN_ROOT, "plugins/vc-fix")} has no such export\n`);
    }
  }
  process.exit(1);
}

main();
