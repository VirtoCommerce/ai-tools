// scripts/deploy/upgrade/versions.ts
/** `<Id>_<version>.zip` → Id + version, split at the FIRST `_` followed by a digit (draft §2). */
export function splitBlobName(name: string): { id: string; version: string } | null {
  const m = /^(.+?)_(\d.*)\.zip$/i.exec(name);
  return m ? { id: m[1], version: m[2] } : null;
}
