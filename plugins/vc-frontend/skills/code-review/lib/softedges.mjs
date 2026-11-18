// Links between changed files that no import shows. In this codebase files also meet through a kit
// tag (kit components are registered globally, never imported), a GraphQL operation (the .graphql
// file, its generated Document and the wrapper that runs it), a shared key (an extension-point name,
// a postMessage type, a storage key, an event name) and an `import.meta.glob` loader. Each soft edge
// is [from, to, kind, via], `via` naming what links the two files.

import path from "node:path";
import { escapeRe, globMatch } from "./globs.mjs";
import { gitGrep, grepHits } from "./git.mjs";
import { exportedNames } from "./graph.mjs";
import { CODE_FILE, RARE_IDENTIFIER_MAX_FILES, SOFT_KEY_MAX_FILES, TEST_LIKE } from "./zones.mjs";

const changedLines = (f) => [...f.addedText, ...f.deletedText];

// Every file that shares a key, linked to one hub: the defining file when there is one, else the
// first. A star connects them as a clique would, in fewer edges.
function star(paths, kind, via, hub = paths[0]) {
  return paths.filter((p) => p !== hub).map((p) => [p, hub, kind, via]);
}

// `<VcPopover` or `<vc-popover` in a changed .vue file, for a changed kit component.
export function tagEdges(nodeFiles, read) {
  const kit = new Map();
  for (const f of nodeFiles) {
    if (f.path.startsWith("client-app/ui-kit/") && f.path.endsWith(".vue")) for (const n of exportedNames(f.path)) kit.set(n, f.path);
  }
  if (!kit.size) return [];
  const re = new RegExp(`<(${[...kit.keys()].map(escapeRe).join("|")})(?=[\\s/>])`, "g");
  const out = [];
  for (const f of nodeFiles) {
    if (!f.path.endsWith(".vue")) continue;
    const used = new Map([...read(f.path).matchAll(re)].map((m) => [kit.get(m[1]), m[1]]));
    for (const [k, name] of used) if (k !== f.path) out.push([f.path, k, "tag", name]);
  }
  return out;
}

const GQL_DEF = /\b(?:query|mutation|subscription|fragment)\s+([A-Za-z_]\w*)/g;
const GQL_USE = /(?:\.\.\.\s*|\bon\s+)([A-Za-z_]\w*)/g;
const GQL_GENERATED = /\b([A-Z]\w*?)(?:Document|QueryVariables|MutationVariables|Query|Mutation|FragmentDoc|Fragment|Type)\b/g;
// `GetCartQuery`, `GetCartDocument` and `query GetCart` are one operation; `CartType` and `on CartType`
// one type. Keys keep the name without the generated suffix.
const gqlKey = (name) => name.replace(/(?:Document|QueryVariables|MutationVariables|Query|Mutation|FragmentDoc|Fragment|Type)$/, "");

export function graphqlEdges(nodeFiles, read) {
  const byKey = new Map();
  const defines = new Map();
  const note = (key, p) => {
    if (key.length < 3) return;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(p);
  };
  for (const f of nodeFiles) {
    if (f.path.endsWith(".graphql")) {
      // A .graphql file names its operation in the whole file, and what it spreads or narrows to in its changed lines.
      for (const m of (read(f.path) || f.deletedText.join("\n")).matchAll(GQL_DEF)) {
        note(gqlKey(m[1]), f.path);
        defines.set(gqlKey(m[1]), f.path);
      }
      for (const l of changedLines(f)) for (const m of l.matchAll(GQL_USE)) note(gqlKey(m[1]), f.path);
    } else if (CODE_FILE.test(f.path)) {
      for (const l of changedLines(f)) for (const m of l.matchAll(GQL_GENERATED)) note(m[1], f.path);
    }
  }
  const out = [];
  for (const [key, set] of byKey) {
    if (set.size < 2 || set.size > SOFT_KEY_MAX_FILES) continue;
    const paths = [...set].sort();
    out.push(...star(paths, "graphql", key, defines.get(key) && set.has(defines.get(key)) ? defines.get(key) : paths[0]));
  }
  return out;
}

