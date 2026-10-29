/**
 * retire — take cases out of a suite: mark them Deprecated, or remove the rows.
 *
 *   npx tsx .claude/skills/qa-suite-sync/scripts/retire.ts deprecate <suite.csv> --ids <A,B> --reason "<why>" [--date YYYY-MM-DD] [--apply]
 *   npx tsx .claude/skills/qa-suite-sync/scripts/retire.ts remove    <suite.csv> (--ids <A,B> | --deprecated) [--apply]
 *
 * Suites only ever grew: `tc:demote` writes `Manual`, nothing removed a row, and a hand edit of a
 * 15-column CSV is how two records merge into one. This is the removal path qa-suite-sync uses
 * after the user approved it.
 *
 * deprecate — `Automation_Status → Deprecated` and `Deprecated: <reason> (<date>)` appended to
 *   References, through tc:promote's byte-preserving editor. The row and its ID stay; no lane runs it.
 * remove    — cuts the records out byte-for-byte (every other line untouched), then re-parses and
 *   proves exactly those records left. `--deprecated` selects every Deprecated row of the suite.
 *   Run `npm run suites:sync` afterwards (testCount). A removed ID is retired: it is never reused,
 *   and removing the highest ID of a prefix prints a warning, because the next allocation scans the
 *   corpus and would hand that number out again.
 *
 * Dry run by default; --apply writes. Exit 0 done/doable · 1 nothing to do · 2 refused (nothing written).
 */
import "../../../../scripts/lib/sync-stdio.mjs";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { appendStamp, applyCellEdits, type CellEdit } from "../../../../scripts/test-cases/promote-cases.ts";
import { isCanonicalHeader } from "../../../../scripts/test-cases/append-test-cases-to-suite.ts";

type Row = Record<string, string>;

function rowsOf(text: string): Row[] {
  return parseCsv(text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) as Row[];
}

export function planDeprecate(
  text: string,
  ids: string[],
  reason: string,
  date: string,
): { edits: Map<string, CellEdit>; refused: { id: string; reason: string }[] } {
  const byId = new Map(rowsOf(text).map((r) => [r.ID, r]));
  const edits = new Map<string, CellEdit>();
  const refused: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) refused.push({ id, reason: "not in this suite" });
    else if ((r.Automation_Status ?? "").trim() === "Deprecated") refused.push({ id, reason: "already Deprecated" });
    else edits.set(id, { Automation_Status: "Deprecated", References: appendStamp(r.References ?? "", "Deprecated", reason, date) });
  }
  return { edits, refused };
}

export function deprecatedIds(text: string): string[] {
  return rowsOf(text).filter((r) => (r.Automation_Status ?? "").trim() === "Deprecated").map((r) => r.ID);
}

interface RawRecord { raw: string; record: string[] }

export function removeRows(text: string, ids: string[]): { text: string; removed: string[]; errors: string[] } {
  if (!isCanonicalHeader(text)) return { text, removed: [], errors: ["suite header is not the canonical 15 columns"] };
  let records: RawRecord[];
  try {
    records = parseCsv(text, { bom: true, skip_empty_lines: true, relax_column_count: true, raw: true }) as unknown as RawRecord[];
  } catch (e) {
    return { text, removed: [], errors: [`CSV does not parse: ${(e as Error).message}`] };
  }
  const want = new Set(ids);
  const unknown = ids.filter((id) => !records.slice(1).some((r) => r.record[0] === id));
  if (unknown.length) return { text, removed: [], errors: unknown.map((id) => `${id}: not in this suite`) };

  let out = "";
  let cursor = 0;
  const removed: string[] = [];
  for (let i = 1; i < records.length; i++) {
    const { raw, record } = records[i];
    const at = text.indexOf(raw, cursor);
    if (at < 0) return { text, removed: [], errors: [`record ${i + 1} (${record[0]}) not locatable in the source text`] };
    let end = at + raw.length;
    if (want.has(record[0])) {
      if (!raw.endsWith("\n")) end += text.startsWith("\r\n", end) ? 2 : text.startsWith("\n", end) ? 1 : 0;
      out += text.slice(cursor, at);
      removed.push(record[0]);
    } else {
      out += text.slice(cursor, end);
    }
    cursor = end;
  }
  out += text.slice(cursor);

  // Round trip: the survivors, in order, field for field.
  const expected = records.map((r) => r.record).filter((r, i) => i === 0 || !want.has(r[0]));
  let after: string[][];
  try {
    after = (parseCsv(out, { bom: true, skip_empty_lines: true, relax_column_count: true }) as string[][]);
  } catch (e) {
    return { text, removed: [], errors: [`rewritten CSV no longer parses: ${(e as Error).message}`] };
  }
  if (JSON.stringify(after) !== JSON.stringify(expected)) {
    return { text, removed: [], errors: ["verification failed: the surviving records changed"] };
  }
  return { text: out, removed, errors: [] };
}

