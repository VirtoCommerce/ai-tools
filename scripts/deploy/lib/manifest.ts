// scripts/deploy/lib/manifest.ts — minimal-diff editing of vc-deploy-dev's backend/packages.json and
// theme/artifact.json. Shared by `vc-deploy.ts pr` and `vc-deploy.ts upgrade`.
import { readPins } from '../upgrade/pins.ts';
import type { Pin } from '../upgrade/pins.ts';

export const THEME_URL_RE = /https?:\/\/[^\s"'<>]*vc-theme[^\s"'<>]*\.zip/i;

// ── types ──────────────────────────────────────────────────────────────────────
export type Kind = 'module' | 'platform' | 'theme';
export interface Target {
  kind: Kind;
  id?: string;             // module Id (backend) or repo pseudo
  version?: string;        // module / platform version
  blobName?: string;       // backend module blob file name
  themeUrl?: string;       // full storefront theme artifact URL
  imageTag?: string;       // platform ONLY: the container tag → PlatformImageTag. Defaults to `version`.
  source: string;          // "PR owner/repo#N" | "--module" | "--platform" | "--theme"
}
/** The tag a platform pin writes to PlatformImageTag (falls back to the version for a plain bump). */
export const tagOf = (t: Target): string => t.imageTag ?? t.version!;

/** Current pin of a module Id: its version + which source it sits in (blob vs GithubReleases).
 *  Recognises BOTH {Id,Version} entries AND BlobName-only AzureBlob entries ("<Id>_<version>.zip",
 *  which carry no Id field — the shape vc-deploy-dev uses for prerelease pins). */
export function pinnedModule(json: any, id: string): { version: string; source: string; blobName?: string } | null {
  for (const s of json.Sources ?? []) for (const m of s?.Modules ?? []) {
    if (m?.Id === id) return { version: String(m.Version), source: String(s.Name ?? ''), blobName: m.BlobName };
    if (typeof m?.BlobName === 'string') { const bm = m.BlobName.match(/^(.+)_(\d.*)\.zip$/i); if (bm && bm[1] === id) return { version: bm[2], source: String(s.Name ?? 'AzureBlob'), blobName: m.BlobName }; }
  }
  return null;
}
/** Pin a module as a pre-release AzureBlob item (and drop it from GithubReleases). Mutates `json`. */
export function applyModule(json: any, id: string, version: string, blobName: string): void {
  json.Sources ||= [];
  const gh = json.Sources.find((s: any) => /github/i.test(s?.Name || '')) || json.Sources.find((s: any) => Array.isArray(s?.Modules) && s.ModuleSources);
  let blob = json.Sources.find((s: any) => s?.Name === 'AzureBlob' || (s?.ServiceUri || '').includes('vc3prerelease'));
  if (!blob) { blob = { Name: 'AzureBlob', Container: 'packages', ServiceUri: 'https://vc3prerelease.blob.core.windows.net', Modules: [] }; json.Sources.push(blob); }
  blob.Modules ||= [];
  if (gh?.Modules) gh.Modules = gh.Modules.filter((m: any) => m.Id !== id);
  const existing = blob.Modules.find((m: any) => m.Id === id);
  if (existing) { existing.Version = version; existing.BlobName = blobName; }
  else blob.Modules.push({ Id: id, Version: version, BlobName: blobName });
}
/**
 * Pin the platform. `imageTag` defaults to `version` (a plain release bump, where the two are equal);
 * a PR pre-release passes them separately — PlatformVersion keeps the base semver, PlatformImageTag
 * carries the full `-pr-…` container tag, which is the ONLY field vc-deploy-dev's deploy-backend.yml
 * reads (`PLATFORM_TAG` → the docker build-arg). Mutates `json`.
 */
export function applyPlatform(json: any, version: string, imageTag: string = version): void {
  json.PlatformVersion = version;
  if (json.PlatformImageTag !== undefined) json.PlatformImageTag = imageTag;
}
export function serialize(json: any): string { return JSON.stringify(json, null, 2) + '\n'; }
/** Lines added + removed (multiset symmetric difference) — handles insertions/deletions, so a
 *  minimal surgical edit reports a small number and a full reserialize reports a large one. */
export function countChangedLines(before: string, after: string): number {
  const bag = (t: string) => { const m = new Map<string, number>(); for (const l of t.split('\n')) m.set(l, (m.get(l) || 0) + 1); return m; };
  const a = bag(before), b = bag(after);
  let diff = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) diff += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return diff;
}

