/**
 * skills/kb/fingerprint.mjs — the observation fingerprint.
 *
 * THE decision this module settles (the open question named in VCST-5818, recorded
 * in docs/adr/adr-knowledge-brain.md §D5-F): what exactly is hashed so that the SAME
 * knowledge, phrased differently by two different runs, dedups to one draft.
 *
 *   fingerprint = sha256( kind \x1f scope \x1f subjectSlug \x1f claimBag ).slice(0,16)
 *
 * The four parts, and why each is in or out:
 *
 *   kind, scope   — typed, closed vocabulary. Two facts of different kinds about the
 *                   same subject are different knowledge with different lifetimes, so
 *                   they must never merge.
 *   subjectSlug   — WHAT the observation is about (a module, a page, an endpoint, a
 *                   selector), normalized to a slug. Deliberately a SEPARATE field the
 *                   capturing agent must state, not something inferred from the prose:
 *                   it is the anchor that keeps the bag below from over-merging, and
 *                   it is the same "name the operation, do not echo the text" move
 *                   upstream-reduce.mjs makes with its SUBJECTS enum.
 *   claimBag      — the claim reduced to a SORTED, DEDUPED bag of content tokens:
 *                   lowercased, punctuation and markdown stripped, stopwords removed,
 *                   a conservative plural strip. This is what makes the hash survive
 *                   rephrasing: "the cart total excludes tax" and "cart totals exclude
 *                   the tax" reduce to the same bag.
 *   NOT hashed    — the raw prose, the run id, the evidence ref, the timestamp, the
 *                   capturing agent. Those vary per sighting by design; hashing any of
 *                   them would make every repeat observation a new draft, which is the
 *                   exact failure the dedup exists to prevent.
 *
 * Known, ACCEPTED trade-off — a sorted bag is order-insensitive, so a claim and its
 * converse over the same subject ("A blocks B" / "B blocks A") collide. Three things
 * make that survivable rather than dangerous, and they are why no fuzzier scheme was
 * chosen: (1) the merge target is a DRAFT, never a confirmed entry — nothing in
 * confirmed/ is ever rewritten by a fingerprint match; (2) every distinct raw phrasing
 * is kept in the draft's observations[] list, so a wrong merge is visible in the file
 * and in the digest rather than silent; (3) consolidation reads the claim, not the
 * hash, when it applies the evidence bar. An LLM-normalized or embedding-based key was
 * rejected for the reason D5 rejects LLMs everywhere in this pipeline: it must run
 * deterministically in a client CI with zero deps and produce the same key forever.
 *
 * Bump FINGERPRINT_VERSION if the normalization ever changes: old fingerprints stay
 * valid as tombstones, and a version change is a corpus migration, not a silent drift.
 */
import { createHash } from "node:crypto";

// Unit separator: it can never occur in a slug or in a token bag, so no two distinct
// part tuples can concatenate to the same hashed string.
const SEP = "\u001f";

export const FINGERPRINT_VERSION = 1;
/** Truncated to 16 hex chars: a filename-friendly key, ~64 bits of space. */
export const FINGERPRINT_LENGTH = 16;

/**
 * Function words carry no discriminating signal and vary most between phrasings.
 * Deliberately short and closed — an aggressive list starts deleting meaning
 * ("no", "not", "never" are NOT here, they invert a QA claim).
 */
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "of", "to",
  "in", "on", "at", "for", "from", "by", "with", "as", "that", "this", "these",
  "those", "it", "its", "and", "or", "but", "if", "then", "than", "so", "such",
  "there", "their", "them", "they", "we", "you", "our", "which", "when", "while",
  "into", "onto", "over", "under", "about", "after", "before", "does", "do", "did",
  "has", "have", "had", "will", "would", "can", "could", "should", "may", "might",
]);

/** A token: a word or a dotted version/identifier ("3.800.0", "vc-frontend" splits on "-"). */
const TOKEN_RE = /[a-z0-9]+(?:\.[a-z0-9]+)*/g;

/**
 * Conservative plural strip, applied only to tokens of 4+ characters:
 *   "carts" -> "cart", "addresses" -> "address", "boxes" -> "box"
 * and never "address" -> "addres", "status" -> "statu", "axis" -> "axi".
 *
 * The "-es" family is handled BEFORE the singular-noun guard, because the guard reads
 * the whole token: "addresses" ends in "es", not "ss", so without this branch it lost
 * one letter and became "addresse" — which then failed to dedup against "address" and
 * silently forked one observation into two drafts.
 */
function singular(token) {
  if (token.length < 4 || !token.endsWith("s")) return token;
  if (/\d$/.test(token.slice(0, -1))) return token;
  if (/(sses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2);
  if (/(ss|us|is|as|os)$/.test(token)) return token;
  return token.slice(0, -1);
}

/**
 * Normalize a free-text subject to a slug. Same shape as the telemetry collector's
 * subject slug: lowercase, non-alphanumerics collapsed to "-", trimmed, capped.
 */
export function normalizeSubject(subject) {
  return String(subject === undefined || subject === null ? "" : subject)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Reduce a claim to its sorted, deduped content-token bag.
 * @returns {string[]} tokens, sorted — the phrasing-insensitive half of the key.
 */
export function claimTokens(claim) {
  const text = String(claim === undefined || claim === null ? "" : claim)
    .toLowerCase()
    // Strip markdown emphasis/code/link syntax so `**tax**` and tax are one token.
    .replace(/[`*_~>#]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const seen = new Set();
  const matches = text.match(TOKEN_RE) || [];
  for (const raw of matches) {
    const t = singular(raw);
    if (!t || STOPWORDS.has(t) || STOPWORDS.has(raw)) continue;
    seen.add(t);
  }
  return Array.from(seen).sort();
}

/** The claim bag as a single string — the fourth hashed component. */
export const claimBag = (claim) => claimTokens(claim).join(" ");

/**
 * Fingerprint an observation.
 * @param {{kind: string, scope: string, subject: string, claim: string}} obs
 * @returns {string} 16 hex chars
 */
export function fingerprint(obs) {
  const parts = [
    String((obs && obs.kind) || ""),
    String((obs && obs.scope) || ""),
    normalizeSubject(obs && obs.subject),
    claimBag(obs && obs.claim),
  ];
  return createHash("sha256").update(parts.join(SEP)).digest("hex").slice(0, FINGERPRINT_LENGTH);
}

/** Everything the fingerprint saw, for a digest line or a test assertion. */
export function fingerprintParts(obs) {
  return {
    version: FINGERPRINT_VERSION,
    kind: String((obs && obs.kind) || ""),
    scope: String((obs && obs.scope) || ""),
    subject: normalizeSubject(obs && obs.subject),
    claimBag: claimBag(obs && obs.claim),
    fingerprint: fingerprint(obs),
  };
}
