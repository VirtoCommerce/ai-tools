/**
 * Deterministic parser + structural linter for the BL oracle
 * (`.claude/knowledge/oracles/business-logic.md`) — the mechanical core of
 * `/qa-review-bl`. It parses every `### BL-*` invariant into structured fields,
 * runs the checks that need no docs/live/source judgment, and cross-references
 * the regression suites so the skill knows which invariants no test case covers.
 *
 * It is the DETERMINISTIC half only. The three evidence axes of `/qa-review-bl`
 * — docs (VirtoOZ), live (playwright via qa-testing-expert), source (GitHub MCP)
 * — and the CONFIRMED/DRIFT/MISSING verdict are the skill's judgment slots; this
 * script just hands the skill a clean, machine-readable inventory + the checks a
 * regex can decide.
 *
 * Structural checks (rule IDs):
 *   BLL-001 [Blocker]  duplicate BL ID
 *   BLL-002 [High]     missing/malformed severity tag (P0-revenue|P0-security|P1-data|P1-ux|P2-ux)
 *   BLL-003 [High]     missing required field (Rule / Verify / Violation signal / Agents)
 *   BLL-004 [Medium]   ID domain-prefix not declared by its `## Domain` heading (misfiled)
 *   BLL-005 [Informational] non-contiguous NNN within a domain (amend/supersede gaps are legit)
 * Coverage cross-ref against regression/suites/**.csv (mechanical half of Dim-6 BL-002/BL-004):
 *   BLC-002 [High]     a suite's Business_Rule cites a BL-* ID absent from the oracle (false traceability).
 *                      `PROPOSED-BL-*` forward-references (awaiting promotion) are exempt — not flagged.
 *   BLC-004 [Medium]   a P0/P1 invariant referenced by NO test case (uncovered) — P2 downgraded to Informational
 *   BLC-005 [High]     a suite CSV the coverage scan could not parse, so it is ABSENT from the coverage map.
 *                      Invalidates BLC-004 and BLC-002 for every invariant that file cites, in both
 *                      directions (false "uncovered", missed dangling ref). Reported so an unreadable
 *                      input can never be mistaken for a clean one.
 *
 * NOT here (need docs/live/source or knowledge judgment → the skill):
 *   the triangulation verdict, Rule-text staleness (DRIFT), MISSING invariants,
 *   whether a Verify instruction still matches the deployed build.
 *
 * Reuses scripts/test-cases/append-test-cases-to-suite.ts (parseSuite/COLUMNS)
 * so the suite CSV schema stays single-sourced.
 *
 * Usage:
 *   npx tsx scripts/knowledge/lint-bl.ts [business-logic.md] [--json] [--filter=<id-regex>] [--fail-on=Blocker|Critical|High|Medium]
 *   npm run bl:lint                # human report, gate on High
 *   npm run bl:audit:collect       # --json inventory for /qa-review-bl
 *
 * Exit code: 0 if no finding at/above --fail-on (default High); 1 otherwise.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { COLUMNS, parseSuite, type Row } from "../test-cases/append-test-cases-to-suite.js";

type Severity = "Blocker" | "Critical" | "High" | "Medium" | "Informational";
const SEVERITY_ORDER: Severity[] = ["Informational", "Medium", "High", "Critical", "Blocker"];

const VALID_TAGS = new Set(["P0-revenue", "P0-security", "P1-data", "P1-ux", "P2-ux"]);
const P0P1_TAGS = new Set(["P0-revenue", "P0-security", "P1-data", "P1-ux"]);
const REQUIRED_FIELDS = ["Rule", "Verify", "Violation signal", "Agents"] as const;

// `### BL-CART-010: Title `[P0-revenue]``. The domain segment may contain digits
// (BL-B2B-006), and a heading may carry MORE than one bracket tag (e.g.
// `[P1-ux]` `[GOLDEN RULE]`) — so capture the whole title+tags tail and extract
// the severity from any bracket token below (BLL-002 flags a genuinely absent one).
const ENTRY_RE = /^###\s+(BL-[A-Z0-9]+-\d+[A-Z]?)\s*:\s*(.*)$/;
const DOMAIN_RE = /^##\s+Domain\s+\S+\s*:.*$/;
const BL_TOKEN_RE = /\bBL-[A-Z0-9]+-\d+[A-Z]?\b/g;
const BRACKET_TAG_RE = /`\[([^\]]+)\]`/g;

interface Invariant {
  id: string;
  domainPrefix: string; // e.g. "BL-CART"
  seq: number;
  title: string;
  severity: string; // raw tag or "" if missing/malformed
  domain: string; // the `## Domain` heading text
  fields: Record<string, string>; // Rule / Verify / Violation signal / Agents / Source / Suite coverage / Amended / Promoted / ...
  referencedByCases: string[];
  uncovered: boolean;
}

interface Finding {
  rule: string;
  severity: Severity;
  id: string;
  message: string;
}

const find = (rule: string, severity: Severity, id: string, message: string): Finding => ({ rule, severity, id, message });

function truncate(s: string, n = 80): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Parse a `- **Field:** value` bullet; returns [field, value] or null. */
function parseFieldBullet(line: string): [string, string] | null {
  const m = line.match(/^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** Parse the whole oracle into structured invariants (in file order). */
export function parseOracle(text: string): Invariant[] {
  const lines = text.split(/\r?\n/);
  const out: Invariant[] = [];
  let domain = "(preamble)";
  let allowedPrefixes: string[] = [];
  let cur: Invariant | null = null;
  let curField: string | null = null;

  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
    curField = null;
  };

  for (const raw of lines) {
    if (DOMAIN_RE.test(raw)) {
      flush();
      domain = raw.replace(/^##\s+/, "").trim();
      allowedPrefixes = [...raw.matchAll(/BL-[A-Z0-9]+/g)].map((m) => m[0]);
      continue;
    }
    const entry = raw.match(ENTRY_RE);
    if (entry) {
      flush();
      const id = entry[1];
      const prefix = id.replace(/-\d+[A-Z]?$/, "");
      const seq = Number(id.match(/-(\d+)[A-Z]?$/)?.[1] ?? 0);
      const tail = entry[2];
      const tags = [...tail.matchAll(BRACKET_TAG_RE)].map((m) => m[1].trim());
      const severityTag = tags.find((t) => VALID_TAGS.has(t)) ?? "";
      const title = tail.replace(BRACKET_TAG_RE, "").replace(/→.*$/, "").trim();
      cur = {
        id,
        domainPrefix: prefix,
        seq,
        title,
        severity: severityTag,
        domain,
        fields: {},
        referencedByCases: [],
        uncovered: false,
        // stash the allowed-prefix context for BLL-004 without widening the type
      } as Invariant & { _allowed?: string[] };
      (cur as Invariant & { _allowed?: string[] })._allowed = allowedPrefixes;
      continue;
    }
    if (!cur) continue;
    const bullet = parseFieldBullet(raw);
    if (bullet) {
      curField = bullet[0];
      cur.fields[curField] = bullet[1];
    } else if (curField && raw.trim()) {
      // continuation line of a multi-line field value
      cur.fields[curField] += "\n" + raw.trim();
    }
  }
  flush();
  return out;
}

/** Recursively collect *.csv under a directory (Node-version-agnostic walker). */
function walkCsv(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walkCsv(full));
    else if (name.toLowerCase().endsWith(".csv")) out.push(full);
  }
  return out;
}

