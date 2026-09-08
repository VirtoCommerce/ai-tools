/**
 * `bl:extract` — hand an agent the BL invariants it needs, as TEXT, instead of a 386 KB file path.
 *
 * WHY THIS EXISTS. The 2026-09-07 audit measured where the token budget actually goes and found the
 * largest remaining item is not the always-loaded tier (that was re-tiered in PRs 1–3) but the
 * per-dispatch reads: ~41 briefs across the agent corpus point at
 * `.claude/knowledge/oracles/business-logic.md` by PATH. Every agent that follows one reads the whole
 * oracle — every invariant in it — to use the three or four that touch its domain. A
 * `/qa-test` FULL run dispatches many such agents, and each pays it again in its own context.
 *
 * The fix is not to shrink the oracle: it is the single source of truth and every invariant in it is
 * load-bearing somewhere. The fix is to stop shipping ALL of it to an agent that needs ONE domain.
 * This script slices it deterministically so an orchestrator can paste the relevant invariants into a
 * brief as DATA. Measured 2026-09-08: `--domain cart` was 7.5% of the file, ~7.2K tokens against ~96K.
 * Counts are never transcribed here (CLAUDE.md §Where the rules live) — `npm run bl:extract:list`
 * prints the live domains and sizes, and `--stats` prints the ratio for whatever you just extracted.
 *
 * VERBATIM, NOT SUMMARISED. The output is the oracle's own markdown, sliced by line range — never a
 * re-rendering. An agent reading extracted text is reading the same authority, character for
 * character, and `BL-*` ids keep their citation contract with the suites. Anything that paraphrased
 * an invariant would create a second, drifting copy, which is the exact defect the audit found in the
 * prose corpus.
 *
 * IT REUSES THE GATE'S PARSER. `ENTRY_RE` / `DOMAIN_RE` are imported from `lint-bl.ts`, so "what
 * counts as a BL entry" is defined once. A future heading-shape change updates both at once, and
 * `scripts/unit/extract-bl.test.ts` fails if an extract ever loses an id the linter can see.
 *
 * Usage:
 *   npm run bl:extract -- --domain cart              # one domain, by prefix or heading word
 *   npm run bl:extract -- --domain cart,checkout     # several
 *   npm run bl:extract -- --id BL-CART-003,BL-PRICE-001
 *   npm run bl:extract -- --severity P0-revenue,P0-security
 *   npm run bl:extract -- --domain cart --json       # {invariants:[{id,title,severity,markdown}], …}
 *   npm run bl:extract -- --list                     # domains + counts + bytes, to choose a scope
 *   npm run bl:extract -- --domain cart --stats      # what the slice costs vs the whole file
 *
 * Filters combine as a UNION (--domain cart --id BL-PRICE-001 gives cart plus that one). Ordering
 * always follows the oracle, so two runs with the same filters produce byte-identical output.
 *
 * Exit codes: 0 on a non-empty extract; 2 on a filter that matches nothing (a silent empty brief is
 * worse than a loud failure — an agent handed zero invariants would report "no invariant applies").
 */
import { readFileSync } from "fs";
import { join } from "path";
import { DOMAIN_RE, ENTRY_RE } from "./lint-bl.ts";

export const BL_PATH = join(".claude", "knowledge", "oracles", "business-logic.md");

export interface Slice {
  id: string;
  title: string;
  severity: string;
  /** The `## Domain N: Name (BL-X)` heading this entry sits under. */
  domain: string;
  domainPrefix: string;
  /** The entry's own markdown, verbatim, `### BL-…` heading included. */
  markdown: string;
}

const BRACKET_TAG = /`\[([^\]]+)\]`/g;
const VALID_TAGS = new Set(["P0-revenue", "P0-security", "P1-data", "P1-ux", "P2-ux"]);

/**
 * Slice the oracle into per-entry markdown, preserving source order.
 *
 * An entry runs from its `### BL-…` line to just before the next heading at `###` or above (another
 * invariant, a domain, or any other section), with trailing blank lines trimmed — so a slice is
 * self-contained, carries no borrowed prose, and concatenating several yields valid markdown. The
 * slice is taken by character offset from the original text, so it is byte-identical to the source
 * including its line endings (CRLF checkouts included).
 */
