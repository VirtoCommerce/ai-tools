// Churn no reviewer needs to read file by file, grouped so that one representative stands for each
// group, with what a reader needs to trust the group: the shared edit, the source of a regeneration,
// the moves.

import { createHash } from "node:crypto";
import path from "node:path";
import { globMatch } from "./globs.mjs";
import { GENERATED, JS_KEYWORDS, REPEATED_HUNK_FILES, SAMPLE_CHARS, SAMPLE_LINES, SHAPE_MIN_CHARS } from "./zones.mjs";

const trimmed = (lines) => lines.map((l) => l.trim()).filter(Boolean);
const hash = (s) => createHash("sha1").update(s).digest("base64");

// A hunk as the reviewer sees it: removed and added lines, trimmed, blank ones dropped. Empty when the
// hunk only moved whitespace.
export function hunkKey(h) {
  const deleted = trimmed(h.deleted);
  const added = trimmed(h.added);
  return deleted.length || added.length ? [...deleted.map((l) => "-" + l), ...added.map((l) => "+" + l)].join("\n") : "";
}

const TOKEN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|\S/g;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const QUOTED = /^["'`]/;
const IMPORT_LINE = /^\s*(import|export)\b.*\bfrom\b|^\s*import\s*["'`]|\bimport\(/;

// A hunk that only renames: the removed and added lines have the same tokens except names swapped for
// names (`useFoo` → `useBar`) and, on import lines, module paths swapped for paths. A changed value,
// keyword or operator (`ref(false)` → `ref(true)`, `<` → `<=`) is behaviour, never a shape.
export function renameOnly(deleted, added) {
  if (deleted.length !== added.length) return false;
  for (let i = 0; i < deleted.length; i++) {
    const a = deleted[i].match(TOKEN) ?? [];
    const b = added[i].match(TOKEN) ?? [];
    if (a.length !== b.length) return false;
    const importLine = IMPORT_LINE.test(deleted[i]) && IMPORT_LINE.test(added[i]);
    for (let j = 0; j < a.length; j++) {
      if (a[j] === b[j]) continue;
      const names = IDENT.test(a[j]) && IDENT.test(b[j]) && !JS_KEYWORDS.has(a[j]) && !JS_KEYWORDS.has(b[j]);
      const paths = importLine && QUOTED.test(a[j]) && QUOTED.test(b[j]);
      if (!names && !paths) return false;
    }
  }
  return true;
}

// The same with string and number literals and every non-keyword name replaced by a placeholder
// numbered in order of first use, so `useFoo` → `useBar` here and `useBaz` → `useQux` there match.
// Only for hunks that rename (renameOnly): anything else must match exactly to be grouped.
export function shapeKey(h) {
  const deleted = trimmed(h.deleted);
  const added = trimmed(h.added);
  if (!deleted.length || !added.length || !renameOnly(deleted, added)) return "";
  const names = new Map();
  const name = (w) => {
    if (JS_KEYWORDS.has(w)) return w;
    if (!names.has(w)) names.set(w, `«${names.size + 1}»`);
    return names.get(w);
  };
  const shape = (l) =>
    l
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "§")
      .replace(/\b\d+(?:\.\d+)?\b/g, "#")
      .replace(/[A-Za-z_$][\w$]*/g, name);
  const key = [...deleted.map((l) => "-" + shape(l)), ...added.map((l) => "+" + shape(l))].join("\n");
  return key.length >= SHAPE_MIN_CHARS ? key : "";
}

// .gitattributes patterns marked `linguist-generated` (or `=true`), as globs for globMatch.
export function parseGeneratedAttributes(text) {
  const out = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [pattern, ...attrs] = line.split(/\s+/);
    if (!attrs.some((a) => a === "linguist-generated" || a === "linguist-generated=true")) continue;
    if (pattern.startsWith("/")) out.push(pattern.slice(1));
    else out.push(pattern.includes("/") ? pattern : `**/${pattern}`);
  }
  return out;
}

const sample = (lines) => trimmed(lines).slice(0, SAMPLE_LINES).map((l) => (l.length > SAMPLE_CHARS ? l.slice(0, SAMPLE_CHARS - 1) + "…" : l));

