#!/usr/bin/env -S npx tsx
/**
 * `npm run assert:strength` — REQ-02 (`docs/bug-detection-requirements.md` §5): does a case's assertion strength match
 * its purpose? REPORT ONLY: it gates nothing yet (the ratchet on new FUNC cases is a later phase).
 *
 * PURPOSE — what the case is for, from a `Purpose:` stamp in its `References` cell (the same convention as `Catches:`):
 *   HAPPY   the path completes                      VISUAL  how it looks (layout, tokens, screenshot, a11y)
 *   FUNC    correctness of data or logic
 * A case with no stamp gets a DERIVED purpose, always reported as derived, never as declared:
 *   FUNC   it cites a data/logic `BL-*` rule (severity P0-* or P1-data, read from bl/*.yaml) or a `Catches:` bug — its
 *          author already claimed it checks that kind of rule; citing only UX rules (P1-ux / P2-ux) does not;
 *   VISUAL every assertion is a visual measurement (a VISUAL_TAGS tag), or its suite's manifest tags name a visual
 *          concern (VISUAL_SUITE_TAGS);
 *   HAPPY  otherwise.
 *
 * ASSERTION CLASS — one per assertion line, deterministic (first rule that matches wins, `--case` prints which):
 *   INV    a property over a whole set: every / all / none / unique / sorted / as a set
 *   DER    a value computed from others: arithmetic, a sum, a percentage
 *   REL    an observed value against another value or an exact expectation: =, <, equals, same, unchanged, at least
 *   SHAPE  structure or format: schema, type, format, pattern
 *   PRES   presence or absence alone: visible, shown, exists, no error, returns 200, `= true`
 * Comparing with a bare boolean or "no errors" is PRES: it says the thing happened, not that it is right.
 *
 * THE STRENGTH RULE (REQ-02 item 3) applies to FUNC only: a FUNC case needs at least one non-PRES assertion. HAPPY and
 * VISUAL cases are counted, never flagged.
 *
 * Usage:
 *   npm run assert:strength                         # totals by purpose and class; FUNC cases with only PRES, per suite
 *   npm run assert:strength -- --list [--suite 042] # the flagged case ids
 *   npm run assert:strength -- --case CHK-061       # each assertion line with its class and the rule that decided it
 *   npm run assert:strength -- --json
 */
import "../lib/sync-stdio.mjs";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parseSuite } from "../test-cases/append-test-cases-to-suite.ts";
import { extractReferencedBlIds } from "../knowledge/lint-bl.ts";
import { readDomains } from "../knowledge/bl-yaml.ts";
import { flagValue, rejectUnknownFlags } from "../lib/cli-args.ts";

const MANIFEST = "config/test-suites.json";

export type Purpose = "HAPPY" | "VISUAL" | "FUNC";
export type AssertClass = "PRES" | "REL" | "INV" | "DER" | "SHAPE";
const PURPOSES: readonly Purpose[] = ["HAPPY", "VISUAL", "FUNC"];

/** Tags whose check is a measured visual property (the layout-measure family of `test-runner-tags.md`). */
const VISUAL_TAGS = new Set(["TOUCH", "OVERFLOW", "ALIGN", "SPACING", "SHIFT", "CLS", "CONTRAST", "VISUAL", "SCREENSHOT", "A11Y", "AXE"]);
/** Suite tags (config/test-suites.json) that make a suite's cases visual by concern. */
const VISUAL_SUITE_TAGS = new Set(["accessibility", "a11y", "wcag", "layout", "visual", "storybook", "ui-ux"]);
/** Severities that mark a rule as data or logic correctness rather than UX. */
const FUNC_SEVERITY = /^(P0-|P1-data)/;
/** Tags that assert structure or format by definition. */
const SHAPE_TAGS = new Set(["SCHEMA", "FORMAT", "FORM", "HEADER"]);

interface Rule { cls: AssertClass; id: string; re: RegExp }
/** Content rules, in order. The tag rules in `classifyLine` run first. */
const RULES: readonly Rule[] = [
  { cls: "INV", id: "inv-quantifier", re: /\b(every|all|each|none of|no two|no (?:duplicate|repeated)|duplicates?|unique|distinct|sorted|ascending|descending|monotonic|as a set|exactly once|appears twice)\b/i },
  { cls: "DER", id: "der-arithmetic", re: /(\w|\))\s+[×*+]\s+(\w|\()|\d\s*[×*]\s*\d|\bsum of\b|\bsummed\b|\bmultiplied\b|\bproduct of\b|\d\s*%|\bpercent(age)?\b|\btimes the\b/i },
  { cls: "PRES", id: "pres-bool", re: /^[^=<>]*(?:==?|\bis)\s*(true|false)\s*$/i },
  { cls: "PRES", id: "pres-no-error", re: /^\W*(no |zero )?(errors?\[?\]?|exceptions?)\b[^=<>]*\b(empty|none|absent|thrown)\b[^=<>]*$/i },
  { cls: "REL", id: "rel-operator", re: /(==|!=|<=|>=|≤|≥|≠|(?<![-=<>])[<>](?![-=<>])|\s=\s|\S=\s|\s=\S)/ },
  { cls: "REL", id: "rel-word", re: /\b(equals?|equal to|matches|match(?:ing)? the|same|identical|unchanged|still (?:shows|holds|equals|contains)|consistent with|corresponds?|reflects?|greater|less than|smaller|larger|fewer|more than|at least|at most|exactly \d|exactly one|exactly the|increases?|decreases?|differs?|before and after|vs\.?)\b/i },
  { cls: "SHAPE", id: "shape-word", re: /\b(schema|type|typed|format(?:ted)?|pattern|regex|iso[- ]?\d|non-null|not null|array of|object with|shape)\b/i },
];

