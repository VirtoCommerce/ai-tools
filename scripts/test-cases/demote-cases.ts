/**
 * Demote presence-only, expensive cases OUT of the regression lane.
 *
 * WHY THIS EXISTS
 * ---------------
 * `promote-cases.ts` is a one-way ratchet — its own header says it "never
 * demotes". The consequence is measurable: 3 cases out of 4,243 carry
 * `Deprecated`, and nothing else has ever left the lane. Meanwhile a full
 * regression is many hours of wall clock and a large share of the corpus cannot
 * fail on a wrong value, so much of that budget buys checks that only fail when
 * an element is missing entirely. `npm run tc:rank` reports the current share;
 * no figure is transcribed here, because the first version quoted one that the
 * very next commit invalidated.
 *
 * This is the missing counterpart. It is deliberately the WEAKEST possible
 * intervention that still stops the bleeding.
 *
 * WHAT IT DOES AND DOES NOT DO
 * ----------------------------
 *   - Writes `Automation_Status` -> `Manual` ONLY. A demoted case stays in the
 *     file, keeps its ID, keeps its history, and a human can put it straight
 *     back. `Manual` is already an EX-200 opt-out in `case-classifier.ts`, so it
 *     immediately stops consuming regression time with no runner change.
 *   - NEVER writes `Deprecated`. That is the repo's own rule (TRI-006:
 *     "Deprecation is destructive … so it is ALWAYS human") and this script has
 *     no business overriding it — `Deprecated` means "nobody runs this ever",
 *     which is a claim about the product, not about the assertion text.
 *   - NEVER deletes a row, and never touches Steps or Assertions. Strengthening
 *     an assertion needs to know the correct value; that is authoring work for
 *     `/qa-test-cases-generator`, not a bulk edit.
 *   - Requires `--confirm` to write. Default is a dry run.
 *
 * FAIL-CLOSED, in the expensive direction
 * ---------------------------------------
 * A wrong demotion silently removes coverage; a wrong keep costs minutes. So the
 * bar is `rank-cases.ts`'s DEMOTE verdict, which already requires ALL of:
 * presence-only assertions, >= 6 steps, not on the risk floor (Critical/P0), and
 * no deliberate `Archetype:` stamp. Anything cheap, critical or deliberately
 * designed comes back STRENGTHEN and is never touched here.
 *
 * The write itself reuses `promote-cases.ts` `applyCellEdits`, which edits only
 * the bytes of the changed cells and then re-parses and compares every field —
 * so a re-serialisation cannot silently renormalise the quoting of untouched
 * rows. Measured on promote: 39 edits produced exactly 39 insertions and 39
 * deletions.
 *
 * Usage:
 *   npx tsx scripts/test-cases/demote-cases.ts [--suite <csv>] [--layer frontend] [--limit N]
 *   npx tsx scripts/test-cases/demote-cases.ts --suite <csv> --apply
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, sep } from "path";
import { fileURLToPath } from "url";
import { parseSuite } from "./append-test-cases-to-suite.js";
import { appendStamp, applyCellEdits, type CellEdit } from "./promote-cases.js";
import { rankSuiteFile, type CaseRank } from "./rank-cases.js";
import { isNonExecutingStatus } from "../lib/case-classifier.js";
import { flagValue, intFlag, rejectUnknownFlags } from "../lib/cli-args.js";

export const DEMOTION_TARGET = "Manual";
/**
 * Can this status be moved out of the lane?
 *
 * Derived from the same owner `rank-cases` uses. The two previously kept
 * separate literals and disagreed about a BLANK status: the ranker counted it as
 * running and advertised it, this script refused it as DM-002, and 386 of 795
 * advertised candidates (48%) were unactionable.
 */
export function isDemotable(status: string): boolean {
  return !isNonExecutingStatus(status);
}

export const DEMOTE_REASONS = {
  NOT_A_CANDIDATE: "DM-001 rank verdict is not DEMOTE",
  WRONG_STATUS: "DM-002 Automation_Status is not one that runs in regression",
  ALREADY_TARGET: "DM-003 already Manual",
  NO_ID: "DM-004 row has no ID",
} as const;

/**
 * Append a reversal-friendly stamp so the demotion is attributable and undoable.
 * Delegates to `promote-cases`' `appendStamp` — same idempotent-append rule,
 * one implementation.
 */
export function stampDemotion(references: string, label: string, date: string): string {
  return appendStamp(references, "Demoted", label, date, "presence-only");
}

export interface DemotionDecision {
  id: string;
  suite: string;
  demote: boolean;
  reason: string;
  steps: number;
  priority: string;
  from: string;
}

