/**
 * `ecl:extract` — hand an agent the edge-case patterns it needs, as TEXT, instead of the whole
 * 121 KB library path. Sibling of `extract-bl.ts`; same contract, the other oracle.
 *
 * WHY BOTH. The 2026-09-07 audit's runtime finding (§6 item 7) is about per-dispatch reads, and the
 * two shared oracles are quoted together everywhere the pipeline briefs an agent — `/qa-test` Step 4's
 * prompt template asks for *"the `BL-*` rule text + `ECL-*` patterns from Step 2"*, and Step 3b's
 * authoring pack names both. Shipping the BL half as extracted text while the ECL half still travels
 * as a path leaves the larger dispatch paying most of what it paid before, and worse, it makes the
 * pack's rule ambiguous: an agent handed one extract and one path cannot tell whether "brief carries
 * it" was meant to apply to the other. Extract both or neither.
 *
 * THE UNIT IS A SECTION, NOT A ROW. `ECL-13.3` is what a suite's `Edge_Case_Refs` cites and what
 * `ecl:lint` proves exists, so the section is the citation contract and therefore the slice. Its
 * pattern table travels whole: a single row lifted out of it loses the Frequency/Impact/Status columns
 * that decide whether the pattern is worth a case at all.
 *
 * VERBATIM, NOT SUMMARISED — the output is the library's own markdown sliced by character offset, so
 * an agent reading an extract reads the same authority character for character, on LF and CRLF alike.
 *
 * IT REUSES THE GATE'S PARSER. `SECTION_RE` / `CHAPTER_RE` / `APPENDIX_RE` / `FENCE_RE` are imported
 * from `lint-ecl.ts`, so "what counts as an ECL section" is defined once. Two of those matter more
 * than they look:
 *   - **Fences.** Appendix A's fenced template contains table rows and headings that are
 *     ILLUSTRATION, not definitions. `lint-ecl` skips fenced lines for exactly this reason (it once
 *     counted a placeholder row as a real pattern of §13.3), and a slicer that did not would ship
 *     that template inside a brief as if it were an edge case.
 *   - **Appendix D.** Its rows CITE sections rather than defining them. Collecting past it would
 *     invent slices for ids that have no body.
 * `scripts/unit/extract-ecl.test.ts` compares id sets between gate and slicer over the real library,
 * so an extract cannot silently drop a section `ecl:lint` can see.
 *
 * Usage:
 *   npm run ecl:extract -- --chapter 1              # a whole chapter, by number
 *   npm run ecl:extract -- --id ECL-1.3,ECL-13.3    # named sections
 *   npm run ecl:extract -- --domain payment         # by word, across chapter AND section titles
 *   npm run ecl:extract -- --chapter 1 --json
 *   npm run ecl:extract:list                        # chapters, sections and sizes, to choose a scope
 *   npm run ecl:extract -- --chapter 1 --stats      # what the slice costs vs the whole library
 *
 * Filters combine as a UNION and output follows library order, so identical filters give
 * byte-identical text.
 *
 * Exit codes: 0 on a non-empty extract; 2 on a filter that matches nothing — a silent empty brief is
 * worse than a loud failure, because an agent handed zero patterns reports "no edge case applies".
 */
import { readFileSync } from "fs";
import { join } from "path";
import { APPENDIX_RE, CHAPTER_RE, FENCE_RE, SECTION_RE } from "./lint-ecl.ts";

export const ECL_PATH = join(".claude", "knowledge", "oracles", "e-commerce-edge-cases-library.md");

export interface EclSlice {
  /** `ECL-13.3` — the citation contract the suites' `Edge_Case_Refs` use. */
  id: string;
  chapter: number;
  seq: number;
  title: string;
  /** The `## N. Name` chapter heading text this section sits under. */
  chapterTitle: string;
  /** The section's own markdown, verbatim, `### N.M` heading included. */
  markdown: string;
}

/**
 * Slice the library into per-section markdown, preserving source order.
 *
 * A section runs from its `### N.M` line to just before the next heading at `###` or above, with
 * trailing blank lines trimmed. Headings inside a fenced block do not count (they are illustration),
 * and collection stops at Appendix D (its rows cite sections, they do not define them).
 */