// ── minimal text-surgery (preserve the manifest's formatting; fall back to reserialize) ─────────
// vc-deploy-dev's packages.json MAY use an irregular indent JSON.stringify can't reproduce, in which
// case mutating the parsed object + reserializing rewrites the whole file. These edit the RAW text so
// the deploy PR shows a clean 2-hunk diff (like a vc-ci "<TICKET>-vcst-qa-deployment" PR). Note most
// env branches now round-trip through JSON.stringify(…, 2) exactly, where the reserialize path is
// equally minimal and this surgery only wins 0-2 lines — it is belt-and-braces plus "never reformat
// DevOps's file", NOT a large win. Don't grow this layer further on diff-size grounds alone.
// Each returns null on an unexpected OR ambiguous shape → editPackagesText falls back to reserialize;
// guessing is never correct here, because a wrong-but-valid manifest deploys the wrong build.
export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Literal (no `$` expansion) replacement of the first `re` match — `String.replace` treats `$&`,
 *  `` $` ``, `$'`, `$n` in a replacement STRING as references, and these values come from a
 *  PR-body URL via decodeURIComponent, so a `$` in a filename would splice manifest text in. */
export const subLiteral = (s: string, re: RegExp, to: string) => s.replace(re, () => to);
/** A line's leading whitespace, tabs included — a spaces-only pattern measures a tab file as 0. */
export const indentOf = (l: string) => (l.match(/^[ \t]*/) as RegExpMatchArray)[0];
/** Line range [openBrace, closeBrace] of the Sources[] object whose body matches `marker`. */
export function sourceBlockRange(lines: string[], marker: RegExp): [number, number] | null {
  const at = lines.findIndex((l) => marker.test(l));
  if (at < 0) return null;
  let open = -1;                                                 // that object's own opening brace
  for (let i = at; i >= 0; i--) if (/^\s*\{\s*$/.test(lines[i])) { open = i; break; }
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < lines.length; i++) {
    // Depth counts structural braces only — blank the string literals first so a `{`/`[` inside a
    // value (URL, BlobName) can't skew the range.
    for (const ch of lines[i].replace(/"(?:\\.|[^"\\])*"/g, '""')) {
      if (ch === '{' || ch === '[') depth++; else if (ch === '}' || ch === ']') depth--;
    }
    if (i > open && depth <= 0) return at <= i ? [open, i] : null; // range must contain the marker
  }
  return null;
}
/** Split into `\r`-free lines + the EOL to rejoin with. Constructed lines must carry the file's own
 *  EOL, else a CRLF manifest gets LF-only inserts (mixed endings + phantom diff on touched lines). */
