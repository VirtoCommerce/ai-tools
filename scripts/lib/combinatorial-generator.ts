/**
 * combinatorial-generator.ts — zero-dependency all-pairs (pairwise) generator.
 *
 * Stage 2 of the `/qa-generate-data` pipeline. Takes the factor/value spec the
 * variant-discovery stage produced (axis → real live values) plus optional
 * constraints (forbidden value combinations), and emits the MINIMAL set of
 * combinations that covers every valid value-pair across every factor pair —
 * the combination matrix the skill turns into fixtures.
 *
 * Why pairwise: full-factorial blows up (∏ |values|); most defects are triggered
 * by a single value or an interacting PAIR, so all-pairs gives near-full coverage
 * at a fraction of the rows. The result reports the full-factorial count so the
 * skill can LOG what pairwise dropped (never silently cap — see reports policy).
 *
 * Input shape mirrors the PICT factor format used in `/qa-test-design`
 * `examples/pairwise-*.md`. Deterministic: same spec → same matrix (greedy with
 * fixed tie-breaking, no Math.random), so a re-run reproduces the same Combo IDs.
 *
 * Standalone smoke:
 *   npx tsx scripts/lib/combinatorial-generator.ts '{"factors":[{"name":"pricing","values":["priced","unpriced"]},{"name":"balance",values:[...]}],"constraints":[]}'
 */

export interface Factor {
  /** Axis name, e.g. "pricing-state", "loyalty-balance". */
  name: string;
  /** The real values for this axis (from variant discovery). */
  values: string[];
}

/**
 * A forbidden partial assignment: a combination is invalid if it matches EVERY
 * key/value here. E.g. `{ "product-type": "configurable", "promotion": "free-gift" }`
 * excludes that pair when it can't coexist. Single-key constraints exclude a value
 * outright in context.
 */
export type Constraint = Record<string, string>;

export interface AllPairsResult {
  /** The minimal covering combination set — one assignment (factor→value) per row. */
  combinations: Array<Record<string, string>>;
  /** ∏ |values| — the full-factorial size pairwise replaced. */
  factorialCount: number;
  /** Valid value-pairs the matrix covers. */
  pairsCovered: number;
  /** Total valid value-pairs that needed covering. */
  pairsTotal: number;
  /** Value-pairs excluded by a constraint (never needed covering). */
  pairsDroppedByConstraint: number;
  /** Human one-liner for the skill to log. */
  summary: string;
}

interface PairKey {
  fi: number;
  vi: string;
  fj: number;
  vj: string;
  key: string;
}

function pairKey(fi: number, vi: string, fj: number, vj: string): string {
  return `${fi}=${vi}||${fj}=${vj}`;
}

/** A (possibly partial) assignment violates a constraint when it matches all the constraint's keys. */
function violates(assignment: Record<string, string>, constraints: Constraint[]): boolean {
  for (const c of constraints) {
    const keys = Object.keys(c);
    if (keys.every((k) => k in assignment)) {
      if (keys.every((k) => assignment[k] === c[k])) return true;
    }
  }
  return false;
}

/** True if assigning `value` to `factor` would, with `partial`, immediately violate a constraint. */
function wouldViolate(
  partial: Record<string, string>,
  factor: string,
  value: string,
  constraints: Constraint[]
): boolean {
  return violates({ ...partial, [factor]: value }, constraints);
}

/**
 * Greedy all-pairs (AETG-style). Deterministic: factors kept in input order,
 * values in input order, ties broken by first-seen. Covers all valid pairs;
 * also guarantees 1-wise coverage (every value appears at least once) as a
 * by-product, and handles the single-factor case explicitly.
 */
