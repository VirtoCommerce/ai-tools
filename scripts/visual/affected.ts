#!/usr/bin/env tsx
/**
 * visual:affected — which Storybook stories a front-end change can move.
 *
 * Feeds `visual:snap --only` and the visual checklist rows of `.claude/skills/qa-visual-regression/`.
 * A component change does not stay in its component: in the 2026-10-23 spike two 2 px edits (VcButton,
 * VcBadge) changed stories in 14 components, because a modal, a tooltip and an empty page render
 * them. So the answer is the changed components PLUS every component that renders one of them, to a
 * fixed point.
 *
 * WORKS ON ANY REPO WITH STORIES. A "component" is the nearest directory, under one of the --roots,
 * that holds a `*.stories.*` file — vc-frontend's `client-app/ui-kit/components/<tier>/<name>/`, a
 * fork's own components dir, frontend-next, vc-shell. The defaults are vc-frontend's layout; a fork
 * adds its own dirs with --roots and its own global files with --global.
 *
 * Fails OPEN — when a change cannot be attributed to a component, every story is in scope:
 *   ALL        a file matching --global (shared styles, theme presets, Tailwind / Storybook config,
 *              the dependency manifest, anything in the ui kit outside a component), or a source file
 *              inside a --roots dir that no component owns (a barrel index, a helper). A wrongly
 *              narrowed scope leaves no trace; a wide one costs minutes.
 *   SUBSET     only component dirs changed → those dirs and the components that render them.
 *   NONE       no rendering file changed.
 * A rendering file with no story (a page, a shared component, a module, a fork component nobody wrote
 * a story for) is listed under `uncovered`: Storybook PIXEL cannot see it, the pages source or another
 * instrument has to.
 *
 * USAGE
 *   npm run visual:affected -- --repo <checkout> --base <git ref>     (diff base...HEAD)
 *   npm run visual:affected -- --repo <checkout> --files a.vue,b.scss (explicit list)
 *     --roots <dir[,dir]>      component roots (default client-app/ui-kit/components)
 *     --global <regex[,regex]> files that restyle every story (default: vc-frontend's, see GLOBAL)
 *     --out <file>             also write the JSON (input of visual:snap --only)
 * EXIT  0 when the inputs were readable · 2 not a checkout / git failed / no root found.
 */
import "../lib/sync-stdio.mjs";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";

const VALUED = ["--repo", "--base", "--files", "--roots", "--global", "--out"];
const argv = process.argv.slice(2);
rejectUnknownFlags(argv, VALUED, VALUED);
const repo = flagValue(argv, "--repo");
if (!repo || !existsSync(repo)) {
  console.error("usage: npm run visual:affected -- --repo <checkout> (--base <ref> | --files a,b) [--roots dir,dir] [--global re,re] [--out file]");
  process.exit(2);
}
const list = (raw: string | undefined, fallback: string[]) => (raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : fallback);
const ROOTS = list(flagValue(argv, "--roots"), ["client-app/ui-kit/components"]).map((r) => r.replace(/\/+$/, ""));
// vc-frontend's files that restyle every story. Not under a component, yet not attributable to one.
const GLOBAL = list(flagValue(argv, "--global"), [
  "^client-app/ui-kit/(?!components/)",
  "^client-app/assets/(styles|presets|icons)/",
  "^tailwind\\.config\\.",
  "^\\.storybook/",
  "^storybook-styles/",
  "^(package\\.json|yarn\\.lock|package-lock\\.json|pnpm-lock\\.yaml)$",
]).map((r) => new RegExp(r));
const RENDERING = /\.(vue|tsx|jsx|svelte|scss|sass|less|css|html|svg)$/;
const SOURCE = /\.(vue|tsx|jsx|svelte|ts|js)$/;
const NOT_SOURCE = /\.(test|spec)\.[jt]sx?$/;

const missingRoots = ROOTS.filter((r) => !existsSync(join(repo, r)));
if (missingRoots.length === ROOTS.length) {
  console.error(`✗ no component root found under ${repo}: ${ROOTS.join(", ")} — pass --roots`);
  process.exit(2);
}

