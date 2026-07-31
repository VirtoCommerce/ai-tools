/**
 * Triangulation audit rotation — which suite gets audited today.
 *
 * The deterministic half of the "one suite per day" schedule. It answers exactly
 * one question — "which suite is most overdue for a Dimension-11 behavioral
 * triangulation?" — and answers it from data already in the repo, so there is no
 * scheduler state to drift:
 *
 *   risk tier (P0 / revenue-critical first)
 *     → oldest `Audited:` stamp (never-audited first)
 *       → testCount desc
 *
 * WHY THE STAMP IS THE STATE. An obvious design would keep a ledger file of
 * "last audited" dates. That desyncs the moment someone edits a CSV, reverts a
 * PR, or cherry-picks — and a desynced ledger silently re-audits the wrong suite
 * forever. The `Audited:` stamp lives in the row it describes, so the queue is
 * always derived from the same commit as the cases themselves. Nothing to cache,
 * nothing to invalidate. (Same reasoning as `.claude/rules/test-data.md`'s
 * GOLDEN RULE: read from the source of truth, never transcribe it.)
 *
 * The stamp format and staleness window are single-sourced from
 * lint-test-cases.ts (`parseAuditStamp` / `auditStaleness` / DEFAULT_STALE_DAYS),
 * so the linter's TRI-000 finding and this rotation cannot disagree about what
 * "stale" means.
 *
 * Usage:
 *   npx tsx scripts/test-cases/audit-queue.ts [--json] [--pick[=N]] [--limit=N]
 *                                             [--stale-days=N]
 *
 *   npm run tc:audit:queue              # human table, whole queue
 *   npm run tc:audit:queue -- --pick    # just today's suite (what CI consumes)
 *   npm run tc:audit:queue -- --json    # machine-readable
 *
 * Exit code: 0 normally; 1 only when the manifest/suite files cannot be read
 * (never "no work to do" — an empty queue is a valid success).
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { parseSuite, type Row } from "./append-test-cases-to-suite.js";
import { auditStaleness, DEFAULT_STALE_DAYS, type AuditStaleness } from "./lint-test-cases.js";
import { resolveSuiteSource, type SuiteSource } from "./suite-source-map.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = join(REPO_ROOT, "config", "test-suites.json");

/** Only the manifest fields the rotation reads. */
interface ManifestSuite {
  id: string;
  name: string;
  file: string;
  domain?: string;
  layer?: string;
  priority?: string;
  testCount?: number;
  estimatedMinutes?: number;
  agent?: string;
  tags?: string[];
  requiresModules?: string[];
}

export interface QueueEntry {
  id: string;
  name: string;
  file: string;
  domain: string;
  priority: string;
  /** 0 = P0/revenue-critical, 1 = P1, 2 = P2/other. Primary sort key. */
  riskTier: number;
  testCount: number;
  estimatedMinutes: number;
  /** Oldest `Audited:` stamp across the suite's rows; null = never audited. */
  oldestStamp: string | null;
  /** Cases that need triangulation: never-audited + stamped beyond the window. */
  dueCases: number;
  parsedCases: number;
  staleness: AuditStaleness | null;
  /** Resolved source axis — module(s) + router-matched repo candidates. */
  source: SuiteSource;
  /**
   * Why this suite cannot be audited by the standard 3-axis run as-is. Non-empty
   * does NOT remove it from the queue — the auditor needs to see it and apply
   * the right waiver (triangulation-criteria.md §1b).
   */
  caveats: string[];
}

/**
 * A suite is risk-tier 0 if it is P0 **or** tagged revenue-critical. The two
 * overlap but neither contains the other: 011/028 are P1 yet revenue-critical,
 * while 042/078 are P0 smoke without the tag. Front-loading the union means the
 * ~14 suites whose failure costs money are audited in the first three weeks
 * instead of somewhere inside a 24-week round-robin.
 */
function riskTierOf(s: ManifestSuite): number {
  const tags = s.tags ?? [];
  if (s.priority === "P0" || tags.includes("revenue-critical")) return 0;
  if (s.priority === "P1") return 1;
  return 2;
}