// Sets f.mechanical (and f.repeatedGroup) on files whose change needs no line-by-line review, first
// match wins:
//   generated   regenerated output, lockfiles, or `linguist-generated` in .gitattributes;
//   rename      moved without an edit (both sides of the move);
//   whitespace  nothing left once whitespace amounts, line ends and blank lines are ignored;
//   repeated    every hunk is one that at least REPEATED_HUNK_FILES files share, exactly or by shape
//               (renames only); an R3 file never joins a shape group, a rename there can rebind.
//               Files sharing the same set of hunks form a group; its first file is the representative.
//               A file with the group's hunks plus others of its own is an outlier: it stays in review.
// Returns the groups for the report.
export function markMechanical(files, hunks, { renames = [], whitespace = new Set(), generatedGlobs = [], facadeExports = new Set() } = {}) {
  const groups = [];
  const changed = files.map((f) => f.path);

  const generated = new Map();
  for (const f of files) {
    const rule = GENERATED.find((r) => r.globs.some((g) => globMatch(g, f.path)));
    const attr = !rule && generatedGlobs.some((g) => globMatch(g, f.path));
    if (!rule && !attr) continue;
    const what = rule?.what ?? "linguist-generated";
    if (!generated.has(what)) generated.set(what, { rule, files: [] });
    generated.get(what).files.push(f.path);
  }
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const [what, { rule, files: paths }] of generated) {
    const sourceGlobs = (rule?.sources ?? []).flatMap((g) => paths.map((p) => g.replace(/^\{dir\}\//, path.dirname(p) === "." ? "" : `${path.dirname(p)}/`)));
    const sources = changed.filter((p) => !paths.includes(p) && (sourceGlobs.some((g) => globMatch(g, p)) || (rule?.facade && facadeExports.has(p))));
    const suspicious = Boolean(rule) && !sources.length;
    // A regeneration with no source is a hand edit until shown otherwise: it stays in review.
    if (!suspicious) for (const p of paths) byPath.get(p).mechanical = "generated";
    const explanation = !rule
      ? "marked linguist-generated in .gitattributes"
      : sources.length
        ? `${what} regenerated from ${sources.length} changed source file(s) in this diff`
        : `${what} changed with no source change in this diff: a hand edit, or a regeneration against something outside the repository; read it as code`;
    groups.push({ id: `g${groups.length + 1}`, kind: "generated", what, count: paths.length, files: paths, sources, suspicious, explanation });
  }

  const pairs = renames.filter(({ from, to }) => [from, to].every((p) => byPath.has(p) && !byPath.get(p).mechanical));
  const moved = new Set(pairs.flatMap(({ from, to }) => [from, to]));
  for (const f of files) if (moved.has(f.path)) f.mechanical = "rename";
  if (pairs.length) groups.push({ id: "rename", kind: "rename", count: moved.size, files: [...moved], pairs, explanation: `${pairs.length} file(s) moved without an edit` });

  const spaced = files.filter((f) => !f.mechanical && whitespace.has(f.path) && f.added + f.deleted > 0);
  for (const f of spaced) f.mechanical = "whitespace";
  if (spaced.length) groups.push({ id: "whitespace", kind: "whitespace", count: spaced.length, files: spaced.map((f) => f.path), explanation: "nothing left once changed amounts of whitespace, line ends and blank lines are ignored: only indentation, line ends or blank lines changed" });

  groups.push(...repeatedGroups(files.filter((f) => !f.mechanical), hunks));
  return groups;
}

function repeatedGroups(files, hunks) {
  const hunksOf = new Map();
  const exactFiles = new Map();
  const shapeFiles = new Map();
  const count = (map, keys) => keys.forEach((k) => map.set(k, (map.get(k) ?? 0) + 1));
  for (const f of files) {
    const hs = (hunks.get(f.path) ?? []).map((h) => {
      const exact = hunkKey(h);
      const shape = exact && !(f.tier >= 3) ? shapeKey(h) : "";
      return { h, exact: exact && hash(exact), shape: shape && hash(shape) };
    });
    hunksOf.set(f, hs.filter((x) => x.exact));
    count(exactFiles, [...new Set(hs.map((x) => x.exact).filter(Boolean))]);
    count(shapeFiles, [...new Set(hs.map((x) => x.shape).filter(Boolean))]);
  }
  // A hunk shared exactly wins over one shared only by shape.
  const shared = (x) => (exactFiles.get(x.exact) >= REPEATED_HUNK_FILES ? `exact:${x.exact}` : x.shape && shapeFiles.get(x.shape) >= REPEATED_HUNK_FILES ? `shape:${x.shape}` : null);

  const bySignature = new Map();
  const partial = [];
  for (const [f, hs] of hunksOf) {
    if (!hs.length) continue;
    const keys = hs.map(shared);
    const known = [...new Set(keys.filter(Boolean))].sort();
    if (!known.length) continue;
    if (keys.some((k) => !k)) {
      partial.push({ f, known: new Set(known) });
      continue;
    }
    const signature = known.join("|");
    if (!bySignature.has(signature)) bySignature.set(signature, { known, members: [] });
    bySignature.get(signature).members.push({ f, hs });
  }

  const out = [];
  for (const { known, members } of bySignature.values()) {
    const id = `r${out.length + 1}`;
    for (const { f } of members) {
      f.mechanical = "repeated";
      f.repeatedGroup = id;
    }
    const match = known.every((k) => k.startsWith("exact:")) ? "exact" : "shape";
    const outliers = partial.filter((p) => known.every((k) => p.known.has(k))).map((p) => p.f.path);
    const rep = members[0];
    const n = members.length;
    const explanation =
      (match === "exact" ? `the same edit in ${n} file(s)` : `the same edit shape in ${n} file(s), with different names or literals: read the representative, spot-check one more`) +
      (outliers.length ? `; ${outliers.length} more file(s) make it plus edits of their own and stay in review` : "");
    out.push({
      id,
      kind: "repeated",
      match,
      count: n,
      files: members.map((m) => m.f.path),
      representative: rep.f.path,
      before: sample(rep.hs.flatMap((x) => x.h.deleted)),
      after: sample(rep.hs.flatMap((x) => x.h.added)),
      outliers,
      explanation,
    });
  }
  return out;
}
