/**
 * Scaffold enriched-CSV suite rows from a machine-readable authoring plan —
 * the deterministic half of `/qa-test` Step 3 case authoring.
 *
 * WHY THIS EXISTS (two problems, one tool):
 *
 * 1. VOLUME. `/qa-test-cases-generator` §3 step 6d culls a candidate list that
 *    has ALREADY been written, so the cull saves nothing but review time. Its
 *    three KEEP questions ("name the observable it reads, the customer-visible
 *    defect it would catch, and why that defect is plausible HERE") are asked
 *    of prose no script can read. Measured cost of gating that late: Loyalty
 *    Missions authored 127 cases, of which the 71-case storefront suite placed
 *    zero orders and 54 cases never left one page. This tool makes the three
 *    questions a REQUIRED, machine-checked field of every planned row — a row
 *    that cannot answer them never becomes a CSV row, so it is never written,
 *    never reviewed, never executed and never maintained.
 *
 * 2. BOILERPLATE. Of the 15 columns, ten are mechanically derivable from
 *    (layer, priority, archetype, technique, ticket): ID, Section, Priority,
 *    Business_Rule, Edge_Case_Refs, Test_Data, Cross_Layer_Checks,
 *    Failure_Signals, Cleanup, References, Automation_Status. Only
 *    Preconditions / Steps / Assertions are genuinely authored. Deriving the
 *    rest removes the whole class of appender rejections (missing
 *    `Archetype:`/`Technique:` stamps, <2 failure signals, empty References on
 *    a Critical/High row).
 *
 * SWEEPS. Four closed vocabularies expand mechanically into rows whose defect
 * hypothesis is ALREADY WRITTEN by the document that owns them, so they satisfy
 * the gate by construction and cost no judgment:
 *   `state-stress`  qa-design SKILL.md §State-Stress Pass          (7 states)
 *   `uip`           qa-sbtm modern-web-attack-surface.md §UIP-*    (10 probes)
 *   `toggle`        qa-test-cases-generator SKILL.md §3.5 flags
 *   `date-range`    qa-test-cases-generator SKILL.md §3.5 dates
 * Every one is READ AT RUN TIME from the markdown that owns it, never
 * transcribed here (`.claude/rules/test-data.md` §GOLDEN RULE): a hardcoded
 * copy is correct exactly once and then fails silently. An unreadable or
 * unparsable source is a non-zero exit, never a silent pass.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never writes into `regression/suites/`.
 * It emits a STAGED rows CSV (canonical header, so `npm run suites:review --
 * <staged.csv>` lints it in place) plus a design sidecar. The append stays with
 * `append-test-cases-to-suite.ts`, run serially by the orchestrator — which is
 * what keeps the one-author-per-CSV rule (`.claude/rules/regression.md`) true
 * when several layer batches author concurrently.
 *
 * Usage:
 *   npx tsx scripts/test-cases/scaffold-rows.ts --plan <plan.json> --out <staged.csv>
 *     [--sidecar <design.md>] [--id-block PREFIX-NNN..PREFIX-NNN] [--check] [--json]
 *
 * Exit code: 0 on a clean plan; 1 on any gate error; 2 on an unreadable source.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  COLUMNS,
  loadDesignVocabulary,
  serialiseRows,
  type DesignVocabulary,
  type Row,
} from "./append-test-cases-to-suite.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");

/* ------------------------------------------------------------------ *
 * Plan shape — the machine-readable form of the Step 1e scenario matrix
 * ------------------------------------------------------------------ */

/** The five surfaces that decide the lane, the agent and the browser. */
export const LAYERS = ["api", "graphql", "admin", "storefront", "e2e"] as const;
export type Layer = (typeof LAYERS)[number];

export const SWEEP_KINDS = ["state-stress", "uip", "toggle", "date-range"] as const;
export type SweepKind = (typeof SWEEP_KINDS)[number];

