// The re-derivation half of `/qa-test`'s independent verifier, as one command.
//
// WHY. `qa-lead-orchestrator.md` §Verifier Mode dispatches a fresh, gate-scoped instance at four
// (up to eight) points in a FULL run. Each one is told to "never trust the doer's summary" and to
// re-derive the evidence — which in practice means issuing three or four sub-two-second
// deterministic scripts and then re-reading the source artifacts by hand. The 2026-09-07 audit
// costed that at ~124K tokens per dispatch (§5 item 5) and named the split it implies:
//
//   "The judgment half is real; the re-derivation half is the most expensive way in the pipeline to
//    recompute machine-checkable evidence."
//
// This script IS the re-derivation half. One invocation per gate, one compact fact sheet, and the
// verifier spends its context on the part a script cannot do.
//
// TWO RULES KEEP THIS FROM BEING A LOSS OF RIGOUR, and both are load-bearing:
//
//   1. **It never emits a verdict.** No APPROVE, no REJECT, no "looks fine". A gate sheet that
//      concluded would make the verifier a rubber stamp for a script that cannot read an acceptance
//      criterion — which is worse than the cost it saves.
//   2. **It enumerates what it did NOT check.** Every gate prints an `UNCHECKED` block naming the
//      claims that are still the verifier's to derive. An APPROVE resting on a silently partial
//      sheet is the exact failure the repo's own rule covers: silence is never an answer
//      (`.claude/skills/qa-test/SKILL.md` §1).
//
// Usage:
//   npx tsx scripts/regression/verify-gate.ts --gate 3-exec              # no --suite: nothing is authored yet
//   npx tsx scripts/regression/verify-gate.ts --gate 3   --suite <suite.csv>
//   npx tsx scripts/regression/verify-gate.ts --gate 5b  --run-id <RUN_ID>
//   npx tsx scripts/regression/verify-gate.ts --gate 5e  --run-id <C2_RUN_ID>
//   npx tsx scripts/regression/verify-gate.ts --gate 5g  --suite <suite.csv>
//
// Exit: 0 = the sheet was produced. NOT a verdict — a gate whose every fact is a mismatch still
// exits 0, because deciding is the verifier's job. Only a usage error or an unreadable input is
// non-zero, so a CI wrapper can never mistake this for a gate result.

import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { parse as parseCsv } from "csv-parse/sync";

export type GateId = "3-exec" | "3" | "5b" | "5e" | "5g";

export interface CommandFact {
  label: string;
  command: string;
  exitCode: number | null;
  /** The lines worth showing — the tail of stdout/stderr, trimmed. */
  digest: string;
  /** How to READ the exit code, because they are not uniform across these scripts. */
  reading: string;
}

// --- promotion diff -------------------------------------------------------------------------

export interface PromotionDiff {
  /** Rows whose Automation_Status changed, as `id: before -> after`. */
  statusChanges: Array<{ id: string; before: string; after: string }>;
  /** Rows where a column OTHER than Automation_Status changed. A promotion must not touch these. */
  otherColumnChanges: Array<{ id: string; column: string }>;
  addedIds: string[];
  removedIds: string[];
}

/**
 * What `tc:promote:apply` actually wrote, derived from the CSV rather than from the doer's report.
 *
 * The verifier is told, verbatim, that "`tc:promote` only ever writes `Automated`, and only onto a
 * row that is exactly `Draft` — a `Reviewed`/`Manual` row in the diff means someone hand-edited the
 * cell, which is itself a REJECT". That is a mechanical statement about two versions of a file, and
 * no existing command answers it, so the verifier was reading the diff by eye. This computes it.
 */
export function diffPromotion(beforeCsv: string, afterCsv: string): PromotionDiff {
  const opts = { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true } as const;
  // NORMALISE LINE ENDINGS FIRST. `.gitattributes` declares `regression/suites/**/*.csv text
  // eol=crlf`, so the blob `git show` hands back is LF and the working tree is CRLF. Multi-line
  // cells carry those endings INSIDE the field value, so an un-normalised comparison reports every
  // row with a multi-line Steps/Assertions cell as changed — which is 100% of them, and is exactly
  // the false "someone hand-edited the cell" a verifier would REJECT on.
  const lf = (t: string): string => t.replace(/\r\n/g, "\n");
  const before = parseCsv(lf(beforeCsv), opts) as Array<Record<string, string>>;
  const after = parseCsv(lf(afterCsv), opts) as Array<Record<string, string>>;
  const byId = (rows: Array<Record<string, string>>) =>
    new Map(rows.filter((r) => (r.ID ?? "").trim()).map((r) => [(r.ID ?? "").trim(), r]));
  const b = byId(before);
  const a = byId(after);

  const statusChanges: PromotionDiff["statusChanges"] = [];
  const otherColumnChanges: PromotionDiff["otherColumnChanges"] = [];
  for (const [id, afterRow] of a) {
    const beforeRow = b.get(id);
    if (!beforeRow) continue;
    for (const col of new Set([...Object.keys(beforeRow), ...Object.keys(afterRow)])) {
      const x = (beforeRow[col] ?? "").trim();
      const y = (afterRow[col] ?? "").trim();
      if (x === y) continue;
      if (col === "Automation_Status") statusChanges.push({ id, before: x, after: y });
      else otherColumnChanges.push({ id, column: col });
    }
  }
  return {
    statusChanges,
    otherColumnChanges,
    addedIds: [...a.keys()].filter((id) => !b.has(id)),
    removedIds: [...b.keys()].filter((id) => !a.has(id)),
  };
}

