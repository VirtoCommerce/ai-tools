// Changes too big to read file by file: when the report switches to a summary, and the clusters a
// review (or a split of the PR) can take one at a time.

import { suggestLenses } from "./report.mjs";
import { CLUSTER_MAX_FILES, DOMAIN_FOLDER, HUGE_DIFF_FILES, HUGE_DIFF_LINES, LAYERS, TIERS } from "./zones.mjs";

export function hugeMode(nonTrivialFiles, changedLines) {
  const why = [];
  if (nonTrivialFiles > HUGE_DIFF_FILES) why.push(`${nonTrivialFiles} non-trivial files (limit ${HUGE_DIFF_FILES})`);
  if (changedLines > HUGE_DIFF_LINES) why.push(`${changedLines} changed non-trivial lines (limit ${HUGE_DIFF_LINES})`);
  return { on: why.length > 0, reason: why.length ? why.join(", ") : null, nonTrivialFiles };
}

// The zone when the file has one, else its domain folder, else its top directory. ui-kit is one zone
// but hundreds of files in a big change, so it keys by component tier.
export function clusterKey(f) {
  const domain = f.path.match(DOMAIN_FOLDER)?.[1] ?? null;
  if (f.zone === "ui-kit") return domain ?? "ui-kit";
  if (f.zone) return f.zone;
  if (domain) return domain;
  return f.path.includes("/") ? f.path.split("/")[0] : ".";
}

function layerOf(paths) {
  const idx = Math.min(...paths.map((p) => {
    const i = LAYERS.findIndex((l) => l.re.test(p));
    return i < 0 ? LAYERS.length : i;
  }));
  return { idx, id: LAYERS[idx]?.id ?? "rest" };
}

function commonDir(paths) {
  const dirs = paths.map((p) => p.split("/").slice(0, -1));
  const out = [];
  for (let i = 0; dirs.every((d) => i < d.length && d[i] === dirs[0][i]); i++) out.push(dirs[0][i]);
  return out.join("/");
}

// A cluster over CLUSTER_MAX_FILES splits by the folder below the files' common folder
// (`shared/catalog:components`), again where a part is still too big. Small sibling parts pack back
// together up to the limit (`…:button..select`), and files that share one folder go in numbered chunks.
export function splitCluster(key, members) {
  if (members.length <= CLUSTER_MAX_FILES) return [{ key, members }];
  const dir = commonDir(members.map((f) => f.path));
  const parts = new Map();
  for (const f of members) {
    const rest = f.path.slice(dir ? dir.length + 1 : 0).split("/");
    const seg = rest.length > 1 ? rest[0] : "(root)";
    if (!parts.has(seg)) parts.set(seg, []);
    parts.get(seg).push(f);
  }
  if (parts.size === 1) return chunks(key, members);
  const sub = (seg) => `${key}${key.includes(":") ? "/" : ":"}${seg}`;
  const out = [];
  let pack = [];
  const flush = () => {
    if (!pack.length) return;
    const segs = pack.map((p) => p.seg);
    const name = segs.length === 1 ? segs[0] : segs.length <= 3 ? segs.join("+") : `${segs[0]}..${segs.at(-1)}`;
    out.push({ key: sub(name), members: pack.flatMap((p) => p.fs) });
    pack = [];
  };
  for (const [seg, fs] of parts) {
    if (fs.length > CLUSTER_MAX_FILES) out.push(...(seg === "(root)" ? chunks(sub(seg), fs) : splitCluster(sub(seg), fs)));
    else {
      if (pack.reduce((n, p) => n + p.fs.length, 0) + fs.length > CLUSTER_MAX_FILES) flush();
      pack.push({ seg, fs });
    }
  }
  flush();
  return out;
}

function chunks(key, members) {
  if (members.length <= CLUSTER_MAX_FILES) return [{ key, members }];
  const n = Math.ceil(members.length / CLUSTER_MAX_FILES);
  return Array.from({ length: n }, (_, i) => ({ key: `${key} (${i + 1}/${n})`, members: members.slice(i * CLUSTER_MAX_FILES, (i + 1) * CLUSTER_MAX_FILES) }));
}

// Non-R0, non-mechanical files as review units, in reading order: the layers others build on first
// (ui-kit, core, shared, modules, pages, the rest), the highest tier first within a layer. Each unit
// carries the lenses it calls for.
export function clusters({ files, tokens, matchedRules }) {
  const byKey = new Map();
  for (const f of files) {
    if (f.tier === 0 || f.mechanical) continue;
    const key = clusterKey(f);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f);
  }
  const units = [...byKey].flatMap(([key, members]) => splitCluster(key, members));
  const out = units.map(({ key, members }) => {
    const tier = Math.max(...members.map((f) => f.tier));
    const paths = new Set(members.map((f) => f.path));
    const lenses = suggestLenses({
      files: members,
      tier,
      tokens: tokens.filter((t) => t.definedIn.some((p) => paths.has(p))),
      matchedRules: matchedRules.map((r) => ({ file: r.file, files: r.files.filter((p) => paths.has(p)) })).filter((r) => r.files.length),
    });
    const layer = layerOf([...paths]);
    return {
      key,
      layer: layer.id,
      layerIdx: layer.idx,
      tier: TIERS[tier],
      changedLines: members.reduce((n, f) => n + f.added + f.deleted, 0),
      lenses: lenses.filter((l) => l.recommended).map((l) => l.id),
      files: [...paths],
    };
  });
  out.sort((a, b) => a.layerIdx - b.layerIdx || b.tier.localeCompare(a.tier) || a.key.localeCompare(b.key));
  return out.map(({ layerIdx, ...c }, i) => ({ order: i + 1, ...c }));
}
