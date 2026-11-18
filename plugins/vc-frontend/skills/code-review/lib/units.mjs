// Review units: what each lens agent reads. Lenses differ in the picture they need (see LENS_KINDS),
// so the change is cut per lens kind, not one way for all. Review agents have no shell, so every unit
// names a diff file the script writes for it (see unitfiles.mjs).

import { clusterKey, splitCluster } from "./huge.mjs";
import { CONSUMER_UNIT_MAX_FILES, FLOW_LENS_MATCH, FLOW_UNIT_MAX_FILES, LENS_KINDS, TIERS, TRIVIAL_KINDS } from "./zones.mjs";

const reviewable = (f) => !f.mechanical;

// Fixed-size slices, for lists that have no folder structure worth keeping (public files, flow singles).
function slices(paths, max) {
  const out = [];
  for (let i = 0; i < paths.length; i += max) out.push(paths.slice(i, i + max));
  return out;
}

// A flow over FLOW_UNIT_MAX_FILES splits along its clusters (each at most CLUSTER_MAX_FILES), packed
// back together up to the cap, so the files that sit together stay together.
export function splitFlow(files, clusterOf, max = FLOW_UNIT_MAX_FILES) {
  if (files.length <= max) return [files];
  const byCluster = new Map();
  for (const p of files) {
    const k = clusterOf.get(p) ?? "";
    if (!byCluster.has(k)) byCluster.set(k, []);
    byCluster.get(k).push(p);
  }
  const out = [];
  let pack = [];
  for (const ps of byCluster.values()) {
    for (const part of slices(ps, max)) {
      if (pack.length + part.length > max) {
        out.push(pack);
        pack = [];
      }
      pack.push(...part);
    }
  }
  if (pack.length) out.push(pack);
  return out;
}

// Parts of a big flow as units: a part over the cap splits along clusters, small ones share a unit.
export function packParts(parts, clusterOf, max = FLOW_UNIT_MAX_FILES) {
  const out = [];
  let pack = [];
  for (const ps of [...parts].sort((a, b) => b.length - a.length)) {
    if (ps.length > max) {
      out.push(...splitFlow(ps, clusterOf, max));
      continue;
    }
    if (pack.length + ps.length > max) {
      out.push(pack);
      pack = [];
    }
    pack.push(...ps);
  }
  if (pack.length) out.push(pack);
  return out;
}

// Whether a file is what a flow lens is about: its zone, the critical zone that renders it, a matched
// question (SEC-* for security), or a content signal (payment, cart mutations for commerce).
export function matchesFlowLens(lens, f) {
  const m = FLOW_LENS_MATCH[lens];
  if (!m) return false;
  if (m.zones.includes(f.zone) || m.zones.includes(f.reaches?.zone)) return true;
  if (m.questions && (f.questions ?? []).some((q) => m.questions.test(q))) return true;
  return Boolean(m.reasons && f.reasons.some((r) => m.reasons.includes(r)));
}

