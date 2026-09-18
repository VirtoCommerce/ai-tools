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

// The deployment pin. A running deployment has no commit, so what identifies it is the set of
// module versions it is running -- which is also exactly what has to change before any derived
// fact can change. Deterministic across runs against an unchanged deployment, which is what lets
// `kb check` byte-compare at all.
export function deploymentPin({ platformVersion, modules }) {
  const rows = [...modules.entries()]
    .filter(([, m]) => m.isInstalled)
    .map(([id, m]) => [id, m.version])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return hash({ platformVersion, modules: rows }, 16);
}

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
// with no shared state and nothing to merge. Different subjects get different ids, and a genuine
// hash collision is a hard error at build time rather than a silent merge of two facts.
export function mintId(subject, namespace = 'KB') {
  return `${namespace}-${hash(subject, 8).toUpperCase()}`;
}