const split = (id: string) => /^(.*?)(\d+)[A-Za-z]?$/.exec(id);

export function reuseWarnings(removed: string[], remainingIds: string[]): string[] {
  const max = new Map<string, number>();
  for (const id of remainingIds) {
    const m = split(id);
    if (m) max.set(m[1], Math.max(max.get(m[1]) ?? -1, Number(m[2])));
  }
  return removed.flatMap((id) => {
    const m = split(id);
    return m && Number(m[2]) > (max.get(m[1]) ?? -1)
      ? [`${id} was the highest ${m[1]}* id — never allocate it again (the corpus scan would)`]
      : [];
  });
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const opt = (args: string[], name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function main(argv: string[]): number {
  const [cmd, file, ...args] = argv;
  const apply = args.includes("--apply");
  if (cmd === "deprecate" && file && opt(args, "--ids") && opt(args, "--reason")) {
    const text = readFileSync(file, "utf8");
    const plan = planDeprecate(text, list(opt(args, "--ids")), opt(args, "--reason")!, opt(args, "--date") ?? today());
    for (const r of plan.refused) console.error(`REFUSED ${r.id}: ${r.reason}`);
    if (plan.refused.length) return 2;
    if (plan.edits.size === 0) return 1;
    const out = applyCellEdits(text, plan.edits);
    for (const e of out.errors) console.error(`REFUSED ${e}`);
    if (out.errors.length) return 2;
    for (const id of out.applied) console.log(`${id}: → Deprecated`);
    if (apply) writeFileSync(file, out.text);
    else console.log("dry run — nothing written; add --apply");
    return 0;
  }
  if (cmd === "remove" && file && (opt(args, "--ids") || args.includes("--deprecated"))) {
    const text = readFileSync(file, "utf8");
    const ids = args.includes("--deprecated") ? deprecatedIds(text) : list(opt(args, "--ids"));
    if (ids.length === 0) return 1;
    const out = removeRows(text, ids);
    for (const e of out.errors) console.error(`REFUSED ${e}`);
    if (out.errors.length) return 2;
    for (const id of out.removed) console.log(`${id}: removed`);
    for (const w of reuseWarnings(out.removed, rowsOf(out.text).map((r) => r.ID))) console.log(`WARN ${w}`);
    if (apply) {
      writeFileSync(file, out.text);
      console.log("now run: npm run suites:sync && npm run suites:lint");
    } else console.log("dry run — nothing written; add --apply");
    return 0;
  }
  console.error(
    'usage: retire.ts deprecate <suite.csv> --ids <A,B> --reason "<why>" [--date YYYY-MM-DD] [--apply]\n' +
      "       retire.ts remove <suite.csv> (--ids <A,B> | --deprecated) [--apply]",
  );
  return 2;
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[retire] ${(e as Error).message}`);
    process.exit(2);
  }
}