function changedFiles(): string[] {
  const files = flagValue(argv, "--files");
  if (files) return list(files, []);
  const ref = flagValue(argv, "--base");
  if (!ref) { console.error("✗ pass --base <ref> or --files"); process.exit(2); }
  try {
    return execFileSync("git", ["-C", repo!, "diff", "--name-only", `${ref}...HEAD`], { encoding: "utf-8" }).split("\n").filter(Boolean);
  } catch (e) {
    console.error(`✗ git diff ${ref}...HEAD failed: ${(e as Error).message.split("\n")[0]}`);
    process.exit(2);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n.startsWith(".")) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every component dir (holds a story) under the roots, with the names it is rendered by. */
interface Component { dir: string; names: string[]; sources: string[] }
function componentIndex(): Component[] {
  const files = ROOTS.filter((r) => existsSync(join(repo!, r))).flatMap((r) => walk(join(repo!, r)));
  const dirs = [...new Set(files.filter((f) => /\.stories\.[jt]sx?$/.test(f) || /\.stories\.mdx$/.test(f)).map(dirname))];
  return dirs.map((abs) => {
    const own = files.filter((f) => dirname(f) === abs || (f.startsWith(abs + "/") && !dirs.some((d) => d !== abs && d.startsWith(abs + "/") && f.startsWith(d + "/"))));
    // <vc-button> and VcButton for vc-button.vue; ProductCard for ProductCard.tsx.
    const names = own.filter((f) => /\.(vue|tsx|jsx|svelte)$/.test(f)).map((f) => basename(f).replace(/\.[^.]+$/, ""))
      .flatMap((n) => [n, n.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase())]);
    // Stories count: a story that slots a VcButton into a VcEmptyView moves when VcButton does.
    const sources = own.filter((f) => SOURCE.test(f) && !NOT_SOURCE.test(f));
    return { dir: relative(repo!, abs), names: [...new Set(names)], sources };
  });
}

const changed = changedFiles();
const index = componentIndex();
/** The component a changed file belongs to: the deepest component dir that contains it. */
const owner = (f: string) => index.filter((c) => f.startsWith(c.dir + "/")).sort((a, b) => b.dir.length - a.dir.length)[0];
// Inside a component root but owned by no component (a barrel index, a shared helper): fail open.
const underRoot = (f: string) => ROOTS.some((r) => f.startsWith(r + "/"));
const globalHits = changed.filter((f) => GLOBAL.some((g) => g.test(f)) || (underRoot(f) && SOURCE.test(f) && !owner(f)));
const direct = [...new Set(changed.filter((f) => !globalHits.includes(f)).map(owner).filter(Boolean).map((c) => c!.dir))];
const uncovered = changed.filter((f) => RENDERING.test(f) && !globalHits.includes(f) && !owner(f));

let result: Record<string, unknown>;
if (globalHits.length) {
  result = { mode: "ALL", reason: `global surface changed: ${globalHits.slice(0, 5).join(", ")}${globalHits.length > 5 ? " …" : ""}`, dirs: [], direct, uncovered };
} else if (direct.length) {
  const inScope = new Set(direct);
  // Fixed point: a component that renders an in-scope component is itself in scope.
  for (let grew = true; grew;) {
    grew = false;
    const names = index.filter((c) => inScope.has(c.dir)).flatMap((c) => c.names);
    if (!names.length) break;
    const esc = (n: string) => n.replace(/[-]/g, "\\-");
    const pascal = names.filter((n) => /^[A-Z]/.test(n));
    const tag = new RegExp(`<(${names.map(esc).join("|")})[\\s/>]${pascal.length ? `|\\b(${pascal.join("|")})\\b` : ""}`);
    for (const c of index) {
      if (inScope.has(c.dir)) continue;
      if (c.sources.some((f) => tag.test(readFileSync(f, "utf-8")))) { inScope.add(c.dir); grew = true; }
    }
  }
  const renderers = [...inScope].filter((d) => !direct.includes(d)).sort();
  result = { mode: "SUBSET", reason: `${direct.length} component dir(s) changed, ${renderers.length} render them`, dirs: [...inScope].sort(), direct, renderers, uncovered };
} else {
  result = { mode: "NONE", reason: "no component or global rendering file changed", dirs: [], direct: [], uncovered };
}
result.roots = ROOTS;
result.changed = changed;

const json = JSON.stringify(result, null, 2);
const outFile = flagValue(argv, "--out");
if (outFile) writeFileSync(outFile, json);
console.log(json);