/**
 * BL-* ids genuinely cited in a Business_Rule cell, EXCLUDING `PROPOSED-BL-*`
 * forward-references. A `PROPOSED-BL-XXX-NNN` cite deliberately points at an invariant
 * still awaiting promotion (see /qa-review-bl proposals) — it is neither coverage of an
 * existing invariant nor a dangling reference, so it must not drive BLC-002/BLC-004.
 * (The `\b` in BL_TOKEN_RE sits at the `-`→`B` boundary inside `PROPOSED-BL-…`, so
 * without this guard the bare `BL-XXX-NNN` leaks out and gets mis-flagged.)
 */
export function extractReferencedBlIds(cell: string): string[] {
  const out: string[] = [];
  for (const m of cell.matchAll(BL_TOKEN_RE)) {
    const at = m.index ?? 0;
    if (cell.slice(Math.max(0, at - 9), at).toUpperCase().endsWith("PROPOSED-")) continue;
    out.push(m[0]);
  }
  return out;
}

/**
 * Map BL-* ID → list of case IDs whose Business_Rule column references it.
 *
 * `unparsed` is returned, not swallowed. A suite this function cannot parse is
 * absent from the coverage map, so every invariant cited ONLY there reads as
 * BLC-004 "uncovered" and every dangling reference in it escapes BLC-002 — a
 * false clean, in both directions, reported with total confidence. That is
 * exactly what happened before `parseSuite` learned `bom: true`: 12 BOM-carrying
 * suites were dropped, and 3 of 6 BLC-004 findings were false. Coverage is a
 * completeness claim, so an unreadable input has to be surfaced rather than
 * quietly reducing the denominator.
 */
