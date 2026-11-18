// Styling lines, design tokens and whether a pixel check is worth its minutes.

import { existsSync } from "node:fs";
import { escapeRe, globMatch } from "./globs.mjs";
import { gitGrep, gitShow, readHead, showMany } from "./git.mjs";
import { MAX_TOKEN_DETAILS, STYLE_CANDIDATE, STYLE_FILE, STYLE_LINE, TAILWIND_COLOR_UTILITIES, TEST_LIKE, TOKEN_SOURCES } from "./zones.mjs";

// A file "touches styling" when a changed line sits in a <style> block, a .scss/.css file, or a
// template class binding, or names a design token. Path zones cannot see this: most styling review
// happens on ordinary pages and components, not in ui-kit or assets/styles.
// `read` gives a .vue file's text at HEAD and at the merge-base; tests pass their own.
export function markStyling(f, read) {
  f.styling = 0;
  if (!STYLE_CANDIDATE.test(f.path) || TEST_LIKE.test(f.path)) return;
  if (STYLE_FILE.test(f.path)) {
    f.styling = f.added + f.deleted;
    return;
  }
  if (!f.path.endsWith(".vue")) {
    f.styling = [...f.addedText, ...f.deletedText].filter((l) => STYLE_LINE.test(l)).length;
    return;
  }
  const headRanges = styleRanges(read.head(f.path));
  const baseRanges = styleRanges(read.base(f.path));
  const inRange = (ranges, n) => ranges.some(([a, b]) => n >= a && n <= b);
  f.addedLines.forEach((n, i) => {
    if (inRange(headRanges, n) || STYLE_LINE.test(f.addedText[i])) f.styling++;
  });
  f.deletedLines.forEach((n, i) => {
    if (inRange(baseRanges, n) || STYLE_LINE.test(f.deletedText[i])) f.styling++;
  });
  if (f.styling) f.reasons.push(`${f.styling} styling line(s): classes, <style> or tokens`);
}

// The merge-base side of every .vue file, read in one batch up front.
export function gitReader(mergeBase, files) {
  const base = showMany(mergeBase, files.filter((f) => f.path.endsWith(".vue") && f.status !== "A").map((f) => f.path));
  return { head: readHead, base: (p) => base.get(p) ?? gitShow(`${mergeBase}:${p}`) };
}

// 1-based [open, close] line pairs of each top-level <style> block in a single-file component.
export function styleRanges(text) {
  const ranges = [];
  const lines = text.split("\n");
  let start = null;
  lines.forEach((l, i) => {
    if (start === null && /^<style\b/.test(l)) start = i + 1;
    else if (start !== null && /^<\/style>/.test(l)) {
      ranges.push([start, i + 1]);
      start = null;
    }
  });
  return ranges;
}