/** The promotion rule, as facts rather than a verdict: which status changes are NOT `Draft -> Automated`. */
export function illegalPromotions(diff: PromotionDiff): Array<{ id: string; before: string; after: string }> {
  return diff.statusChanges.filter((c) => !(c.before === "Draft" && c.after === "Automated"));
}

// --- gate definitions -----------------------------------------------------------------------

interface GateSpec {
  title: string;
  /** Claims this sheet CANNOT settle. Printed verbatim; the verifier owns every line. */
  unchecked: string[];
}

export const GATES: Record<GateId, GateSpec> = {
  "3-exec": {
    // Releases the EXECUTION agents, not the corpus write. It runs BEFORE Artifact A exists, which is
    // the whole point: the checklist and the seeded data are all an execution agent consumes, so
    // holding them behind case authoring put the run's longest browser job behind a dependency it
    // never reads. Deliberately INLINE (no fresh-verifier dispatch) and deliberately suite-less.
    title: "Step 3-exec — checklist + data ready, execution may dispatch (inline)",
    unchecked: [
      "every atomic condition in the ticket maps to a checklist item, an existing case, or an explicit PENDING-A (needs the AC list; there is no CSV yet)",
      "each checklist item actually exercises the condition its wording claims",
      "when data_surface was false, that the SKIP was right: no link under test needs a divergence the fixtures lack",
      "that every fixture the checklist names is seeded and resolvable RIGHT NOW, not merely declared",
    ],
  },
  "3": {
    // The corpus-write half: releases C1. Checklist coverage moved to 3-exec above; what stays here
    // is everything that needs the authored rows to exist.
    title: "Step 3 — authored cases reviewed, PENDING-A closed (hard STOP)",
    unchecked: [
      "every PENDING-A condition recorded at 3-exec now resolves to a real authored row",
      "each case's Steps actually exercise the condition its title claims",
      "when data_surface was false, that the SKIP was right: no link under test needs a divergence the fixtures lack",
      "whether tc:scope's scope and risk terms match the ones 1b item 2e derived",
    ],
  },
  "5b": {
    title: "Step 5b — triage + AC/DoD reconciled against the implementation (hard STOP)",
    unchecked: [
      "every PASS carries a re-openable artifact (open the screenshots/traces; a claimed PASS with no artifact is a REJECT)",
      "each finding's severity grade, and its PRE-EXISTING / IN-SCOPE / OUT-OF-SCOPE provenance",
      "whether a reconciled AC is genuinely met, as opposed to merely reported met",
    ],
  },
  "5e": {
    title: "Step 5e — Feature Release Gate ratified (non-blocking)",
    unchecked: [
      "re-evaluation from the RAW inputs per skills/qa-metrics/quality-gates.md §1a — this sheet reports the script's verdict inputs, not a second opinion on them",
      "whether a skipped C2 is recorded with its reason (an absent regression block reads as a clean sweep)",
      "whether the report's narrative matches the numbers below",
    ],
  },
  "5g": {
    title: "Promotion flip Draft -> Automated (hard STOP) — /qa-test-lifecycle 6P",
    unchecked: [
      "for a sample of upgraded assertions, that each {OBSERVED} traces to real Step-4 evidence",
      "that no {HYPOTHESIS} was cleared by an invented value",
      "that the doer ran tc:promote:apply (the write) and not bare tc:promote (the dry run)",
    ],
  },
};

// --- runner ---------------------------------------------------------------------------------

