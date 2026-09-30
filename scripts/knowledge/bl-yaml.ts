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
import { posix } from "path";
import { isDeepStrictEqual } from "util";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { BRACKET_TAG_RE, DOMAIN_RE, ENTRY_RE, VALID_TAGS, isField, parseOracle, type Invariant } from "./lint-bl.ts";
import { BL_PATH, listDomains } from "./extract-bl.ts";
import { flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";

// Posix separators: these also become the `history` anchor and the YAML `$schema` link, and fs accepts `/` on Windows.
const SCHEMA_PATH = "templates/bl.schema.json";
const YAML_DIR = ".claude/knowledge/oracles/bl";
const HISTORY_DIR = "docs/decisions/bl";

// A field block starts only at column 0. An indented `  - **X:**` sub-bullet stays verbatim inside the block
// above it; `parseOracle` splits it off as its own field, but it does so identically on both sides of the
// round trip, so the comparison still holds and nothing is re-indented.
const FIELD_RE = /^- \*\*(.+?):\*\*\s?(.*)$/;
/** The fields that become the record's own text, and that the round trip compares. */
const CORE_FIELDS = ["Rule", "Verify", "Violation signal"] as const;
const NO_DOC_RE = /^(n\/?a|none|not documented|no (public )?doc)/i;

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
interface ConvertedDomain {
  slug: string;
  file: BlDomainFile;
  history: { id: string; text: string }[];
}

/**
 * The text of `base` and its qualified forms (`Rule (write path — …)`), each qualifier kept in front of its
 * text, so two `Rule (…)` bullets fold into one `rule`. The converter and the round-trip comparator share it.
 */
function fold(parts: readonly { label: string; text: string }[], base: string): string {
  return parts
    .filter((p) => isField(p.label, base))
    .map((p) => (p.label === base ? p.text : `${p.label.slice(base.length).trim()} ${p.text}`))
    .join("\n");
}

export function classifySource(text: string): SourceKind {
  if (/\bVCST-\d+\b/.test(text) && /\b(AC|acceptance criteri)/i.test(text)) return "ac";
  if (/\.(cs|ts|tsx|js|mjs|vue|cshtml|json|graphql)\b|\bvc-(module|frontend|platform)|\bsrc\//.test(text)) return "code";
  if (/^\s*(live|observed)\b/i.test(text)) return "live";
  return "other";
}

/**
 * The agent roster on disk: `.claude/agents` and every `plugins/*\/agents`, by FILE name. Not
 * `knownAgentNames` (scripts/kb/core/caller.mjs): that reads the frontmatter `name`, and the oracle cites
 * agents by file name (`test-runner-agent`, whose frontmatter says "Test Runner Agent"). Longest first so
 * no name shadows another.
 */
export function readAgentRoster(): string[] {
  const dirs = [".claude/agents", ...(existsSync("plugins") ? readdirSync("plugins").map((p) => `plugins/${p}/agents`) : [])];
  const names = dirs
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.slice(0, -3)));
  return [...new Set(names)].sort((a, b) => b.length - a.length);
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
  return `${HISTORY_DIR}/${slug}.md#${id.toLowerCase()}`;
}