export const splitLines = (text: string) => ({ lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' });
/** Remove a GithubReleases {Id,Version} object (+ its adjacent comma). Unchanged text if the id
 *  isn't in GithubReleases; null if it's there but not in the canonical 4-line shape. */
export function removeGhReleaseEntry(text: string, id: string): string | null {
  const { lines, eol } = splitLines(text);
  const idRe = new RegExp(`"Id"\\s*:\\s*"${escRe(id)}"`);
  // Scope the search to the GithubReleases source when it's locatable: an AzureBlob prerelease entry
  // may ALSO carry an "Id" (the {Id,Version,BlobName} shape a reserialize writes), and matching THAT
  // one would fail the 4-line shape check and force a needless whole-file reserialize.
  const gh = sourceBlockRange(lines, /"Name"\s*:\s*"[^"]*github[^"]*"/i)
          ?? sourceBlockRange(lines, /"ModuleSources"\s*:/);      // same shapes applyModule() accepts
  let idLine = -1;
  for (let i = gh ? gh[0] : 0, end = gh ? gh[1] : lines.length - 1; i <= end; i++) if (idRe.test(lines[i])) { idLine = i; break; }
  if (idLine < 0) return text;                                   // not in GithubReleases — nothing to remove
  const open = idLine - 1, close = idLine + 2;                   // { · Id · Version · }
  if (open < 0 || close >= lines.length) return null;
  if (!/^\s*\{\s*$/.test(lines[open]) || !/^\s*\},?\s*$/.test(lines[close])) return null;
  const closeHasComma = /\},[ \t]*$/.test(lines[close]);
  lines.splice(open, close - open + 1);
  if (!closeHasComma) {                                          // was the last entry → drop the previous entry's trailing comma
    for (let i = open - 1; i >= 0; i--) { if (/\S/.test(lines[i])) { if (/\},?[ \t]*$/.test(lines[i])) lines[i] = lines[i].replace(/,([ \t]*)$/, '$1'); break; } }
  }
  return lines.join(eol);
}
/** The file's indent step, as the literal whitespace string (so a tab-indented manifest gets tabs).
 *  Read off the first indented line rather than the enclosing block's own indent, which can be
 *  irregular — vcst-qa indented the AzureBlob block's children at the SAME column as its opening
 *  brace, so a parent-delta would yield an empty step. Two spaces if the file has no indent at all. */
export const detectIndentUnit = (lines: string[]) =>
  lines.find((l) => /^[ \t]+\S/.test(l))?.match(/^[ \t]+/)![0] ?? '  ';
/** Seed the first entry into an EMPTY AzureBlob `"Modules": []` — the state of a branch that has
 *  never carried a prerelease pin (vcptcore-stable and -regression are both here today), where there
 *  is no `"BlobName"` line to anchor on. Returns null if the AzureBlob source, or its empty Modules
 *  array, can't be located. Mutates `lines`. */
function insertFirstBlobEntry(lines: string[], blobName: string, eol: string): string | null {
  const range = sourceBlockRange(lines, /"Name"\s*:\s*"AzureBlob"|"ServiceUri"\s*:\s*"[^"]*vc3prerelease/);
  if (!range) return null;                                         // no AzureBlob source at all
  const [open, close] = range;
  let modAt = -1;                                                  // that source's own "Modules" key
  for (let i = open + 1; i < close; i++) if (/"Modules"\s*:/.test(lines[i])) { modAt = i; break; }
  if (modAt < 0) return null;
  const mod = indentOf(lines[modAt]), unit = detectIndentUnit(lines);
  const entry = [`${mod}${unit}{`, `${mod}${unit}${unit}"BlobName": "${blobName}"`, `${mod}${unit}}`];
  const inline = /^([ \t]*"Modules"\s*:\s*)\[[ \t]*\][ \t]*(,?)[ \t]*\r?$/.exec(lines[modAt]);
  if (inline) {                                                    // "Modules": []  (one line)
    lines.splice(modAt, 1, `${inline[1]}[`, ...entry, `${mod}]${inline[2]}`);
    return lines.join(eol);
  }
  if (/"Modules"\s*:\s*\[[ \t]*\r?$/.test(lines[modAt])) {         // "Modules": [ … ] (multi-line)
    for (let i = modAt + 1; i < close; i++) {
      if (!/\S/.test(lines[i])) continue;
      if (!/^[ \t]*\][ \t]*,?[ \t]*\r?$/.test(lines[i])) return null; // array is NOT empty → unexpected
      lines.splice(i, 0, ...entry);
      return lines.join(eol);
    }
  }
  return null;
}
/** Add (or replace) a BlobName-only entry in the AzureBlob source, matching existing indentation.
 *  `id` must own AT MOST one entry and one entry per line — anything ambiguous returns null so the
 *  caller reserializes (whose applyModule matches by `Id`) instead of editing the wrong pin. */
