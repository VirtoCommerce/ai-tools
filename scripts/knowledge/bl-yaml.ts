/**
 * `bl:convert` — BL 2.0 migration stage M1: `business-logic.md` ⇄ one YAML record file per domain.
 *
 * Design: `docs/bug-detection-requirements.md` §7.2 (the record) and §7.6 (the migration). Schema:
 * `templates/bl.schema.json`.
 *
 * THE CONVERSION IS MECHANICAL. It reads what an entry already says and decides nothing:
 *   - `Rule` → `rule`, `Verify` → `check: { kind: manual, ref }`, `Violation signal` → `violation_signal`,
 *     the severity tag → `priority`;
 *   - `Docs` → a `doc` source, `Source` → a `code` / `ac` / `live` / `other` source by its wording;
 *   - `Agents` → the domain's `agents` list (§7.2: agents are derived from the domain, not stored per rule);
 *   - every other line of the entry (`Promoted`, `Amended`, `Live`, `Status`, `Severity rationale`,
 *     `Suite coverage`, the per-rule `Agents` detail, free prose) → the domain's history file, verbatim.
 * Every record gets `trust: UNREVIEWED` and `status: ACTIVE`. Setting trust, `code_ref` and `verified`
 * is the per-domain triage of M2/M3, which reads sources this script cannot judge.
 *
 * NOTHING IS LOST. Each non-blank line of an entry lands either in a record field or in its history
 * block. `scripts/unit/bl-yaml.test.ts` asserts that over the real oracle.
 *
 * THE ROUND TRIP IS JUDGED BY THE GATE'S PARSER. `--check` converts every domain, serialises it to YAML,
 * parses it back, renders markdown, and runs `parseOracle` (the `bl:lint` parser) over both texts: the
 * ids, their order, titles, severities and the Rule / Verify / Violation-signal texts must match.
 *
 * The markdown stays the source of truth until a domain is migrated (M2 onwards); `--write` produces
 * that domain's files and says so, and `--render` turns a YAML file back into its markdown section.
 *
 * Usage:
 *   npm run bl:convert -- --check                    # round-trip every domain; exit 1 on any mismatch
 *   npm run bl:convert -- --domain srch --write      # write bl/<domain>.yaml + its history file
 *   npm run bl:convert -- --render <file.yaml>       # the domain's markdown section, to stdout
 */
import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DOMAIN_RE, ENTRY_RE, parseOracle, type Invariant } from "./lint-bl.ts";
import { BL_PATH } from "./extract-bl.ts";

export const SCHEMA_PATH = join("templates", "bl.schema.json");
export const YAML_DIR = join(".claude", "knowledge", "oracles", "bl");
export const HISTORY_DIR = join("docs", "decisions", "bl");
const AGENT_DIRS = [join(".claude", "agents"), join("plugins", "vc-fix", "agents")];

const PRIORITIES = new Set(["P0-revenue", "P0-security", "P1-data", "P1-ux", "P2-ux"]);
const TAG_RE = /`\[([^\]]+)\]`/g;
const FIELD_RE = /^- \*\*(.+?):\*\*\s?(.*)$/;
const NO_DOC_RE = /^(n\/?a|none|not documented|no (public )?doc)/i;

export type SourceKind = "doc" | "ac" | "resolution" | "code" | "live" | "other";
export interface BlSource { kind: SourceKind; ref: string }
export interface BlRule {
  id: string;
  title: string;
  rule: string;
  priority: string;
  trust: "DECLARED" | "OBSERVED" | "INFERRED" | "UNREVIEWED";
  source: BlSource[];
  scope?: { module?: string; code_ref?: string };
  check: { kind: "executable" | "manual" | "none"; ref?: string };
  violation_signal: string;
  verified?: { date: string; version?: string; by: string };
  status: "ACTIVE" | "SUSPECT" | "RETIRED";
  suspect_reason?: string | null;
  owner?: string;
  history?: string;
}
export interface BlDomainFile {
  domain: { heading: string; prefixes: string[]; agents: string[]; intro?: string };
  rules: BlRule[];
}
/** One converted domain: the record file, plus what BL 2.0 moves out of the record, per rule id. */
export interface ConvertedDomain {
  slug: string;
  file: BlDomainFile;
  history: { id: string; text: string }[];
}

