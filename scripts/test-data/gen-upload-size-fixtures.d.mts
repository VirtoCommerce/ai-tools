/** Repo-relative paths `gen-upload-size-fixtures.mjs` writes. */
export const OUTPUTS: readonly string[];
/** Write every OUTPUT under `root` (the repo root by default). */
export function generate(root?: string): { rel: string; size: number; head: string }[];