export interface PlanCase {
  title: string;
  /** Which link of the value chain this row crosses or guards (sidecar only). */
  link?: string;
  layer?: Layer;
  priority?: string;
  section?: string;
  archetype: string;
  technique: string;
  /** `VC-*` catalog entry this row came from, when it came from a Detection probe. */
  probe?: string;
  bl?: string[];
  ecl?: string[];
  /** `key={{VAR}}` / `key=@td(ALIAS.field)` bindings. Never a literal. */
  data?: string[];
  preconditions?: string;
  cleanup?: string;
  /** KEEP question 1 — the observable this case reads. */
  observable: string;
  /** KEEP question 2 — the customer-visible failure it would catch. */
  defect: string;
  /** KEEP question 3 — why that defect is plausible HERE. See PLAUSIBLE_FORMS. */
  plausible: string;
}

export interface PlanSweep {
  kind: SweepKind;
  /** The surface being swept — becomes the title prefix. */
  surface: string;
  layer?: Layer;
  archetype?: string;
  technique?: string;
  /** Only expand these keys (state name / `UIP-*` token / row number). */
  only?: string[];
  /** Waive a key WITH A REASON. A silent omission is not available. */
  waive?: Record<string, string>;
}

export interface Plan {
  /** Target suite CSV the staged rows are destined for (recorded, not written). */
  suite?: string;
  /** Tracker key — lands in References, which Critical/High rows require. */
  ticket: string;
  idPrefix: string;
  idStart?: number;
  defaults?: {
    layer?: Layer;
    priority?: string;
    section?: string;
    cleanup?: string;
  };
  cases?: PlanCase[];
  sweeps?: PlanSweep[];
}

/* ------------------------------------------------------------------ *
 * Derived columns — layer-shaped, and true for every case on that layer
 * ------------------------------------------------------------------ */

/**
 * Cross-layer checks that hold for EVERY case on a layer. Deliberately generic:
 * a derived line naming a specific operation would be an invented literal
 * (`GRD-002`), and the author fills the specific ones alongside the Steps.
 */
export function crossLayerFor(layer: Layer): string {
  switch (layer) {
    case "api":
      return "[NETWORK] no unexpected 4xx/5xx on the endpoint under test";
    case "graphql":
      return ["[API] errors[] is empty in the GraphQL response", "[NETWORK] no 4xx/5xx on /graphql"].join("\n");
    case "admin":
      return [
        "[CONSOLE] no TypeError or JS error during the blade interaction",
        "[NETWORK] no 4xx/5xx on the Admin API calls this blade issues",
      ].join("\n");
    case "storefront":
      return [
        "[CONSOLE] no TypeError or JS error on the page under test",
        "[NETWORK] no 4xx/5xx on /graphql",
      ].join("\n");
    case "e2e":
      return [
        "[API] errors[] is empty in every GraphQL mutation this flow issues",
        "[CONSOLE] no TypeError or JS error on any page in the flow",
        "[NETWORK] no 4xx/5xx on /graphql",
      ].join("\n");
  }
}

/** At least two signals per case (template §Failure_Signals): one timeout-shaped, one API/console. */
export function failureSignalsFor(layer: Layer): string {
  const common = "Spinner visible >5s";
  switch (layer) {
    case "api":
      return [common, "4xx/5xx on the endpoint under test", "empty or malformed response body"].join(", ");
    case "graphql":
      return [common, "errors[] non-empty in GraphQL response", "4xx/5xx on /graphql"].join(", ");
    case "admin":
      return [common, "Blade does not open within 10s", "console.error with TypeError"].join(", ");
    case "storefront":
      return [common, "console.error with TypeError", "4xx/5xx on /graphql"].join(", ");
    case "e2e":
      return [common, "errors[] non-empty in GraphQL response", "console.error with TypeError"].join(", ");
  }
}

const PRIORITY_ALIASES: Record<string, string> = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low" };
const PRIORITIES = new Set(["Critical", "High", "Medium", "Low"]);

export function normalisePriority(p: string): string | null {
  const t = p.trim();
  const mapped = PRIORITY_ALIASES[t.toUpperCase()] ?? t;
  return PRIORITIES.has(mapped) ? mapped : null;
}

/* ------------------------------------------------------------------ *
 * The KEEP gate — the three questions, machine-checked
 * ------------------------------------------------------------------ */

