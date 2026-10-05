// scripts/deploy/lib/pins.ts — read every module pin of a parsed packages.json, whatever its shape.
// Shared: lib/manifest.ts verifies edits with it, upgrade/ classifies with it.

/** `<Id>_<version>.zip` → Id + version, split at the FIRST `_` followed by a digit (draft §2). */
export function splitBlobName(name: string): { id: string; version: string } | null {
  const m = /^(.+?)_(\d.*)\.zip$/i.exec(name);
  return m ? { id: m[1], version: m[2] } : null;
}

export interface Pin { id: string; version: string; source: 'AzureBlob' | 'GithubReleases' }
export const isBlobSource = (s: any): boolean => s?.Name === 'AzureBlob' || String(s?.ServiceUri ?? '').includes('vc3prerelease');
export const isGhSource = (s: any): boolean => !isBlobSource(s) && /github/i.test(String(s?.Name ?? ''));

/** One pin per Id. An Id seen twice (both sources, or twice in one) is reported in `duplicates`
 *  and keeps its FIRST pin. An explicit `Version` wins over the BlobName-derived one. */
export function readPins(json: any): { pins: Pin[]; duplicates: string[] } {
  const seen = new Map<string, Pin>(), dups = new Set<string>();
  for (const s of json?.Sources ?? []) {
    const source = isBlobSource(s) ? 'AzureBlob' : isGhSource(s) ? 'GithubReleases' : null;
    if (!source) continue;
    for (const m of s.Modules ?? []) {
      const fromBlob = typeof m?.BlobName === 'string' ? splitBlobName(m.BlobName) : null;
      const id = m?.Id ?? fromBlob?.id, version = m?.Version ?? fromBlob?.version;
      if (!id || version === undefined) continue;
      if (seen.has(id)) dups.add(id); else seen.set(id, { id, version: String(version), source });
    }
  }
  return { pins: [...seen.values()], duplicates: [...dups] };
}

export function blobBase(json: any): string {
  const s = (json?.Sources ?? []).find(isBlobSource);
  const uri = String(s?.ServiceUri ?? 'https://vc3prerelease.blob.core.windows.net').replace(/\/$/, '');
  return `${uri}/${s?.Container ?? 'packages'}`;
}
