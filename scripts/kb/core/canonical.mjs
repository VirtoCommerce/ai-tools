import { createHash } from 'node:crypto';

// Key order is what makes a hash a drift sensor rather than a formatting sensor: the same
// contract serialized twice must hash the same, or every regeneration flags everything.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function hash(value, length = 12) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, length);
}

// A BUILD, as the kb records it (VCST-6221): the platform version, the installed modules and the
// theme, in one canonical shape -- module ids sorted, absent parts null -- so the same build hashes the
// same from every writer and `builds/<pin>.json` is content-addressed. A running deployment has no
// commit; what identifies it is what it runs, which is also what has to change before an observed
// behaviour can. (Replaces `deploymentPin`, which nothing called.)
export function canonicalBuild({ platform = null, theme = null, modules = {} } = {}) {
  const sorted = {};
  for (const id of Object.keys(modules ?? {}).sort((a, b) => a.localeCompare(b))) sorted[id] = String(modules[id]);
  return { platform: platform ? String(platform) : null, theme: theme ? String(theme) : null, modules: sorted };
}

export const buildPin = (build) => hash(canonicalBuild(build), 16);

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// The id is DERIVED from the subject, not allocated from a counter.
//
// A counter needs a single writer to hand out the next number, which is exactly what a base written
// by several people's agents does not have. A timestamp does not fix that -- it makes it worse: two
// agents recording the SAME fact would mint two different ids and the base would hold the fact
// twice, which is the drift this project keeps paying for. For a knowledge base you want two
// independent captures of one fact to COLLIDE, not to avoid each other.
//
// Hashing the subject gives that for free: same subject, same id, on any machine, in any order,
// with no shared state and nothing to merge.
//
// THE ID IS 32 BITS, AND THIS COMMENT USED TO PROMISE MORE THAN THAT BUYS. It read: "a genuine hash
// collision is a hard error at build time rather than a silent merge of two facts." There is no
// build step here, and nothing checked. An independent review brute-forced two unrelated subjects
// onto one id in seconds and drove the push with them: the newcomer's evidence was appended to the
// INCUMBENT's entry and its claim was written nowhere.
//
// The birthday probability is ~1.4e-6 at 109 entries and ~0.3% at 5,000, so widening the id is not
// worth the churn of re-addressing a live corpus. What was worth fixing is the ASSURANCE: `push.mjs`
// now compares the two subjects and REFUSES a collision between different ones instead of merging
// them. A reassuring comment outlives the code it describes, so this one says what is actually
// guaranteed — same subject, same id; different subjects with one id are caught at push, not
// impossible.
export function mintId(subject, namespace = 'KB') {
  return `${namespace}-${hash(subject, 8).toUpperCase()}`;
}

// A STAND'S NAME, folded on SPELLING only: case, and `-` / whitespace against `_`.
//
// This is not the normaliser `stand()` in verbs.mjs refuses to be. That refusal is about MAPPING
// one name onto another (`vcst` onto `vcst_qa`), which needs a table nobody owns. `vcst-qa` and
// `vcst_qa` are not two beliefs about which stand it was -- they are one name typed two ways, and
// the rule that joins them is derived from the string alone, so there is nothing to transcribe.
// Measured on the published base 2026-09-25 (`grep -h "deployment:" entries/*.md | sort | uniq -c`):
// 69 `vcst-qa` against 43 `vcst_qa`, one entry carrying both, so every per-stand count split one
// stand in two. `_` is the form the repo's own env names use (`vcptcore_stable`, `vcptcore_qa1`).
export function canonicalStand(name) {
  return String(name).trim().toLowerCase().replace(/[\s-]+/g, '_');
}