export function sliceLibrary(text: string): EclSlice[] {
  // Slice the ORIGINAL string by character offset rather than re-joining split lines. Splitting on
  // /\r?\n/ and joining with "\n" rewrites every line ending, which silently falsifies the verbatim
  // claim on a CRLF checkout — the defect `extract-bl.ts` shipped and CI caught on windows-latest.
  const rawLines = text.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const l of rawLines) {
    offsets.push(at);
    at += l.length + 1; // + the "\n" that split consumed
  }

  const out: EclSlice[] = [];
  let chapter = 0;
  let chapterTitle = "(preamble)";
  let inFence = false;
  let cur: { start: number; id: string; chapter: number; seq: number; title: string; chapterTitle: string } | null = null;

  const close = (endLineExclusive: number) => {
    if (!cur) return;
    const from = offsets[cur.start];
    const to = endLineExclusive < offsets.length ? offsets[endLineExclusive] : text.length;
    out.push({
      id: cur.id,
      chapter: cur.chapter,
      seq: cur.seq,
      title: cur.title,
      chapterTitle: cur.chapterTitle,
      markdown: text.slice(from, to).replace(/\s+$/, ""),
    });
    cur = null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    // Match on the line WITHOUT its carriage return: `.` matches `\r`, so a CRLF file would otherwise
    // fold the CR into the captured title and into the chapter heading.
    const line = rawLines[i].endsWith("\r") ? rawLines[i].slice(0, -1) : rawLines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (APPENDIX_RE.test(line)) {
      close(i);
      break; // Appendix D cites sections; it defines none.
    }
    const chap = CHAPTER_RE.exec(line);
    if (chap) {
      close(i);
      chapter = Number(chap[1]);
      chapterTitle = chap[2].trim();
      continue;
    }
    const sec = SECTION_RE.exec(line);
    if (sec) {
      close(i);
      cur = {
        start: i,
        id: `ECL-${sec[1]}.${sec[2]}`,
        chapter: Number(sec[1]),
        seq: Number(sec[2]),
        title: sec[3].trim(),
        chapterTitle,
      };
      continue;
    }
    // ANY heading at `###` or above ends the section — an appendix, a note, a chapter. Without this a
    // section would swallow unrelated prose and a brief cannot tell borrowed text from the pattern.
    if (/^#{1,3}\s/.test(line)) close(i);
  }
  close(rawLines.length);
  return out;
}

export interface EclFilters {
  chapters?: readonly (string | number)[];
  ids?: readonly string[];
  domains?: readonly string[];
}

const empty = (f: EclFilters) => !f.chapters?.length && !f.ids?.length && !f.domains?.length;

/**
 * Resolve ONE `--domain` token: chapter titles UNION section titles, whole-word.
 *
 * **`bl:extract`'s prefix-first precedence deliberately does NOT transfer here, and copying it was a
 * defect caught before this shipped.** There, an exact `BL-CART` prefix is the canonical domain id and
 * a heading-word match is a weaker fallback, so letting the prefix win suppresses a neighbouring
 * domain ("Loyalty & Mixed Cart") that only shares a word. Here the two matches are not strong-vs-weak
 * — chapters 1–13 and 15 are grouped by SUBJECT while **chapter 14 is grouped by ORIGIN** ("Virto
 * Commerce Platform-Specific Patterns"), so its sections belong to the other chapters' subjects by
 * topic and to 14 by provenance. Chapter-first would have made `--domain payment` return chapter 1's
 * eight sections and silently drop `ECL-14.6 Payment Processor Differences (VC-specific)` — the one
 * section carrying this product's actual processor behaviour, which `CLAUDE.md` §Critical Revenue
 * Flows treats as load-bearing. A brief that confidently omits it is the "false clean" the extract
 * header warns about, manufactured by the tool itself.
 *
 * Whole-word on both axes, so `cart` cannot match "Cartesian" and `bot` cannot match "both".
 */
function resolveDomainToken(slices: readonly EclSlice[], token: string): EclSlice[] {
  const t = token.trim();
  if (!t) return [];
  const word = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return slices.filter((s) => word.test(s.chapterTitle) || word.test(s.title));
}

export function selectSections(slices: readonly EclSlice[], f: EclFilters): EclSlice[] {
  if (empty(f)) return [...slices];
  const ids = new Set((f.ids ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));
  const chapters = new Set((f.chapters ?? []).map((c) => Number(String(c).trim())).filter((n) => Number.isFinite(n)));
  const byDomain = new Set((f.domains ?? []).flatMap((d) => resolveDomainToken(slices, d)).map((s) => s.id));
  return slices.filter((s) => ids.has(s.id.toUpperCase()) || chapters.has(s.chapter) || byDomain.has(s.id));
}

