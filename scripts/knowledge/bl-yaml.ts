/**
 * BL 2.0 — the business-logic oracle's only source: one YAML record file per domain, plus `bl/_oracle.yaml`.
 *
 * Design: `docs/bug-detection-requirements.md` §7.2 (the record) and §7.6 (the migration). Schema:
 * `templates/bl.schema.json`.
 *
 * THE YAML IS THE SOURCE; THE MARKDOWN IS ITS RENDER. `bl/<slug>.yaml` holds a domain's heading, prefixes,
 * agents, intro and rules; `bl/_oracle.yaml` holds what belongs to no domain (the preamble and the order of
 * the domain sections). `business-logic.md` is generated whole from them by `npm run bl:render`, and its
 * closing coverage table is computed from the records, never written by hand.
 *
 * NO SCRIPT READS THE MARKDOWN (M4). A consumer calls `oracleText()` — the same render, built in memory from
 * the YAML — or `loadBl()` for the records themselves. So the generated file can lag, be deleted or be edited
 * by hand without changing what any gate or extract sees; `--check` (a CI gate) keeps it equal to its render
 * for the people and the prompts that still open it by path.
 *
 * The md → YAML converter of M1 is gone: every domain was migrated in M3, and the markdown is now an output.
 *
 * Usage:
 *   npm run bl:convert:check                         # schema, index and agents; business-logic.md = its render
 *   npm run bl:render                                # regenerate business-logic.md (+ the vc-fix plugin copy) from the YAML
 *   npm run bl:convert -- --render <file.yaml>       # one domain's markdown section, to stdout
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from "yaml";
import { flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";

// Posix separators: SCHEMA_PATH is also read by fs on Windows, which accepts `/`.
const SCHEMA_PATH = "templates/bl.schema.json";
export const BL_DIR = join(".claude", "knowledge", "oracles", "bl");
/** The generated view. Written by `bl:render`, compared by `--check`, read by no script. */
export const BL_PATH = join(".claude", "knowledge", "oracles", "business-logic.md");
/**
 * The same render, shipped inside a plugin. A plugin is self-contained (plugins/CLAUDE.md): it cannot read this
 * repo's YAML at install time, so it carries the generated markdown, and `--check` keeps it equal to the render.
 */
export const PLUGIN_COPIES = [join("plugins", "vc-fix", "knowledge", "oracles", "business-logic.md")];
const VIEWS = [BL_PATH, ...PLUGIN_COPIES];
/** `_`-prefixed files in BL_DIR are not domains. */
const INDEX_FILE = "_oracle.yaml";

type SourceKind = "doc" | "ac" | "resolution" | "code" | "live" | "other";
export interface BlSource { kind: SourceKind; ref: string }
export interface BlRule {
  id: string;
  title: string;
  rule: string;
  priority: string;
  trust: "DECLARED" | "OBSERVED" | "INFERRED" | "UNREVIEWED";
  source: BlSource[];
  scope?: { module?: string; code_ref?: string };
  check: { kind: "executable" | "manual" | "none"; ref?: string; run?: string[]; steps?: string };
  violation_signal: string;
  verified?: { date: string; version?: string; by: string };
  status: "ACTIVE" | "SUSPECT" | "RETIRED";
  suspect_reason?: string | null;
  owner?: string;
}
export interface BlDomainFile {
  domain: { heading: string; prefixes: string[]; agents: string[]; intro?: string };
  rules: BlRule[];
}
export interface BlOracle {
  preamble: string;
  /** In section order. */
  domains: { slug: string; file: BlDomainFile }[];
  /** Index problems: a YAML file the index does not list, or a listed slug with no file. Empty = clean. */
  problems: string[];
}

/**
 * The agent roster on disk: `.claude/agents` and every `plugins/*\/agents`, by FILE name. Not
 * `knownAgentNames` (scripts/kb/core/caller.mjs): that reads the frontmatter `name`, and the oracle cites
 * agents by file name (`test-runner-agent`, whose frontmatter says "Test Runner Agent").
 */
