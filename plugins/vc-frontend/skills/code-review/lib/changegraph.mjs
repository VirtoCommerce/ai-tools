// How the changed files connect: which of them import or otherwise reach each other, the flows that
// come out of that, and how much of the change the links explain. A review split only by folder
// loses the picture for cross-cutting lenses: a checkout step, the composable it calls and the
// payment processor it renders sit in three clusters but break together.

import { readHead } from "./git.mjs";
import { consumersThroughBarrels, isBarrel } from "./graph.mjs";
import { globEdges, graphqlEdges, identifierEdges, tagEdges } from "./softedges.mjs";
import { CODE_FILE, FLOW_UNIT_MAX_FILES, ORPHAN_WARN_SHARE, TIERS } from "./zones.mjs";

// Changed files a review reads: not R0, not mechanical. Code and GraphQL files carry the import and
// soft links; stylesheets and JSON schemas join through a glob loader.
export function changeNodes(files) {
  return files.filter((f) => f.tier >= 1 && !f.mechanical);
}

// Hard edges: one changed file imports another in the dependency-cruiser graph. Through a barrel the
// importer must name one of the target's exports, the rule the consumer lists use. A changed barrel
// links to the changed files it re-exports, through nested barrels too.
export function importEdges(g, nodes) {
  if (!g) return [];
  const out = [];
  for (const b of nodes) {
    if (!CODE_FILE.test(b)) continue;
    for (const c of consumersThroughBarrels(g, b).consumers) if (c !== b && nodes.has(c)) out.push([c, b, "import"]);
    if (!isBarrel(b)) continue;
    const seen = new Set([b]);
    const queue = [...(g.deps.get(b) ?? [])];
    while (queue.length) {
      const d = queue.shift();
      if (seen.has(d)) continue;
      seen.add(d);
      if (nodes.has(d)) out.push([b, d, "import"]);
      else if (isBarrel(d)) queue.push(...(g.deps.get(d) ?? []));
    }
  }
  return out;
}

// { nodes, edges: [from, to, kind, via?], crossCluster }. A pair already joined by an import keeps
// only that edge; a pair joined softly keeps one edge per kind.
export function changeGraph({ graph, files, clusterOf, read = readHead, soft = {} }) {
  const nodeFiles = changeNodes(files);
  const nodes = new Set(nodeFiles.map((f) => f.path));
  const pair = (a, b) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);
  const hard = new Set();
  const edges = [];
  for (const e of importEdges(graph, nodes)) {
    if (hard.has(pair(e[0], e[1]))) continue;
    hard.add(pair(e[0], e[1]));
    edges.push(e);
  }
  const softEdges = [
    ...(soft.tag ?? tagEdges)(nodeFiles, read),
    ...(soft.graphql ?? graphqlEdges)(nodeFiles, read),
    ...(soft.identifier ? soft.identifier(nodeFiles) : identifierEdges(nodeFiles)),
    ...(soft.glob ? soft.glob(nodeFiles, read) : globEdges(nodeFiles, read)),
  ];
  const seenSoft = new Set();
  for (const e of softEdges) {
    const key = `${pair(e[0], e[1])}\n${e[2]}`;
    if (e[0] === e[1] || hard.has(pair(e[0], e[1])) || seenSoft.has(key)) continue;
    seenSoft.add(key);
    edges.push(e);
  }
  edges.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  const crossCluster = edges.filter(([a, b]) => clusterOf.get(a) !== clusterOf.get(b));
  return { nodes: [...nodes].sort(), edges, crossCluster };
}

