/**
 * flip — the two writes qa-case-promotion must never hand-roll.
 *
 *   npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts snapshot <file>...        > snapshot.json
 *   npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts restore <snapshot.json>
 *   npx tsx .claude/skills/qa-case-promotion/scripts/flip.ts review <suite.csv> --ticket <KEY> --ids <A,B> [--date YYYY-MM-DD] [--apply]
 *
 * snapshot/restore keep a blob of each file in git's object store (`git hash-object -w`), so a revert
 * puts back exactly those bytes — unlike `git checkout`, which also discards this run's earlier edits
 * and any other session's uncommitted work in the same file.
 *
 * review flips approved rows `Draft → Reviewed` in place and appends `Promoted: <KEY> (<date>)` to
 * References — two cells per row, written through applyCellEdits (tc:promote's byte-preserving
 * editor, which re-parses and proves nothing else moved). `Automated` is never written here: only
 * `tc:promote` may claim it, from a run.
 *
 * review exit codes: 0 flipped (or flippable, dry run) · 1 nothing to flip · 2 refused (a row not
 * Draft, an unknown id, or a file the editor cannot place) — and on 2 nothing is written.
 */
import "../../../../scripts/lib/sync-stdio.mjs";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { appendStamp, applyCellEdits, type CellEdit } from "../../../../scripts/test-cases/promote-cases.ts";

export function planReviewFlip(
  text: string,
  ticket: string,
  ids: string[],
  date: string,
): { edits: Map<string, CellEdit>; refused: { id: string; reason: string }[] } {
  const rows = parseCsv(text, {
    columns: true, bom: true, skip_empty_lines: true, relax_column_count: true,
  }) as Record<string, string>[];
  const byId = new Map(rows.map((r) => [r.ID, r]));
  const edits = new Map<string, CellEdit>();
  const refused: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) {
      refused.push({ id, reason: "not in this suite" });
      continue;
    }
    const status = (r.Automation_Status ?? "").trim();
    if (status !== "Draft") {
      refused.push({ id, reason: `Automation_Status is "${status}", not Draft` });
      continue;
    }
    edits.set(id, {
      Automation_Status: "Reviewed",
      References: appendStamp(r.References ?? "", "Promoted", ticket, date),
    });
  }
  return { edits, refused };
}

export function snapshot(files: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of files) {
    map[resolve(f)] = execFileSync("git", ["hash-object", "-w", resolve(f)], { encoding: "utf8" }).trim();
  }
  return map;
}

export function restore(map: Record<string, string>): void {
  for (const [file, sha] of Object.entries(map)) {
    writeFileSync(file, execFileSync("git", ["cat-file", "-p", sha]));
  }
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv: string[]): number {
  const [cmd, ...args] = argv;
  if (cmd === "snapshot" && args.length > 0) {
    console.log(JSON.stringify(snapshot(args), null, 2));
    return 0;
  }
  if (cmd === "restore" && args.length === 1) {
    restore(JSON.parse(readFileSync(args[0], "utf8")));
    return 0;
  }
  if (cmd === "review" && args[0] && opt(args, "--ticket") && opt(args, "--ids")) {
    const file = args[0];
    const ticket = opt(args, "--ticket")!;
    const ids = opt(args, "--ids")!.split(",").map((s) => s.trim()).filter(Boolean);
    const date = opt(args, "--date") ?? today();
    const text = readFileSync(file, "utf8");
    const plan = planReviewFlip(text, ticket, ids, date);
    for (const r of plan.refused) console.error(`REFUSED ${r.id}: ${r.reason}`);
    if (plan.refused.length) return 2;
    if (plan.edits.size === 0) return 1;
    const out = applyCellEdits(text, plan.edits);
    for (const e of out.errors) console.error(`REFUSED ${e}`);
    if (out.errors.length) return 2;
    for (const id of out.applied) console.log(`${id}: Draft → Reviewed, Promoted: ${ticket} (${date})`);
    if (args.includes("--apply")) writeFileSync(file, out.text);
    else console.log("dry run — nothing written; add --apply");
    return 0;
  }
  console.error(
    "usage: flip.ts snapshot <file>... | restore <snapshot.json> | " +
      "review <suite.csv> --ticket <KEY> --ids <A,B> [--date YYYY-MM-DD] [--apply]",
  );
  return 2;
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[flip] ${(e as Error).message}`);
    process.exit(2);
  }
}
