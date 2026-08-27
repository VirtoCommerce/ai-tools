/**
 * Significance scoring for the two shared oracles — the deterministic core that
 * decides PROMOTION ORDER (`/qa-review-oracles` Step 0) and the PROMOTION BAR
 * (Step 3), so a triangulated-and-confirmed entry is not automatically an entry
 * worth carrying.
 *
 * Why this exists. The evidence bar in `bl-audit-criteria.md` / `ecl-audit-criteria.md`
 * answers "is this TRUE?" — it never answers "is this WORTH HAVING?". Both oracles grew
 * against a truth gate alone (211 BL invariants, 54 ECL sections), and the value is not
 * evenly spread: 25 invariants are cited by no test case at all, while single dangling
 * clusters carried 51 and 92 citing cases waiting for an entry that did not exist. The
 * audit budget was being spent in file order rather than in value order, and every
 * confirmed candidate landed regardless of whether anything would ever read it.
 *
 * Value has TWO axes and an entry has to earn both — that is what "valuable" means here:
 *
 *   - **business value** — what a violation COSTS: revenue, a security boundary, data
 *     integrity, a legal/UX commitment. Read from the entry's own declared severity tag
 *     (BL) or from the BL invariants its rows map to (ECL).
 *   - **product value** — how much of the tested PRODUCT leans on it: how many test cases
 *     cite it, whether it reaches across domains, whether it is confirmed on this platform.
 *
 * They are scored separately and combined by CONJUNCTION, not by sum: high demand can no
 * longer buy a `P2-ux` display rule into the oracle, and an unclassified candidate cannot
 * be promoted at all — declaring the business value is the price of entry. The blended
 * score survives only as the ORDER within a tier.
 *
 * The model is deliberately small, integer, and fully attributable: every score carries
 * the contributions that produced it, so a promotion decision can be re-derived and
 * argued with rather than trusted. Three rules keep it honest:
 *
 *  1. **Never derive value from prose.** The ECL `Impact` column ("Double charge, order
 *     duplication") is free text; scoring it would mean a regex judging severity. Only
 *     closed vocabularies score: the BL severity tag, the ECL `Frequency` and `Status`
 *     columns. An unparseable cell becomes an `unresolved` note contributing ZERO — it
 *     never guesses a value, and it caps the tier (see rule 3).
 *  2. **Demand is bounded.** Citing-case count is the strongest signal — promoting one
 *     entry at a cited id retroactively makes N citations true — but it is laddered, not
 *     linear, so a 92-case cluster cannot outrank every P0 in the corpus by arithmetic.
 *  3. **Fail-closed upward.** Missing severity, no parseable rows, or a not-yet-classified
 *     candidate CAPS the tier at T2 (or T3) instead of inferring one. Unassessable is
 *     never "significant"; the fix is to classify it, not to promote it.
 *
 * Pure functions only — no file, network or CLI access. `rank-oracles.ts` wires it to the
 * lint parsers; `scripts/unit/oracle-significance.test.ts` pins the model.
 */

export type Tier = "T1" | "T2" | "T3" | "EXCLUDED";

/** Tiers in ascending significance, for comparisons. `EXCLUDED` sits outside the order. */
export const TIER_ORDER: Tier[] = ["T3", "T2", "T1"];

/** The bar `/qa-review-oracles` Step 3 promotes at: T2 and above. */
export const PROMOTION_BAR: Tier = "T2";

export interface Contribution {
  signal: string;
  points: number;
  note: string;
}

/** What a violation costs. Declared by the entry, never inferred from prose. */
export type BusinessValue = "high" | "medium" | "low" | "unknown";
/** How much of the tested product leans on the entry. Derived from citations + reach. */
export type ProductValue = "high" | "medium" | "low" | "none";

export const BUSINESS_ORDER: BusinessValue[] = ["unknown", "low", "medium", "high"];
export const PRODUCT_ORDER: ProductValue[] = ["none", "low", "medium", "high"];