/**
 * The brief-ready document: a provenance header the reader can verify, then the verbatim slices.
 *
 * The header exists because an agent receiving this text must be able to tell it is an EXTRACT —
 * otherwise "I saw no edge case about X" is ambiguous between "none is catalogued" and "it was
 * filtered out", and that ambiguity is how a partial read becomes a false clean.
 */
export function renderMarkdown(selected: readonly EclSlice[], scope: string, total: number): string {
  const ids = selected.map((s) => s.id).join(", ");
  return [
    `# ECL edge cases — extract (${selected.length} of ${total})`,
    "",
    `> Verbatim slice of \`${ECL_PATH}\`, produced by \`npm run ecl:extract -- ${scope}\`.`,
    "> **This is a SUBSET.** Sections outside the filter are not shown and are not absent — if the",
    "> task turns out to touch another chapter, extract that too rather than concluding no edge case",
    "> applies. The `ECL-N.M` ids are the citation contract `Edge_Case_Refs` uses; cite them, do not",
    "> renumber. A pattern's `[OBSERVED]` / `[THEORETICAL]` status is part of the row — an observed",
    "> pattern has been seen in this product, a theoretical one has not.",
    "",
    `**Included:** ${ids || "(none)"}`,
    "",
    "---",
    "",
    selected.map((s) => s.markdown).join("\n\n"),
    "",
  ].join("\n");
}

// --- CLI ---------------------------------------------------------------------------------------

function listArg(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== `--${name}`) continue;
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) out.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--") && a.endsWith(".md")) ?? ECL_PATH;
  const text = readFileSync(file, "utf-8");
  const slices = sliceLibrary(text);

  if (argv.includes("--list")) {
    const byChapter = new Map<string, { n: number; bytes: number; chapter: number }>();
    for (const s of slices) {
      const key = `${s.chapter}. ${s.chapterTitle}`;
      const cur = byChapter.get(key) ?? { n: 0, bytes: 0, chapter: s.chapter };
      byChapter.set(key, { n: cur.n + 1, bytes: cur.bytes + s.markdown.length, chapter: s.chapter });
    }
    console.log(`${slices.length} sections in ${file} (${text.length.toLocaleString()} chars)\n`);
    console.log("chapter                                                   n     chars  --chapter");
    console.log("--------------------------------------------------------|----|--------|---------");
    for (const [name, v] of byChapter) {
      console.log(`${name.slice(0, 56).padEnd(56)} | ${String(v.n).padStart(2)} | ${String(v.bytes).padStart(6)} | ${v.chapter}`);
    }
    process.exit(0);
  }

  const filters: EclFilters = {
    chapters: listArg(argv, "chapter"),
    ids: listArg(argv, "id"),
    domains: listArg(argv, "domain"),
  };
  const selected = selectSections(slices, filters);
  const scope = [
    filters.chapters?.length ? `--chapter ${filters.chapters.join(",")}` : "",
    filters.ids?.length ? `--id ${filters.ids.join(",")}` : "",
    filters.domains?.length ? `--domain ${filters.domains.join(",")}` : "",
  ].filter(Boolean).join(" ") || "(no filter — whole library)";

  if (selected.length === 0) {
    console.error(`ecl:extract: ${scope} matched no section in ${file}.`);
    console.error("Run with --list to see the chapters and their numbers. Refusing to emit an empty");
    console.error("extract: an agent handed zero patterns reports 'no edge case applies', which is a");
    console.error("false clean, not a missing filter.");
    process.exit(2);
  }

  const md = renderMarkdown(selected, scope, slices.length);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ source: file, scope, total: slices.length, count: selected.length, sections: selected }, null, 2));
  } else {
    console.log(md);
  }
  if (argv.includes("--stats")) {
    const pct = ((md.length / text.length) * 100).toFixed(1);
    console.error(`\n[ecl:extract] ${selected.length}/${slices.length} sections — ${md.length.toLocaleString()} of ${text.length.toLocaleString()} chars (${pct}%), ~${Math.round(md.length / 4).toLocaleString()} tokens vs ~${Math.round(text.length / 4).toLocaleString()}.`);
  }
}

const isCli = (() => {
  try {
    return process.argv[1]?.endsWith("extract-ecl.ts") ?? false;
  } catch {
    return false;
  }
})();

if (isCli) main();
