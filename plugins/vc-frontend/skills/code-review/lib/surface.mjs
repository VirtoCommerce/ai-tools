// The changed files other code builds on from outside their folder or outside the repository, with
// what their public API gained and lost. The consumers lens reads these; the overview shows them so a
// reviewer sees an API change without opening the diff.

import { API_DELTA_LINES, FACADE_ENTRY, PUBLIC_BARREL, TIERS } from "./zones.mjs";

// files: classified files (numeric tier); read: { head(p), base(p) } texts for .vue files.
export function publicSurface(files, read) {
  const out = [];
  for (const f of files) {
    if (f.tier === 0 || f.mechanical) continue;
    const why = [...f.external];
    if (PUBLIC_BARREL.test(f.path)) why.push("public barrel: forks and modules import what it exports");
    if (FACADE_ENTRY.test(f.path)) why.push("plugin facade entry (@vc-frontend/core)");
    if (f.status === "D" && ["ui-kit", "federation"].includes(f.zone)) why.push("deleted from ui-kit or the facade: forks and plugins may import it");
    if (!why.length) continue;
    out.push({ path: f.path, status: f.status, tier: TIERS[f.tier], why, consumers: f.consumers.length, api: apiDelta(f, read) });
  }
  return out;
}

export function apiDelta(f, read) {
  if (f.path.endsWith(".vue")) return vueDelta(f, read);
  if (/\.(ts|tsx|js|mjs)$/.test(f.path)) return exportDelta(f.addedText, f.deletedText);
  return null;
}

const EXPORT_DECL = /^\s*export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function\*?|class|enum|type|interface)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_LIST_OPEN = /^\s*export\s*(?:type\s*)?\{([^}]*)(\})?/;
const EXPORT_STAR = /^\s*export\s*\*\s*(?:as\s+([\w$]+)\s+)?from\s*["']([^"']+)["']/;

const listNames = (s) =>
  s
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && n !== "default");

// Exported names in a run of changed lines. An `export {` list that the change adds or removes whole
// spans lines; its names count until the closing brace.
export function exportNames(lines) {
  const decl = new Set();
  const list = new Set();
  let open = false;
  for (const l of lines) {
    if (open) {
      for (const n of listNames(l.split("}")[0])) list.add(n);
      if (l.includes("}")) open = false;
      continue;
    }
    const d = l.match(EXPORT_DECL);
    if (d) {
      decl.add(d[1]);
      continue;
    }
    const s = l.match(EXPORT_STAR);
    if (s) {
      list.add(s[1] ? `* as ${s[1]}` : `* from ${s[2]}`);
      continue;
    }
    const o = l.match(EXPORT_LIST_OPEN);
    if (o) {
      for (const n of listNames(o[1])) list.add(n);
      open = !o[2];
    }
  }
  return { decl, list };
}

// Added and removed exports; a declaration on both sides was edited in place (its signature or value
// changed). An export-list line edited in place is not reported as changed: only its new or lost names matter.
export function exportDelta(addedText, deletedText) {
  const a = exportNames(addedText);
  const d = exportNames(deletedText);
  const all = (x) => new Set([...x.decl, ...x.list]);
  const [aa, dd] = [all(a), all(d)];
  const delta = {
    added: [...aa].filter((n) => !dd.has(n)).sort(),
    removed: [...dd].filter((n) => !aa.has(n)).sort(),
    changed: [...a.decl].filter((n) => d.decl.has(n)).sort(),
  };
  return compact(delta);
}

const API_BLOCK = /\binterface\s+\w*?(Props|Emits?|Slots)\w*\b|\bdefine(Props|Emits|Slots)\s*<|\bwithDefaults\s*\(/;
const KIND = { Props: "props", Emit: "emits", Emits: "emits", Slots: "slots" };

// 1-based line → API kind in a single-file component: the lines of the props, emits and slots
// interfaces or inline type literals, and of the withDefaults() call, found by brace and paren depth
// (angle brackets are left out: `=>` would close them).
export function apiLineKinds(text) {
  const kinds = new Map();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(API_BLOCK);
    if (!m) continue;
    const kind = m[1] ? KIND[m[1]] : m[2] ? KIND[m[2]] : "props";
    let depth = 0;
    let j = i;
    for (; j < lines.length; j++) {
      kinds.set(j + 1, kind);
      for (const ch of lines[j]) depth += "{(".includes(ch) ? 1 : "})".includes(ch) && depth > 0 ? -1 : 0;
      if (depth === 0 && j > i) break;
      if (depth === 0 && /[})]/.test(lines[j])) break;
    }
    i = j;
  }
  return kinds;
}

const lineKind = (kinds, n, text) => (/\bdefineModel\b/.test(text) ? "model" : /<slot\b/.test(text) ? "slots" : kinds.get(n) ?? null);
const short = (l) => (l.length > 100 ? l.slice(0, 99) + "…" : l);

export function vueDelta(f, read) {
  const head = apiLineKinds(f.status === "D" ? "" : read.head(f.path));
  const base = apiLineKinds(f.status === "A" ? "" : read.base(f.path));
  const out = {};
  const note = (kind, side, text) => {
    const t = text.trim();
    if (!kind || !t || /^(\/\/|\/\*|\*)/.test(t)) return;
    out[kind] ??= { added: [], removed: [] };
    out[kind][side].push(short(t));
  };
  f.addedLines.forEach((n, i) => note(lineKind(head, n, f.addedText[i]), "added", f.addedText[i]));
  f.deletedLines.forEach((n, i) => note(lineKind(base, n, f.deletedText[i]), "removed", f.deletedText[i]));
  for (const k of Object.keys(out)) out[k] = compact(out[k]);
  return Object.keys(out).length ? out : null;
}

// Empty lists dropped, long ones cut to API_DELTA_LINES with a count of the rest.
function compact(delta) {
  const out = {};
  for (const [k, v] of Object.entries(delta)) {
    if (!v.length) continue;
    out[k] = v.length > API_DELTA_LINES ? [...v.slice(0, API_DELTA_LINES), `… ${v.length - API_DELTA_LINES} more`] : v;
  }
  return Object.keys(out).length ? out : null;
}
