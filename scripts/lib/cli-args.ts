/**
 * Shared CLI argument reading for the `scripts/test-cases/` tools.
 *
 * Three hand-rolled copies existed and they drifted in exactly the ways a
 * hand-rolled copy does:
 *   - `report-yield` read `argv[argv.indexOf("--limit") + 1]`, which is `argv[0]`
 *     when the flag is absent, so `--unknown` became `Number("--unknown")` = NaN
 *     and `slice(0, NaN)` silently emptied the report's main table;
 *   - `rank-cases` accepted `--limit abc` the same way, losing the whole table
 *     plus the "… N more" hint with no message;
 *   - both ignored an unknown flag entirely, so `--layar frontend` ranked the
 *     entire corpus and said nothing, while `promote-cases` (the incumbent) has
 *     always thrown on one.
 *
 * A reporting tool that silently drops its payload is worse than one that
 * crashes, so every reader here fails loudly instead of coercing.
 */

/** Raw value following `flag`, or undefined when the flag is absent. */
export function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Non-negative integer flag. Exits non-zero on a value that is not one. */
export function intFlag(argv: readonly string[], flag: string, fallback: number): number {
  const raw = flagValue(argv, flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`✗ ${flag} expects a non-negative number, got "${raw}"`);
    process.exit(1);
  }
  return n;
}

/** Value flag restricted to a closed set. Exits non-zero on anything else. */
export function enumFlag<T extends string>(
  argv: readonly string[],
  flag: string,
  allowed: readonly T[],
): T | undefined {
  const raw = flagValue(argv, flag);
  if (raw === undefined) return undefined;
  const hit = allowed.find((a) => a.toLowerCase() === raw.toLowerCase());
  if (!hit) {
    console.error(`✗ ${flag} expects one of ${allowed.join(" | ")}, got "${raw}"`);
    process.exit(1);
  }
  return hit;
}

/**
 * Reject a flag the script does not understand.
 *
 * `known` lists every recognised flag; `valued` those that consume the next
 * argument (so its value is not itself mistaken for an unknown flag). Matching
 * `promote-cases.ts`, an unknown flag is a usage error, not something to ignore:
 * a typo that silently changes the scope of a corpus-wide read is the worst kind
 * of quiet.
 */
export function rejectUnknownFlags(
  argv: readonly string[],
  known: readonly string[],
  valued: readonly string[] = [],
): void {
  const knownSet = new Set(known);
  const valuedSet = new Set(valued);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    if (!knownSet.has(a)) {
      console.error(`✗ unknown flag "${a}". Known: ${[...known].sort().join(" ")}`);
      process.exit(1);
    }
    if (valuedSet.has(a)) i++; // skip its value
  }
}
