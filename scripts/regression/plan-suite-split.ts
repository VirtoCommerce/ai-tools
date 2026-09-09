// Plan (and apply) a dependency-safe split of an oversized regression suite.
//
// WHY THIS EXISTS. `reports/regression/history.json` (108 suite rows, 19 runs, 3991 cases) shows
// artefactual BLOCKED rising with suite size: 13.5% at <=15 cases, 17.9% at 16-40, 17.7% at 41-80,
// **28.6% at 81+**. Session length is the driver, and it is the one thing bounded batching
// (`ci/lib/suite-batching.ts`) provably cannot fix: a batch is never shorter than its longest
// member, so a 116-case suite is a 116-case session whatever the batcher does. Splitting is the
// only lever that reaches it.
//
// WHY IT IS A SCRIPT AND NOT A JUDGEMENT CALL. The 078 split (115 cases -> four siblings) was done
// by hand after a hand analysis, and the note it left behind is the whole reason this file exists
// (`.claude/knowledge/execution/regression-suites.md` §Suite inventory):
//
//   * "The unit of splitting is a dependency component, not a row range." 99 of 078's 115 cases
//     declared a dependency in `Preconditions`; a row slice cuts those chains and turns a slow pass
//     into a fast cascade of BLOCKED.
//   * A row-range split WAS actually tried (`REG-2026-08-03-1900`, `078-p1/p2/p3`) and failed.
//
// Nothing enforced that lesson. This script does: it reads the SAME dependency edges `suites:lint`
// enforces XREF-001 with (same regex, same "a token counts only when it resolves to a real case id"
// rule — imported, not re-implemented, so the planner and the gate can never disagree), keeps every
// dependency component whole, and REFUSES to emit a plan whose boundaries cut an edge.
//
// It is also the answer to the question the 078 note could not answer in general: is a given suite
// splittable at all? Measured on the four 81+ browser suites (2026-09-09), the answer turned out to
// be "trivially" — 060/072/014/083c declare 3/1/2/9 dependency rows against 078's 99, largest
// component 3/2/3/8. 078 was the hard case, not the typical one.
//
// ROWS MOVE VERBATIM. Records are sliced out of the raw file by a quote-aware scanner and written
// byte-for-byte into the sibling; nothing is re-serialised. A csv-parse round-trip would silently
// renormalise quoting across ~100 multi-line rows, which is a diff nobody can review and a change
// `suites:lint`'s CSV_LINT_BASELINE would happily absorb.
//
// Usage:
//   npm run suites:split -- <SUITE_ID> [--max-cases 60] [--depth 2] [--names slug-a,slug-b]
//   npm run suites:split:apply -- <SUITE_ID> [...]

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parse as parseCsv } from "csv-parse/sync";

/** Default session budget, in cases. Shared intent with `ci/lib/suite-batching.ts`
 *  DEFAULT_MAX_BATCH_CASES: a suite at or under it is both out of the 81+ BLOCKED bucket and
 *  packable into a batch, so the two levers compose instead of fighting. */
export const DEFAULT_MAX_SPLIT_CASES = 60;

/** The XREF-001 reference regex. Kept identical to `sync-test-suites.ts` on purpose — see header. */
const CASE_REF_RE = /\b([A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*)-(\d{2,4})\b/g;

export interface SuiteRow {
  id: string;
  section: string;
  /** In-file case ids this row's `Preconditions` depends on (self-reference excluded). */
  deps: string[];
}

// --- raw record scanning ------------------------------------------------------------------

/**
 * Split a CSV's raw text into its header record and its body records, quote-aware, keeping every
 * byte (line terminator included). A record ends at a newline that is NOT inside a quoted field;
 * `""` inside a quoted field is an escaped quote, not a terminator.
 */
export function scanRecords(text: string): { header: string; body: string[] } {
  const records: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === "\n") {
      records.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) records.push(text.slice(start));
  const header = records[0] ?? "";
  // A trailing newline produces no record; a blank line between records is not a record either.
  const body = records.slice(1).filter((r) => r.trim() !== "");
  return { header, body };
}