/**
 * Structural reasons an axis may be unavailable, surfaced up-front so the run
 * applies a waiver instead of silently scoring UNGROUNDED.
 */
function caveatsFor(s: ManifestSuite, estMinutes: number, source: SuiteSource): string[] {
  const out: string[] = [];
  if (!s.agent || s.agent === "none")
    out.push("runner-native (agent: none) — no browser lane; LIVE axis structurally unavailable (§1b)");
  if (source.via === "unresolved")
    out.push("SOURCE axis unresolved (no Module Map row, no requiresModules) ⇒ UNGROUNDED — never guess a repo (§2)");
  else if (!source.repos.length)
    out.push(`SOURCE axis: module "${source.modules.join(", ")}" resolved, but no router repo match — search org:VirtoCommerce by module name`);
  if (estMinutes > 120)
    out.push(`estimatedMinutes=${estMinutes} — audit in section-scoped chunks across consecutive days`);
  return out;
}

function readSuiteRows(file: string): { rows: Row[]; error?: string } {
  const abs = resolve(REPO_ROOT, file);
  if (!existsSync(abs)) return { rows: [], error: "CSV not found" };
  try {
    // Strip a UTF-8 BOM — 12 suite CSVs carry one (same guard as the linter).
    const raw = readFileSync(abs, "utf-8").replace(/^﻿/, "");
    return { rows: parseSuite(raw).rows };
  } catch (e) {
    // A malformed CSV is lint-test-cases' finding (S-007), not ours. Keep the
    // suite in the queue — being unparseable is a strong reason to look at it —
    // but say so rather than reporting a misleading "0 cases due".
    return { rows: [], error: `CSV parse error: ${(e as Error).message}` };
  }
}

export function buildQueue(
  suites: ManifestSuite[],
  now = new Date(),
  staleDays = DEFAULT_STALE_DAYS,
): { queue: QueueEntry[]; duplicateIds: string[] } {
  // Key by FILE, not id. Manifest id `092` is carried by two different suites
  // (Backend/sales-rep/092-sales-rep-admin-embedded-app.csv and
  // 092-sales-rep-admin.csv); keying by id would silently collapse them and one
  // would never be audited. The collision is reported, not swallowed.
  const idCounts = new Map<string, number>();
  for (const s of suites) idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1);
  const duplicateIds = [...idCounts].filter(([, n]) => n > 1).map(([id]) => id).sort();

  const byFile = new Map<string, ManifestSuite>();
  for (const s of suites) if (!byFile.has(s.file)) byFile.set(s.file, s);

  const queue: QueueEntry[] = [];
  for (const s of byFile.values()) {
    const { rows, error } = readSuiteRows(s.file);
    const staleness = rows.length ? auditStaleness(rows, now, staleDays) : null;
    const estMinutes = s.estimatedMinutes ?? 0;
    const source = resolveSuiteSource(s.id, s.requiresModules ?? []);
    const caveats = caveatsFor(s, estMinutes, source);
    if (error) caveats.push(error);

    queue.push({
      id: s.id,
      name: s.name,
      file: s.file,
      domain: s.domain ?? "",
      priority: s.priority ?? "",
      riskTier: riskTierOf(s),
      testCount: s.testCount ?? rows.length,
      estimatedMinutes: estMinutes,
      oldestStamp: staleness?.oldestStamp ?? null,
      // An unparseable suite reports its manifest testCount as due — it has
      // certainly never been triangulated, and reporting 0 would bury it.
      dueCases: staleness ? staleness.unstamped + staleness.stale : (s.testCount ?? 0),
      parsedCases: rows.length,
      staleness,
      source,
      caveats,
    });
  }

  queue.sort((a, b) => {
    if (a.riskTier !== b.riskTier) return a.riskTier - b.riskTier;
    // Within a tier, a suite whose SOURCE axis cannot be resolved goes last.
    // Not an exclusion — it still gets audited, just not first. A suite with no
    // resolvable repo can only ever score UNGROUNDED at the suite level, so
    // leading the rotation with one (078 Backend Smoke was the natural head)
    // would spend the first scheduled run producing zero applied changes and
    // read as "the mechanism doesn't work".
    const ua = a.source.via === "unresolved" ? 1 : 0;
    const ub = b.source.via === "unresolved" ? 1 : 0;
    if (ua !== ub) return ua - ub;
    // Never-audited (null) sorts first: "" < any ISO date.
    const sa = a.oldestStamp ?? "";
    const sb = b.oldestStamp ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (a.testCount !== b.testCount) return b.testCount - a.testCount;
    return a.file < b.file ? -1 : 1; // stable, file-keyed tiebreak
  });

  return { queue, duplicateIds };
}