export function sliceOracle(text: string): Slice[] {
  // Slice the ORIGINAL string by character offset rather than re-joining split lines. Splitting on
  // /\r?\n/ and joining with "\n" silently rewrites every line ending, so on a CRLF checkout (Windows,
  // git autocrlf) the "verbatim" claim above becomes false and `text.includes(slice)` fails for every
  // entry — measured: 0 of 216. Offsets keep a slice byte-identical to its source on both platforms.
  const rawLines = text.split("\n");
  const out: Slice[] = [];
  const offsets: number[] = [];
  let at = 0;
  for (const l of rawLines) {
    offsets.push(at);
    at += l.length + 1; // + the "\n" that split consumed
  }

  let domain = "(preamble)";
  let cur: { start: number; id: string; title: string; severity: string; domain: string } | null = null;

  const close = (endLineExclusive: number) => {
    if (!cur) return;
    const from = offsets[cur.start];
    const to = endLineExclusive < offsets.length ? offsets[endLineExclusive] : text.length;
    out.push({
      id: cur.id,
      title: cur.title,
      severity: cur.severity,
      domain: cur.domain,
      domainPrefix: cur.id.replace(/-\d+[A-Z]?$/, ""),
      markdown: text.slice(from, to).replace(/\s+$/, ""),
    });
    cur = null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    // Match on the line WITHOUT its carriage return: `.` matches `\r`, so a CRLF file would otherwise
    // fold the CR into the captured title and into the severity tag.
    const line = rawLines[i].endsWith("\r") ? rawLines[i].slice(0, -1) : rawLines[i];
    if (DOMAIN_RE.test(line)) {
      close(i);
      domain = line.replace(/^##\s+/, "").trim();
      continue;
    }
    const entry = line.match(ENTRY_RE);
    if (entry) {
      close(i);
      const tail = entry[2];
      const tags = [...tail.matchAll(BRACKET_TAG)].map((m) => m[1].trim());
      cur = {
        start: i,
        id: entry[1],
        title: tail.replace(BRACKET_TAG, "").replace(/→.*$/, "").trim(),
        severity: tags.find((t) => VALID_TAGS.has(t)) ?? "",
        domain,
      };
      continue;
    }
    // ANY heading at `###` or above ends the entry, not just a BL one. Today the oracle's only
    // non-BL `###` is "Severity Tags" in the preamble, so this changes no current slice — but the
    // moment someone adds a `### Note` inside a domain, an entry that swallowed it would ship
    // unrelated prose inside `BL-X`'s body, and a brief cannot tell borrowed text from the invariant.
    if (/^#{1,3}\s/.test(line)) close(i);
  }
  close(rawLines.length);
  return out;
}

export interface Filters {
  domains?: readonly string[];
  ids?: readonly string[];
  severities?: readonly string[];
}

/** True when NO filter was given — the caller asked for everything. */
const empty = (f: Filters) => !f.domains?.length && !f.ids?.length && !f.severities?.length;

/**
 * Resolve ONE `--domain` token to the slices it means, precisely.
 *
 * Two passes, and the order is the whole point. An exact id-prefix match wins outright; only when a
 * token matches no prefix at all does it fall back to a whole-word match on the domain heading.
 * Without that precedence `--domain cart` also returns every Loyalty invariant, because that heading
 * reads "Loyalty & Mixed cart (BL-LOY)" — measured here: 33 invariants and 66 KB instead of 15 and
 * 28 KB. A brief padded with a neighbouring domain is exactly the waste this script exists to remove,
 * and worse, it reads as authoritative scope.
 *
 * The heading fallback still exists because agents brief in domain words: `--domain pricing` has no
 * `BL-PRICING` prefix and must still find "Domain 1: Pricing & Discounts (BL-PRICE)". Whole-word, so
 * `cat` cannot match "Catalog" by accident.
 */
function resolveDomainToken(slices: readonly Slice[], token: string): Slice[] {
  const t = token.trim().toLowerCase();
  if (!t) return [];
  const wanted = t.startsWith("bl-") ? t : `bl-${t}`;
  const byPrefix = slices.filter((s) => s.domainPrefix.toLowerCase() === wanted);
  if (byPrefix.length) return byPrefix;
  const word = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return slices.filter((s) => word.test(s.domain));
}

export function selectSlices(slices: readonly Slice[], f: Filters): Slice[] {
  if (empty(f)) return [...slices];
  const ids = new Set((f.ids ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));
  const sev = new Set((f.severities ?? []).map((s) => s.trim()).filter(Boolean));
  // Each --domain token is resolved against the WHOLE corpus first (prefix, else heading word), then
  // unioned — so one token's precision is not weakened by another token in the same run.
  const byDomain = new Set((f.domains ?? []).flatMap((d) => resolveDomainToken(slices, d)).map((s) => s.id));
  return slices.filter((s) => ids.has(s.id.toUpperCase()) || sev.has(s.severity) || byDomain.has(s.id));
}

/**
 * The brief-ready document: a provenance header the reader can verify, then the verbatim slices.
 *
 * The header exists because an agent receiving this text must be able to tell it is an EXTRACT and
 * where the rest is — otherwise "I saw no invariant about X" is ambiguous between "none exists" and
 * "it was filtered out". That ambiguity is exactly how a partial read becomes a false clean.
 */
export function renderMarkdown(selected: readonly Slice[], scope: string, total: number): string {
  const ids = selected.map((s) => s.id).join(", ");
  return [
    `# BL invariants — extract (${selected.length} of ${total})`,
    "",
    `> Verbatim slice of \`${BL_PATH}\`, produced by \`npm run bl:extract -- ${scope}\`.`,
    "> **This is a SUBSET.** Invariants outside the filter are not shown and are not absent — if the",
    "> task turns out to touch another domain, extract that domain too rather than concluding no rule",
    "> applies. The `BL-*` ids are the citation contract the suites use; cite them, do not renumber.",
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
  const file = argv.find((a) => !a.startsWith("--") && a.endsWith(".md")) ?? BL_PATH;
  const text = readFileSync(file, "utf-8");
  const slices = sliceOracle(text);

  if (argv.includes("--list")) {
    const byDomain = new Map<string, { n: number; bytes: number }>();
    for (const s of slices) {
      const cur = byDomain.get(s.domain) ?? { n: 0, bytes: 0 };
      byDomain.set(s.domain, { n: cur.n + 1, bytes: cur.bytes + s.markdown.length });
    }
    console.log(`${slices.length} invariants in ${file} (${text.length.toLocaleString()} chars)\n`);
    console.log("domain                                                    n     chars  --domain token");
    console.log("--------------------------------------------------------|----|--------|---------------");
    for (const [domain, v] of byDomain) {
      const token = domain.match(/\(BL-([A-Z0-9]+)\)/)?.[1]?.toLowerCase() ?? "";
      console.log(`${domain.slice(0, 56).padEnd(56)} | ${String(v.n).padStart(2)} | ${String(v.bytes).padStart(6)} | ${token}`);
    }
    process.exit(0);
  }

  const filters: Filters = {
    domains: listArg(argv, "domain"),
    ids: listArg(argv, "id"),
    severities: listArg(argv, "severity"),
  };
  const selected = selectSlices(slices, filters);
  const scope = [
    filters.domains?.length ? `--domain ${filters.domains.join(",")}` : "",
    filters.ids?.length ? `--id ${filters.ids.join(",")}` : "",
    filters.severities?.length ? `--severity ${filters.severities.join(",")}` : "",
  ].filter(Boolean).join(" ") || "(no filter — whole oracle)";

  if (selected.length === 0) {
    console.error(`bl:extract: ${scope} matched no invariant in ${file}.`);
    console.error("Run with --list to see the domains and their tokens. Refusing to emit an empty");
    console.error("extract: an agent handed zero invariants reports 'no rule applies', which is a");
    console.error("false clean, not a missing filter.");
    process.exit(2);
  }

  const md = renderMarkdown(selected, scope, slices.length);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ source: file, scope, total: slices.length, count: selected.length, invariants: selected }, null, 2));
  } else {
    console.log(md);
  }
  if (argv.includes("--stats")) {
    const pct = ((md.length / text.length) * 100).toFixed(1);
    console.error(`\n[bl:extract] ${selected.length}/${slices.length} invariants — ${md.length.toLocaleString()} of ${text.length.toLocaleString()} chars (${pct}%), ~${Math.round(md.length / 4).toLocaleString()} tokens vs ~${Math.round(text.length / 4).toLocaleString()}.`);
  }
}

const isCli = (() => {
  try {
    return process.argv[1]?.endsWith("extract-bl.ts") ?? false;
  } catch {
    return false;
  }
})();

if (isCli) main();