// Raw units for one lens: [{ scope, files }].
function lensParts(lens, ctx) {
  const { files, clusters, flows, surface, clusterOf } = ctx;
  const kind = LENS_KINDS[lens];
  if (kind === "global") return [{ scope: "whole change (condensed view)", files: files.filter((f) => f.tier >= 1 && reviewable(f)).map((f) => f.path) }];
  if (kind === "consumers") {
    const pub = new Set(surface.map((s) => s.path));
    // With nothing public, the files that still have consumers are what the lens can check.
    const picked = pub.size ? files.filter((f) => pub.has(f.path)) : files.filter((f) => f.tier >= 1 && reviewable(f) && f.consumers.length);
    const order = new Map(clusters.map((c) => [c.key, c.order]));
    const paths = picked.map((f) => f.path).sort((a, b) => (order.get(clusterOf.get(a)) ?? 1e9) - (order.get(clusterOf.get(b)) ?? 1e9) || a.localeCompare(b));
    return slices(paths, CONSUMER_UNIT_MAX_FILES).map((ps, i, all) => ({ scope: `public files${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`, files: ps }));
  }
  if (kind === "flow") {
    const byPath = new Map(files.map((f) => [f.path, f]));
    const out = [];
    const inFlow = new Set();
    const hit = (ps) => ps.some((p) => matchesFlowLens(lens, byPath.get(p)));
    for (const fl of flows) {
      for (const p of fl.files) inFlow.add(p);
      if (!hit(fl.files)) continue;
      // A big flow goes by its parts, only those the lens is about (through their own files or their
      // hubs), small parts packed together; the hubs of those parts form units of their own, since
      // they are what every part shares and repeating them in each unit would crowd the parts out.
      let chunks = [];
      if (fl.parts) {
        const used = fl.parts.filter((pt) => hit([...pt.files, ...pt.hubs]));
        chunks = packParts(used.map((pt) => pt.files), clusterOf);
        const hubs = [...new Set(used.flatMap((pt) => pt.hubs))].sort();
        chunks.push(...splitFlow(hubs, clusterOf).filter((ps) => ps.length));
      } else chunks = splitFlow(fl.files, clusterOf);
      chunks.forEach((ps, i) => out.push({ scope: `flow ${fl.id}${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ""}`, files: ps }));
    }
    const single = files.filter((f) => f.tier >= 1 && reviewable(f) && !inFlow.has(f.path) && matchesFlowLens(lens, f)).map((f) => f.path);
    slices(single, FLOW_UNIT_MAX_FILES).forEach((ps, i, all) => out.push({ scope: `files in no flow${all.length > 1 ? ` (${i + 1}/${all.length})` : ""}`, files: ps }));
    return out;
  }
  if (lens === "trivial") return grouped(files.filter((f) => f.tier === 0 && reviewable(f)), (f) => TRIVIAL_KINDS[f.zone] ?? f.zone ?? "other");
  // Test files sit in the "tests" zone; they group by the folder of the code they test instead.
  if (lens === "tests") return grouped(files.filter((f) => f.zone === "tests" && reviewable(f)), (f) => clusterKey({ ...f, zone: null }));
  if (lens === "ui-kit") return grouped(files.filter((f) => f.zone === "ui-kit" && f.tier >= 1 && reviewable(f)), (f) => f.path.match(/^client-app\/ui-kit\/(components\/[^/]+|[^/]+)/)?.[1] ?? "ui-kit");
  // Local lenses read the clusters that call for them; a lens no cluster calls for (one run on
  // request) reads them all.
  const calling = clusters.filter((c) => c.lenses.includes(lens));
  const out = (calling.length ? calling : clusters).map((c) => ({ scope: `cluster ${c.key}`, files: c.files }));
  if (lens === "ui") out.push(...grouped(files.filter((f) => f.zone === "locales" && reviewable(f)), () => "locales"));
  return out;
}

function grouped(fs, keyOf) {
  const by = new Map();
  for (const f of fs) {
    const k = keyOf(f);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(f);
  }
  return [...by]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flatMap(([k, members]) => splitCluster(k, members))
    .map(({ key, members }) => ({ scope: key, files: members.map((f) => f.path) }));
}

// lenses: suggestLenses output; chosen: lens ids to emit units for (default: the recommended ones).
// Every other lens gets one { lens, kind, recommended: false, units } entry, so the orchestrator can
// offer it with its cost, and rerun with --lenses to get its diff files.
export function buildUnits({ files, clusters, flows, surface, lenses, clusterOf, chosen = null }) {
  const pick = new Set(chosen ?? lenses.filter((l) => l.recommended).map((l) => l.id));
  const byPath = new Map(files.map((f) => [f.path, f]));
  const ctx = { files, clusters, flows, surface, clusterOf };
  const out = [];
  for (const l of lenses) {
    const kind = LENS_KINDS[l.id] ?? "local";
    const parts = lensParts(l.id, ctx).filter((p) => p.files.length);
    if (!pick.has(l.id)) {
      out.push({ lens: l.id, kind, recommended: false, units: parts.length });
      continue;
    }
    parts.forEach((p, i) => {
      const id = `${l.id}-${i + 1}`;
      const tier = TIERS[Math.max(...p.files.map((f) => byPath.get(f)?.tier ?? 0))];
      out.push({ id, lens: l.id, kind, scope: p.scope, files: p.files, tier, diffFile: `${id}.${kind === "global" ? "md" : "diff"}` });
    });
  }
  return out;
}
