// plugins/vc-test/lib/personas.mjs — the project's own personas file (skills/qa-design/personas.md §0): its
// archetypes, its segment vocabulary and its persona → account map, kept in the PROJECT knowledge store
// (`<store>/personas.md`). Every write goes through knowledge-store.mjs writeKnowledge, so it lands only in the
// project store, scrubbed of the project's secret values — never in the platform store or the public kb.
// A person decides every row: the visual lane only PROPOSES personas; /vc-test:init and the run's close-out add
// the ones the operator accepts, with this script.
// CLI (from the project root):
//   node <plugin>/lib/personas.mjs --show
//   node <plugin>/lib/personas.mjs --init
//   node <plugin>/lib/personas.mjs --add --section archetypes|segments|accounts --row '| a | b | … |' [--replace]
// Prints one JSON object. Exit 0 done · 1 refused (bad row, duplicate without --replace) · 2/3 profile missing/unreadable.
import { pathToFileURL } from "node:url";
import { readKnowledge, storeConfig, writeKnowledge } from "./knowledge-store.mjs";
import { argOf, outputRoot } from "./paths.mjs";
import { loadProfile } from "./profile.mjs";

const SLUG = "project"; // `personas` is one file per store; writeKnowledge still takes a slug

/** The sections, in file order, with the columns each table carries. */
export const SECTIONS = Object.freeze({
  archetypes: ["Persona", "Account", "Starts at", "Device", "Acts like", "Succeeds when"],
  segments: ["Segment", "Values", "Where it shows in the product", "Where a ticket names it"],
  accounts: ["Persona", "Env", "Key"],
});

const title = (name) => name[0].toUpperCase() + name.slice(1);
const headerRow = (cols) => `| ${cols.join(" | ")} |`;
const ruleRow = (cols) => `|${cols.map(() => "---").join("|")}|`;

/** A new, empty file: the three tables with their headers and no rows. */
export function skeleton() {
  const parts = [
    "# Personas — this project's own",
    "",
    "Read by vc-test's visual lane before it derives personas from a ticket (vc-test `skills/qa-design/personas.md` §0).",
    "A row here replaces the plugin's archetype of the same name, or adds one. Rows are added by a person,",
    "with `node <vc-test>/lib/personas.mjs --add`.",
  ];
  for (const [name, cols] of Object.entries(SECTIONS)) parts.push("", `## ${title(name)}`, "", headerRow(cols), ruleRow(cols));
  return `${parts.join("\n")}\n`;
}

/** The cells of a Markdown table row, or null when the line is not one. */
export function cellsOf(line) {
  const t = String(line).trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) return null;
  return t.slice(1, -1).split("|").map((c) => c.trim());
}

const isRule = (cells) => cells.every((c) => /^:?-{3,}:?$/.test(c));

/** Where each section's table is: { name: { header, rule, rows: [lineIndex…], end } } — absent sections omitted. */
function locate(lines) {
  const found = {};
  let current = null;
  lines.forEach((line, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].toLowerCase();
      current = Object.prototype.hasOwnProperty.call(SECTIONS, name) ? name : null;
      if (current) found[current] = { heading: i, header: -1, rule: -1, rows: [], end: i };
      return;
    }
    if (!current) return;
    const cells = cellsOf(line);
    const sec = found[current];
    if (!cells) return;
    if (sec.header < 0) sec.header = i;
    else if (sec.rule < 0 && isRule(cells)) sec.rule = i;
    else sec.rows.push(i);
    sec.end = i;
  });
  return found;
}

/**
 * The file with `row` added to `section`. A row whose first cell names an existing one (case-insensitive) is refused
 * unless `replace`, which swaps it in place. A missing section is appended with its header.
 * @returns {{ text: string, replaced: boolean }}
 */
export function addRow(text, section, row, { replace = false } = {}) {
  const cols = SECTIONS[section];
  if (!cols) throw new Error(`unknown section "${section}" (known: ${Object.keys(SECTIONS).join(", ")})`);
  const cells = cellsOf(row);
  if (!cells) throw new Error("a row is one Markdown table line: | a | b | … |");
  if (cells.length !== cols.length) throw new Error(`${section} rows have ${cols.length} cells (${cols.join(" · ")}); this one has ${cells.length}`);
  if (!cells[0]) throw new Error(`the first cell (${cols[0]}) must not be empty`);
  const clean = headerRow(cells);
  const lines = String(text).replace(/\s+$/, "").split("\n");
  const sec = locate(lines)[section];
  if (!sec || sec.header < 0) {
    lines.push("", `## ${title(section)}`, "", headerRow(cols), ruleRow(cols), clean);
    return { text: `${lines.join("\n")}\n`, replaced: false };
  }
  const key = section === "accounts" ? (c) => `${c[0]}\u0000${c[1]}`.toLowerCase() : (c) => c[0].toLowerCase();
  const same = sec.rows.find((i) => key(cellsOf(lines[i])) === key(cells));
  if (same !== undefined) {
    if (!replace) throw new Error(`${section} already has "${cells[0]}"${section === "accounts" ? ` on ${cells[1]}` : ""} — pass --replace to change it`);
    lines[same] = clean;
    return { text: `${lines.join("\n")}\n`, replaced: true };
  }
  const after = Math.max(sec.rule, sec.header, ...sec.rows);
  lines.splice(after + 1, 0, clean);
  return { text: `${lines.join("\n")}\n`, replaced: false };
}

/** The rows of every section as cell arrays — what a reader of the file gets. */
export function parsePersonas(text) {
  const lines = String(text).split("\n");
  const found = locate(lines);
  const out = {};
  for (const name of Object.keys(SECTIONS)) out[name] = (found[name]?.rows ?? []).map((i) => cellsOf(lines[i]));
  return out;
}

function cli(argv) {
  const root = outputRoot();
  const cfg = storeConfig(loadProfile({ root }), { root });
  const current = () => {
    const hit = readKnowledge({ ...cfg, platform: null }, "personas", SLUG); // the project's file only
    return hit ? hit.text : null;
  };
  if (argv.includes("--show")) {
    const text = current();
    return { store: cfg.project, exists: text !== null, ...(text !== null ? { personas: parsePersonas(text) } : {}) };
  }
  if (argv.includes("--init")) {
    if (current() !== null) return { created: false, store: cfg.project, note: "personas.md already exists — left as it is" };
    const { path } = writeKnowledge(cfg, { kind: "personas", slug: SLUG, text: skeleton() });
    return { created: true, path };
  }
  if (argv.includes("--add")) {
    const section = argOf(argv, "section");
    const row = argOf(argv, "row");
    if (!section || !row) throw Object.assign(new Error("--add needs --section and --row"), { exit: 1 });
    let result;
    try {
      result = addRow(current() ?? skeleton(), section, row, { replace: argv.includes("--replace") });
    } catch (e) {
      throw Object.assign(e, { exit: 1 });
    }
    const { path } = writeKnowledge(cfg, { kind: "personas", slug: SLUG, text: result.text });
    return { written: true, path, section, replaced: result.replaced };
  }
  throw Object.assign(new Error("usage: personas.mjs --show | --init | --add --section <archetypes|segments|accounts> --row '| … |' [--replace]"), { exit: 1 });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(JSON.stringify(cli(process.argv.slice(2)), null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
    process.exit(e.exit ?? e.code ?? 1);
  }
}