/** `Rule` and its qualified forms (`Rule (write path — …)`), the same predicate `bl:lint` BLL-003 uses. */
export function isField(label: string, base: string): boolean {
  return label === base || label.startsWith(base + " ") || label.startsWith(base + "(");
}

/** A qualified field keeps its qualifier in front of its text, so two `Rule (…)` bullets fold into one `rule`. */
function joinParts(parts: { label: string; text: string }[], base: string): string {
  return parts.map((p) => (p.label === base ? p.text : `${p.label.slice(base.length).trim()} ${p.text}`)).join("\n");
}

export function classifySource(text: string): SourceKind {
  if (/\bVCST-\d+\b/.test(text) && /\b(AC|acceptance criteri)/i.test(text)) return "ac";
  if (/\.(cs|ts|tsx|js|mjs|vue|cshtml|json|graphql)\b|\bvc-(module|frontend|platform)|\bsrc\//.test(text)) return "code";
  if (/^\s*(live|observed)\b/i.test(text)) return "live";
  return "other";
}

/** The agents named in `text`, matched against the roster on disk rather than a list kept here. */
export function readAgentRoster(root = "."): string[] {
  const names: string[] = [];
  for (const dir of AGENT_DIRS) {
    const full = join(root, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) if (f.endsWith(".md") && f !== "README.md") names.push(basename(f, ".md"));
  }
  return [...new Set(names)].sort((a, b) => b.length - a.length); // longest first: no prefix shadowing
}

function agentsIn(text: string, roster: readonly string[]): string[] {
  const hits: { name: string; at: number }[] = [];
  for (const name of roster) {
    const m = new RegExp(`(^|[^a-z0-9-])${name.replace(/[-]/g, "\\-")}(?![a-z0-9-])`).exec(text);
    if (m) hits.push({ name, at: m.index });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}

function trimBlock(lines: string[]): string[] {
  const out = [...lines];
  while (out.length && (!out[out.length - 1].trim() || out[out.length - 1].trim() === "---")) out.pop();
  return out;
}

function historyAnchor(slug: string, id: string): string {
  return `${HISTORY_DIR.split("\\").join("/")}/${slug}.md#${id.toLowerCase()}`;
}

/** Convert one entry: its `### BL-…` heading line plus the body lines under it. */
function convertEntry(heading: string, body: string[], slug: string, roster: readonly string[]) {
  const m = heading.match(ENTRY_RE)!;
  const id = m[1];
  const tail = m[2];
  const history: string[] = [];

  const tags = [...tail.matchAll(TAG_RE)];
  const prio = tags.find((t) => PRIORITIES.has(t[1].trim()));
  const priority = prio ? prio[1].trim() : "";
  const title = (prio ? tail.slice(0, prio.index) : tail).replace(TAG_RE, "").trim();
  if (prio) {
    const after = tail.slice(prio.index! + prio[0].length).trim();
    const otherTags = tags.filter((t) => t !== prio).map((t) => t[0]);
    const note = [otherTags.join(" "), after].filter(Boolean).join(" ");
    if (note) history.push(`- **Heading note:** ${note}`);
  }

  // Split the body into top-level field blocks; lines before the first field are prose.
  const blocks: { label: string; lines: string[] }[] = [];
  const preface: string[] = [];
  for (const line of body) {
    const f = line.match(FIELD_RE);
    if (f) blocks.push({ label: f[1].trim(), lines: [f[2]] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
    else preface.push(line);
  }
  const pre = trimBlock(preface).filter((l) => l.trim());
  if (pre.length) history.push(...pre);

  const rules: { label: string; text: string }[] = [];
  const verifies: { label: string; text: string }[] = [];
  const violations: { label: string; text: string }[] = [];
  const source: BlSource[] = [];
  const agents: string[] = [];
  for (const b of blocks) {
    const lines = trimBlock(b.lines);
    const text = lines.join("\n").trimEnd();
    const raw = [`- **${b.label}:** ${lines[0] ?? ""}`.trimEnd(), ...lines.slice(1)].join("\n");
    if (isField(b.label, "Rule")) rules.push({ label: b.label, text });
    else if (isField(b.label, "Verify")) verifies.push({ label: b.label, text });
    else if (isField(b.label, "Violation signal")) violations.push({ label: b.label, text });
    else if (b.label === "Source" && text) source.push({ kind: classifySource(text), ref: text });
    else if (b.label === "Docs" && text && !NO_DOC_RE.test(text.replace(/[*_`]/g, "").trim())) source.push({ kind: "doc", ref: text });
    else {
      if (b.label === "Agents") agents.push(...agentsIn(text, roster));
      history.push(raw);
    }
  }

  const rule: BlRule = {
    id,
    title,
    rule: joinParts(rules, "Rule"),
    priority,
    trust: "UNREVIEWED",
    source,
    check: verifies.length ? { kind: "manual", ref: joinParts(verifies, "Verify") } : { kind: "none" },
    violation_signal: joinParts(violations, "Violation signal"),
    status: "ACTIVE",
  };
  if (history.length) rule.history = historyAnchor(slug, id);
  return { rule, agents, history: history.join("\n") };
}

/** Split the oracle into its domains and convert each. Preamble and trailing sections are not rules. */
export function convertOracle(text: string, roster: readonly string[]): ConvertedDomain[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const out: ConvertedDomain[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!DOMAIN_RE.test(lines[i])) { i++; continue; }
    const heading = lines[i].replace(/^##\s+/, "").trim();
    const prefixes = [...heading.matchAll(/BL-[A-Z0-9]+/g)].map((x) => x[0]);
    const slug = (prefixes[0] ?? heading).replace(/^BL-/, "").toLowerCase();
    let j = i + 1;
    while (j < lines.length && !/^#{1,2}\s/.test(lines[j])) j++;
    const section = lines.slice(i + 1, j);

    const intro: string[] = [];
    const entries: { heading: string; body: string[] }[] = [];
    for (const line of section) {
      if (ENTRY_RE.test(line)) entries.push({ heading: line, body: [] });
      else if (/^###\s/.test(line)) throw new Error(`bl:convert: non-rule heading inside "${heading}": ${line}`);
      else if (entries.length) entries[entries.length - 1].body.push(line);
      else intro.push(line);
    }

    const agents: string[] = [];
    const rules: BlRule[] = [];
    const history: { id: string; text: string }[] = [];
    for (const e of entries) {
      const c = convertEntry(e.heading, e.body, slug, roster);
      rules.push(c.rule);
      for (const a of c.agents) if (!agents.includes(a)) agents.push(a);
      if (c.history) history.push({ id: c.rule.id, text: c.history });
    }
    const introText = trimBlock(intro).join("\n").trim();
    const domain: BlDomainFile["domain"] = { heading, prefixes, agents };
    if (introText) domain.intro = introText;
    out.push({ slug, file: { domain, rules }, history });
    i = j;
  }
  return out;
}

function verifyLine(check: BlRule["check"]): string {
  if (check.kind === "manual") return check.ref!;
  if (check.kind === "executable") return `Executable check: \`${check.ref}\``;
  return "No check.";
}

/** The markdown section for one domain file. Field order follows today's oracle so a reader sees no change. */
export function renderDomain(file: BlDomainFile): string {
  const parts = [`## ${file.domain.heading}`];
  if (file.domain.intro) parts.push(file.domain.intro);
  for (const r of file.rules) {
    const lines = [
      `### ${r.id}: ${r.title} \`[${r.priority}]\``,
      `- **Rule:** ${r.rule}`,
      `- **Verify:** ${verifyLine(r.check)}`,
      `- **Violation signal:** ${r.violation_signal}`,
      `- **Agents:** ${file.domain.agents.join(", ")}`,
    ];
    for (const s of r.source.filter((x) => x.kind === "doc")) lines.push(`- **Docs:** ${s.ref}`);
    for (const s of r.source.filter((x) => x.kind !== "doc")) lines.push(`- **Source:** ${s.ref}`);
    lines.push(`- **Trust:** ${r.trust}`);
    if (r.status !== "ACTIVE") lines.push(`- **Lifecycle:** ${r.status}${r.suspect_reason ? ` — ${r.suspect_reason}` : ""}`);
    if (r.history) lines.push(`- **History:** \`${r.history}\``);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

export function renderHistory(d: ConvertedDomain): string {
  const head = [
    `# BL history — ${d.file.domain.heading}`,
    "",
    "Generated by `npm run bl:convert` from `.claude/knowledge/oracles/business-logic.md`. It holds, verbatim, the",
    "lines of each rule that the BL 2.0 record does not carry (`docs/bug-detection-requirements.md` §7.2).",
  ].join("\n");
  return [head, ...d.history.map((h) => `## ${h.id}\n\n${h.text}`)].join("\n\n") + "\n";
}

export function toYaml(file: BlDomainFile): string {
  return stringifyYaml(file, { lineWidth: 0 });
}

export function fromYaml(text: string): BlDomainFile {
  return parseYaml(text) as BlDomainFile;
}

export function schemaValidator(root = ".") {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(JSON.parse(readFileSync(join(root, SCHEMA_PATH), "utf-8")));
}

/** The Rule / Verify / Violation-signal text as the gate's parser sees it, qualified bullets folded. */
function gateText(inv: Invariant, base: string): string {
  const parts = Object.entries(inv.fields)
    .filter(([k]) => isField(k, base))
    .map(([label, text]) => ({ label, text }));
  return joinParts(parts, base);
}

/** Every difference between two oracle texts in what `bl:lint` parses: ids, order, titles, severities, texts. */
export function compareOracles(beforeText: string, afterText: string): string[] {
  const problems: string[] = [];
  const before = parseOracle(beforeText);
  const after = parseOracle(afterText);
  const ids = (xs: Invariant[]) => xs.map((x) => x.id).join(",");
  if (ids(before) !== ids(after)) problems.push(`ids or their order differ: ${before.length} before, ${after.length} after`);
  const byId = new Map(after.map((x) => [x.id, x]));
  for (const b of before) {
    const a = byId.get(b.id);
    if (!a) continue;
    for (const k of ["title", "severity", "domain"] as const) if (a[k] !== b[k]) problems.push(`${b.id}: ${k} "${b[k]}" → "${a[k]}"`);
    for (const f of ["Rule", "Verify", "Violation signal"]) if (gateText(a, f) !== gateText(b, f)) problems.push(`${b.id}: ${f} text differs`);
  }
  return problems;
}

/** md → YAML → md over the whole oracle, plus schema validity and YAML identity per domain. Empty = clean. */
export function roundTrip(text: string, roster: readonly string[], validate = schemaValidator()): string[] {
  const problems: string[] = [];
  const rendered: string[] = [];
  for (const d of convertOracle(text, roster)) {
    if (!validate(d.file)) problems.push(`${d.slug}: schema: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    const back = fromYaml(toYaml(d.file));
    if (JSON.stringify(back) !== JSON.stringify(d.file)) problems.push(`${d.slug}: YAML does not parse back to the same records`);
    if (d.file.rules.length && !d.file.domain.agents.length) problems.push(`${d.slug}: no agent from the roster is named`);
    rendered.push(renderDomain(back));
  }
  return [...problems, ...compareOracles(text, rendered.join("\n"))];
}

function main(argv: string[]) {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const renderPath = arg("--render");
  if (renderPath) {
    process.stdout.write(renderDomain(fromYaml(readFileSync(renderPath, "utf-8"))));
    return 0;
  }
  const text = readFileSync(BL_PATH, "utf-8");
  const roster = readAgentRoster();
  const domains = convertOracle(text, roster);

  if (argv.includes("--write")) {
    const want = arg("--domain");
    const d = domains.find((x) => x.slug === want);
    if (!d) {
      console.error(`bl:convert: --write needs --domain <${domains.map((x) => x.slug).join("|")}>`);
      return 2;
    }
    mkdirSync(YAML_DIR, { recursive: true });
    mkdirSync(HISTORY_DIR, { recursive: true });
    const yamlPath = join(YAML_DIR, `${d.slug}.yaml`);
    writeFileSync(yamlPath, `# yaml-language-server: $schema=../../../../${SCHEMA_PATH.split("\\").join("/")}\n${toYaml(d.file)}`);
    writeFileSync(join(HISTORY_DIR, `${d.slug}.md`), renderHistory(d));
    console.log(`wrote ${yamlPath} (${d.file.rules.length} rules) and ${join(HISTORY_DIR, d.slug + ".md")}`);
    console.log("business-logic.md is still the source of truth for this domain until its section is regenerated (M2).");
    return 0;
  }

  const problems = roundTrip(text, roster);
  const rules = domains.reduce((n, d) => n + d.file.rules.length, 0);
  const withHistory = domains.reduce((n, d) => n + d.history.length, 0);
  console.log(`bl:convert --check: ${domains.length} domains, ${rules} rules, ${withHistory} with a history block`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(problems.length ? `FAIL: ${problems.length} round-trip problem(s)` : "OK: ids, order, titles, severities and Rule / Verify / Violation-signal texts survive md → YAML → md");
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
