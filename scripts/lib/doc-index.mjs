// Shared text helpers for the derived-index generators — `gen-knowledge-index.mjs` (knowledge/README.md)
// and `gen-doc-indexes.mjs` (the README rosters). One copy, so a fix to the sentence cut, the
// truncation or the marker splice reaches both indexes instead of drifting between two forks.

/**
 * Abbreviations that end in a dot without ending a sentence. Shielded before the sentence cut and
 * restored after it. Case-insensitive, so a description opening "E.g." is not cut at the "E.g.".
 */
const ABBREV = /\b(e\.g|i\.e|incl|approx|cf|esp|resp|viz|vs)\./gi;
// "etc." is ambiguous: mid-sentence in "A, B, etc. and C", a real sentence end in "A, B, etc. Writes…".
// A following capital decides it.
const ETC = /\betc\.(?!\s+[A-Z])/gi;
const SHIELD = "\u0000";

/**
 * The first sentence of already-cleaned prose (at least 25 chars, so a short lead-in such as
 * "Note." is not the whole sentence), cut at `max` chars on a word boundary with an ellipsis.
 */
export function firstSentence(text, max) {
  let t = String(text ?? "")
    .replace(ABBREV, `$1${SHIELD}`)
    .replace(ETC, `etc${SHIELD}`);
  const m = t.match(/^(.{25,}?[.!?])(\s|$)/);
  if (m) t = m[1];
  t = t.replace(new RegExp(SHIELD, "g"), ".");
  if (t.length > max) t = t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return t;
}

/**
 * Split a markdown file into its frontmatter source and its body. `fm` is null when the file does not
 * open with a `---` fence line, or the fence is never closed.
 */
export function splitFrontmatter(text) {
  const open = text.match(/^---\r?\n/);
  if (!open) return { fm: null, body: text };
  const end = text.indexOf("\n---", open[0].length - 1);
  if (end === -1) return { fm: null, body: text };
  return { fm: text.slice(open[0].length, end), body: text.slice(end + 4) };
}

/**
 * Replace the span from `begin` through `end` (markers included) with `block`. Returns null when either
 * marker is missing or they are out of order; otherwise the span as it stands and the text with it
 * replaced, so a caller can compare `current` with `block` (check mode) or write `next` (write mode).
 */
export function spliceBlock(text, begin, end, block) {
  const bi = text.indexOf(begin);
  const ei = text.indexOf(end);
  if (bi === -1 || ei === -1 || ei < bi) return null;
  const stop = ei + end.length;
  return { current: text.slice(bi, stop), next: text.slice(0, bi) + block + text.slice(stop) };
}