// Connected components over the given nodes, edges taken both ways, each sorted.
export function components(nodes, edges) {
  const parent = new Map(nodes.map((n) => [n, n]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const [a, b] of edges) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  const groups = new Map();
  for (const n of nodes) {
    const r = find(n);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(n);
  }
  return [...groups.values()].map((g) => g.sort());
}

// A big component is usually a few hubs (a utilities barrel, a snapshot module, the app runner) that
// many unrelated files touch. Taking out the most linked file until every piece fits one flow unit
// gives the strands that actually run through the change. Each part keeps the hubs it links to: they
// are what joins it to the rest, and the reviewer of the part needs their diff.
export function flowParts(paths, edges, max = FLOW_UNIT_MAX_FILES) {
  if (paths.length <= max) return null;
  const inFlow = new Set(paths);
  const local = edges.filter(([a, b]) => inFlow.has(a) && inFlow.has(b));
  const hubs = [];
  let left = new Set(paths);
  for (;;) {
    const live = local.filter(([a, b]) => left.has(a) && left.has(b));
    const big = components([...left], live).filter((c) => c.length > max);
    if (!big.length) break;
    for (const c of big) {
      const inC = new Set(c);
      const degree = new Map(c.map((n) => [n, 0]));
      for (const [a, b] of live) if (inC.has(a) && inC.has(b)) [a, b].forEach((n) => degree.set(n, degree.get(n) + 1));
      const hub = [...degree].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0];
      hubs.push(hub);
      left.delete(hub);
    }
  }
  const hubSet = new Set(hubs);
  const hubsOf = (fs) => {
    const set = new Set(fs);
    return [...new Set(local.flatMap(([a, b]) => (set.has(a) && hubSet.has(b) ? [b] : set.has(b) && hubSet.has(a) ? [a] : [])))].sort();
  };
  // Files left alone once the hubs are out go with the first hub they touch.
  const parts = [];
  const byHub = new Map();
  for (const c of components([...left], local)) {
    if (c.length >= 2) parts.push(c);
    else {
      const h = hubsOf(c)[0] ?? "";
      if (!byHub.has(h)) byHub.set(h, []);
      byHub.get(h).push(c[0]);
    }
  }
  parts.push(...byHub.values());
  return parts.map((fs) => ({ files: fs.sort(), hubs: hubsOf(fs) })).sort((a, b) => b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));
}

// Connected components of the change graph with two or more files. Highest tier first, then the
// biggest: the flows a cross-cutting lens reads whole. A flow too big for one unit carries its parts.
export function flows(cg, files, clusterOf) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out = components(cg.nodes, cg.edges)
    .filter((g) => g.length >= 2)
    .map((paths) => {
      const set = new Set(paths);
      const fs = paths.map((p) => byPath.get(p));
      const edgeKinds = {};
      for (const e of cg.edges) if (set.has(e[0])) edgeKinds[e[2]] = (edgeKinds[e[2]] ?? 0) + 1;
      return {
        tierN: Math.max(...fs.map((f) => f.tier)),
        files: paths.sort(),
        zones: [...new Set(fs.map((f) => f.zone).filter(Boolean))].sort(),
        clusters: [...new Set(paths.map((p) => clusterOf.get(p)).filter(Boolean))].sort(),
        edgeKinds,
        ...(paths.length > FLOW_UNIT_MAX_FILES ? { parts: flowParts(paths, cg.edges) } : {}),
      };
    });
  out.sort((a, b) => b.tierN - a.tierN || b.files.length - a.files.length || a.files[0].localeCompare(b.files[0]));
  return out.map(({ tierN, ...f }, i) => ({ id: `f${i + 1}`, tier: TIERS[tierN], ...f }));
}

// Changed code files that no edge of any kind touches. When they are most of the change, the graph
// does not explain it, and whoever maps the change has to name the links by reading.
export function graphCoverage(cg) {
  const linked = new Set(cg.edges.flatMap(([a, b]) => [a, b]));
  const code = cg.nodes.filter((p) => CODE_FILE.test(p));
  const orphans = code.filter((p) => !linked.has(p));
  const orphanShare = code.length ? Math.round((orphans.length / code.length) * 100) / 100 : 0;
  const warning =
    code.length >= 2 && orphanShare > ORPHAN_WARN_SHARE
      ? `${orphans.length} of ${code.length} changed code files (${Math.round(orphanShare * 100)}%) have no import, tag, GraphQL, identifier or glob link to another changed file: the graph does not explain this change, so the map step must name the missing links`
      : null;
  return { codeFiles: code.length, orphans, orphanShare, warning };
}