export interface LineVerdict { line: string; tag: string | null; cls: AssertClass; rule: string }

/** One assertion line → its class and the rule that decided it. */
export function classifyLine(raw: string): LineVerdict {
  const line = raw.trim();
  const tag = /^\[([A-Z][A-Z0-9_-]*)/.exec(line)?.[1] ?? null;
  // The claim, without its tag, provenance markers ({SPEC} {OBSERVED} …) and trailing parenthetical citations.
  const body = line.replace(/^\[[^\]]*\]\s*/, "").replace(/\{[A-Z]+\}/g, "").replace(/\((?:[^()]*\b(?:BL|ECL|VCST|VP)-[^()]*)\)/g, "").trim();
  if (tag && SHAPE_TAGS.has(tag)) return { line, tag, cls: "SHAPE", rule: `tag-${tag}` };
  if (tag && VISUAL_TAGS.has(tag)) return { line, tag, cls: /[<>=≤≥]/.test(body) ? "REL" : "PRES", rule: `tag-${tag}` };
  for (const r of RULES) if (r.re.test(body)) return { line, tag, cls: r.cls, rule: r.id };
  return { line, tag, cls: "PRES", rule: "default-presence" };
}

export interface CaseInput { id: string; suite: string; assertions: string; references: string; businessRule: string; title?: string; visualSuite?: boolean }
/** BL id → severity, from the oracle's records. */
export type Severities = ReadonlyMap<string, string>;
export function readSeverities(): Map<string, string> {
  return new Map([...readDomains().values()].flatMap((d) => d.rules.map((r) => [r.id, r.priority] as const)));
}
export interface CaseVerdict {
  id: string;
  suite: string;
  purpose: Purpose;
  declared: boolean;
  /** A `Purpose:` stamp naming none of the three. */
  badStamp?: string;
  classes: Partial<Record<AssertClass, number>>;
  lines: LineVerdict[];
  /** FUNC with no non-PRES assertion — the REQ-02 finding. */
  weak: boolean;
}

export function purposeOf(c: CaseInput, lines: readonly LineVerdict[], sev: Severities): { purpose: Purpose; declared: boolean; badStamp?: string } {
  const stamp = /\bPurpose:\s*([A-Za-z]+)/.exec(c.references ?? "")?.[1];
  if (stamp) {
    const p = stamp.toUpperCase() as Purpose;
    if (PURPOSES.includes(p)) return { purpose: p, declared: true };
    return { ...derive(), badStamp: stamp };
  }
  return derive();
  function derive(): { purpose: Purpose; declared: false } {
    const dataRule = extractReferencedBlIds(c.businessRule ?? "").some((id) => FUNC_SEVERITY.test(sev.get(id) ?? ""));
    if (dataRule || /\bCatches:\s*[A-Z][A-Z0-9]+-\d+/.test(c.references ?? "")) return { purpose: "FUNC", declared: false };
    if (c.visualSuite || (lines.length && lines.every((l) => l.tag && VISUAL_TAGS.has(l.tag)))) return { purpose: "VISUAL", declared: false };
    return { purpose: "HAPPY", declared: false };
  }
}