export function upsertBlobEntry(text: string, id: string, blobName: string): string | null {
  const { lines, eol } = splitLines(text);
  const blobRe = new RegExp(`"BlobName"\\s*:\\s*"${escRe(id)}_`, 'i');
  const owns = lines.filter((l) => blobRe.test(l)).length;
  if (owns > 1) return null;                                      // same module pinned twice — don't guess
  const existing = lines.findIndex((l) => blobRe.test(l));
  if (existing >= 0) {
    // One entry per line, else the id-anchored match above and the positional replace below can
    // disagree and rewrite a NEIGHBOUR's BlobName (silently dropping that module's pin).
    if ((lines[existing].match(/"BlobName"\s*:/g) || []).length > 1) return null;
    lines[existing] = subLiteral(lines[existing], /"BlobName"\s*:\s*"[^"]*"/, `"BlobName": "${blobName}"`);
    // Refresh this entry's "Version" if it has one: pinnedModule() prefers an explicit Version over
    // the BlobName-derived one, so leaving it stale would make the table / --verify report a version
    // the pin no longer points at. (Entries written by a reserialize carry Id+Version+BlobName.)
    const ver = blobName.match(/^.+_(\d.*)\.zip$/i)?.[1];
    const setVer = (l: string) => l.replace(/("Version"\s*:\s*")[^"]*(")/, (_m, a, b) => a + ver + b);
    if (/"Version"\s*:/.test(lines[existing])) {                  // single-line entry: Version sits here
      if (!ver) return null;
      lines[existing] = setVer(lines[existing]);
    } else {
      // Multi-line entry: bound the search to THIS entry's own field lines — contiguous, at the same
      // indent as the BlobName line, stopping at any brace/bracket. So an outer key (e.g. a
      // source-level "Version") can never be rewritten, and order within the entry doesn't matter.
      const sibling = (i: number) => !/^[ \t]*[{}[\]]/.test(lines[i]) && indentOf(lines[i]) === indentOf(lines[existing]);
      let lo = existing, hi = existing;
      while (lo - 1 >= 0 && sibling(lo - 1)) lo--;
      while (hi + 1 < lines.length && sibling(hi + 1)) hi++;
      for (let i = lo; i <= hi; i++) {
        if (!/"Version"\s*:/.test(lines[i])) continue;
        if (!ver) return null;                                    // can't derive a version → reserialize
        lines[i] = setVer(lines[i]);
        break;
      }
    }
    return lines.join(eol);
  }
  const sample = lines.findIndex((l) => /"BlobName"\s*:/.test(l));
  if (sample < 1) return insertFirstBlobEntry(lines, blobName, eol); // empty AzureBlob — no sibling to mirror
  const blobIndent = indentOf(lines[sample]);
  // Mirror the sibling ENTRY'S OPENING BRACE, found by scanning up from its BlobName line. Reading
  // `sample - 1` assumed the brace always sits directly above, which only holds for a BlobName-ONLY
  // entry — on the {Id,…,BlobName} shape that line is `"Id"`, so the braces inherited the FIELD
  // indent and the inserted entry sat one step deeper than its siblings (valid JSON, untidy diff).
  const openAt = (() => { for (let i = sample; i >= 0; i--) if (/^[ \t]*\{\s*$/.test(lines[i])) return i; return -1; })();
  const braceIndent = openAt >= 0 ? indentOf(lines[openAt]) : blobIndent;
  let lastClose = -1;
  for (let i = 0; i < lines.length - 1; i++) if (/"BlobName"\s*:/.test(lines[i]) && /^\s*\}/.test(lines[i + 1])) lastClose = i + 1;
  if (lastClose < 0) return null;
  lines[lastClose] = lines[lastClose].replace(/^([ \t]*\})[ \t]*,?[ \t]*$/, '$1,');
  lines.splice(lastClose + 1, 0, `${braceIndent}{`, `${blobIndent}"BlobName": "${blobName}"`, `${braceIndent}}`);
  return lines.join(eol);
}
export function bumpPlatformText(text: string, version: string, imageTag: string = version): string | null {
  let hit = 0;
  const out = text.replace(/("PlatformVersion"\s*:\s*")[^"]*(")/, (_m, a, b) => (hit++, a + version + b))
                  .replace(/("PlatformImageTag"\s*:\s*")[^"]*(")/, (_m, a, b) => (hit++, a + imageTag + b));
  return hit > 0 ? out : null;
}
/** Apply all module moves + a platform bump. Prefer minimal surgery; verify (valid JSON + intended
 *  semantic delta) and fall back to a full reserialize if anything is off. */
export function editPackagesText(origText: string, origJson: any, modules: Target[], platformT?: Target): { text: string; minimal: boolean } {
  let text: string | null = origText;
  for (const t of modules) {
    text = removeGhReleaseEntry(text!, t.id!); if (text == null) break;
    text = upsertBlobEntry(text, t.id!, t.blobName!); if (text == null) break;
  }
  if (text != null && platformT) text = bumpPlatformText(text, platformT.version!, tagOf(platformT));
  if (text != null) {
    try {
      const j = JSON.parse(text);
      const gh = j.Sources?.find((s: any) => /github/i.test(s?.Name || ''));
      const blob = j.Sources?.find((s: any) => s?.Name === 'AzureBlob' || (s?.ServiceUri || '').includes('vc3prerelease'));
      let good = true;
      // Assert the intended END STATE, not mere presence. Surgery matches by BlobName prefix while the
      // reserialize fallback matches by `Id`; when the two can disagree (duplicate pin, stale sibling
      // Version, an entry the prefix scan missed) the only safe outcome is the reserialize. pinnedModule
      // is the right oracle because it is exactly what the dry-run table and --verify read.
      for (const t of modules) {
        if (gh?.Modules?.some((m: any) => m.Id === t.id)) good = false;
        const owning = (blob?.Modules ?? []).filter((m: any) =>
          m?.Id === t.id || String(m?.BlobName ?? '').toLowerCase().startsWith(`${String(t.id).toLowerCase()}_`));
        if (owning.length !== 1) good = false;                     // missing, or duplicated (stale one could win)
        const pin = pinnedModule(j, t.id!);
        if (pin?.version !== t.version || pin?.blobName !== t.blobName) good = false;
      }
      if (platformT && (String(j.PlatformVersion) !== platformT.version
        || (j.PlatformImageTag !== undefined && String(j.PlatformImageTag) !== tagOf(platformT)))) good = false;
      if (good) return { text, minimal: true };
    } catch { /* fall through */ }
  }
  const clone = JSON.parse(JSON.stringify(origJson));
  for (const t of modules) applyModule(clone, t.id!, t.version!, t.blobName!);
  if (platformT) applyPlatform(clone, platformT.version!, tagOf(platformT));
  return { text: serialize(clone), minimal: false };
}
export function editThemeText(text: string, newUrl: string): { text: string; from: string | null } {
  const m = THEME_URL_RE.exec(text);
  return m ? { text: subLiteral(text, THEME_URL_RE, newUrl), from: m[0] } : { text, from: null };
}

// ── upgrade edits (vc-deploy.ts upgrade) ────────────────────────────────────────────────────────
// Same contract as the surgery above: edit the RAW text, keep EOL and indentation, and return null
// on any shape that is not recognised. Unlike `pr`, `upgrade` never falls back to a reserialize —
// a null STOPs the apply (draft §7: "keep line endings, indentation and odd whitespace exactly").
export type ManifestEditMode = 'release-bump' | 'blob-bump' | 'promote' | 'platform';
export interface ManifestChange { id: string; to: string; mode: ManifestEditMode }

const GH_SOURCE_RE = /"Name"\s*:\s*"[^"]*github[^"]*"/i;
const BLOB_SOURCE_RE = /"Name"\s*:\s*"AzureBlob"|"ServiceUri"\s*:\s*"[^"]*vc3prerelease/;
const setVersion = (l: string, v: string) => l.replace(/("Version"\s*:\s*")[^"]*(")/, (_m, a, b) => a + v + b);

/** Change the "Version" of the one GithubReleases entry whose "Id" is `id`. */
export function bumpGhReleaseText(text: string, id: string, version: string): string | null {
  const { lines, eol } = splitLines(text);
  const gh = sourceBlockRange(lines, GH_SOURCE_RE);
  if (!gh) return null;
  const idRe = new RegExp(`"Id"\\s*:\\s*"${escRe(id)}"`);
  const hits = lines.map((l, i) => (i >= gh[0] && i <= gh[1] && idRe.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) return null;
  const at = hits[0];
  if (/"Version"\s*:/.test(lines[at])) { lines[at] = setVersion(lines[at], version); return lines.join(eol); }
  const field = indentOf(lines[at]);
  for (const step of [1, -1]) {
    for (let i = at + step; i >= 0 && i < lines.length && !/^[ \t]*[{}[\]]/.test(lines[i]) && indentOf(lines[i]) === field; i += step) {
      if (/"Version"\s*:/.test(lines[i])) { lines[i] = setVersion(lines[i], version); return lines.join(eol); }
    }
  }
  return null;
}

/** Remove the one AzureBlob entry owned by `id` (by "Id" or by a "BlobName": "<id>_<digit>…"). */
export function removeBlobEntryText(text: string, id: string): string | null {
  const { lines, eol } = splitLines(text);
  const blob = sourceBlockRange(lines, BLOB_SOURCE_RE);
  if (!blob) return null;
  const own = new RegExp(`"BlobName"\\s*:\\s*"${escRe(id)}_\\d|"Id"\\s*:\\s*"${escRe(id)}"`, 'i');
  const hits = lines.map((l, i) => (i > blob[0] && i < blob[1] && own.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) return null;
  let open = -1, close = -1;
  if (/^[ \t]*\{.*\}[ \t]*,?[ \t]*$/.test(lines[hits[0]])) {          // single-line entry
    if (hits.length !== 1) return null;
    open = close = hits[0];
  } else {
    for (let i = hits[0]; i > blob[0]; i--) if (/^[ \t]*\{[ \t]*$/.test(lines[i])) { open = i; break; }
    for (let i = hits[0]; i < blob[1]; i++) if (/^[ \t]*\},?[ \t]*$/.test(lines[i])) { close = i; break; }
    if (open < 0 || close < 0 || hits.some((h) => h < open || h > close)) return null; // two entries own it → don't guess
  }
  const hadComma = /,[ \t]*$/.test(lines[close]);
  lines.splice(open, close - open + 1);
  if (!hadComma) {                                                       // it was the last element
    for (let i = open - 1; i >= 0; i--) {
      if (!/\S/.test(lines[i])) continue;
      if (/\},[ \t]*$/.test(lines[i])) lines[i] = lines[i].replace(/,([ \t]*)$/, '$1');
      break;
    }
  }
  return lines.join(eol);
}

/** Insert `{ "Id", "Version" }` as the FIRST element of GithubReleases.Modules, indented like its siblings. */
export function insertGhReleaseText(text: string, id: string, version: string): string | null {
  const { lines, eol } = splitLines(text);
  const gh = sourceBlockRange(lines, GH_SOURCE_RE);
  if (!gh) return null;
  let modAt = -1;
  for (let i = gh[0] + 1; i < gh[1]; i++) if (/"Modules"\s*:\s*\[/.test(lines[i])) { modAt = i; break; }
  if (modAt < 0 || /\]/.test(lines[modAt].replace(/"(?:\\.|[^"\\])*"/g, '""'))) return null; // one-line array → unknown shape
  const unit = detectIndentUnit(lines);
  let first = modAt + 1;
  while (first < gh[1] && !/\S/.test(lines[first])) first++;
  const empty = /^[ \t]*\][ \t]*,?[ \t]*$/.test(lines[first]);
  const brace = empty ? indentOf(lines[modAt]) + unit : indentOf(lines[first]);
  const field = !empty && /^[ \t]*\{[ \t]*$/.test(lines[first]) ? indentOf(lines[first + 1]) : brace + unit;
  lines.splice(first, 0, `${brace}{`, `${field}"Id": "${id}",`, `${field}"Version": "${version}"`, `${brace}}${empty ? '' : ','}`);
  return lines.join(eol);
}

export function editUpgradeText(text: string, changes: ManifestChange[]): { text: string } | { error: string } {
  let t: string | null = text;
  const fail = (c: ManifestChange) => ({ error: `${c.id} (${c.mode} → ${c.to}): manifest shape not recognised — no minimal edit possible` });
  for (const c of changes) {
    if (c.mode === 'platform') t = bumpPlatformText(t!, c.to, c.to);
    else if (c.mode === 'release-bump') t = bumpGhReleaseText(t!, c.id, c.to);
    else if (c.mode === 'blob-bump') t = upsertBlobEntry(t!, c.id, `${c.id}_${c.to}.zip`);
    else continue;
    if (t == null) return fail(c);
  }
  // Promotions are inserted at the top in reverse Id order, so they end up ascending.
  for (const c of changes.filter((x) => x.mode === 'promote').sort((a, b) => (a.id < b.id ? 1 : -1))) {
    t = removeBlobEntryText(t!, c.id); if (t == null) return fail(c);
    t = insertGhReleaseText(t, c.id, c.to); if (t == null) return fail(c);
  }
  return { text: t! };
}

/** Problems with `newText`, compared BY VALUE (never `!==` on arrays — bc0701f5): the pin set equals
 *  the original plus exactly `changes`, no Id newly sits in two places, and no other top-level key or
 *  source header moved. [] means the edit is exactly what was approved. */
export function verifyUpgradeEdit(origText: string, newText: string, changes: ManifestChange[]): string[] {
  let a: any, b: any;
  try { a = JSON.parse(origText); b = JSON.parse(newText); } catch (e: any) { return [`result does not parse: ${e.message}`]; }
  const problems: string[] = [];
  const before = new Map(readPins(a).pins.map((p) => [p.id, p]));
  const afterRead = readPins(b), after = new Map(afterRead.pins.map((p) => [p.id, p]));
  // A DUPLICATE already in the original is reported in the plan and never changed by it — only a new one is the edit's fault.
  const preDup = new Set(readPins(a).duplicates);
  const newDup = afterRead.duplicates.filter((id) => !preDup.has(id));
  if (newDup.length) problems.push(`Id in two places: ${newDup.join(', ')}`);
  const want = new Map<string, Pin>(before);
  for (const c of changes) {
    if (c.mode === 'platform') continue;
    want.set(c.id, { id: c.id, version: c.to, source: c.mode === 'blob-bump' ? 'AzureBlob' : 'GithubReleases' });
  }
  for (const id of new Set([...want.keys(), ...after.keys()])) {
    const w = want.get(id), g = after.get(id);
    if (!g) problems.push(`${id}: missing after the edit`);
    else if (!w) problems.push(`${id}: added by the edit`);
    else if (g.version !== w.version || g.source !== w.source) problems.push(`${id}: expected ${w.version} (${w.source}), got ${g.version} (${g.source})`);
  }
  const strip = (j: any) => ({ ...j, Sources: (j.Sources ?? []).map((s: any) => ({ ...s, Modules: undefined })) });
  const platform = changes.find((c) => c.mode === 'platform')?.to;
  const expectTop = strip({ ...a, ...(platform ? { PlatformVersion: platform, ...('PlatformImageTag' in a ? { PlatformImageTag: platform } : {}) } : {}) });
  if (JSON.stringify(expectTop) !== JSON.stringify(strip(b))) problems.push('a top-level key or a source header changed');
  return problems;
}
