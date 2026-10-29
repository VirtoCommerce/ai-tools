/**
 * find-source — what a ticket has waiting to be promoted out of `Draft`.
 *
 *   npx tsx .claude/skills/qa-case-promotion/scripts/find-source.ts VCST-5628
 *
 * Two kinds of source (qa-case-promotion SKILL.md step 0):
 *   - in-suite: rows under regression/suites whose Automation_Status is exactly `Draft` and whose
 *     References carry the ticket key — what a current /qa-test run leaves behind;
 *   - legacy:   a run-scoped test-cases.csv in one of the ticket's run folders (older /qa-test runs).
 *
 * The key is matched on a boundary, so VCST-56 never claims a row stamped VCST-5628. A row that
 * /qa-regression Step 6.5 already flipped is not `Draft` and is not a source.
 *
 * Prints the JSON on stdout. Exit 0 = something found, 1 = nothing, 2 = bad usage.
 */
import "../../../../scripts/lib/sync-stdio.mjs";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { parse as parseCsv } from "csv-parse/sync";
import { globDirs, priorRunDirs, TICKET_KEY } from "../../../../scripts/lib/run-dir.mjs";

export interface PromotionSource {
  ticket: string;
  inSuite: { caseId: string; suiteCsv: string }[];
  legacy: { casesCsv: string; summaryJson: string | null }[];
}

const posix = (p: string) => p.split("\\").join("/");

function csvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...csvFiles(p));
    else if (name.endsWith(".csv")) out.push(p);
  }
  return out;
}

export function findPromotionSource(
  ticket: string,
  opts: { suitesRoot?: string; runRoot?: string } = {},
): PromotionSource {
  const runRoot = resolve(opts.runRoot ?? process.cwd());
  const suitesRoot = resolve(opts.suitesRoot ?? join(runRoot, "regression", "suites"));
  const escaped = ticket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const key = new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![0-9])`);

  const inSuite: PromotionSource["inSuite"] = [];
  for (const file of csvFiles(suitesRoot).sort()) {
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(readFileSync(file, "utf8"), {
        columns: true, bom: true, skip_empty_lines: true, relax_column_count: true,
      });
    } catch {
      continue; // an unparsable suite is the linter's finding, not a promotion source
    }
    for (const r of rows) {
      if ((r.Automation_Status ?? "").trim() === "Draft" && key.test(r.References ?? "")) {
        inSuite.push({ caseId: r.ID, suiteCsv: posix(relative(runRoot, file)) });
      }
    }
  }

  const legacy: PromotionSource["legacy"] = [];
  const seen = new Set<string>();
  // priorRunDirs knows the configured layout; the two globs also catch a ticket folder that holds only an env
  // subfolder, which priorRunDirs skips unless that subfolder looks like a full run folder.
  const runDirs = new Set<string>([
    ...(priorRunDirs({ ticket, root: runRoot }) as { dir: string }[]).map((d) => resolve(d.dir)),
    ...(globDirs(join(runRoot, "reports", "tickets", "*", ticket)) as string[]).map((d) => resolve(d)),
    ...(globDirs(join(runRoot, "reports", "tickets", ticket)) as string[]).map((d) => resolve(d)),
  ]);
  for (const dir of runDirs) {
    const candidates = [dir, ...readdirSync(dir).map((n) => join(dir, n)).filter((p) => statSync(p).isDirectory())];
    for (const d of candidates) {
      const csv = join(d, "test-cases.csv");
      if (!existsSync(csv) || seen.has(resolve(csv))) continue;
      seen.add(resolve(csv));
      const summary = join(d, "summary.json");
      legacy.push({
        casesCsv: posix(relative(runRoot, csv)),
        summaryJson: existsSync(summary) ? posix(relative(runRoot, summary)) : null,
      });
    }
  }
  legacy.sort((a, b) => a.casesCsv.localeCompare(b.casesCsv));

  return { ticket, inSuite, legacy };
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) {
  const ticket = process.argv[2];
  if (!ticket || !TICKET_KEY.test(ticket)) {
    console.error("usage: find-source.ts <TICKET-KEY>   (e.g. VCST-5628)");
    process.exit(2);
  }
  const source = findPromotionSource(ticket);
  console.log(JSON.stringify(source, null, 2));
  process.exit(source.inSuite.length + source.legacy.length > 0 ? 0 : 1);
}