// --- dependency graph ---------------------------------------------------------------------

/** In-file dependency edges declared in `Preconditions`, using the XREF-001 resolution rule. */
export function dependencyEdges(rows: readonly SuiteRow[]): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const row of rows) for (const dep of row.deps) edges.push([row.id, dep]);
  return edges;
}

export function rowsFromRecords(
  records: ReadonlyArray<Record<string, string>>,
): SuiteRow[] {
  const ids = new Set(
    records.map((r) => (r.ID ?? "").trim()).filter((id) => id.length > 0),
  );
  return records.map((r) => {
    const id = (r.ID ?? "").trim();
    const pre = r.Preconditions ?? "";
    const deps = [...pre.matchAll(CASE_REF_RE)]
      .map((m) => m[0])
      .filter((ref) => ref !== id && ids.has(ref));
    return { id, section: (r.Section ?? "").trim(), deps: [...new Set(deps)] };
  });
}

// --- blocks ---------------------------------------------------------------------------------

/** The grouping theme of a row: the first `depth` levels of its `Section` breadcrumb. */
export function themeKeyOf(section: string, depth = 2): string {
  const parts = section.split(">").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "(none)";
  return parts.slice(0, depth).join(" > ");
}

export interface Block {
  /** Inclusive row-index range this block spans. */
  from: number;
  to: number;
  themes: string[];
}

/**
 * Contiguous, order-preserving, dependency-closed blocks.
 *
 * Two passes. First, maximal runs of consecutive rows sharing a theme key. Then any dependency edge
 * joining two blocks widens a group to the whole interval between them — the blocks BETWEEN the two
 * are swept in as well, because a group that skipped them could only be honoured by reordering rows,
 * and row order is the execution order the suite was authored in.
 */
export function buildBlocks(rows: readonly SuiteRow[], depth = 2): Block[] {
  if (rows.length === 0) return [];
  const indexOf = new Map<string, number>();
  rows.forEach((r, i) => indexOf.set(r.id, i));

  // Intervals start as theme runs.
  const intervals: Array<{ from: number; to: number }> = [];
  let from = 0;
  for (let i = 1; i <= rows.length; i++) {
    const same =
      i < rows.length && themeKeyOf(rows[i].section, depth) === themeKeyOf(rows[from].section, depth);
    if (!same) {
      intervals.push({ from, to: i - 1 });
      from = i;
    }
  }

  // Widen for every dependency edge, then coalesce overlaps until stable.
  for (const row of rows) {
    const a = indexOf.get(row.id)!;
    for (const dep of row.deps) {
      const b = indexOf.get(dep);
      if (b === undefined) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (const iv of intervals) {
        if (iv.from <= hi && iv.to >= lo) {
          iv.from = Math.min(iv.from, lo);
          iv.to = Math.max(iv.to, hi);
        }
      }
    }
  }
  intervals.sort((x, y) => x.from - y.from);
  const merged: Array<{ from: number; to: number }> = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (last && iv.from <= last.to + 1 && iv.from <= last.to) last.to = Math.max(last.to, iv.to);
    else if (last && iv.from <= last.to) last.to = Math.max(last.to, iv.to);
    else merged.push({ ...iv });
  }

  return merged.map((iv) => ({
    from: iv.from,
    to: iv.to,
    themes: [...new Set(rows.slice(iv.from, iv.to + 1).map((r) => themeKeyOf(r.section, depth)))],
  }));
}

// --- packing ----------------------------------------------------------------------------------

export interface PackedSibling {
  from: number;
  to: number;
  count: number;
  themes: string[];
}

/**
 * Pack blocks into the FEWEST siblings that all fit under `maxCases`, balanced and order-preserving.
 *
 * Balance matters more than it looks: the point of the split is the LONGEST resulting session, so
 * 116 -> 58+58 is the win and 116 -> 60+56 is very nearly it, while 116 -> 60+60 (a plain greedy
 * fill) leaves the same worst case as 60+56 for no reason. The target is therefore the balanced
 * share, with `maxCases` kept as the hard ceiling a block may never push a sibling past.
 */
