/**
 * Scoring for the detection trial. Pure: takes the per-run observations, returns the verdicts.
 *
 * A mutant is
 *   KILLED         — at least one case it touched failed (exit 1) while the clean run passed;
 *   SURVIVED       — it touched at least one case and every such case still passed;
 *   NOT_EXERCISED  — no case produced a response it could act on (a gap: the suite never looks
 *                    at that shape at all).
 * The score is KILLED / (KILLED + SURVIVED). NOT_EXERCISED is reported separately and never
 * counted as caught.
 */

/**
 * @param {object} input
 * @param {Array<{id:string, archetype:string, models:string}>} input.mutants
 * @param {Array<{mutant:string, caseId:string, exit:number|null, applied:boolean}>} input.runs
 * @returns {{mutants: Array<object>, killed:number, survived:number, notExercised:number, score:number|null}}
 */
export function scoreTrial({ mutants, runs }) {
  const out = mutants.map((m) => {
    const mine = runs.filter((r) => r.mutant === m.id && r.applied);
    const killedBy = mine.filter((r) => r.exit === 1).map((r) => r.caseId);
    const errors = mine.filter((r) => r.exit !== 0 && r.exit !== 1).map((r) => r.caseId);
    const status = mine.length === 0 ? "NOT_EXERCISED" : killedBy.length > 0 ? "KILLED" : "SURVIVED";
    return {
      id: m.id,
      archetype: m.archetype,
      models: m.models,
      status,
      exercisedBy: mine.map((r) => r.caseId),
      killedBy,
      errors,
    };
  });
  const killed = out.filter((m) => m.status === "KILLED").length;
  const survived = out.filter((m) => m.status === "SURVIVED").length;
  const notExercised = out.filter((m) => m.status === "NOT_EXERCISED").length;
  const score = killed + survived === 0 ? null : killed / (killed + survived);
  return { mutants: out, killed, survived, notExercised, score };
}

/**
 * Cases that are usable as a baseline: every clean repetition passed. A case that failed or
 * flipped on the unmodified build is excluded — a mutant "killing" it would prove nothing.
 * @param {Record<string, number[]>} cleanExits caseId → exit codes of the clean repetitions
 */
export function stableCleanCases(cleanExits) {
  const stable = [];
  const excluded = [];
  for (const [id, exits] of Object.entries(cleanExits)) {
    if (exits.length > 0 && exits.every((e) => e === 0)) stable.push(id);
    else excluded.push({ id, exits });
  }
  return { stable, excluded };
}