/** Convert one entry: its `### BL-…` heading line plus the body lines under it. */
function convertEntry(heading: string, body: string[], slug: string, roster: readonly string[]) {
  const m = heading.match(ENTRY_RE)!;
  const id = m[1];
  const tail = m[2];
  const history: string[] = [];

  const tags = [...tail.matchAll(BRACKET_TAG_RE)];
  const prio = tags.find((t) => VALID_TAGS.has(t[1].trim()));
  const priority = prio ? prio[1].trim() : "";
  const title = (prio ? tail.slice(0, prio.index) : tail).replace(BRACKET_TAG_RE, "").trim();
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
  history.push(...preface.filter((l) => l.trim() && l.trim() !== "---"));

  const core: { label: string; text: string }[] = [];
  const source: BlSource[] = [];
  const agents: string[] = [];
  for (const b of blocks) {
    const lines = trimBlock(b.lines);
    const text = lines.join("\n").trimEnd();
    const raw = [`- **${b.label}:** ${lines[0] ?? ""}`.trimEnd(), ...lines.slice(1)].join("\n");
    if (CORE_FIELDS.some((f) => isField(b.label, f))) core.push({ label: b.label, text });
    else if (b.label === "Source" && text) source.push({ kind: classifySource(text), ref: text });
    else if (b.label === "Docs" && text && !NO_DOC_RE.test(text.replace(/[*_`]/g, "").trim())) source.push({ kind: "doc", ref: text });
    else {
      if (b.label === "Agents") agents.push(...agentsIn(text, roster));
      history.push(raw);
    }
  }

  const verify = fold(core, "Verify");
  const rule: BlRule = {
    id,
    title,
    rule: fold(core, "Rule"),
    priority,
    trust: "UNREVIEWED",
    source,
    check: verify ? { kind: "manual", ref: verify } : { kind: "none" },
    violation_signal: fold(core, "Violation signal"),
    status: "ACTIVE",
  };
  if (history.length) rule.history = historyAnchor(slug, id);
  return { rule, agents, history: history.join("\n") };
}

/** Split the oracle into its domains and convert each. Preamble and trailing sections are not rules. */
export function convertOracle(text: string, roster: readonly string[]): ConvertedDomain[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const tokens = new Map(listDomains(text).map((d) => [d.domain, d.token]));
  const out: ConvertedDomain[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!DOMAIN_RE.test(lines[i])) { i++; continue; }
    const heading = lines[i].replace(/^##\s+/, "").trim();
    const prefixes = [...heading.matchAll(/BL-[A-Z0-9]+/g)].map((x) => x[0]);
    const slug = tokens.get(heading) || heading.toLowerCase().replace(/[^a-z0-9]+/g, "-"); // same token as `bl:extract --domain`
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

function renderHistory(d: ConvertedDomain): string {
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

export function schemaValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, "utf-8")));
}

/** A field's text as the gate's parser sees it, qualified bullets folded the same way the converter folds them. */
function gateText(inv: Invariant, base: string): string {
  return fold(Object.entries(inv.fields).map(([label, text]) => ({ label, text })), base);
}

/** Every difference between two oracle texts in what `bl:lint` parses: ids, order, titles, severities, texts. */
export function compareOracles(beforeText: string | Invariant[], afterText: string): string[] {
  const problems: string[] = [];
  const before = typeof beforeText === "string" ? parseOracle(beforeText) : beforeText;
  const after = parseOracle(afterText);
  const ids = (xs: Invariant[]) => xs.map((x) => x.id).join(",");
  if (ids(before) !== ids(after)) problems.push(`ids or their order differ: ${before.length} before, ${after.length} after`);
  const byId = new Map(after.map((x) => [x.id, x]));
  for (const b of before) {
    const a = byId.get(b.id);
    if (!a) continue;
    for (const k of ["title", "severity", "domain"] as const) if (a[k] !== b[k]) problems.push(`${b.id}: ${k} "${b[k]}" → "${a[k]}"`);
    for (const f of CORE_FIELDS) if (gateText(a, f) !== gateText(b, f)) problems.push(`${b.id}: ${f} text differs`);
  }
  return problems;
}

/**
 * md → YAML → md over the whole oracle, plus schema validity and YAML identity per domain. Empty = clean.
 * Takes the already converted domains (and, optionally, the parsed source) so a caller that has them pays once.
 */
export function roundTrip(
  domains: readonly ConvertedDomain[],
  source: string | Invariant[],
  validate = schemaValidator(),
): string[] {
  const problems: string[] = [];
  const rendered: string[] = [];
  for (const d of domains) {
    if (!validate(d.file)) problems.push(`${d.slug}: schema: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    const back = fromYaml(toYaml(d.file));
    if (!isDeepStrictEqual(back, d.file)) problems.push(`${d.slug}: YAML does not parse back to the same records`);
    if (d.file.rules.length && !d.file.domain.agents.length) problems.push(`${d.slug}: no agent from the roster is named`);
    rendered.push(renderDomain(back));
  }
  return [...problems, ...compareOracles(source, rendered.join("\n"))];
}

function main(argv: string[]) {
  rejectUnknownFlags(argv, ["--check", "--write", "--domain", "--render"], ["--domain", "--render"]);
  const renderPath = flagValue(argv, "--render");
  if (renderPath) {
    process.stdout.write(renderDomain(fromYaml(readFileSync(renderPath, "utf-8"))));
    return 0;
  }
  const text = readFileSync(BL_PATH, "utf-8");
  const roster = readAgentRoster();
  const domains = convertOracle(text, roster);

  if (argv.includes("--write")) {
    const want = flagValue(argv, "--domain");
    const d = domains.find((x) => x.slug === want);
    if (!d) {
      console.error(`bl:convert: --write needs --domain <${domains.map((x) => x.slug).join("|")}>`);
      return 2;
    }
    mkdirSync(YAML_DIR, { recursive: true });
    mkdirSync(HISTORY_DIR, { recursive: true });
    const yamlPath = `${YAML_DIR}/${d.slug}.yaml`;
    const historyPath = `${HISTORY_DIR}/${d.slug}.md`;
    writeFileSync(yamlPath, `# yaml-language-server: $schema=${posix.relative(YAML_DIR, SCHEMA_PATH)}\n${toYaml(d.file)}`);
    writeFileSync(historyPath, renderHistory(d));
    console.log(`wrote ${yamlPath} (${d.file.rules.length} rules) and ${historyPath}`);
    console.log("business-logic.md is still the source of truth for this domain until its section is regenerated (M2).");
    return 0;
  }

  const problems = roundTrip(domains, text);
  const rules = domains.reduce((n, d) => n + d.file.rules.length, 0);
  const withHistory = domains.reduce((n, d) => n + d.history.length, 0);
  console.log(`bl:convert --check: ${domains.length} domains, ${rules} rules, ${withHistory} with a history block`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(problems.length ? `FAIL: ${problems.length} round-trip problem(s)` : "OK: ids, order, titles, severities and Rule / Verify / Violation-signal texts survive md → YAML → md");
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