export function readAgentRoster(): string[] {
  const dirs = [".claude/agents", ...(existsSync("plugins") ? readdirSync("plugins").map((p) => `plugins/${p}/agents`) : [])];
  const names = dirs
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.slice(0, -3)));
  return [...new Set(names)].sort();
}

function verifyLine(check: BlRule["check"]): string {
  if (check.kind === "manual") return check.ref!;
  if (check.kind === "executable") return `Executable check: \`${check.ref}\`.${check.steps ? ` By hand: ${check.steps}` : ""}`;
  return "No check.";
}

/** The markdown section for one domain file. Field order follows the pre-YAML oracle so a reader sees no change. */
export function renderDomain(file: BlDomainFile): string {
  const parts = [`## ${file.domain.heading}`];
  if (file.domain.intro) parts.push(file.domain.intro);
  for (const r of file.rules) {
    const lines = [
      `### ${r.id}: ${r.title}${r.priority ? ` \`[${r.priority}]\`` : ""}`,
      `- **Rule:** ${r.rule}`,
      `- **Verify:** ${verifyLine(r.check)}`,
      `- **Violation signal:** ${r.violation_signal}`,
      `- **Agents:** ${file.domain.agents.join(", ")}`,
    ];
    for (const s of r.source.filter((x) => x.kind === "doc")) lines.push(`- **Docs:** ${s.ref}`);
    for (const s of r.source.filter((x) => x.kind !== "doc")) lines.push(`- **Source:** ${s.ref}`);
    lines.push(`- **Trust:** ${r.trust}`);
    if (r.status !== "ACTIVE") lines.push(`- **Lifecycle:** ${r.status}${r.suspect_reason ? ` — ${r.suspect_reason}` : ""}`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

/** `Domain 2: Cart (BL-CART)` → `Cart`. */
function domainName(heading: string): string {
  return heading.replace(/^Domain\s+\d+[a-z]?:\s*/i, "").replace(/\s*\(BL-[^)]*\)\s*$/, "").trim();
}

/** `BL-CART-001`…`BL-CART-015` → `BL-CART-001–015`; ids keep their file order. */
function idRange(ids: readonly string[]): string {
  if (!ids.length) return "—";
  if (ids.length === 1) return ids[0];
  const last = ids[ids.length - 1];
  const shared = ids[0].slice(0, ids[0].lastIndexOf("-") + 1);
  return last.startsWith(shared) ? `${ids[0]}–${last.slice(shared.length)}` : `${ids[0]}–${last}`;
}

/** The closing table, computed from the records: a count is never transcribed (CLAUDE.md §Where the rules live). */
export function renderSummary(domains: readonly { file: BlDomainFile }[]): string {
  const rows: string[] = [];
  const total = { n: 0, p0: 0, p1: 0, p2: 0, declared: 0, suspect: 0 };
  for (const { file } of domains) {
    const rs = file.rules;
    const c = {
      n: rs.length,
      p0: rs.filter((r) => r.priority.startsWith("P0")).length,
      p1: rs.filter((r) => r.priority.startsWith("P1")).length,
      p2: rs.filter((r) => r.priority.startsWith("P2")).length,
      declared: rs.filter((r) => r.trust === "DECLARED").length,
      suspect: rs.filter((r) => r.status === "SUSPECT").length,
    };
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += c[k];
    rows.push(`| ${domainName(file.domain.heading)} | ${idRange(rs.map((r) => r.id))} | ${c.n} | ${c.p0} | ${c.p1} | ${c.p2} | ${c.declared} | ${c.suspect} |`);
  }
  return [
    "## Invariant Coverage Summary",
    "",
    "Generated from `bl/*.yaml` by `npm run bl:render`. P0 rolls up `[P0-revenue]` + `[P0-security]`; P1 rolls up",
    "`[P1-data]` + `[P1-ux]`. DECLARED counts rules a human source states (`trust`); SUSPECT counts rules a closed",
    "ticket or a docs page disputes (`status`).",
    "",
    "| Domain | ID Range | Total | P0 | P1 | P2 | DECLARED | SUSPECT |",
    "|--------|----------|-------|----|----|----|----------|---------|",
    ...rows,
    `| **Total** | | **${total.n}** | **${total.p0}** | **${total.p1}** | **${total.p2}** | **${total.declared}** | **${total.suspect}** |`,
  ].join("\n") + "\n";
}

/** The whole oracle: preamble, every domain in index order, the computed summary — `---` between sections. */
export function renderBl(oracle: Pick<BlOracle, "preamble" | "domains">): string {
  const sections = [oracle.preamble.trimEnd(), ...oracle.domains.map((d) => renderDomain(d.file).trimEnd()), renderSummary(oracle.domains).trimEnd()];
  return sections.join("\n\n---\n\n") + "\n";
}

export function toYaml(file: BlDomainFile): string {
  return stringifyYaml(file, { lineWidth: 0 });
}

export function fromYaml(text: string): BlDomainFile {
  return parseYaml(text) as BlDomainFile;
}

export function schemaValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf-8")));
}

/** Every domain file in `dir`, keyed by slug. */
export function readDomains(dir = BL_DIR): Map<string, BlDomainFile> {
  const out = new Map<string, BlDomainFile>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml") && !x.startsWith("_")).sort()) out.set(f.slice(0, -5), fromYaml(readFileSync(join(dir, f), "utf-8")));
  return out;
}

/** The oracle as records, in section order. A file the index does not list is still returned, after the listed ones. */
export function loadBl(dir = BL_DIR): BlOracle {
  const index = parseYaml(readFileSync(join(dir, INDEX_FILE), "utf-8")) as { preamble?: string; domains?: string[] };
  const files = readDomains(dir);
  const order = index.domains ?? [];
  const problems: string[] = [];
  for (const slug of order) if (!files.has(slug)) problems.push(`${INDEX_FILE} lists "${slug}" but there is no bl/${slug}.yaml`);
  const dupes = order.filter((s, i) => order.indexOf(s) !== i);
  if (dupes.length) problems.push(`${INDEX_FILE} lists ${[...new Set(dupes)].join(", ")} more than once`);
  const unlisted = [...files.keys()].filter((s) => !order.includes(s));
  for (const slug of unlisted) problems.push(`bl/${slug}.yaml is not listed in ${INDEX_FILE} domains`);
  const domains = [...new Set(order), ...unlisted].filter((s) => files.has(s)).map((slug) => ({ slug, file: files.get(slug)! }));
  return { preamble: index.preamble ?? "", domains, problems };
}

/** The oracle's markdown, rendered in memory from the YAML. What every script reads instead of business-logic.md. */
export function oracleText(dir = BL_DIR): string {
  return renderBl(loadBl(dir));
}

/**
 * The `--check` gate: the index lists every domain once, every file is schema-valid and names an agent on
 * the roster, rule ids are unique across domains, and the generated view equals its render. Empty = clean.
 */
export function checkBl(oracle: BlOracle, view: string | null, roster: readonly string[], validate = schemaValidator()): string[] {
  const problems = [...oracle.problems];
  const known = new Set(roster);
  const seen = new Map<string, string>();
  for (const { slug, file } of oracle.domains) {
    if (!validate(file)) problems.push(`bl/${slug}.yaml: schema: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    const strangers = (file.domain?.agents ?? []).filter((a) => !known.has(a));
    if (strangers.length) problems.push(`bl/${slug}.yaml: agents not on the roster: ${strangers.join(", ")}`);
    for (const r of file.rules ?? []) {
      if (seen.has(r.id)) problems.push(`${r.id} is in both bl/${seen.get(r.id)}.yaml and bl/${slug}.yaml`);
      seen.set(r.id, slug);
    }
  }
  return [...problems, ...checkView(oracle, view, BL_PATH)];
}

/** One generated file against the render. CRLF from a Windows checkout is not an edit. Empty = clean. */
export function checkView(oracle: Pick<BlOracle, "preamble" | "domains">, view: string | null, path: string): string[] {
  if (view === null) return [`${path} is missing — npm run bl:render`];
  if (view.replace(/\r\n/g, "\n") !== renderBl(oracle)) return [`${path} is not the render of bl/*.yaml — edit the YAML, then npm run bl:render (never the markdown)`];
  return [];
}

/**
 * A domain file not in the yaml library's own output form (a hand-typed `[a, b]` list, say) would be reformatted
 * the first time `bl:fresh` edits one field of it, burying that edit in a whole-file diff. Empty = clean.
 */
export function checkFormat(dir = BL_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml")) // _oracle.yaml too: bl:fresh writes freshness.closed_checked_through
    .filter((f) => {
      const text = readFileSync(join(dir, f), "utf-8").replace(/\r\n/g, "\n");
      return parseDocument(text).toString({ lineWidth: 0 }) !== text;
    })
    .map((f) => `bl/${f} is not in the form the yaml library writes (a flow list or odd spacing?) — rewrite that part in block style`);
}

/** Write every generated view (business-logic.md and the plugin copies) that differs from the render. Path → rewritten. */
export function renderViews(oracle: Pick<BlOracle, "preamble" | "domains"> = loadBl()): Map<string, boolean> {
  const text = renderBl(oracle);
  const out = new Map<string, boolean>();
  for (const path of VIEWS) {
    const before = existsSync(path) ? readFileSync(path, "utf-8") : null;
    if (before !== text) writeFileSync(path, text);
    out.set(path, before !== text);
  }
  return out;
}

function main(argv: string[]) {
  rejectUnknownFlags(argv, ["--check", "--render", "--render-oracle"], ["--render"]);
  const renderPath = flagValue(argv, "--render");
  if (renderPath) {
    process.stdout.write(renderDomain(fromYaml(readFileSync(renderPath, "utf-8"))));
    return 0;
  }
  const oracle = loadBl();

  if (argv.includes("--render-oracle")) {
    if (oracle.problems.length) {
      for (const p of oracle.problems) console.error(`  ✗ ${p}`);
      console.error("bl:render: fix the index first; nothing written");
      return 1;
    }
    for (const [path, changed] of renderViews(oracle)) console.log(`bl:render: ${oracle.domains.length} domains ${changed ? "regenerated" : "already current"} in ${path}`);
    return 0;
  }

  if (!argv.includes("--check")) {
    console.error("bl:convert: pass --check, --render-oracle or --render <file.yaml>");
    return 2;
  }
  const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf-8") : null);
  const problems = [...checkBl(oracle, read(BL_PATH), readAgentRoster()), ...PLUGIN_COPIES.flatMap((p) => checkView(oracle, read(p), p)), ...checkFormat()];
  const rules = oracle.domains.reduce((n, d) => n + d.file.rules.length, 0);
  console.log(`bl:convert --check: ${oracle.domains.length} domains, ${rules} rules, all owned by YAML`);
  for (const { slug, file: f } of oracle.domains) {
    const unreviewed = f.rules.filter((r) => r.trust === "UNREVIEWED").length;
    const executable = f.rules.filter((r) => r.check.kind === "executable").length;
    console.log(`  ${slug}: ${f.rules.length} rules, ${unreviewed} UNREVIEWED, ${executable} with an executable check`);
  }
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(problems.length ? `FAIL: ${problems.length} problem(s)` : `OK: the YAML is valid and ${VIEWS.join(", ")} are its render`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
