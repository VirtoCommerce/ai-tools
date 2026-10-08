// WHAT WAS TRUE OF THE STAND when an observation was made (VCST-6179).
//
// A `deployment` names WHERE; it does not say what that stand was running or how it was set up, and
// two observations of one behaviour on one stand can disagree for exactly that reason. Measured on
// the base 2026-10-08: 58 of 532 active entries were disputed, 92 of the 137 dispute notes named a
// build, a PR or a setting in PROSE, and only 146 of 1,197 evidence items carried a structured
// `platformVersion`. A judge settling a dispute had to re-read paragraphs to learn whether the two
// sides even looked at the same thing.
//
// So an evidence item may carry `conditions`: `key=value` pairs, `; `-joined into ONE scalar because
// the frontmatter subset is flat (frontmatter.mjs). The keys are the writer's, in the shape the
// contract recommends (`platform`, `theme`, `module:<Id>`, `setting:<Name>`, `store`, `role`) -- not
// a closed list, because the setting that decides a behaviour is not known until somebody finds it.
//
// REFUSED, NEVER TRUNCATED, unlike `note`: a cut pair is a WRONG pair (`theme=2.59` from
// `theme=2.59.0-pr-2476`), and a wrong condition is worse than none -- it is what a judge scopes an
// entry by.

export const CONDITIONS_MAX = 600;
const KEY = /^[A-Za-z][\w.:@/-]{0,79}$/;
const VALUE_MAX = 160;

/**
 * `raw` -- a string (`k=v; k=v`, `;` or newline separated) or a list of `k=v` -- to the one canonical
 * spelling, or the reason it is unusable. Empty is not a problem: the field is optional.
 */
export function normalizeConditions(raw) {
  const parts = (Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [])
    .flatMap((s) => s.split(/[;\n]/))
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { value: null, problem: null };
  const seen = new Set();
  const pairs = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    const key = eq > 0 ? p.slice(0, eq).trim() : '';
    const value = eq > 0 ? p.slice(eq + 1).trim() : '';
    if (!key || !value) return { value: null, problem: `"${p.slice(0, 40)}" is not key=value` };
    if (!KEY.test(key)) return { value: null, problem: `key "${key.slice(0, 40)}" must start with a letter and hold no spaces` };
    if (value.length > VALUE_MAX) return { value: null, problem: `the value of ${key} is over ${VALUE_MAX} characters -- a condition, not a note` };
    if (seen.has(key.toLowerCase())) return { value: null, problem: `${key} is given twice` };
    seen.add(key.toLowerCase());
    pairs.push(`${key}=${value}`);
  }
  const value = pairs.join('; ');
  if (value.length > CONDITIONS_MAX) return { value: null, problem: `over ${CONDITIONS_MAX} characters -- name the conditions that decide the behaviour, not the whole stand` };
  return { value, problem: null };
}

/** The canonical string back to `{key: value}`, for comparing two observations. */
export function parseConditions(text) {
  const out = {};
  for (const p of String(text ?? '').split(';')) {
    const eq = p.indexOf('=');
    if (eq > 0) out[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
  }
  return out;
}