export interface Score {
  score: number;
  tier: Tier;
  /** The promotion axes. `tier`/`score` order the queue; these two decide the gate. */
  business: BusinessValue;
  businessNote: string;
  product: ProductValue;
  productNote: string;
  contributions: Contribution[];
  /** Tier ceilings that fired, each with its reason. A cap is never silent. */
  caps: string[];
  /** Closed-vocabulary cells that could not be read. Each contributes 0 and is reported. */
  unresolved: string[];
  /** Set only for `EXCLUDED` — why this id may never enter the oracle, and where it belongs. */
  exclusion?: { reason: string; redirect: string };
}

// ---------------------------------------------------------------------------
// Shared signal: demand (how many test cases cite the id)
// ---------------------------------------------------------------------------

/** `[minimum citing cases, points]`, highest bracket first. */
export const DEMAND_LADDER: ReadonlyArray<readonly [number, number]> = [
  [30, 40],
  [10, 30],
  [3, 20],
  [1, 10],
  [0, 0],
];

export function demandPoints(citingCases: number): Contribution {
  const n = Math.max(0, Math.trunc(citingCases));
  const [min, points] = DEMAND_LADDER.find(([m]) => n >= m)!;
  return {
    signal: "demand",
    points,
    note: n === 0 ? "cited by no test case" : `cited by ${n} case(s) (${min}+ bracket)`,
  };
}

// ---------------------------------------------------------------------------
// BL axis
// ---------------------------------------------------------------------------

/** The oracle's own severity vocabulary (`business-logic.md` §Severity Tags). */
export const SEVERITY_POINTS: Readonly<Record<string, number>> = {
  "P0-security": 40,
  "P0-revenue": 35,
  "P1-data": 20,
  "P1-ux": 12,
  "P2-ux": 4,
};

/** A P0 is never "not worth having", however little cites it. */
const P0_FLOOR_TIER: Tier = "T2";

/**
 * Prefixes that are NOT invariants and may never be promoted, whatever their demand.
 * Each was declined on a real audit (BL-AUDIT-2026-08-24) after citing cases had already
 * accumulated against it — demand alone would have promoted all three, which is precisely
 * the failure this table prevents. Cite the redirect in the audit report so the traceability
 * moves rather than being destroyed.
 */
export const NON_INVARIANT_PREFIXES: Readonly<Record<string, { reason: string; redirect: string }>> = {
  "BL-PERF": {
    reason: "performance budgets are environment- and hardware-specific; an invariant here would violate the oracle's env-agnostic rule",
    redirect: ".claude/knowledge/execution/performance-thresholds.md",
  },
  "BL-COMPAT": {
    reason: "browser-engine quirks are tooling facts, not platform invariants",
    redirect: ".claude/knowledge/automation/browser-quirks.md",
  },
  "BL-API": {
    reason: "a coverage tag, not a normative rule — heterogeneous cases sharing one label",
    redirect: "the owning domain's own BL-* invariant",
  },
};

/** Severity tag → business value. The tag IS the business declaration; nothing else is. */
export const BUSINESS_OF_SEVERITY: Readonly<Record<string, BusinessValue>> = {
  "P0-security": "high",
  "P0-revenue": "high",
  "P1-data": "medium",
  "P1-ux": "medium",
  "P2-ux": "low",
};

/**
 * Citing-case demand → product value, with a one-level bump for a cross-domain entry
 * (`BL-CROSS` reaches the whole product by construction) and for an ECL section that is
 * predominantly `[OBSERVED]` here.
 */
export function productValueOf(citingCases: number, bump = 0): { value: ProductValue; note: string } {
  const base: ProductValue = citingCases >= 10 ? "high" : citingCases >= 3 ? "medium" : citingCases >= 1 ? "low" : "none";
  const idx = Math.max(0, Math.min(PRODUCT_ORDER.length - 1, PRODUCT_ORDER.indexOf(base) + bump));
  const value = PRODUCT_ORDER[idx];
  const moved = value !== base ? ` (${base} → ${value})` : "";
  return { value, note: `${citingCases} citing case(s)${moved}` };
}

