// The impact map: for every changed hunk of non-trivial code, the code around it (the enclosing
// symbol), what it calls into (imported names it touches, with their files) and who calls it (files
// naming the symbol elsewhere). A one-line change in payment can only be judged by reading what it
// touches; the map tells the reviewer where to look without a shell.

import path from "node:path";
import { grepHits } from "./git.mjs";
import { exportedNames } from "./graph.mjs";
import { CODE_FILE, IMPACT_USED_BY_MAX, TEST_LIKE } from "./zones.mjs";

const NAME = "[A-Za-z_$][\\w$]*";
const KEYWORDS = new Set("if for while switch catch return function else do try with new typeof await yield".split(" "));
// Declarations that open a scope, first match wins. Each returns the label the map shows.
const DECLS = [
  [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\*?\\s*(${NAME})`), (m) => m[1]],
  [new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+(${NAME})\\s*(?::[^=]*)?=\\s*(?:(computed|watch|watchEffect)\\b)?`), (m) => (m[2] ? `${m[1]} (${m[2]})` : m[1])],
  [new RegExp(`^\\s*(watch|watchEffect|watchPostEffect|onMounted|onBeforeMount|onBeforeUnmount|onUnmounted|onActivated)\\s*\\(\\s*(?:\\(\\)\\s*=>\\s*)?([\\w$.]+)?`), (m) => (m[1].startsWith("watch") && m[2] ? `${m[1]}(${m[2]})` : m[1])],
  [new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+(${NAME})`), (m) => m[1]],
  [new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:interface|type|enum)\\s+(${NAME})`), (m) => m[1]],
  [new RegExp(`^\\s*(?:(?:public|private|protected|static|readonly|override|get|set)\\s+)*(?:async\\s+)?\\*?(${NAME})\\s*(?:<[^>]*>)?\\(.*\\)\\s*(?::\\s*[^={]+)?\\{\\s*$`), (m) => (KEYWORDS.has(m[1]) ? null : m[1])],
  [new RegExp(`^\\s*(${NAME})\\s*:\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|${NAME}\\s*=>)`), (m) => (KEYWORDS.has(m[1]) ? null : m[1])],
];

// Strings and comments carry brackets that do not nest code.
const codeOnly = (l) => l.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, "");

// For each 1-based line of a script, the chain of declarations open on it, outermost first. One pass:
// a declaration opens on its line and closes when bracket depth falls back to where it started; one
// that never opens a bracket ends with its line.
export function scopeChains(text) {
  const chains = [null];
  const stack = [];
  let depth = 0;
  for (const raw of text.split("\n")) {
    const line = codeOnly(raw);
    const trimmed = raw.trim();
    if (!trimmed.startsWith("*") && !trimmed.startsWith("/*")) {
      for (const [re, label] of DECLS) {
        const m = line.match(re);
        const name = m && label(m);
        if (name) {
          stack.push({ name, depth });
          break;
        }
      }
    }
    chains.push(stack.map((s) => s.name));
    for (const ch of line) {
      if ("{([".includes(ch)) depth++;
      else if ("})]".includes(ch)) depth = Math.max(0, depth - 1);
    }
    while (stack.length && depth <= stack.at(-1).depth) stack.pop();
  }
  return chains;
}

// Where a line sits: the innermost two declarations around it, or for a .vue file the SFC block
// (template, style) or the declarations inside <script>.
export function enclosing(file, text, line) {
  if (!file.endsWith(".vue")) return label(scopeChains(text)[line]);
  const lines = text.split("\n");
  let block = null;
  let start = 0;
  for (let i = 0; i < Math.min(line, lines.length); i++) {
    const open = lines[i].match(/^<(template|script|style)\b/);
    if (open) [block, start] = [open[1], i + 1];
    else if (/^<\/(template|script|style)>/.test(lines[i]) && i + 1 < line) block = null;
  }
  if (block !== "script") return block ? `<${block}>` : null;
  const inner = label(scopeChains(lines.slice(start, line).join("\n")).at(-1));
  return inner ? `<script> ${inner}` : "<script>";
}

const label = (chain) => (chain?.length ? chain.slice(-2).join(" › ") : null);

// Local name → import specifier, from `import` statements (multi-line too).
export function importMap(text) {
  const out = new Map();
  for (const m of text.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = m[1];
    const spec = m[2];
    const named = clause.match(/\{([\s\S]*)\}/);
    const rest = clause.replace(/\{[\s\S]*\}/, "");
    for (const part of named ? named[1].split(",") : []) {
      const local = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (local) out.set(local, spec);
    }
    const ns = rest.match(new RegExp(`\\*\\s+as\\s+(${NAME})`));
    if (ns) out.set(ns[1], spec);
    const def = rest.match(new RegExp(`^\\s*(${NAME})`));
    if (def) out.set(def[1], spec);
  }
  return out;
}