export function packBlocks(blocks: readonly Block[], maxCases: number): PackedSibling[] {
  const total = blocks.reduce((n, b) => n + (b.to - b.from + 1), 0);
  if (total === 0) return [];
  const siblingCount = Math.max(1, Math.ceil(total / maxCases));
  const target = Math.ceil(total / siblingCount);

  const out: PackedSibling[] = [];
  let cur: PackedSibling | null = null;
  for (const b of blocks) {
    const size = b.to - b.from + 1;
    const remaining = siblingCount - out.length;
    const mustClose =
      cur !== null && (cur.count + size > maxCases || (cur.count >= target && remaining > 1));
    if (cur === null || mustClose) {
      if (cur) out.push(cur);
      cur = { from: b.from, to: b.to, count: size, themes: [...b.themes] };
    } else {
      cur.to = b.to;
      cur.count += size;
      for (const t of b.themes) if (!cur.themes.includes(t)) cur.themes.push(t);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// --- plan -------------------------------------------------------------------------------------

export interface SplitPlan {
  total: number;
  maxCases: number;
  siblings: PackedSibling[];
  /** Reasons the plan must NOT be applied. Empty means safe. */
  blockers: string[];
  edges: Array<[string, string]>;
}

/**
 * Size of the largest connected component of the declared dependency graph — the true lower bound
 * on how small a sibling can be. Themes can always be regrouped; a dependency component cannot.
 */
export function largestDependencyComponent(rows: readonly SuiteRow[]): number {
  const parent = new Map<string, string>(rows.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const [a, b] of dependencyEdges(rows)) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const sizes = new Map<string, number>();
  for (const r of rows) {
    const root = find(r.id);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  return Math.max(0, ...sizes.values());
}

export function planSplit(
  rows: readonly SuiteRow[],
  maxCases: number,
  depth = 2,
): SplitPlan {
  const blocks = buildBlocks(rows, depth);
  const siblings = packBlocks(blocks, maxCases);
  const blockers: string[] = [];

  const largestComponent = largestDependencyComponent(rows);
  const indexOfRow = new Map<string, number>();
  rows.forEach((r, i) => indexOfRow.set(r.id, i));
  /** Row-span of the declared dependencies that live inside a block; 0 when it has none. */
  const spanOf = (b: Block): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = b.from; i <= b.to; i++) {
      for (const dep of rows[i].deps) {
        const j = indexOfRow.get(dep);
        if (j === undefined) continue;
        lo = Math.min(lo, i, j);
        hi = Math.max(hi, i, j);
      }
    }
    return hi < lo ? 0 : hi - lo + 1;
  };
  for (const b of blocks) {
    const size = b.to - b.from + 1;
    if (size <= maxCases) continue;
    // THREE different reasons a block can be too big, and the operator's next move differs for each.
    // Reporting the wrong one sends them to a flag that cannot help (measured on 083c: "retry at a
    // deeper --depth" was the message, and depth 3 and 4 were both equally blocked).
    if (largestComponent > maxCases) {
      blockers.push(
        `dependency component of ${largestComponent} cases exceeds --max-cases ${maxCases} (block rows ${b.from + 1}-${b.to + 1}); this suite cannot be cut at this budget without breaking a declared dependency chain`,
      );
    } else if (spanOf(b) > maxCases) {
      blockers.push(
        `declared dependencies inside rows ${b.from + 1}-${b.to + 1} span ${spanOf(b)} rows, over --max-cases ${maxCases}, even though the largest dependency COMPONENT is only ${largestComponent}. A contiguous, order-preserving split cannot separate them; doing so needs the rows RE-ORDERED so each component sits together — a manual, single-author change, not a flag`,
      );
    } else {
      blockers.push(
        `theme block of ${size} cases (rows ${b.from + 1}-${b.to + 1}, ${b.themes.join(" / ")}) exceeds --max-cases ${maxCases}, but its dependencies span only ${spanOf(b)} rows. The Section breadcrumb is too coarse at depth ${depth} — retry with --depth ${depth + 1}`,
      );
    }
  }

  // The invariant the whole script exists for: no edge may cross a sibling boundary.
  const siblingOf = new Map<string, number>();
  siblings.forEach((s, i) => {
    for (let r = s.from; r <= s.to; r++) siblingOf.set(rows[r].id, i);
  });
  for (const [a, b] of dependencyEdges(rows)) {
    const sa = siblingOf.get(a);
    const sb = siblingOf.get(b);
    if (sa !== undefined && sb !== undefined && sa !== sb) {
      blockers.push(`dependency ${a} -> ${b} would cross the boundary between sibling ${sa + 1} and ${sb + 1}`);
    }
  }

  return {
    total: rows.length,
    maxCases,
    siblings,
    blockers,
    edges: dependencyEdges(rows),
  };
}

// --- CLI ----------------------------------------------------------------------------------------

interface ManifestSuite {
  id: string;
  name: string;
  file: string;
  testCount?: number;
  estimatedMinutes?: number;
  [k: string]: unknown;
}

function slugify(theme: string): string {
  return theme
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** The next free single-letter suffixes for `id`, skipping ones the manifest already uses. */
export function freeSuffixes(id: string, taken: ReadonlySet<string>, howMany: number): string[] {
  const out: string[] = [];
  for (let c = "b".charCodeAt(0); c <= "z".charCodeAt(0) && out.length < howMany; c++) {
    const candidate = `${id}${String.fromCharCode(c)}`;
    if (!taken.has(candidate)) out.push(candidate);
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const suiteId = positional[0];
  if (!suiteId) {
    console.error("usage: npm run suites:split -- <SUITE_ID> [--max-cases N] [--depth N] [--names a,b] [--apply]");
    process.exit(1);
  }
  const maxIdx = argv.indexOf("--max-cases");
  const maxCases = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : DEFAULT_MAX_SPLIT_CASES;
  const depthIdx = argv.indexOf("--depth");
  const depth = depthIdx >= 0 ? Number(argv[depthIdx + 1]) : 2;
  const namesIdx = argv.indexOf("--names");
  const names = namesIdx >= 0 ? argv[namesIdx + 1].split(",").map((s) => s.trim()) : [];

  const manifestPath = "config/test-suites.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    suites: ManifestSuite[];
    selections: Record<string, unknown>;
  };
  const parent = manifest.suites.find((s) => s.id === suiteId);
  if (!parent) {
    console.error(`[suites:split] no suite "${suiteId}" in ${manifestPath}`);
    process.exit(1);
  }

  const raw = readFileSync(parent.file, "utf-8");
  const { header, body } = scanRecords(raw);
  const records = parseCsv(raw, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

  // Mixed line endings are a documented corpus hazard, not a cosmetic one: `.gitattributes` pins
  // these CSVs to CRLF because the GraphQL runner's csv-parse (relax_column_count: false) fails on
  // mixed endings inside a multi-line quoted cell (2026-06-10, suite 050b4). A split cannot create
  // that state — records move verbatim — but it can PROPAGATE it into a new file where it is
  // harder to spot, so say so. (The way it actually gets created is an editor or a script that
  // round-trips the file in text mode; Python's default `open()` does exactly that on both read
  // and write.)
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  const lfOnly = (raw.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf > 0 && lfOnly > 0) {
    console.warn(
      `[suites:split] WARNING — ${parent.file} has MIXED line endings (${crlf} CRLF, ${lfOnly} bare LF).\n` +
        `  The split preserves them verbatim, so the mix is inherited. Normalise to CRLF (.gitattributes) before or after.`,
    );
  }

  if (records.length !== body.length) {
    console.error(
      `[suites:split] record-scan disagreement: csv-parse sees ${records.length} rows, the raw scanner ${body.length}. Refusing to split.`,
    );
    process.exit(1);
  }

  const rows = rowsFromRecords(records);
  const plan = planSplit(rows, maxCases, depth);

  console.log(`\n[suites:split] ${suiteId} — ${plan.total} cases, ${plan.edges.length} in-file dependency edge(s)`);
  console.log(`  target: <= ${maxCases} cases per sibling -> ${plan.siblings.length} file(s)\n`);

  const taken = new Set(manifest.suites.map((s) => s.id));
  const suffixes = [suiteId, ...freeSuffixes(suiteId, taken, plan.siblings.length - 1)];

  plan.siblings.forEach((s, i) => {
    const label = suffixes[i] ?? `${suiteId}?${i}`;
    console.log(
      `  ${label.padEnd(6)} rows ${String(s.from + 1).padStart(3)}-${String(s.to + 1).padEnd(3)}  ${String(s.count).padStart(3)} cases  ${s.themes.slice(0, 4).join(" / ")}${s.themes.length > 4 ? ` (+${s.themes.length - 4})` : ""}`,
    );
  });

  if (plan.blockers.length > 0) {
    console.error(`\n[suites:split] BLOCKED — ${plan.blockers.length} reason(s):`);
    for (const b of plan.blockers) console.error(`  - ${b}`);
    process.exit(2);
  }
  console.log(`\n  no dependency edge crosses a boundary — plan is safe.`);

  if (!apply) {
    console.log(`\n  dry run. Re-run with \`npm run suites:split:apply -- ${suiteId}\` to write the files.`);
    return;
  }

  const dir = dirname(parent.file);
  const written: Array<{ id: string; file: string; count: number; themes: string[] }> = [];

  plan.siblings.forEach((s, i) => {
    const id = suffixes[i];
    const slug = names[i] ?? slugify(s.themes[0] ?? "part");
    const file = i === 0 ? parent.file : join(dir, `${id}-${slug}.csv`);
    const text = header + body.slice(s.from, s.to + 1).join("");
    writeFileSync(file, text, "utf-8");
    written.push({ id, file, count: s.count, themes: s.themes });
  });

  // Manifest: parent keeps its id (a past sprint plan naming it still resolves, to a smaller
  // suite); siblings are new entries carrying the parent's routing fields verbatim.
  const totalCases = plan.total;
  const parentMinutes = typeof parent.estimatedMinutes === "number" ? parent.estimatedMinutes : 0;
  const idx = manifest.suites.findIndex((s) => s.id === suiteId);
  const inserts: ManifestSuite[] = [];
  written.forEach((w, i) => {
    const minutes = Math.max(1, Math.round((parentMinutes * w.count) / totalCases));
    if (i === 0) {
      parent.testCount = w.count;
      parent.estimatedMinutes = minutes;
      return;
    }
    // Key order mirrors the existing entries so the manifest diff stays reviewable; `lanes` is
    // dropped rather than copied, because per-lane counts describe the PARENT's rows.
    const {
      id: _id,
      name: _name,
      file: _file,
      lanes: _lanes,
      domain,
      layer,
      concern,
      priority,
      testCount: _tc,
      estimatedMinutes: _em,
      agent,
      tags,
      ...extras
    } = parent;
    inserts.push({
      id: w.id,
      name: `${String(parent.name).split(" — ")[0]} — ${w.themes[0] ?? "part"}`,
      file: w.file,
      domain,
      layer,
      concern,
      priority,
      testCount: w.count,
      estimatedMinutes: minutes,
      agent,
      tags,
      ...extras,
    } as ManifestSuite);
  });
  manifest.suites.splice(idx + 1, 0, ...inserts);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log(`\n[suites:split] wrote ${written.length} file(s) and ${inserts.length} manifest entry(ies):`);
  for (const w of written) console.log(`  ${w.id.padEnd(6)} ${w.count} cases  ${w.file}`);
  console.log(
    `\n  NEXT: \`npm run suites:sync\` (recount), \`npm run suites:lint\` (ids + XREF-001), and add the new ids to any\n  \`selections\` entry that names ${suiteId} EXPLICITLY (\`where\`-based groups pick them up from the carried domain/layer/tags).`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith("plan-suite-split.ts");
if (invokedDirectly) main();