export interface BlInput {
  id: string;
  /** Raw severity tag, `""` when absent/malformed (BLL-002). */
  severity: string;
  citingCases: number;
  /** false ⇒ a MISSING candidate (a dangling cited id), not yet an entry. */
  inOracle: boolean;
}

export function domainPrefixOf(id: string): string {
  return id.replace(/-\d+[A-Z]?$/, "");
}

export function scoreBl(input: BlInput): Score {
  const prefix = domainPrefixOf(input.id);
  const excluded = NON_INVARIANT_PREFIXES[prefix];
  if (excluded) {
    return {
      score: 0,
      tier: "EXCLUDED",
      business: "unknown",
      businessNote: `${prefix} is a non-invariant class — it has no business value AS AN INVARIANT`,
      product: productValueOf(input.citingCases).value,
      productNote: productValueOf(input.citingCases).note,
      contributions: [demandPoints(input.citingCases)],
      caps: [`${prefix} is a non-invariant class — ${excluded.reason}`],
      unresolved: [],
      exclusion: { reason: excluded.reason, redirect: excluded.redirect },
    };
  }

  const contributions: Contribution[] = [demandPoints(input.citingCases)];
  const caps: string[] = [];
  const unresolved: string[] = [];

  const sevPoints = SEVERITY_POINTS[input.severity];
  if (sevPoints === undefined) {
    unresolved.push(
      input.severity
        ? `severity tag "${input.severity}" is outside the oracle vocabulary`
        : "no severity tag (BLL-002)",
    );
    contributions.push({ signal: "severity", points: 0, note: "unclassified — contributes nothing" });
    caps.push("unclassified severity caps the tier at T3 — tag it before promoting, never infer the tag");
  } else {
    contributions.push({ signal: "severity", points: sevPoints, note: input.severity });
  }

  if (prefix === "BL-CROSS") {
    contributions.push({
      signal: "cross-domain",
      points: 10,
      note: "BL-CROSS — the oracle's own highest-value class (catches what single-domain testing misses)",
    });
  }

  if (!input.inOracle && sevPoints === undefined) {
    // A dangling cited id carries demand but no classification yet. Demand alone can reach
    // T2, never T1 — the severity that would justify T1 has not been assigned.
    caps.length = 0;
    caps.push("candidate not yet in the oracle and not yet classified — demand-only score, ceiling T2 until triangulation assigns a severity tag");
  }

  const score = contributions.reduce((n, c) => n + c.points, 0);
  const cap: Tier | undefined = caps.length
    ? (!input.inOracle && sevPoints === undefined ? "T2" : "T3")
    : undefined;
  const floor: Tier | undefined = input.severity.startsWith("P0-") ? P0_FLOOR_TIER : undefined;

  const business = BUSINESS_OF_SEVERITY[input.severity] ?? "unknown";
  const businessNote =
    business === "unknown"
      ? input.severity
        ? `severity tag "${input.severity}" is outside the oracle vocabulary — business value undeclared`
        : "no severity tag — business value undeclared"
      : `${input.severity}`;
  const { value: product, note: productNote } = productValueOf(input.citingCases, prefix === "BL-CROSS" ? 1 : 0);

  return {
    score,
    tier: tierFor(score, { cap, floor }),
    business,
    businessNote,
    product,
    productNote: prefix === "BL-CROSS" ? `${productNote}, cross-domain reach` : productNote,
    contributions,
    caps,
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// ECL axis
// ---------------------------------------------------------------------------

export type Frequency = "High" | "Low-High" | "Medium" | "Low-Medium" | "Low";

export const FREQUENCY_POINTS: Readonly<Record<Frequency, number>> = {
  High: 20,
  "Low-High": 14,
  Medium: 12,
  "Low-Medium": 7,
  Low: 4,
};

const FREQUENCY_LOOKUP = new Map<string, Frequency>(
  (Object.keys(FREQUENCY_POINTS) as Frequency[]).map((f) => [f.toLowerCase(), f]),
);

/**
 * Read a `Frequency` cell. Accepts the closed vocabulary, optionally followed by a
 * parenthetical qualifier (`High (false bug)`), and NOTHING else — a slash-range like
 * `Low/Medium/High` is genuinely ambiguous and returns `null` with a reason rather than
 * silently taking its first token.
 */
export function normalizeFrequency(raw: string): { value: Frequency | null; reason?: string } {
  const cell = raw.trim();
  if (!cell || cell === "—") return { value: null, reason: "empty Frequency cell" };
  const head = cell.split(/\s*\(/)[0].trim().toLowerCase();
  const hit = FREQUENCY_LOOKUP.get(head);
  if (hit) return { value: hit };
  return { value: null, reason: `Frequency "${cell}" is outside the closed vocabulary` };
}

export interface EclRow {
  frequency: string;
  /** `[OBSERVED]` / `[THEORETICAL]`, raw. */
  status: string;
  /** BL ids the row maps to (7-column chapter shape); empty for the 5-column shape. */
  blRefs: string[];
}

export interface EclInput {
  id: string;
  citingCases: number;
  rows: EclRow[];
  /**
   * Resolver for the severity tag of a BL invariant a row links to, so an ECL section's
   * BUSINESS value is read from the normative oracle rather than from its own prose.
   * Omitted ⇒ the frequency proxy below is used.
   */
  blSeverityOf?: (id: string) => string | undefined;
  /**
   * BL ids Appendix D declares for this section, used ONLY when the section's own rows
   * declare none. Only chapter 14 carries a `BL Invariant` column, so without this the
   * business axis is unreachable for the 5-column chapters — 45 of 54 sections scored
   * `unknown` (and so could never promote) while Appendix D already named a real
   * invariant for 34 of them. Measured 2026-08-27: correcting Appendix D's 15.1 row to
   * `BL-A11Y-001/002/004` did not move its label, which is what surfaced this.
   */
  appendixBlRefs?: string[];
}

/**
 * Business value of an ECL section — read from the `BL Invariant` column, falling back to
 * the section's Appendix D row.
 *
 * A pattern that maps to a `P0-revenue` invariant costs what that invariant costs: a real
 * cross-reference into the normative oracle, not a second opinion about the same behavior.
 * A section that links none stays `unknown`, and `unknown` never promotes — so adding a NEW
 * pattern means naming the invariant it endangers, which is the discipline the library
 * already practises in prose (several rows read `— (gap; see bl_proposals)`).
 *
 * **The Appendix D fallback is not a loosening of that rule; it is what makes the rule
 * reachable at all.** Only chapter 14's table carries a `BL Invariant` column, so reading
 * that column alone left the other 45 sections permanently `unknown` — ineligible for
 * growth by construction, not by any judgement about them — while Appendix D, whose entire
 * purpose is this cross-reference, already declared a real invariant for 34. A declaration
 * is a declaration wherever the library makes it; an Appendix D cell that opens with an em
 * dash still declares nothing (see `parseLibrary`).
 *
 * `Frequency` deliberately does NOT feed this axis. It answers "how often does this bite",
 * which is exposure, not cost — it belongs to the product axis, and treating a
 * frequent-but-cheap pattern as business-critical is exactly the inference this model
 * refuses everywhere else.
 */
export function eclBusinessValue(
  rows: EclRow[],
  blSeverityOf?: (id: string) => string | undefined,
  appendixBlRefs: string[] = [],
): { value: BusinessValue; note: string } {
  const own = rows.flatMap((r) => r.blRefs);
  const linked = own.length ? own : appendixBlRefs;
  // Where the declaration was found. Kept in the note so a derived link is never mistaken
  // for one the section's own table declares — the reader can tell which file to edit.
  const source = own.length ? "" : " (via Appendix D)";
  if (!linked.length) return { value: "unknown", note: "no BL invariant linked — business value undeclared (name the invariant this pattern endangers)" };
  if (!blSeverityOf) return { value: "unknown", note: `links ${linked.length} BL invariant(s)${source} but no severity resolver was supplied` };

  let best: BusinessValue = "unknown";
  let via = "";
  for (const ref of linked) {
    const mapped = BUSINESS_OF_SEVERITY[blSeverityOf(ref) ?? ""] ?? "unknown";
    if (BUSINESS_ORDER.indexOf(mapped) > BUSINESS_ORDER.indexOf(best)) {
      best = mapped;
      via = ref;
    }
  }
  return best === "unknown"
    ? { value: "unknown", note: `links ${linked.join(", ")}${source}, none of which carries a severity tag in the BL oracle` }
    : { value: best, note: `via ${via} (${blSeverityOf(via)})${source}` };
}

export function scoreEcl(input: EclInput): Score {
  const contributions: Contribution[] = [demandPoints(input.citingCases)];
  const caps: string[] = [];
  const unresolved: string[] = [];

  // Status scores by SHARE, not by presence. 175 of 213 rows in the library are
  // `[OBSERVED]`, so "has at least one observed row" is true of almost every section and
  // discriminates nothing. The share does: a section that is mostly confirmed-here is
  // release-walk material (`/qa-checklist`), one that is mostly `[THEORETICAL]` is charter
  // material (`/qa-exploratory`) — a real difference in what the entry buys.
  const observed = input.rows.filter((r) => /OBSERVED/i.test(r.status)).length;
  const classified = input.rows.filter((r) => /OBSERVED|THEORETICAL/i.test(r.status)).length;
  if (classified === 0) {
    contributions.push({ signal: "status", points: 0, note: "no [OBSERVED]/[THEORETICAL] row parsed" });
    if (input.rows.length > 0) unresolved.push("no row carries a [OBSERVED]/[THEORETICAL] status");
  } else {
    const share = observed / classified;
    const [points, band] =
      share >= 0.75 ? ([25, "≥75% confirmed on this platform"] as const)
      : share > 0 ? ([15, "partly confirmed on this platform"] as const)
      : ([5, "[THEORETICAL] only — charter material, not checklist material"] as const);
    contributions.push({
      signal: "status",
      points,
      note: `${observed}/${classified} [OBSERVED] — ${band}`,
    });
  }

  let best: Frequency | null = null;
  for (const row of input.rows) {
    const { value, reason } = normalizeFrequency(row.frequency);
    if (!value) {
      if (reason) unresolved.push(reason);
      continue;
    }
    if (best === null || FREQUENCY_POINTS[value] > FREQUENCY_POINTS[best]) best = value;
  }
  contributions.push(
    best
      ? { signal: "frequency", points: FREQUENCY_POINTS[best], note: `max row frequency ${best}` }
      : { signal: "frequency", points: 0, note: "no readable Frequency cell — contributes nothing" },
  );

  // Same fallback as the business axis, and for the same reason: the signal is "this
  // pattern is normatively testable", which is equally true of a link Appendix D declares.
  // Scoring it only for chapter 14 would have made this an artefact of table shape.
  const ownBlLink = input.rows.some((r) => r.blRefs.length > 0);
  const appendixBlLink = !ownBlLink && (input.appendixBlRefs?.length ?? 0) > 0;
  if (ownBlLink || appendixBlLink) {
    contributions.push({
      signal: "bl-linked",
      points: 8,
      note: `at least one row maps to a BL-* invariant — the pattern is normatively testable${appendixBlLink ? " (declared in Appendix D)" : ""}`,
    });
  }

  if (input.rows.length === 0) {
    caps.push("no pattern row parsed — capped at T3; a section whose table cannot be read is unassessable, not significant");
  }

  const score = contributions.reduce((n, c) => n + c.points, 0);
  const business = eclBusinessValue(input.rows, input.blSeverityOf, input.appendixBlRefs);
  // Product value = how much of the tested product is exposed to the pattern. A
  // predominantly-confirmed section is worth one more level than its raw citation count says;
  // a purely theoretical one, one less — it describes a risk nobody has seen here yet, which
  // is charter material rather than coverage. A High-frequency pattern adds one more: it bites
  // often, which is exposure — the axis `Frequency` genuinely belongs to.
  const classifiedRows = input.rows.filter((r) => /OBSERVED|THEORETICAL/i.test(r.status)).length;
  const observedRows = input.rows.filter((r) => /OBSERVED/i.test(r.status)).length;
  const statusBump = classifiedRows === 0 ? 0 : observedRows / classifiedRows >= 0.75 ? 1 : observedRows === 0 ? -1 : 0;
  const frequencyBump = best === "High" || best === "Low-High" ? 1 : 0;
  const bump = statusBump + frequencyBump;
  const product = productValueOf(input.citingCases, bump);
  const bumpNotes = [statusBump > 0 ? "predominantly [OBSERVED]" : statusBump < 0 ? "[THEORETICAL] only" : "", frequencyBump ? `Frequency ${best}` : ""].filter(Boolean);

  return {
    score,
    tier: tierFor(score, { cap: input.rows.length === 0 ? "T3" : undefined }),
    business: business.value,
    businessNote: business.note,
    product: product.value,
    productNote: bumpNotes.length ? `${product.note}, ${bumpNotes.join(" + ")}` : product.note,
    contributions,
    caps,
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// Tiering
// ---------------------------------------------------------------------------

export const TIER_THRESHOLDS: ReadonlyArray<readonly [Tier, number]> = [
  ["T1", 55],
  ["T2", 30],
  ["T3", 0],
];

/** Apply the thresholds, then any cap (ceiling) and floor. Cap wins over floor. */
export function tierFor(score: number, bounds: { cap?: Tier; floor?: Tier } = {}): Tier {
  let tier = TIER_THRESHOLDS.find(([, min]) => score >= min)![0];
  if (bounds.floor && TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(bounds.floor)) tier = bounds.floor;
  if (bounds.cap && TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(bounds.cap)) tier = bounds.cap;
  return tier;
}

export function meetsBar(tier: Tier, bar: Tier = PROMOTION_BAR): boolean {
  if (tier === "EXCLUDED") return false;
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(bar);
}

// ---------------------------------------------------------------------------
// The promotion gate
// ---------------------------------------------------------------------------

export type Verdict = "CONFIRMED" | "DRIFT" | "MISSING" | "DUPLICATE" | "CONTRADICTORY" | "UNGROUNDED" | "RETIRE";

export interface GateDecision {
  apply: boolean;
  /** Human-readable justification — goes verbatim into the audit report row. */
  reason: string;
  /** `high` only when BOTH axes are strong — the label the report's Value column carries. */
  label: ValueLabel;
}

export type ValueLabel = "high" | "qualified" | "low" | "undeclared" | "excluded";

/**
 * The promotion rule, in one place.
 *
 * A new entry has to be worth carrying for the BUSINESS **and** for the PRODUCT, so the two
 * axes are combined by conjunction rather than by sum:
 *
 *   business `high`   (a P0 — revenue or a security boundary)  → promote at any demand.
 *       An uncited P0 is not low-value; nothing tests it YET, and the oracle is the input
 *       test authoring reads. Blocking it would be circular.
 *   business `medium` (a P1) → promote only when product value is `medium`+ (≥3 citing
 *       cases, or ≥1 with cross-domain reach / predominantly-observed rows). A P1 nothing
 *       leans on is a note, not an invariant.
 *   business `low`    (a P2 display/UX rule) → never promoted by demand. This is the
 *       loophole the sum-based model had: 30 citations could carry a cosmetic rule into a
 *       file whose whole purpose is judging PASS/FAIL.
 *   business `unknown` → never. Declaring what a violation costs is the price of entry;
 *       an unclassified entry cannot be judged by anyone downstream either.
 *
 * `label` is what the **Value** column of the proposals file and the audit report carries:
 * `high` when both axes are strong, `qualified` when it promotes on the medium+demand path,
 * and `low` / `undeclared` / `excluded` for the three ways an entry does not promote.
 */
export function valueGate(business: BusinessValue, product: ProductValue): GateDecision {
  const p = PRODUCT_ORDER.indexOf(product);
  const mediumProduct = p >= PRODUCT_ORDER.indexOf("medium");

  if (business === "high")
    return {
      apply: true,
      label: mediumProduct ? "high" : "qualified",
      reason: `business ${business} · product ${product} — a P0 promotes at any demand (uncited means untested, not unimportant)`,
    };
  if (business === "medium")
    return mediumProduct
      ? { apply: true, label: "qualified", reason: `business ${business} · product ${product} — a P1 the product demonstrably leans on` }
      : { apply: false, label: "low", reason: `business ${business} · product ${product} — a P1 nothing leans on is a note, not an invariant; HELD` };
  if (business === "low")
    return { apply: false, label: "low", reason: `business ${business} · product ${product} — demand cannot buy a low-cost rule into the oracle; HELD` };
  return {
    apply: false,
    label: "undeclared",
    reason: "business value undeclared — assign the severity tag (BL) or link the BL invariant (ECL) before promoting; HELD",
  };
}

/**
 * Decide whether a triangulated verdict may be written to the oracle.
 *
 * The value gate governs GROWTH, never CORRECTION. A DRIFT verdict on an entry that already
 * exists is a fix to something the oracle currently states wrongly — holding it back because
 * the entry scored low would leave a known-false rule in a file other skills judge against,
 * which is strictly worse than a low-value-but-true one. Same for a CONFIRMED provenance
 * refresh and a DUPLICATE merge (which shrinks the oracle). Only MISSING — a NEW entry — has
 * to clear the bar, because that is the only verdict that makes the oracle bigger.
 */
export function gate(verdict: Verdict, score: Score): GateDecision {
  if (verdict === "CONTRADICTORY" || verdict === "UNGROUNDED" || verdict === "RETIRE")
    return {
      apply: false,
      label: "undeclared",
      reason: `${verdict} — unconfirmed or destructive; routes to the proposals file (evidence bar, unchanged)`,
    };

  if (score.tier === "EXCLUDED")
    return { apply: false, label: "excluded", reason: "EXCLUDED — a non-invariant class; record the redirect, never promote" };

  if (verdict === "MISSING") {
    const decision = valueGate(score.business, score.product);
    return { ...decision, reason: `MISSING · ${decision.reason}` };
  }

  const label = valueGate(score.business, score.product).label;
  return {
    apply: true,
    label,
    reason: `${verdict} · business ${score.business} · product ${score.product} — correction to an existing entry; the bar governs growth, not correction`,
  };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export interface Ranked<T> {
  item: T;
  score: Score;
}

/**
 * Audit/promotion order: business value, then product value, then the blended score, then
 * demand, then id — total and stable. Business leads because that is the axis the promotion
 * rule keys on; the blended score only breaks ties inside a business × product cell.
 */
export function rankOrder<T extends { id: string; citingCases: number }>(rows: Ranked<T>[]): Ranked<T>[] {
  const excluded = (s: Score) => (s.tier === "EXCLUDED" ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      excluded(a.score) - excluded(b.score) ||
      BUSINESS_ORDER.indexOf(b.score.business) - BUSINESS_ORDER.indexOf(a.score.business) ||
      PRODUCT_ORDER.indexOf(b.score.product) - PRODUCT_ORDER.indexOf(a.score.product) ||
      b.score.score - a.score.score ||
      b.item.citingCases - a.item.citingCases ||
      a.item.id.localeCompare(b.item.id),
  );
}
