/**
 * Deterministic linter for the edge-case oracle
 * (`.claude/knowledge/oracles/e-commerce-edge-cases-library.md`) and the
 * `Edge_Case_Refs` citations that point at it from `regression/suites/**.csv`.
 *
 * Sibling of `lint-bl.ts`: that script guards the BL oracle's IDs and their
 * `Business_Rule` citations; this one guards the ECL library's section numbers
 * and their `Edge_Case_Refs` citations. Same shape, same honesty rules.
 *
 * WHY THIS EXISTS. Until 2026-08-06 the ECL library had no declared write owner
 * and no gate of any kind, and wrong citations accumulated silently across four
 * suites: `CMS-121` cited `ECL-13.4`, a section that has never existed, and nine
 * loyalty cases cited `ECL-13.2` ("Subscription & Recurring Billing") when they
 * meant `ECL-13.3` ("Loyalty & Points"). Nothing failed. A dangling ref is a
 * false traceability claim — a reviewer reading the case believes an oracle
 * backs an assertion that no oracle backs.
 *
 * Structural checks (rule IDs):
 *   ECLL-001 [Blocker]        duplicate section number in the library
 *   ECLL-002 [Medium]         Appendix D cross-reference row cites a section absent from the body
 *   ECLL-003 [Informational]  body section missing from the Appendix D cross-reference
 * Citation cross-ref against regression/suites/**.csv:
 *   ECLC-001 [High]           a suite's Edge_Case_Refs cites an ECL section absent from the library
 *                             (DANGLING — the ECL-13.4 class)
 *   ECLC-002 [Medium]         a library section referenced by NO test case (uncovered)
 *   ECLC-003 [High]           a suite CSV the citation scan could not parse, so it is ABSENT from
 *                             the map. Invalidates ECLC-001 and ECLC-002 for every section it
 *                             cites, in BOTH directions (a missed dangling ref AND a false
 *                             "uncovered"). Surfaced rather than silently reducing the denominator
 *                             — same rule as lint-bl's BLC-005.
 *
 * NOT here — and this is the important limitation, not a TODO:
 *   A citation that resolves to a REAL BUT SEMANTICALLY WRONG section is
 *   invisible to this script. `ECL-13.2` on a loyalty case parses, resolves, and
 *   passes every check below; only a human or an agent reading the section text
 *   can tell it means Subscription Billing. That judgment is `/qa-review-tests`
 *   Dimension 6 (BL/ECL Coverage + Requirement Traceability). This gate proves a
 *   ref EXISTS; Dimension 6 proves it is TRUE — exactly the GRD-001 vs
 *   Dimension-11 split on the assertion-provenance side.
 *
 * Reuses scripts/test-cases/append-test-cases-to-suite.ts (parseSuite) so the
 * suite CSV schema stays single-sourced.
 *
 * Usage:
 *   npx tsx scripts/knowledge/lint-ecl.ts [library.md] [--json] [--filter=<id-regex>] [--fail-on=Blocker|Critical|High|Medium|Informational]
 *   npm run ecl:lint                          # human report, gate on High
 *   npm run ecl:audit:collect                 # --json inventory
 *   npm run ecl:audit:collect -- --filter=14  # one chapter, for a scoped audit batch
 *
 * `--filter` scopes the REPORT, never the SCAN: citations are always collected from
 * every suite, so a scoped run cannot mistake "outside my filter" for "not cited".
 * It matches the section id (`ECL-14.6`) — `--filter=14\.` for a chapter, `--filter=14\.6$`
 * for one section. Mirrors `bl:lint --filter=BL-CART`.
 *
 * Exit code: 0 if no finding at/above --fail-on (default High); 1 otherwise.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { parseSuite, type Row } from "../test-cases/append-test-cases-to-suite.js";

type Severity = "Blocker" | "Critical" | "High" | "Medium" | "Informational";
const SEVERITY_ORDER: Severity[] = ["Informational", "Medium", "High", "Critical", "Blocker"];

/** `### 13.3 Loyalty & Points Edge Cases` → chapter 13, section 3. */
const SECTION_RE = /^###\s+(\d+)\.(\d+)\s+(.*?)\s*$/;
/** `## 13. Business Logic & Workflow Edge Cases` */
const CHAPTER_RE = /^##\s+(\d+)\.\s+(.*?)\s*$/;
/** A citation token as it appears in a CSV cell or Appendix D row. */
const ECL_TOKEN_RE = /\bECL-(\d+)\.(\d+)\b/g;
/** Appendix D starts here; rows below are cross-reference claims, not definitions. */
const APPENDIX_RE = /^##\s+Appendix\s+D\b/i;