export function buildCoverage(suitesRoot: string): {
  byBl: Map<string, string[]>;
  referenced: Set<string>;
  unparsed: string[];
} {
  const byBl = new Map<string, string[]>();
  const referenced = new Set<string>();
  const unparsed: string[] = [];
  for (const csv of walkCsv(suitesRoot)) {
    let rows: Row[];
    try {
      rows = parseSuite(readFileSync(csv, "utf-8")).rows;
    } catch {
      unparsed.push(csv); // surfaced as BLC-005 — never silently skipped
      continue;
    }
    for (const r of rows) {
      const cell = r["Business_Rule"] ?? "";
      for (const id of extractReferencedBlIds(cell)) {
        referenced.add(id);
        const arr = byBl.get(id) ?? [];
        if (r.ID && !arr.includes(r.ID)) arr.push(r.ID);
        byBl.set(id, arr);
      }
    }
  }
  return { byBl, referenced, unparsed };
}

export function lint(
  invariants: Invariant[],
  coverage: { byBl: Map<string, string[]>; referenced: Set<string>; unparsed?: string[] },
): Finding[] {
  const f: Finding[] = [];
  const seen = new Map<string, number>();
  const byDomainSeqs = new Map<string, number[]>();
  const oracleIds = new Set(invariants.map((i) => i.id));

  invariants.forEach((inv, idx) => {
    // BLL-001 duplicate ID
    if (seen.has(inv.id)) f.push(find("BLL-001", "Blocker", inv.id, `duplicate BL ID (also entry #${seen.get(inv.id)! + 1})`));
    else seen.set(inv.id, idx);

    // BLL-002 severity tag
    if (!inv.severity) f.push(find("BLL-002", "High", inv.id, `missing/malformed severity tag (expected one of ${[...VALID_TAGS].join("|")})`));

    // BLL-003 required fields. Field names may be qualified ("Rule (write path — …)",
    // "Verify (read path)"), so match by prefix, not exact key.
    const fieldKeys = Object.keys(inv.fields);
    for (const req of REQUIRED_FIELDS) {
      const hit = fieldKeys.some((k) => k === req || k.startsWith(req + " ") || k.startsWith(req + "("));
      if (!hit) f.push(find("BLL-003", "High", inv.id, `missing required field: **${req}**`));
    }

    // BLL-004 misfiled prefix
    const allowed = (inv as Invariant & { _allowed?: string[] })._allowed ?? [];
    if (allowed.length && !allowed.includes(inv.domainPrefix))
      f.push(find("BLL-004", "Medium", inv.id, `prefix ${inv.domainPrefix} not declared by its domain heading "${truncate(inv.domain, 50)}" (allowed: ${allowed.join(", ")})`));

    const seqs = byDomainSeqs.get(inv.domainPrefix) ?? [];
    seqs.push(inv.seq);
    byDomainSeqs.set(inv.domainPrefix, seqs);

    // coverage attach
    inv.referencedByCases = coverage.byBl.get(inv.id) ?? [];
    inv.uncovered = inv.referencedByCases.length === 0;

    // BLC-004 uncovered invariant
    if (inv.uncovered) {
      const sev: Severity = P0P1_TAGS.has(inv.severity) ? "Medium" : "Informational";
      f.push(find("BLC-004", sev, inv.id, `no test case references this invariant in its Business_Rule column (uncovered)`));
    }
  });

  // BLL-005 sequence gaps (informational — amend/supersede legitimately create gaps)
  for (const [prefix, seqs] of byDomainSeqs) {
    const sorted = [...new Set(seqs)].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let n = 1; n < sorted[sorted.length - 1]; n++) if (!sorted.includes(n)) gaps.push(n);
    if (gaps.length) f.push(find("BLL-005", "Informational", prefix, `non-contiguous sequence — missing ${prefix}-${gaps.map((g) => String(g).padStart(3, "0")).join(", " + prefix + "-")}`));
  }

  // BLC-005 a suite CSV the coverage scan could not read. High, because it silently
  // invalidates BOTH coverage directions for that file: its invariants look uncovered
  // (false BLC-004) and its dangling references look absent (missed BLC-002). Never
  // downgrade this to Informational — the whole point is that an unreadable input must
  // not be mistakable for a clean one.
  const unparsed = coverage.unparsed ?? [];
  if (unparsed.length) {
    f.push(
      find(
        "BLC-005",
        "High",
        "coverage-scan",
        `${unparsed.length} suite CSV(s) could not be parsed and are ABSENT from the coverage map — BLC-004/BLC-002 are unreliable for the invariants they cite: ${truncate(unparsed.map((p: string) => p.split(/[\\/]/).pop()).join(", "), 160)}`,
      ),
    );
  }

  // BLC-002 suite references a non-existent BL ID (Medium — matches the canonical
  // Dim-6 BL-002 severity in review-criteria.md; keeps the default High gate green
  // on the large pre-existing suite↔oracle drift while still surfacing every case).
  for (const ref of coverage.referenced) {
    if (!oracleIds.has(ref)) {
      const cases = coverage.byBl.get(ref) ?? [];
      f.push(find("BLC-002", "Medium", ref, `cited in Business_Rule of ${truncate(cases.join(", "), 60)} but no such invariant exists in the oracle (false traceability)`));
    }
  }

  return f;
}