// Imported names a hunk's changed lines mention, each with the file it comes from: depcruise's
// resolution inside client-app when there is one, else the `@/` alias or the relative path, else the
// package name.
export function hunkUses(file, hunk, imports, resolved = null) {
  const words = new Set([...hunk.added, ...hunk.deleted].flatMap((l) => l.match(/[A-Za-z_$][\w$]*/g) ?? []));
  const out = [];
  for (const [name, spec] of imports) {
    if (!words.has(name)) continue;
    // A package resolves into node_modules; its name says more than that path.
    const hit = resolved?.get(spec);
    const from = hit?.startsWith("client-app/") ? hit : (spec.startsWith("@/") ? `client-app/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.join(path.posix.dirname(file), spec) : spec);
    out.push({ name, from });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Registered for templates (a global component, directive or property): templates use it by a name
// no word grep sees.
const GLOBAL_REGISTRATION = /\bapp\.(?:component|directive)\(|globalProperties/;
const TEMPLATE_NOTE = "template usages are found by tag grep only for ui-kit; other template references may be missing";

// complete: the list holds every user a grep can see, so none was cut and no template hides one.
function usedByOf(users, grepSeesAll) {
  const complete = grepSeesAll && users.length <= IMPACT_USED_BY_MAX;
  return { total: users.length, files: users.slice(0, IMPACT_USED_BY_MAX), complete, ...(grepSeesAll ? {} : { note: TEMPLATE_NOTE }) };
}

const SHARED_MODULE = /^client-app\/shared\/|\/composables\/|(^|\/)use[A-Z]\w*\.ts$/;

// files: classified files; hunks: path → hunks with positions; read(p): HEAD text; graph: depcruise
// graph or null; grep: (names) → Map name → Set of files (one batch for the whole change).
export function impactMap(files, hunks, { read, graph = null, grep = (names) => grepHits(names, { word: true, scope: ["client-app"] }) }) {
  const out = [];
  const asked = new Map();
  for (const f of files) {
    if (f.tier < 1 || f.mechanical || f.status === "D" || !CODE_FILE.test(f.path)) continue;
    const text = read(f.path);
    const imports = importMap(`${text}\n${f.deletedText.join("\n")}`);
    const exported = new Set(f.path.endsWith(".vue") ? [] : exportedNames(f.path, text));
    const shared = SHARED_MODULE.test(f.path);
    const hs = (hunks.get(f.path) ?? []).map((h) => {
      const at = Math.max(1, h.newStart);
      const lines = h.newCount ? `${h.newStart}-${h.newStart + h.newCount - 1}` : `after ${h.newStart}`;
      const where = enclosing(f.path, text, at);
      const top = where?.replace(/^<script> /, "").split(" › ")[0].replace(/ \(.*\)$/, "");
      // Who calls it only matters for a symbol other files can reach.
      const symbol = top && /^[A-Za-z_$][\w$]*$/.test(top) && (exported.has(top) || (shared && !f.path.endsWith(".vue"))) ? top : null;
      if (symbol) asked.set(symbol, (asked.get(symbol) ?? new Set()).add(f.path));
      const entry = { lines, in: where, uses: hunkUses(f.path, h, imports, graph?.resolve?.get(f.path)), symbol };
      // A component's users are its consumers. Templates reach components by tag, and only kit tags
      // are grepped, so the list is never known to be complete.
      if (f.path.endsWith(".vue")) entry.usedBy = usedByOf(f.consumers.filter((p) => !TEST_LIKE.test(p)), false);
      return entry;
    });
    if (hs.length) out.push({ path: f.path, hunks: hs });
  }
  const hits = asked.size ? grep([...asked.keys()]) : new Map();
  for (const entry of out) {
    for (const h of entry.hunks) {
      if (h.symbol) {
        const users = [...(hits.get(h.symbol) ?? [])].filter((p) => p !== entry.path && !TEST_LIKE.test(p)).sort();
        h.usedBy = usedByOf(users, !GLOBAL_REGISTRATION.test(read(entry.path)));
      }
      delete h.symbol;
    }
  }
  return out;
}

// impact.md: per file, its hunks with line ranges and what each touches.
export function impactMarkdown(impact) {
  const code = (s) => "`" + s + "`";
  const lines = ["# Impact map", "", "Per changed hunk (HEAD line numbers): the declaration around it, the imported names its changed lines use, and the files that name its top-level symbol elsewhere (tests left out)."];
  for (const f of impact) {
    lines.push("", `## ${code(f.path)}`, "");
    let last = "";
    for (const h of f.hunks) {
      lines.push(`- lines ${h.lines}${h.in ? ` in ${code(h.in)}` : " at top level"}`);
      if (h.uses.length) lines.push(`  - uses: ${h.uses.map((u) => `${code(u.name)} (${u.from})`).join(", ")}`);
      // The same users under every hunk of one symbol or component say nothing new after the first.
      const used = h.usedBy ? `  - used by ${h.usedBy.total} file(s)${h.usedBy.total ? `: ${h.usedBy.files.join(", ")}${h.usedBy.total > h.usedBy.files.length ? ", …" : ""}` : ""}${h.usedBy.complete ? "" : ` (incomplete${h.usedBy.note ? `: ${h.usedBy.note}` : ""})`}` : "";
      if (used && used !== last) lines.push(used);
      else if (used) lines.push("  - used by: as above");
      last = used || last;
    }
  }
  return lines.join("\n") + "\n";
}
