// Changes too big to read file by file: when the report switches to a summary, and the clusters a
// review (or a split of the PR) can take one at a time.

import { suggestLenses } from "./report.mjs";
import { CLUSTER_MAX_FILES, DOMAIN_FOLDER, HUGE_DIFF_FILES, HUGE_DIFF_LINES, LAYERS, MODE_CRITICAL_ZONES, MODE_L_CRITICAL_ZONES, MODE_L_EXPOSED_FILES, MODE_L_LAYERS, MODE_M_FILES, MODE_M_LINES, MODE_S_FILES, MODE_S_LINES, TIERS } from "./zones.mjs";

export function hugeMode(nonTrivialFiles, changedLines) {
  const why = [];
  if (nonTrivialFiles > HUGE_DIFF_FILES) why.push(`${nonTrivialFiles} non-trivial files (limit ${HUGE_DIFF_FILES})`);
  if (changedLines > HUGE_DIFF_LINES) why.push(`${changedLines} changed non-trivial lines (limit ${HUGE_DIFF_LINES})`);
  return { on: why.length > 0, reason: why.length ? why.join(", ") : null, nonTrivialFiles };
}

// How much machinery the review needs. A small, contained change is read whole by every lens;
// splitting it into units, flows and a link graph costs more than it saves. Size sets the first guess
// over the non-trivial part (not R0, not mechanical); risk and spread then move it, in this order:
//   1. an R3 file needs at least M: one cheap pass is not enough for it;
//   2. several critical zones, several layers or several publicly visible files need at least L: the
//      links between them are where it breaks, and only L and XL build the graph;
//   3. R1 files in one cluster need at most M: nothing in them reaches far;
//   4. a huge change is XL whatever else holds.
// clusterCount: review clusters, which hold exactly the non-trivial files.
const MODES = ["S", "M", "L", "XL"];
export function changeMode(files, huge, clusterCount) {
  const nonTrivial = files.filter((f) => f.tier >= 1 && !f.mechanical);
  const lines = nonTrivial.reduce((n, f) => n + f.added + f.deleted, 0);
  let mode = nonTrivial.length <= MODE_S_FILES && lines <= MODE_S_LINES ? "S" : nonTrivial.length <= MODE_M_FILES && lines <= MODE_M_LINES ? "M" : "L";
  const why = [`size ${mode} (${nonTrivial.length} non-trivial file(s), ${lines} line(s))`];
  const atLeast = (m, rule) => {
    if (MODES.indexOf(mode) >= MODES.indexOf(m)) return;
    mode = m;
    why.push(`${rule} → ${m}`);
  };
  const r3 = nonTrivial.filter((f) => f.tier === 3).length;
  if (r3) atLeast("M", `${r3} R3 file(s)`);
  const zones = [...new Set(nonTrivial.map((f) => f.zone).filter((z) => MODE_CRITICAL_ZONES.includes(z)))];
  const layers = [...new Set(nonTrivial.map((f) => LAYERS.find((l) => l.re.test(f.path))?.id).filter(Boolean))];
  const exposed = nonTrivial.filter((f) => f.external.length).length;
  if (zones.length >= MODE_L_CRITICAL_ZONES) atLeast("L", `zones ${zones.join("+")}`);
  if (layers.length >= MODE_L_LAYERS) atLeast("L", `layers ${layers.join("+")}`);
  if (exposed >= MODE_L_EXPOSED_FILES) atLeast("L", `${exposed} publicly visible file(s)`);
  if (!huge.on && nonTrivial.length && nonTrivial.every((f) => f.tier === 1) && clusterCount === 1 && MODES.indexOf(mode) > 1) {
    mode = "M";
    why.push("all R1 in one cluster → M");
  }
  if (huge.on) {
    mode = "XL";
    why.push(`huge (${huge.reason}) → XL`);
  }
  return { id: mode, reason: why.join("; ") };
}

// Changes with nothing for the code lenses to read: say which, and what review is left.
export function reviewGates(files) {
  if (files.some((f) => f.tier >= 1 && !f.mechanical)) return [];
  const r0 = files.some((f) => f.tier === 0 && !f.mechanical);
  const mech = files.some((f) => f.mechanical);
  if (!mech) return [{ id: "r0-only", lenses: ["trivial"], note: "only R0 files (tests, stories, docs, locales, assets, version bump): run the trivial lens alone" }];
  if (!r0) return [{ id: "mechanical-only", lenses: [], note: "only mechanical files: review the mechanical groups (one representative each), no lens" }];
  return [{ id: "no-non-trivial", lenses: ["trivial"], note: "no non-trivial file: only R0 and mechanical files; run the trivial lens and review the mechanical groups" }];
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
