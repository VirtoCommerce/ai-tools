// Types for mutants.mjs — see that file for the semantics.
export interface Mutant {
  id: string;
  archetype: string;
  models: string;
  body?: boolean;
  apply(target: unknown): boolean;
}
export const MUTANTS: Mutant[];
export function mutantIds(): string[];
export function applyMutant(id: string, body: unknown): { body: unknown; applied: boolean };
export function applicableMutants(body: unknown): string[];