const STRING_LITERAL = /(["'`])((?:(?!\1)[^\\\n]|\\.){6,80})\1/g;
const UPPER_SNAKE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const IMPORT_LINE = /^\s*import\b|\bfrom\s*["']|\bimport\(/;
// Sentences and class lists (spaces), template strings, module paths, URLs, i18n keys and colours
// are not keys that tie two files together; dropping them keeps the repo-wide grep small.
const NOT_A_KEY = /\s|\$\{|^(?:\.{1,2}\/|@\/|\/\/|https?:)|^[a-z][\w-]*(?:\.[\w-]+)+$|^#?[0-9a-f]+$/i;

export function identifierCandidates(f) {
  const out = new Set();
  for (const l of changedLines(f)) {
    if (IMPORT_LINE.test(l)) continue;
    for (const m of l.matchAll(STRING_LITERAL)) if (!NOT_A_KEY.test(m[2])) out.add(m[2]);
    for (const m of l.matchAll(UPPER_SNAKE)) if (m[0].length >= 4) out.add(m[0]);
  }
  return out;
}

// Repo-wide file count per candidate, in one `git grep -o`.
export function grepFileCounts(cands) {
  return new Map([...grepHits(cands, { scope: [".", ":!yarn.lock"] })].map(([c, s]) => [c, s.size]));
}

// A string literal or UPPER_SNAKE constant in the changed lines of two or more changed files that at
// most RARE_IDENTIFIER_MAX_FILES files in the repository contain: a registry key, a message type, a
// storage key. Only candidates two changed files share are grepped.
export function identifierEdges(nodeFiles, counts = grepFileCounts) {
  const byCand = new Map();
  for (const f of nodeFiles) {
    if (!CODE_FILE.test(f.path)) continue;
    for (const c of identifierCandidates(f)) {
      if (!byCand.has(c)) byCand.set(c, []);
      byCand.get(c).push(f.path);
    }
  }
  const shared = [...byCand].filter(([, ps]) => ps.length >= 2 && ps.length <= RARE_IDENTIFIER_MAX_FILES);
  const n = counts(shared.map(([c]) => c));
  const out = [];
  for (const [c, ps] of shared) if ((n.get(c) ?? 0) <= RARE_IDENTIFIER_MAX_FILES) out.push(...star(ps.sort(), "identifier", c.length > 40 ? c.slice(0, 39) + "…" : c));
  return out;
}

const GLOB_CALL = /import\.meta\.glob\b[^(]*\(\s*(\[[^\]]*\]|(["'`])[^"'`]*\2)/g;

// The patterns of every `import.meta.glob` call in a file, as repository paths.
export function globPatterns(loader, text) {
  const out = [];
  for (const m of text.matchAll(GLOB_CALL)) {
    for (const s of m[1].matchAll(/(["'`])([^"'`]+)\1/g)) {
      const p = s[2];
      if (p.startsWith("!")) continue;
      const full = p.startsWith("@/") ? `client-app/${p.slice(2)}` : p.startsWith("/") ? p.slice(1) : path.posix.join(path.posix.dirname(loader), p);
      out.push(path.posix.normalize(full));
    }
  }
  return out;
}

// A changed loader links to the changed files it loads; an unchanged loader links the changed files
// it loads to each other, since one registry reads them all.
export function globEdges(nodeFiles, read, loaders = gitGrep([], "", [], "import\\.meta\\.glob")) {
  const nodes = new Set(nodeFiles.map((f) => f.path));
  const out = [];
  for (const loader of loaders) {
    if (TEST_LIKE.test(loader) || !/\.(ts|js|mjs|vue)$/.test(loader)) continue;
    for (const pattern of globPatterns(loader, read(loader))) {
      const loaded = [...nodes].filter((p) => p !== loader && globMatch(pattern, p)).sort();
      if (nodes.has(loader)) out.push(...loaded.map((p) => [loader, p, "glob", pattern]));
      else if (loaded.length >= 2) out.push(...star(loaded, "glob", `${loader}: ${pattern}`));
    }
  }
  return out;
}