interface Section {
  id: string; // "ECL-13.3"
  chapter: number;
  seq: number;
  title: string;
  chapterTitle: string;
  line: number;
  referencedByCases: string[];
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

/**
 * Parse the library body into sections. Stops collecting definitions at Appendix D:
 * appendix rows CITE sections, they do not define them, so counting them as
 * definitions would make every dangling appendix row self-validating.
 */
export function parseLibrary(text: string): { sections: Section[]; appendixIds: string[] } {
  const sections: Section[] = [];
  const appendixIds: string[] = [];
  let chapterTitle = "";
  let inAppendix = false;

  text.split(/\r?\n/).forEach((line, i) => {
    if (APPENDIX_RE.test(line)) {
      inAppendix = true;
      return;
    }
    if (inAppendix) {
      for (const m of line.matchAll(ECL_TOKEN_RE)) appendixIds.push(`ECL-${m[1]}.${m[2]}`);
      return;
    }
    const chap = CHAPTER_RE.exec(line);
    if (chap) {
      chapterTitle = chap[2];
      return;
    }
    const sec = SECTION_RE.exec(line);
    if (sec) {
      sections.push({
        id: `ECL-${sec[1]}.${sec[2]}`,
        chapter: Number(sec[1]),
        seq: Number(sec[2]),
        title: sec[3],
        chapterTitle,
        line: i + 1,
        referencedByCases: [],
      });
    }
  });

  return { sections, appendixIds };
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
 * Canonical form of a citation's numeric segments. `ECL-05.1` and `ECL-5.1` are the
 * SAME section written two ways — the suites contain both. Comparing raw strings
 * reported every zero-padded citation as dangling, which is a lint bug, not a data
 * bug: it buries the real dangling refs under noise and trains readers to ignore
 * the gate. Padding is still surfaced separately as ECLL-004 (style, Informational).
 */
const canon = (chapter: string, seq: string): string => `ECL-${Number(chapter)}.${Number(seq)}`;

export function extractReferencedEclIds(cell: string): string[] {
  const out: string[] = [];
  for (const m of cell.matchAll(ECL_TOKEN_RE)) {
    const id = canon(m[1], m[2]);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Raw citation tokens whose numeric segments carry a leading zero (`ECL-05.1`). */
export function extractPaddedEclTokens(cell: string): string[] {
  const out: string[] = [];
  for (const m of cell.matchAll(ECL_TOKEN_RE)) {
    const raw = m[0];
    if (raw !== canon(m[1], m[2]) && !out.includes(raw)) out.push(raw);
  }
  return out;
}

/**
 * Map ECL section id → the case IDs citing it, plus the files that could not be
 * read. `unparsed` is returned, never swallowed: a suite absent from this map
 * makes its dangling refs invisible AND makes the sections only it cites look
 * uncovered, so a clean report over an unreadable input would be a lie.
 */
export function buildCitations(suitesRoot: string): {
  byEcl: Map<string, string[]>;
  citedIn: Map<string, string[]>;
  padded: Map<string, string[]>;
  unparsed: string[];
} {
  const byEcl = new Map<string, string[]>();
  const citedIn = new Map<string, string[]>();
  const padded = new Map<string, string[]>();
  const unparsed: string[] = [];
  for (const csv of walkCsv(suitesRoot)) {
    let rows: Row[];
    try {
      rows = parseSuite(readFileSync(csv, "utf-8")).rows;
    } catch {
      unparsed.push(csv); // surfaced as ECLC-003 — never silently skipped
      continue;
    }
    for (const r of rows) {
      const cell = r["Edge_Case_Refs"] ?? "";
      for (const id of extractReferencedEclIds(cell)) {
        const arr = byEcl.get(id) ?? [];
        if (r.ID && !arr.includes(r.ID)) arr.push(r.ID);
        byEcl.set(id, arr);
        const files = citedIn.get(id) ?? [];
        if (!files.includes(csv)) files.push(csv);
        citedIn.set(id, files);
      }
      for (const raw of extractPaddedEclTokens(cell)) {
        const arr = padded.get(raw) ?? [];
        if (r.ID && !arr.includes(r.ID)) arr.push(r.ID);
        padded.set(raw, arr);
      }
    }
  }
  return { byEcl, citedIn, padded, unparsed };
}

export function lint(
  sections: Section[],
  appendixIds: string[],
  citations: { byEcl: Map<string, string[]>; citedIn: Map<string, string[]>; padded: Map<string, string[]>; unparsed: string[] },
  repoRoot: string,
): Finding[] {
  const f: Finding[] = [];
  const seen = new Map<string, number>();
  const libraryIds = new Set(sections.map((s) => s.id));

  sections.forEach((s, idx) => {
    // ECLL-001 duplicate section number
    if (seen.has(s.id)) {
      f.push(find("ECLL-001", "Blocker", s.id, `duplicate section number (also line ${sections[seen.get(s.id)!].line}) — citations become ambiguous`));
    } else {
      seen.set(s.id, idx);
    }
  });

  // ECLC-001 dangling citation — the ECL-13.4 class
  for (const [id, cases] of citations.byEcl) {
    if (libraryIds.has(id)) continue;
    const files = (citations.citedIn.get(id) ?? []).map((p) => relative(repoRoot, p)).join(", ");
    f.push(
      find("ECLC-001", "High", id, `cited by ${cases.length} case(s) [${truncate(cases.join(", "), 60)}] in ${truncate(files, 90)} but NO such section exists in the library`),
    );
  }

  // ECLC-002 uncovered section
  for (const s of sections) {
    if (!citations.byEcl.has(s.id)) {
      f.push(find("ECLC-002", "Medium", s.id, `no test case cites this section — ${truncate(s.title, 50)}`));
    }
  }

  // ECLC-003 unreadable suite — invalidates both directions above
  for (const p of citations.unparsed) {
    f.push(find("ECLC-003", "High", relative(repoRoot, p), `suite CSV could not be parsed — its citations are ABSENT from this report (dangling refs missed, sections may read as uncovered)`));
  }

  // ECLL-002 / ECLL-003 Appendix D coherence
  const appendixSet = new Set(appendixIds);
  for (const id of appendixSet) {
    if (!libraryIds.has(id)) f.push(find("ECLL-002", "Medium", id, `Appendix D cross-reference cites a section absent from the library body`));
  }
  for (const s of sections) {
    if (!appendixSet.has(s.id)) f.push(find("ECLL-003", "Informational", s.id, `section missing from the Appendix D → BL cross-reference table`));
  }

  // ECLL-004 zero-padded citation style — resolves fine, but two spellings of one id
  for (const [raw, cases] of citations.padded) {
    f.push(find("ECLL-004", "Informational", raw, `zero-padded citation of ${extractReferencedEclIds(raw)[0]} in ${cases.length} case(s) [${truncate(cases.join(", "), 50)}] — normalize the spelling`));
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
  const file = argv.find((a) => !a.startsWith("--")) ?? join(repoRoot, ".claude", "knowledge", "oracles", "e-commerce-edge-cases-library.md");
  const json = argv.includes("--json");
  const filterArg = argv.find((a) => a.startsWith("--filter="))?.split("=")[1];
  const failOnArg = (argv.find((a) => a.startsWith("--fail-on=")) ?? "--fail-on=High").split("=")[1] as Severity;
  const failOn: Severity = SEVERITY_ORDER.includes(failOnArg) ? failOnArg : "High";

  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    console.error(`[ecl:lint] cannot read library: ${file}`);
    process.exit(1);
  }

  const { sections, appendixIds } = parseLibrary(text);
  // Citations are scanned from EVERY suite regardless of --filter. Narrowing the scan
  // would let a scoped run report "uncited" for a section cited only by a suite the
  // filter excluded — the same false-clean class ECLC-003 exists to prevent.
  const citations = buildCitations(join(repoRoot, "regression", "suites"));
  const allFindings = lint(sections, appendixIds, citations, repoRoot);

  let re: RegExp | null = null;
  if (filterArg) {
    try {
      re = new RegExp(filterArg);
    } catch {
      console.error(`[ecl:lint] invalid --filter regex: ${filterArg}`);
      process.exit(1);
    }
  }
  const inScope = (id: string): boolean => !re || re.test(id);
  const findings = allFindings.filter((f) => inScope(f.id));
  const scopedSections = sections.filter((s) => inScope(s.id));
  const blocking = findings.filter((x) => rank(x.severity) >= rank(failOn));

  if (json) {
    console.log(
      JSON.stringify(
        {
          library: relative(repoRoot, file),
          filter: filterArg ?? null,
          sections: scopedSections.map((s) => ({
            id: s.id,
            title: s.title,
            chapter: s.chapter,
            chapterTitle: s.chapterTitle,
            line: s.line,
            citedBy: citations.byEcl.get(s.id) ?? [],
          })),
          findings,
          unparsedSuites: citations.unparsed.map((p) => relative(repoRoot, p)),
          failOn,
          blocking: blocking.length,
        },
        null,
        2,
      ),
    );
    process.exit(blocking.length > 0 ? 1 : 0);
  }

  const cited = scopedSections.filter((s) => citations.byEcl.has(s.id)).length;
  const scopeNote = filterArg ? ` (filtered to /${filterArg}/ — citations still scanned across ALL suites)` : "";
  console.log(`\n[ecl:lint] ${scopedSections.length} sections, ${cited} cited by ≥1 case, ${citations.byEcl.size} distinct ids cited across the suites${scopeNote}`);

  if (findings.length === 0) {
    console.log(`[ecl:lint] OK — no findings\n`);
  } else {
    const order: Severity[] = ["Blocker", "Critical", "High", "Medium", "Informational"];
    for (const sev of order) {
      const group = findings.filter((x) => x.severity === sev);
      if (!group.length) continue;
      console.log(`\n  ${sev} (${group.length})`);
      for (const x of group) console.log(`    ${x.rule}  ${x.id.padEnd(14)} ${x.message}`);
    }
    console.log(
      `\n  Existence checks only. A ref that resolves to a REAL BUT WRONG section (e.g. a loyalty case citing ECL-13.2 "Subscription & Recurring Billing") passes every check above — that is /qa-review-tests Dimension 6's judgment call, not this script's.`,
    );
    console.log(`\n[ecl:lint] ${blocking.length} finding(s) at/above ${failOn}\n`);
  }

  process.exit(blocking.length > 0 ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