function rank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function main(): void {
  const argv = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..", "..");
  const file = argv.find((a) => !a.startsWith("--")) ?? join(repoRoot, ".claude", "knowledge", "oracles", "business-logic.md");
  const json = argv.includes("--json");
  const filterArg = argv.find((a) => a.startsWith("--filter="))?.split("=")[1];
  const filterRe = filterArg ? new RegExp(filterArg, "i") : null;
  const failOnArg = (argv.find((a) => a.startsWith("--fail-on=")) ?? "--fail-on=High").split("=")[1] as Severity;
  const failOn = SEVERITY_ORDER.includes(failOnArg) ? failOnArg : "High";

  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch (e) {
    console.error(`Cannot read oracle: ${file}\n${(e as Error).message}`);
    process.exit(1);
  }

  const invariants = parseOracle(raw);
  const coverage = buildCoverage(join(repoRoot, "regression", "suites"));
  const findings = lint(invariants, coverage);

  // strip the internal _allowed helper before serialising
  const shaped = invariants
    .filter((i) => !filterRe || filterRe.test(i.id))
    .map(({ id, domainPrefix, seq, title, severity, domain, fields, referencedByCases, uncovered }) => ({
      id, domainPrefix, seq, title, severity, domain, fields, referencedByCases, uncovered,
    }));

  const blocking = findings.filter((x) => rank(x.severity) >= rank(failOn));

  if (json) {
    console.log(JSON.stringify({ file, count: invariants.length, total: findings.length, blocking: blocking.length, invariants: shaped, findings }, null, 2));
  } else {
    const counts = SEVERITY_ORDER.slice().reverse().map((s) => [s, findings.filter((x) => x.severity === s).length] as const).filter(([, n]) => n > 0);
    console.log(`\n${file}`);
    console.log(`  ${invariants.length} invariants parsed · ${findings.length} finding(s): ${counts.map(([s, n]) => `${n} ${s}`).join(", ") || "none"}`);
    for (const s of SEVERITY_ORDER.slice().reverse()) for (const x of findings.filter((y) => y.severity === s)) console.log(`  [${x.severity}] ${x.rule} ${x.id}: ${x.message}`);
    console.log(`\n  Structural + coverage checks only. The docs/live/source triangulation + CONFIRMED/DRIFT/MISSING verdict are /qa-review-bl's judgment slots (run \`--json\` to feed it).`);
  }
  process.exit(blocking.length > 0 ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
