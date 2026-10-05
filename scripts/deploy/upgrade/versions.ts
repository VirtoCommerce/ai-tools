// scripts/deploy/upgrade/versions.ts
/** `<Id>_<version>.zip` → Id + version, split at the FIRST `_` followed by a digit (draft §2). */
export function splitBlobName(name: string): { id: string; version: string } | null {
  const m = /^(.+?)_(\d.*)\.zip$/i.exec(name);
  return m ? { id: m[1], version: m[2] } : null;
}

/** Numeric per-component compare of dotted versions (3.1009.0 > 3.999.0). Pass BASES — suffixes are not ordered here. */
export function cmpVersion(a: string, b: string): number {
  const pa = baseOf(a).split('.').map(Number), pb = baseOf(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}
export const baseOf = (v: string): string => /^\d+(?:\.\d+)*/.exec(v.trim().replace(/^v/, ''))?.[0] ?? v;

export type PinKind = 'release' | 'pr' | 'alpha' | 'branch-alpha' | 'unknown';
export interface ParsedVersion { raw: string; base: string; kind: PinKind; pr?: number; alpha?: number; branch?: string }
/** Pin kinds (draft §4): X.Y.Z · X.Y.Z-pr-<N>-… · X.Y.Z-alpha.<N> · X.Y.Z-alpha.<N>-<branch> · anything else. */
export function parseVersion(raw: string): ParsedVersion {
  const v = raw.trim();
  const m = /^(\d+\.\d+\.\d+)(?:-(.+))?$/.exec(v);
  if (!m) return { raw: v, base: v, kind: 'unknown' };
  const [, base, suffix] = m;
  if (!suffix) return { raw: v, base, kind: 'release' };
  let s: RegExpExecArray | null;
  if ((s = /^pr-(\d+)(?:-.+)?$/i.exec(suffix))) return { raw: v, base, kind: 'pr', pr: +s[1] };
  if ((s = /^alpha\.(\d+)$/i.exec(suffix))) return { raw: v, base, kind: 'alpha', alpha: +s[1] };
  if ((s = /^alpha\.(\d+)-(.+)$/i.exec(suffix))) return { raw: v, base, kind: 'branch-alpha', alpha: +s[1], branch: s[2] };
  return { raw: v, base, kind: 'unknown' };
}
/** First tracker key (PROJ-123) in any of the texts — PR title, then branch name. */
export function trackerKey(...texts: (string | undefined | null)[]): string | undefined {
  for (const t of texts) { const m = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d{2,})\b/.exec(t ?? ''); if (m) return m[1].toUpperCase(); }
  return undefined;
}
