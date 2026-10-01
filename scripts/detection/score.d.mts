// Types for score.mjs — see that file for the semantics.
export interface TrialRun { mutant: string; caseId: string; exit: number | null; applied: boolean }
export interface MutantVerdict {
  id: string;
  archetype: string;
  models: string;
  status: "KILLED" | "SURVIVED" | "NOT_EXERCISED";
  exercisedBy: string[];
  killedBy: string[];
  errors: string[];
}
export function scoreTrial(input: {
  mutants: Array<{ id: string; archetype: string; models: string }>;
  runs: TrialRun[];
}): { mutants: MutantVerdict[]; killed: number; survived: number; notExercised: number; score: number | null };
export function stableCleanCases(cleanExits: Record<string, number[]>): {
  stable: string[];
  excluded: Array<{ id: string; exits: number[] }>;
};