export function classifyCase(c: CaseInput, sev: Severities): CaseVerdict {
  const lines = (c.assertions ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(classifyLine);
  const classes: Partial<Record<AssertClass, number>> = {};
  for (const l of lines) classes[l.cls] = (classes[l.cls] ?? 0) + 1;
  const p = purposeOf(c, lines, sev);
  return { id: c.id, suite: c.suite, ...p, classes, lines, weak: p.purpose === "FUNC" && !lines.some((l) => l.cls !== "PRES") };
}

/** Every case of every suite the manifest declares. A suite that does not parse is returned in `unparsed`, never dropped silently. */
export function loadCorpus(manifestPath = MANIFEST): { cases: CaseInput[]; unparsed: string[] } {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { suites: Array<{ id: string; file: string; tags?: string[] }> };
  const cases: CaseInput[] = [];
  const unparsed: string[] = [];
  for (const s of manifest.suites) {
    if (!existsSync(s.file)) { unparsed.push(s.file); continue; }
    const visualSuite = (s.tags ?? []).some((t) => VISUAL_SUITE_TAGS.has(t));
    try {
      for (const r of parseSuite(readFileSync(s.file, "utf-8")).rows) {
        if (!r.ID) continue;
        cases.push({ id: r.ID, suite: s.id, assertions: r.Assertions ?? "", references: r.References ?? "", businessRule: r.Business_Rule ?? "", title: r.Title, visualSuite });
      }
    } catch {
      unparsed.push(s.file);
    }
  }
  return { cases, unparsed };
}

/** The one-line REQ-02 figure `suites:lint` prints (report only — it never fails the lint). */
export function strengthLine(): string {
  const sev = readSeverities();
  const v = loadCorpus().cases.map((c) => classifyCase(c, sev));
  const func = v.filter((x) => x.purpose === "FUNC");
  const weak = func.filter((x) => x.weak);
  const declared = v.filter((x) => x.declared).length;
  return `${weak.length} of ${func.length} FUNC cases have only presence assertions; ${declared} of ${v.length} cases declare a Purpose: (npm run assert:strength)`;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

function main(argv: string[]): number {
  rejectUnknownFlags(argv, ["--list", "--suite", "--case", "--json"], ["--suite", "--case"]);
  const { cases, unparsed } = loadCorpus();
  const onlySuite = flagValue(argv, "--suite");
  const sev = readSeverities();
  const verdicts = cases.filter((c) => !onlySuite || c.suite === onlySuite).map((c) => classifyCase(c, sev));

  const caseId = flagValue(argv, "--case");
  if (caseId) {
    const v = verdicts.find((x) => x.id === caseId);
    if (!v) { console.error(`assert:strength: no case ${caseId}`); return 2; }
    console.log(`${v.id} (suite ${v.suite}) — purpose ${v.purpose} (${v.declared ? "declared" : "derived"})${v.weak ? " — FUNC with only PRES" : ""}`);
    for (const l of v.lines) console.log(`  ${l.cls.padEnd(5)} ${l.rule.padEnd(16)} ${l.line.slice(0, 120)}`);
    return 0;
  }

  const weak = verdicts.filter((v) => v.weak);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ cases: verdicts.length, unparsed, weak: weak.map((v) => ({ id: v.id, suite: v.suite, declared: v.declared })), byPurpose: tally(verdicts) }, null, 2));
    return 0;
  }
  if (argv.includes("--list")) {
    for (const v of weak) console.log(`${v.suite}\t${v.id}\t${v.declared ? "declared" : "derived"}`);
    return 0;
  }

  console.log(`assert:strength (REQ-02, report only): ${verdicts.length} cases${unparsed.length ? `, ${unparsed.length} suite(s) unreadable: ${unparsed.join(", ")}` : ""}`);
  console.log("\npurpose   declared  derived   only-PRES   lines: PRES   REL   INV   DER  SHAPE");
  for (const [p, t] of Object.entries(tally(verdicts))) {
    console.log(`${p.padEnd(9)} ${String(t.declared).padStart(8)} ${String(t.derived).padStart(8)} ${`${t.onlyPres} (${pct(t.onlyPres, t.declared + t.derived)})`.padStart(11)}   ${["PRES", "REL", "INV", "DER", "SHAPE"].map((k) => String(t.lines[k as AssertClass] ?? 0).padStart(5)).join(" ")}`);
  }
  const bad = verdicts.filter((v) => v.badStamp);
  if (bad.length) console.log(`\n${bad.length} case(s) carry a Purpose: stamp that is none of ${PURPOSES.join("/")}: ${bad.slice(0, 10).map((v) => `${v.id}=${v.badStamp}`).join(", ")}`);
  const bySuite = new Map<string, number>();
  for (const v of weak) bySuite.set(v.suite, (bySuite.get(v.suite) ?? 0) + 1);
  const empty = weak.filter((v) => !v.lines.length).length;
  console.log(`\nFUNC cases with only PRES: ${weak.length} (${weak.filter((v) => v.declared).length} declared, ${weak.filter((v) => !v.declared).length} derived${empty ? `; ${empty} have no assertion at all` : ""}). Top suites:`);
  for (const [s, n] of [...bySuite].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${s.padEnd(8)} ${n}`);
  console.log("\n--list for the ids · --case <ID> for why · HAPPY and VISUAL cases are counted, never flagged.");
  return 0;
}

function tally(verdicts: readonly CaseVerdict[]) {
  const out: Record<string, { declared: number; derived: number; onlyPres: number; lines: Partial<Record<AssertClass, number>> }> = {};
  for (const p of PURPOSES) out[p] = { declared: 0, derived: 0, onlyPres: 0, lines: {} };
  for (const v of verdicts) {
    const t = out[v.purpose];
    if (v.declared) t.declared++;
    else t.derived++;
    if (v.lines.length && v.lines.every((l) => l.cls === "PRES")) t.onlyPres++;
    for (const [k, n] of Object.entries(v.classes)) t.lines[k as AssertClass] = (t.lines[k as AssertClass] ?? 0) + (n ?? 0);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