function main(): void {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const pickArg = argv.find((a) => a === "--pick" || a.startsWith("--pick="));
  const pickN = pickArg ? Math.max(1, Number(pickArg.split("=")[1]) || 1) : 0;
  const limitArg = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1]);
  const staleArg = Number(argv.find((a) => a.startsWith("--stale-days="))?.split("=")[1]);
  const staleDays = Number.isFinite(staleArg) && staleArg > 0 ? staleArg : DEFAULT_STALE_DAYS;

  if (!existsSync(MANIFEST)) {
    console.error(`Manifest not found: ${MANIFEST}`);
    process.exit(1);
  }

  let suites: ManifestSuite[];
  try {
    suites = JSON.parse(readFileSync(MANIFEST, "utf-8")).suites ?? [];
  } catch (e) {
    console.error(`Cannot parse ${MANIFEST}: ${(e as Error).message}`);
    process.exit(1);
  }

  const { queue, duplicateIds } = buildQueue(suites, new Date(), staleDays);
  const due = queue.filter((q) => q.dueCases > 0);
  const picked = pickN ? due.slice(0, pickN) : queue.slice(0, Number.isFinite(limitArg) ? limitArg : queue.length);

  if (json) {
    console.log(JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      staleDays,
      totalSuites: queue.length,
      suitesDue: due.length,
      duplicateIds,
      picked: pickN ? picked : undefined,
      queue: pickN ? undefined : picked,
    }, null, 2));
    process.exit(0);
  }

  if (pickN) {
    for (const q of picked)
      console.log(
        `${q.id}\t${q.file}\t${q.dueCases} due\t` +
          `source=${q.source.repos.join("|") || q.source.modules.join("|") || "UNRESOLVED"}\t` +
          `${q.caveats.length} caveat(s)`,
      );
    if (!picked.length) console.log("(nothing due — every suite is within the staleness window)");
    process.exit(0);
  }

  console.log(`\nTriangulation audit queue — ${queue.length} suite(s), ${due.length} due (window ${staleDays}d)\n`);
  console.log("  #  tier  id     due/cases  oldest      domain                suite");
  picked.forEach((q, i) => {
    const tier = q.riskTier === 0 ? "P0/rev" : q.riskTier === 1 ? "P1   " : "P2   ";
    console.log(
      `  ${String(i + 1).padStart(3)}  ${tier}  ${q.id.padEnd(6)} ` +
        `${String(q.dueCases).padStart(4)}/${String(q.testCount).padEnd(4)} ` +
        `${(q.oldestStamp ?? "never").padEnd(11)} ${q.domain.padEnd(20)} ${q.name}`,
    );
    for (const c of q.caveats) console.log(`         ⚠ ${c}`);
  });

  if (duplicateIds.length)
    console.log(
      `\n  NOTE: duplicate manifest id(s): ${duplicateIds.join(", ")} — the queue is keyed by FILE, ` +
        `so every suite is scheduled; fix the manifest to make \`suite <ID>\` unambiguous.`,
    );
  console.log(
    `\n  Rotation: risk tier → oldest \`Audited:\` stamp → testCount desc. The stamp IS the state ` +
      `(no ledger file). Audit one suite per weekday with:\n` +
      `    /qa-review-tests suite <ID> --triangulate --fix\n`,
  );
  process.exit(0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