/** Pure decision over an already-ranked case. */
export function decideDemotion(r: CaseRank): DemotionDecision {
  const base = { id: r.id, suite: r.suite, steps: r.steps, priority: r.priority, from: r.status };
  if (!r.id || r.id === "<no id>" || r.id === "<unparsable>")
    return { ...base, demote: false, reason: DEMOTE_REASONS.NO_ID };
  if (r.status === DEMOTION_TARGET)
    return { ...base, demote: false, reason: DEMOTE_REASONS.ALREADY_TARGET };
  if (r.verdict !== "DEMOTE")
    return { ...base, demote: false, reason: `${DEMOTE_REASONS.NOT_A_CANDIDATE} (${r.verdict})` };
  if (!isDemotable(r.status))
    return { ...base, demote: false, reason: `${DEMOTE_REASONS.WRONG_STATUS} ("${r.status}")` };
  return { ...base, demote: true, reason: r.reasons.join("; ") };
}

function main(): void {
  const argv = process.argv.slice(2);
  rejectUnknownFlags(
    argv,
    ["--apply", "--json", "--suite", "--label", "--date", "--limit"],
    ["--suite", "--label", "--date", "--limit"],
  );
  // `--apply` matches promote-cases, the incumbent counterpart. The first
  // version used `--confirm` for identical semantics.
  const confirm = argv.includes("--apply");
  const asJson = argv.includes("--json");
  const suite = flagValue(argv, "--suite");
  const label = flagValue(argv, "--label") ?? "rank-cases";
  const date = flagValue(argv, "--date") ?? new Date().toISOString().slice(0, 10);
  const limit = intFlag(argv, "--limit", 50);

  if (!suite) {
    console.error(
      "✗ --suite <csv> is required.\n" +
        "  A corpus-wide bulk demotion is deliberately not offered: hundreds of cases across dozens\n" +
        "  of files in one commit is unreviewable, and this write is the one that removes coverage.\n" +
        "  Run it per suite, review the diff, move on. `npm run tc:rank -- --verdict DEMOTE` gives\n" +
        "  the current corpus-wide count — quoted nowhere, so it cannot go stale.",
    );
    process.exit(1);
  }

  const file = resolve(suite);
  const decisions = rankSuiteFile(file).map(decideDemotion);
  const toDemote = decisions.filter((d) => d.demote);

  if (asJson) {
    console.log(JSON.stringify({ suite: file, total: decisions.length, demoting: toDemote.length, decisions }, null, 2));
    if (!confirm) return;
  } else {
    console.log(`\n${file.split(sep).pop()} — ${decisions.length} case(s), ${toDemote.length} to demote → ${DEMOTION_TARGET}\n`);
    for (const d of toDemote.slice(0, limit)) {
      console.log(`  ${d.id.padEnd(18)} ${d.priority.padEnd(9)} ${d.from.padEnd(10)} ${d.steps}st`);
      console.log(`      ${d.reason}`);
    }
    if (toDemote.length > limit) console.log(`  … ${toDemote.length - limit} more`);
  }

  if (!toDemote.length) {
    if (!asJson) console.log("\nNothing to demote.");
    return;
  }

  if (!confirm) {
    console.log(
      `\nDRY RUN — nothing written. Re-run with --apply to write.\n` +
        `Demotion sets Automation_Status to "${DEMOTION_TARGET}" and appends a "Demoted:" stamp to\n` +
        `References. The row, its ID and its steps are untouched, so this is reversible; it is NOT\n` +
        `Deprecated (that stays human, per TRI-006) and nothing is deleted.`,
    );
    return;
  }

  const text = readFileSync(file, "utf-8");
  // The References cell is read from the parsed row so the "Demoted:" stamp is
  // APPENDED to whatever stamps are already there (Synced:/Audited:/Promoted:),
  // never clobbering them.
  const byId = new Map(parseSuite(text).rows.map((r) => [r.ID, r] as const));
  const edits = new Map<string, CellEdit>();
  const target = new Set(toDemote.map((d) => d.id));
  for (const id of target) {
    const row = byId.get(id);
    if (!row) continue;
    edits.set(id, {
      Automation_Status: DEMOTION_TARGET,
      References: stampDemotion(row.References ?? "", label, date),
    });
  }

  const result = applyCellEdits(text, edits);
  if (result.errors.length) {
    console.error(`\n✗ Refusing to write — ${result.errors.length} verification error(s):`);
    for (const e of result.errors.slice(0, 10)) console.error(`   ${e}`);
    process.exit(1);
  }
  writeFileSync(file, result.text, "utf-8");
  // Human prose goes to stderr under --json so the document stays parseable.
  const say = asJson ? console.error : console.log;
  say(`\n✓ Demoted ${result.applied.length} case(s) in ${file.split(sep).pop()}.`);
  say(`  Reversible: set Automation_Status back, or \`git checkout -- ${suite}\`.`);
  say(`  Next: run \`npm run suites:sync\` then \`npm run suites:lint\`.`);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