// Design tokens defined or changed by the diff: `--vc-*` and `--color-*` custom properties in styles,
// preset keys (`color_primary_500` → `--color-primary-500`) and Tailwind scale tokens (`vcToken("radius-md")`).
// A removed token breaks every rule that reads it, in this repository, in forks and in plugins built on
// the core-api Tailwind preset; a changed value moves every screen that uses it.
export function tokenChanges(files) {
  const defined = { added: new Map(), removed: new Map() };
  const note = (map, name, p) => map.set(name, [...new Set([...(map.get(name) ?? []), p])]);
  for (const f of files) {
    if (!TOKEN_SOURCES.some((g) => globMatch(g, f.path))) continue;
    for (const l of f.addedText) for (const t of tokenDefs(l, f.path)) note(defined.added, t, f.path);
    for (const l of f.deletedText) for (const t of tokenDefs(l, f.path)) note(defined.removed, t, f.path);
  }
  const names = [...new Set([...defined.added.keys(), ...defined.removed.keys()])].sort();
  const out = names.map((name) => {
    const a = defined.added.has(name);
    const r = defined.removed.has(name);
    const change = a && r ? "changed" : a ? "added" : stillDefined(name) ? "changed" : "removed";
    return { name, change, definedIn: [...new Set([...(defined.added.get(name) ?? []), ...(defined.removed.get(name) ?? [])])] };
  });
  const detail = out.filter((t) => t.change !== "added").slice(0, MAX_TOKEN_DETAILS);
  for (const t of detail) {
    const used = tokenUsers(t.name);
    t.users = used.files.length;
    t.uiKitUsers = used.files.filter((p) => p.startsWith("client-app/ui-kit/")).map((p) => p.replace(/^client-app\/ui-kit\/components\//, ""));
    t.tailwind = used.tailwind;
  }
  for (const t of out) {
    if (t.change === "added") continue;
    for (const p of t.definedIn) {
      const f = files.find((x) => x.path === p);
      if (!f) continue;
      if (t.change === "removed" && f.tier < 3) {
        f.tier = 3;
        f.reasons.push(`removes token ${t.name}${t.users ? ` still read by ${t.users} file(s)` : ""}; forks and plugins may read it too`);
      } else if (f.tier < 2) {
        f.tier = 2;
        f.reasons.push(`changes token ${t.name}`);
      }
    }
  }
  return out;
}

export function tokenDefs(line, p) {
  const out = [...line.matchAll(/(--(?:vc|color)-[\w-]+)\s*:/g)].map((m) => m[1]);
  if (p.endsWith(".json")) out.push(...[...line.matchAll(/"(color_\w+)"\s*:/g)].map((m) => "--" + m[1].replace(/_/g, "-")));
  if (/tailwind\.config/.test(p)) out.push(...[...line.matchAll(/vcToken\(\s*["']([\w-]+)["']/g)].map((m) => "--vc-" + m[1]));
  return out;
}

function stillDefined(name) {
  const json = name.startsWith("--color-") ? `|"${name.slice(2).replace(/-/g, "_")}"\\s*:` : "";
  return gitGrep([], "", [], `${escapeRe(name)}\\s*:${json}`).length > 0;
}

// Files that read a token: `var(--x` anywhere, plus Tailwind utilities for preset colours
// (`--color-primary-500` → `bg-primary-500`, `text-primary-500` …). Scale tokens wired through
// tailwind.config are read by every matching utility class, which no grep can count.
function tokenUsers(name) {
  const patterns = [`var\\(${escapeRe(name)}\\b`];
  if (name.startsWith("--color-")) patterns.push(`\\b(${TAILWIND_COLOR_UTILITIES})-${escapeRe(name.slice(8))}\\b`);
  const users = gitGrep([], "", [], patterns.join("|")).filter((p) => p.startsWith("client-app/") && !TEST_LIKE.test(p));
  const tailwind = existsSync("tailwind.config.ts") && new RegExp(escapeRe(name.replace(/^--vc-/, ""))).test(readHead("tailwind.config.ts"));
  return { files: users, tailwind: Boolean(tailwind && name.startsWith("--vc-")) };
}

// A pixel check is worth its minutes when the change can move what many screens look like.
export function visualCheck(files, tokens, mergeBase) {
  const why = [];
  const tokenMoves = tokens.filter((t) => t.change !== "added");
  if (tokenMoves.length) why.push(`${tokenMoves.length} design token(s) changed or removed`);
  const global = files.filter((f) => f.tier >= 1 && ["styles", "build"].includes(f.zone));
  if (global.length) why.push(`global styles, presets, designs or build config: ${global.map((f) => f.path).slice(0, 3).join(", ")}`);
  const kit = files.filter((f) => f.zone === "ui-kit" && f.styling);
  if (kit.length) why.push(`${kit.length} ui-kit file(s) with styling changes: every screen that renders them`);
  return {
    recommended: why.length > 0,
    why,
    command: `node "\${CLAUDE_PLUGIN_ROOT}/visual/affected.mjs" --repo . --base ${mergeBase.slice(0, 12)}`,
  };
}