export function allPairs(factors: Factor[], constraints: Constraint[] = []): AllPairsResult {
  const clean = factors.filter((f) => f.values.length > 0);
  const factorialCount = clean.reduce((acc, f) => acc * f.values.length, 1);

  // Single factor (or none): no pairs — emit each value once (1-wise).
  if (clean.length <= 1) {
    const f = clean[0];
    const combinations = f
      ? f.values
          .filter((v) => !violates({ [f.name]: v }, constraints))
          .map((v) => ({ [f.name]: v }))
      : [];
    return {
      combinations,
      factorialCount,
      pairsCovered: 0,
      pairsTotal: 0,
      pairsDroppedByConstraint: 0,
      summary: `${combinations.length} combination(s); single-axis (no pairs), full-factorial=${factorialCount}`,
    };
  }

  // Enumerate all valid value-pairs to cover.
  const uncovered = new Map<string, PairKey>();
  let droppedByConstraint = 0;
  for (let i = 0; i < clean.length; i++) {
    for (let j = i + 1; j < clean.length; j++) {
      for (const vi of clean[i].values) {
        for (const vj of clean[j].values) {
          if (violates({ [clean[i].name]: vi, [clean[j].name]: vj }, constraints)) {
            droppedByConstraint++;
            continue;
          }
          const key = pairKey(i, vi, j, vj);
          uncovered.set(key, { fi: i, vi, fj: j, vj, key });
        }
      }
    }
  }
  const pairsTotal = uncovered.size;

  const combinations: Array<Record<string, string>> = [];
  let guard = 0;
  const guardMax = pairsTotal * clean.length + factorialCount + 1000;

  while (uncovered.size > 0 && guard++ < guardMax) {
    // Seed the candidate from the first uncovered pair (deterministic).
    const seed = uncovered.values().next().value as PairKey;
    const assignment: Record<string, string> = {
      [clean[seed.fi].name]: seed.vi,
      [clean[seed.fj].name]: seed.vj,
    };

    // Fill the remaining factors greedily: pick the value covering the most
    // currently-uncovered pairs with already-assigned factors (ties → input order).
    for (let f = 0; f < clean.length; f++) {
      const fname = clean[f].name;
      if (fname in assignment) continue;
      let bestVal: string | null = null;
      let bestGain = -1;
      for (const v of clean[f].values) {
        if (wouldViolate(assignment, fname, v, constraints)) continue;
        let gain = 0;
        for (let g = 0; g < clean.length; g++) {
          const gname = clean[g].name;
          if (!(gname in assignment)) continue;
          const gv = assignment[gname];
          const k = g < f ? pairKey(g, gv, f, v) : pairKey(f, v, g, gv);
          if (uncovered.has(k)) gain++;
        }
        if (gain > bestGain) {
          bestGain = gain;
          bestVal = v;
        }
      }
      // Fallback: every value violated a constraint with the partial assignment —
      // take the first non-violating value, else the first value (best effort).
      if (bestVal === null) {
        bestVal =
          clean[f].values.find((v) => !wouldViolate(assignment, fname, v, constraints)) ??
          clean[f].values[0];
      }
      assignment[fname] = bestVal;
    }

    // Mark every pair this combination covers.
    for (let i = 0; i < clean.length; i++) {
      for (let j = i + 1; j < clean.length; j++) {
        uncovered.delete(pairKey(i, assignment[clean[i].name], j, assignment[clean[j].name]));
      }
    }
    combinations.push(assignment);
  }

  const pairsCovered = pairsTotal - uncovered.size;
  return {
    combinations,
    factorialCount,
    pairsCovered,
    pairsTotal,
    pairsDroppedByConstraint: droppedByConstraint,
    summary:
      `${combinations.length} combinations cover ${pairsCovered}/${pairsTotal} valid pairs ` +
      `(full-factorial=${factorialCount}, dropped-by-constraint=${droppedByConstraint})`,
  };
}

/* ───────────────────────── CLI (smoke / standalone) ───────────────────────── */

// Run directly: `npx tsx scripts/lib/combinatorial-generator.ts '<json-spec>'`
// Spec: { "factors": [{ "name": "...", "values": ["..."] }], "constraints": [{...}] }
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /combinatorial-generator\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  const arg = process.argv[2];

  const run = (raw: string) => {
    let spec: { factors: Factor[]; constraints?: Constraint[] };
    try {
      spec = JSON.parse(raw);
    } catch (e) {
      console.error(`Invalid JSON spec: ${(e as Error).message}`);
      process.exit(2);
    }
    const result = allPairs(spec.factors || [], spec.constraints || []);
    console.log(result.summary);
    console.table(result.combinations);
  };

  // Read from stdin when no arg or arg is "-" (robust against shell-quoting of
  // JSON values containing $, backticks, quotes — pipe-safe):
  //   node discover-variants.mjs loyalty --json | npx tsx combinatorial-generator.ts -
  if (!arg || arg === "-") {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      if (!buf.trim()) {
        console.error(
          'Usage: npx tsx scripts/lib/combinatorial-generator.ts \'<json-spec>\'  (or pipe spec via stdin with "-")'
        );
        process.exit(2);
      }
      run(buf);
    });
  } else {
    run(arg);
  }
}