function run(label: string, command: string, args: string[], reading: string): CommandFact {
  const r = spawnSync(command, args, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  return {
    label,
    command: [command, ...args].join(" "),
    exitCode: r.status,
    digest: lines.slice(-12).join("\n"),
    reading,
  };
}

function factsFor(gate: GateId, opts: { suite?: string; runId?: string }): CommandFact[] {
  const facts: CommandFact[] = [];
  if (gate === "3-exec") {
    // No --suite by design: Artifact A is still being authored in the background when this runs.
    facts.push(
      run("td:validate (@td() / {{VAR}} drift)", "npx", ["tsx", "scripts/test-data/validate-td-refs.ts"],
        "non-zero = an unresolvable reference; the checklist cannot execute against data that does not resolve"),
      run("tc:scope (existing-coverage triage)", "npx", ["tsx", "scripts/test-cases/scope-existing-coverage.ts"],
        "non-zero = the scan itself failed; hits are DATA, not a failure"),
    );
  } else if (gate === "3") {
    if (!opts.suite) throw new Error("--gate 3 needs --suite <suite.csv>");
    facts.push(
      run("suites:review (11-dim static lint)", "npx", ["tsx", "scripts/test-cases/lint-test-cases.ts", opts.suite],
        "non-zero = findings at or above the --fail-on severity"),
      run("td:validate (@td() / {{VAR}} drift)", "npx", ["tsx", "scripts/test-data/validate-td-refs.ts"],
        "non-zero = an unresolvable reference"),
      run("tc:scope (existing-coverage triage)", "npx", ["tsx", "scripts/test-cases/scope-existing-coverage.ts"],
        "non-zero = the scan itself failed; hits are DATA, not a failure"),
    );
  } else if (gate === "5b" || gate === "5e") {
    if (!opts.runId) throw new Error(`--gate ${gate} needs --run-id <RUN_ID> (unscoped returns the whole-history rate)`);
    facts.push(
      run("compute-metrics --gate feature", "npx",
        ["tsx", "scripts/regression/compute-metrics.ts", "--gate", "feature", "--run-id", opts.runId],
        "0 = evaluated and not blocking · 1 = gate BLOCKED · 2 = CANNOT EVALUATE (no run in scope) — 2 is NOT a failing pass rate"),
    );
  } else {
    if (!opts.suite) throw new Error("--gate 5g needs --suite <suite.csv>");
    facts.push(
      run("suites:review on the promoted suite", "npx",
        ["tsx", "scripts/test-cases/lint-test-cases.ts", opts.suite],
        "non-zero = findings at or above the --fail-on severity"),
    );
  }
  return facts;
}

function printPromotionSection(suite: string): void {
  const head = spawnSync("git", ["show", `HEAD:${suite}`], { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
  if (head.status !== 0) {
    console.log(`  promotion diff: UNAVAILABLE — \`git show HEAD:${suite}\` failed. Derive it by hand.`);
    return;
  }
  const diff = diffPromotion(head.stdout, readFileSync(suite, "utf-8"));
  const illegal = illegalPromotions(diff);
  console.log(`  Automation_Status changes vs HEAD: ${diff.statusChanges.length}`);
  console.log(`    Draft -> Automated:              ${diff.statusChanges.length - illegal.length}`);
  console.log(`    NOT Draft -> Automated:          ${illegal.length}`);
  for (const c of illegal) console.log(`      ${c.id}: "${c.before}" -> "${c.after}"`);
  console.log(`  rows with a NON-status column changed: ${diff.otherColumnChanges.length}`);
  for (const c of diff.otherColumnChanges.slice(0, 20)) console.log(`      ${c.id}: ${c.column}`);
  console.log(`  rows added: ${diff.addedIds.length}   rows removed: ${diff.removedIds.length}`);
  if (diff.removedIds.length > 0) console.log(`      removed: ${diff.removedIds.slice(0, 20).join(", ")}`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const at = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const gate = at("--gate") as GateId | undefined;
  if (!gate || !(gate in GATES)) {
    console.error("usage: npx tsx scripts/regression/verify-gate.ts --gate <3-exec|3|5b|5e|5g> [--suite <csv>] [--run-id <ID>]");
    process.exit(1);
  }
  const suite = at("--suite");
  const runId = at("--run-id");
  if (suite && !existsSync(suite)) {
    console.error(`[verify-gate] no such suite CSV: ${suite}`);
    process.exit(1);
  }

  const spec = GATES[gate];
  console.log(`\n=== verify-gate ${gate} — ${spec.title} ===`);
  console.log(`This sheet is EVIDENCE, not a verdict. It contains no APPROVE and no REJECT.\n`);

  let facts: CommandFact[];
  try {
    facts = factsFor(gate, { suite, runId });
  } catch (e) {
    console.error(`[verify-gate] ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`--- deterministic core (re-run here so the verifier does not re-issue it) ---`);
  for (const f of facts) {
    console.log(`\n[${f.label}]  exit ${f.exitCode}`);
    console.log(`  $ ${f.command}`);
    console.log(`  reading: ${f.reading}`);
    for (const line of f.digest.split("\n")) console.log(`  | ${line}`);
  }

  if (gate === "5g" && suite) {
    console.log(`\n--- what tc:promote actually wrote (CSV vs HEAD) ---`);
    printPromotionSection(suite);
  }

  console.log(`\n--- UNCHECKED — still yours to derive, and an APPROVE must address each ---`);
  for (const u of spec.unchecked) console.log(`  - ${u}`);
  console.log(
    `\nThis sheet settles the machine-checkable half only. Re-read the source artifact for the lines\nabove, then rule. When in doubt, REJECT.\n`,
  );
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith("verify-gate.ts");
if (invokedDirectly) main();