/**
 * §6d names exactly three admissible grounds for "why is this defect plausible
 * HERE": a mechanism in this code, a bug in `reports/bugs/**`, or a
 * `vc-bug-catalog` entry. Encoding exactly those three is what stops the field
 * degrading into "because software has bugs" — the null hypothesis, which
 * justifies infinite cases and therefore justifies none.
 */
export const PLAUSIBLE_FORMS = [
  { name: "a vc-bug-catalog entry (VC-*-NNN)", re: /\bVC-[A-Z0-9]+-\d+\b/ },
  { name: "a filed bug (VCST-NNNN or reports/bugs/...)", re: /\bVCST-\d+\b|reports\/bugs\// },
  { name: "`mechanism: <what in this code makes it likely>`", re: /^mechanism:\s*\S[\s\S]{19,}/i },
] as const;

/**
 * Phrasings that ARE the null hypothesis. Narrow on purpose: a broad denylist
 * would reject real findings, and this gate has to be one the author trusts.
 */
const NULL_HYPOTHESIS = [
  "could fail to render",
  "might not work",
  "may not work",
  "does not work as expected",
  "is broken",
  "any element could",
];

const MIN_OBSERVABLE = 15;
const MIN_DEFECT = 25;

export function checkKeep(c: PlanCase, where: string): string[] {
  const errors: string[] = [];
  const obs = (c.observable ?? "").trim();
  const def = (c.defect ?? "").trim();
  const why = (c.plausible ?? "").trim();

  if (obs.length < MIN_OBSERVABLE)
    errors.push(
      `${where}: \`observable\` is missing or too thin (<${MIN_OBSERVABLE} chars). Name the value this case READS.`,
    );
  if (def.length < MIN_DEFECT)
    errors.push(
      `${where}: \`defect\` is missing or too thin (<${MIN_DEFECT} chars). State the failure as something a CUSTOMER would see.`,
    );
  for (const phrase of NULL_HYPOTHESIS) {
    if (def.toLowerCase().includes(phrase)) {
      errors.push(
        `${where}: \`defect\` is the null hypothesis ("${phrase}") — it justifies infinite cases and ` +
          `therefore justifies none (qa-test-cases-generator §3 step 6d).`,
      );
      break;
    }
  }
  if (!PLAUSIBLE_FORMS.some((f) => f.re.test(why)))
    errors.push(
      `${where}: \`plausible\` must cite one of ${PLAUSIBLE_FORMS.map((f) => f.name).join(" / ")} — got "${
        why || "<empty>"
      }".`,
    );
  return errors;
}

/* ------------------------------------------------------------------ *
 * Sweep sources — read at run time from the markdown that owns them
 * ------------------------------------------------------------------ */

export interface SweepRow {
  /** Stable key for `only` / `waive` — the state name or `UIP-*` token. */
  key: string;
  /** What the sweep does to the surface — becomes the title + observable. */
  scenario: string;
  /** The pre-written failure hypothesis from the owning document. */
  defect: string;
  /** `P0`/`P1` where the source declares one. */
  priority?: string;
}

interface SweepSource {
  file: string;
  heading: string;
  parse: (section: string) => SweepRow[];
  /** Default shape when the plan does not override. */
  archetype: string;
  technique: string;
  /** Per-key archetype override (UIP probes are not one shape). */
  archetypeByKey?: Record<string, string>;
}

class SourceError extends Error {
  exitCode = 2;
}

function readSource(relPath: string): string {
  for (const base of [REPO_ROOT, process.cwd()]) {
    const full = join(base, relPath);
    if (existsSync(full)) return readFileSync(full, "utf-8");
  }
  throw new SourceError(
    `Cannot read the sweep source ${relPath} (looked in ${REPO_ROOT} and ${process.cwd()}). ` +
      `Refusing to scaffold: a sweep expanded from a missing source is a silently empty sweep.`,
  );
}

/** Slice from a heading to the next heading of the same or a higher level. */
export function sliceSection(md: string, heading: string): string {
  const start = md.indexOf(heading);
  if (start < 0) return "";
  const level = (/^#+/.exec(heading.trim()) ?? ["#"])[0].length;
  const rest = md.slice(start + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} [^#]`));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Cells of every markdown table row in `section`, header + separator dropped. */
export function tableRows(section: string): string[][] {
  const out: string[][] = [];
  for (const line of section.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|") || !t.endsWith("|")) continue;
    const cells = t.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
    out.push(cells);
  }
  return out.slice(1); // drop the header row
}

const stripMd = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

/** `| **State** | Trigger | Audits to re-run |` */
export function parseStateStress(section: string): SweepRow[] {
  return tableRows(section)
    .filter((c) => c.length >= 3 && stripMd(c[0]))
    .map((c) => ({
      key: stripMd(c[0]),
      scenario: `${stripMd(c[0])} state (${stripMd(c[1])})`,
      defect:
        `${stripMd(c[2])} holds in the default render but is violated in the "${stripMd(c[0])}" state, ` +
        `so a default-state-only audit reports the surface as clean`,
    }));
}

/** `| \`UIP-X\` | trigger | ECL refs | typical defect |` */
export function parseUip(section: string): SweepRow[] {
  return tableRows(section)
    .filter((c) => c.length >= 4 && /^UIP-[A-Z]+$/.test(stripMd(c[0])))
    .map((c) => ({ key: stripMd(c[0]), scenario: stripMd(c[1]), defect: stripMd(c[3]) }));
}

/** `| State Scenario | Bug Hypothesis | Priority |` (the §3.5 tables) */
export function parseHypothesisTable(section: string): SweepRow[] {
  return tableRows(section)
    .filter((c) => c.length >= 3 && stripMd(c[0]) && stripMd(c[1]))
    .map((c, i) => ({
      key: String(i + 1),
      scenario: stripMd(c[0]),
      defect: stripMd(c[1]),
      priority: stripMd(c[2]),
    }));
}

/**
 * `UIP-*` is not one failure shape, so one default archetype would be a lie for
 * nine of the ten probes. This map is a judgment call, validated against the
 * live archetype vocabulary at run time — and a probe with NO mapping is a hard
 * error, so adding a probe to the sweep table demands a shape rather than
 * silently inheriting a wrong one.
 */
const UIP_ARCHETYPES: Record<string, string> = {
  "UIP-BACK": "REPLAY",
  "UIP-DEEP": "SCOPE",
  "UIP-REFRESH": "REPLAY",
  "UIP-TABS": "RACE",
  "UIP-EXPIRE": "FALLBACK",
  "UIP-STORAGE": "STALE",
  "UIP-NET": "FALLBACK",
  "UIP-INPUT": "SILENT",
  "UIP-VIEW": "RENDER",
  "UIP-DATA": "BOUNDARY",
};

export const SWEEP_SOURCES: Record<SweepKind, SweepSource> = {
  "state-stress": {
    file: "/.claude/skills/qa-design/SKILL.md",
    heading: "### State-Stress Pass",
    parse: parseStateStress,
    archetype: "RENDER",
    technique: "EP",
  },
  uip: {
    file: "/.claude/skills/qa-sbtm/modern-web-attack-surface.md",
    heading: "## The `UIP-*` sweep",
    parse: parseUip,
    archetype: "FALLBACK",
    technique: "EG",
    archetypeByKey: UIP_ARCHETYPES,
  },
  toggle: {
    file: "/.claude/skills/qa-test-cases-generator/SKILL.md",
    heading: "#### On/Off Feature Flags & Active/Inactive Toggles",
    parse: parseHypothesisTable,
    archetype: "CONFIG",
    technique: "DT",
  },
  "date-range": {
    file: "/.claude/skills/qa-test-cases-generator/SKILL.md",
    heading: "#### Start Date / End Date Fields",
    parse: parseHypothesisTable,
    archetype: "BOUNDARY",
    technique: "BVA",
  },
};

export function loadSweep(kind: SweepKind, read: (p: string) => string = readSource): SweepRow[] {
  const src = SWEEP_SOURCES[kind];
  const section = sliceSection(read(src.file), src.heading);
  if (!section)
    throw new SourceError(
      `${src.file} has no "${src.heading}" section — the ${kind} sweep cannot be expanded. ` +
        `Fix the parser rather than letting the sweep silently yield nothing.`,
    );
  const rows = src.parse(section);
  if (rows.length === 0)
    throw new SourceError(
      `Parsed 0 rows from ${src.file} "${src.heading}" — the table shape changed; fix the parser.`,
    );
  return rows;
}

/* ------------------------------------------------------------------ *
 * Expansion + build
 * ------------------------------------------------------------------ */

const TITLE_CAP = 110;
function truncate(s: string, n = TITLE_CAP): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function expandSweep(
  sweep: PlanSweep,
  rows: SweepRow[],
  fallbackLayer: Layer,
): { cases: PlanCase[]; errors: string[]; waived: string[] } {
  const errors: string[] = [];
  const waived: string[] = [];
  const src = SWEEP_SOURCES[sweep.kind];
  const keys = new Set(rows.map((r) => r.key));

  for (const k of sweep.only ?? [])
    if (!keys.has(k))
      errors.push(
        `sweep ${sweep.kind}: \`only\` names "${k}", which the source does not define (have: ${[...keys].join(", ")})`,
      );
  for (const k of Object.keys(sweep.waive ?? {}))
    if (!keys.has(k)) errors.push(`sweep ${sweep.kind}: \`waive\` names "${k}", which the source does not define`);

  const cases: PlanCase[] = [];
  for (const r of rows) {
    if (sweep.only && !sweep.only.includes(r.key)) continue;
    const reason = sweep.waive?.[r.key];
    if (reason !== undefined) {
      if (!reason.trim())
        errors.push(`sweep ${sweep.kind}: waiving "${r.key}" needs a reason — a silent omission is not available`);
      else waived.push(`${r.key} — ${reason.trim()}`);
      continue;
    }
    if (src.archetypeByKey && !sweep.archetype && !src.archetypeByKey[r.key]) {
      errors.push(
        `sweep ${sweep.kind}: probe "${r.key}" has no archetype mapping in UIP_ARCHETYPES — give it one ` +
          `(or set \`archetype\` on the sweep) rather than inheriting a wrong shape`,
      );
      continue;
    }
    cases.push({
      title: truncate(`${sweep.surface} — ${r.scenario}`),
      link: `${sweep.kind}:${r.key}`,
      layer: sweep.layer ?? fallbackLayer,
      priority: r.priority,
      archetype: sweep.archetype ?? src.archetypeByKey?.[r.key] ?? src.archetype,
      technique: sweep.technique ?? src.technique,
      observable: r.scenario,
      defect: r.defect,
      plausible: `mechanism: ${src.file} "${src.heading}" documents this failure mode for this surface class (${r.key})`,
    });
  }
  return { cases, errors, waived };
}

export interface BuildResult {
  rows: Row[];
  sidecar: string;
  errors: string[];
  waived: string[];
}

function padId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

export function buildRows(
  plan: Plan,
  vocab: DesignVocabulary,
  sweepLoader: (k: SweepKind) => SweepRow[] = (k) => loadSweep(k),
): BuildResult {
  const errors: string[] = [];
  const waived: string[] = [];

  if (!plan.ticket?.trim())
    errors.push("plan: `ticket` is required — Critical/High rows must cite a source of demand");
  if (!/^[A-Z][A-Z0-9]*$/.test(plan.idPrefix ?? ""))
    errors.push(`plan: \`idPrefix\` "${plan.idPrefix}" must be an uppercase suite prefix (e.g. MISA)`);

  const fallbackLayer = (plan.defaults?.layer ?? "storefront") as Layer;
  if (!LAYERS.includes(fallbackLayer))
    errors.push(`plan: defaults.layer "${fallbackLayer}" is not one of ${LAYERS.join("|")}`);

  const all: PlanCase[] = [...(plan.cases ?? [])];
  for (const sweep of plan.sweeps ?? []) {
    if (!SWEEP_KINDS.includes(sweep.kind)) {
      errors.push(`plan: sweep kind "${sweep.kind}" is not one of ${SWEEP_KINDS.join("|")}`);
      continue;
    }
    if (!sweep.surface?.trim()) {
      errors.push(`plan: sweep ${sweep.kind} needs a \`surface\` — it names what is being swept`);
      continue;
    }
    const r = expandSweep(sweep, sweepLoader(sweep.kind), fallbackLayer);
    errors.push(...r.errors);
    waived.push(...r.waived);
    all.push(...r.cases);
  }

  if (all.length === 0) errors.push("plan: no cases and no sweep expansion — nothing to scaffold");

  let n = plan.idStart ?? 1;
  const rows: Row[] = [];
  const sidecarRows: string[] = [];
  const seenTitles = new Set<string>();

  all.forEach((c, i) => {
    const id = padId(plan.idPrefix || "X", n);
    const where = `case ${i + 1} (${id}: ${c.title || "<no title>"})`;

    if (!c.title?.trim()) errors.push(`${where}: missing \`title\``);
    const layer = (c.layer ?? fallbackLayer) as Layer;
    if (!LAYERS.includes(layer)) errors.push(`${where}: layer "${layer}" is not one of ${LAYERS.join("|")}`);
    const priority = normalisePriority(c.priority ?? plan.defaults?.priority ?? "High");
    if (!priority) errors.push(`${where}: priority "${c.priority}" is not Critical|High|Medium|Low (or P0-P3)`);
    const section = c.section ?? plan.defaults?.section ?? "";
    if (!section.trim()) errors.push(`${where}: no \`section\` and no \`defaults.section\``);

    if (!vocab.archetypes.has(c.archetype))
      errors.push(
        vocab.nonDefectArchetypes.has(c.archetype)
          ? `${where}: archetype "${c.archetype}" is a non-defect guard, never a scenario candidate`
          : `${where}: archetype "${c.archetype}" is not in the vc-bug-catalog vocabulary (${[...vocab.archetypes].join(
              ", ",
            )})`,
      );
    if (!vocab.techniques.has(c.technique))
      errors.push(
        `${where}: technique "${c.technique}" is not in the §0 vocabulary (${[...vocab.techniques].join(", ")})`,
      );
    if (c.probe && !/^VC-[A-Z0-9]+-\d+$/.test(c.probe)) errors.push(`${where}: probe "${c.probe}" is not a VC-*-NNN id`);

    errors.push(...checkKeep(c, where));

    const titleKey = `${c.title} ${section}`;
    if (seenTitles.has(titleKey)) errors.push(`${where}: Title+Section duplicates an earlier row in this batch`);
    seenTitles.add(titleKey);

    for (const d of c.data ?? [])
      if (!/\{\{[A-Z0-9_]+\}\}|@td\(/.test(d))
        errors.push(`${where}: Test_Data binding "${d}" has no {{VAR}} or @td() — literals are rejected by DV-013`);

    const row = {} as Row;
    for (const col of COLUMNS) row[col] = "";
    row.ID = id;
    row.Title = c.title ?? "";
    row.Section = section;
    row.Priority = priority ?? "";
    row.Business_Rule = (c.bl ?? []).join(", ");
    row.Edge_Case_Refs = (c.ecl ?? []).join(", ");
    row.Preconditions = c.preconditions ?? "";
    row.Test_Data = (c.data ?? []).join(", ");
    row.Steps = ""; // authored
    row.Assertions = ""; // authored
    row.Cross_Layer_Checks = LAYERS.includes(layer) ? crossLayerFor(layer) : "";
    row.Failure_Signals = LAYERS.includes(layer) ? failureSignalsFor(layer) : "";
    row.Cleanup = c.cleanup ?? plan.defaults?.cleanup ?? "none";
    row.References = [
      plan.ticket,
      `Archetype:${c.archetype}`,
      `Technique:${c.technique}`,
      ...(c.probe ? [`Probe:${c.probe}`] : []),
    ].join(" · ");
    row.Automation_Status = "Draft";
    rows.push(row);

    sidecarRows.push(
      `| ${id} | ${c.link ?? "—"} | ${layer} | ${c.archetype} · ${c.technique} | ${c.observable} | ${c.defect} | ${c.plausible} |`,
    );
    n += 1;
  });

  const sidecar = [
    `# Design rationale — ${plan.ticket}${plan.suite ? ` → \`${plan.suite}\`` : ""}`,
    "",
    "Emitted by `npm run tc:scaffold`. Every row answered the three KEEP questions",
    "(`qa-test-cases-generator` §3 step 6d) before it became a CSV row.",
    "",
    "| ID | Chain link | Layer | Shape | Observable it reads | Customer-visible defect it catches | Why plausible here |",
    "|---|---|---|---|---|---|---|",
    ...sidecarRows,
    "",
    ...(waived.length ? ["## Waived sweep items", "", ...waived.map((w) => `- ${w}`), ""] : []),
    "Steps / Assertions / Preconditions are intentionally EMPTY — they are the authored half.",
    "Lint before appending: `npm run suites:review -- <staged.csv>`.",
  ].join("\n");

  return { rows, sidecar, errors, waived };
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

interface CliArgs {
  plan: string;
  out?: string;
  sidecar?: string;
  idBlock?: string;
  check: boolean;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const plan = get("--plan");
  if (!plan) {
    process.stderr.write(
      "Usage: scaffold-rows.ts --plan <plan.json> --out <staged.csv> [--sidecar <design.md>] " +
        "[--id-block PREFIX-NNN..PREFIX-NNN] [--check] [--json]\n",
    );
    process.exit(2);
  }
  return {
    plan,
    out: get("--out"),
    sidecar: get("--sidecar"),
    idBlock: get("--id-block"),
    check: argv.includes("--check"),
    json: argv.includes("--json"),
  };
}

/** `MISA-041..MISA-052` (or `MISA-041..052`) -> the start number and the count it permits. */
export function parseIdBlock(block: string): { prefix: string; start: number; count: number } {
  const m = /^([A-Z][A-Z0-9]*)-(\d+)\.\.(?:\1-)?(\d+)$/.exec(block.trim());
  if (!m) throw new Error(`--id-block "${block}" is not PREFIX-NNN..PREFIX-NNN`);
  const start = Number(m[2]);
  const end = Number(m[3]);
  if (end < start) throw new Error(`--id-block "${block}" ends before it starts`);
  return { prefix: m[1], start, count: end - start + 1 };
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(readFileSync(args.plan, "utf-8")) as Plan;

  let cap: number | null = null;
  if (args.idBlock) {
    const b = parseIdBlock(args.idBlock);
    if (plan.idPrefix && plan.idPrefix !== b.prefix)
      fail(`--id-block prefix "${b.prefix}" disagrees with the plan's idPrefix "${plan.idPrefix}"`);
    plan.idPrefix = b.prefix;
    plan.idStart = b.start;
    cap = b.count;
  }

  const { rows, sidecar, errors, waived } = buildRows(plan, loadDesignVocabulary());

  if (cap !== null && rows.length > cap)
    errors.push(
      `--id-block allows ${cap} id(s) but the plan produces ${rows.length} rows. Re-run \`npm run tc:alloc\` ` +
        `for a bigger block — never spill past it: a neighbouring batch owns the next ids.`,
    );

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ ok: errors.length === 0, rowCount: rows.length, waived, errors }, null, 2) + "\n",
    );
  } else {
    for (const e of errors) process.stderr.write(`  [gate] ${e}\n`);
    for (const w of waived) process.stdout.write(`  [waived] ${w}\n`);
  }
  if (errors.length) {
    if (!args.json) process.stderr.write(`\n${errors.length} gate error(s) — nothing written.\n`);
    process.exit(1);
  }

  if (args.check) {
    if (!args.json) process.stdout.write(`OK — ${rows.length} row(s) would be scaffolded.\n`);
    return;
  }
  if (!args.out) fail("--out <staged.csv> is required (or pass --check)");

  const body = `${COLUMNS.join(",")}\n${serialiseRows(rows)}`;
  writeFileSync(args.out, body, "utf-8");
  const sidecarPath = args.sidecar ?? `${args.out.replace(/\.csv$/i, "")}.design.md`;
  writeFileSync(sidecarPath, `${sidecar}\n`, "utf-8");
  if (!args.json)
    process.stdout.write(
      `Scaffolded ${rows.length} row(s) -> ${args.out}\nDesign rationale -> ${sidecarPath}\n` +
        `Next: author Steps/Assertions, then \`npm run suites:review -- ${args.out}\`.\n`,
    );
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  try {
    main();
  } catch (e) {
    const err = e as Error & { exitCode?: number };
    process.stderr.write(`${err.message}\n`);
    process.exit(err.exitCode ?? 1);
  }
}
