#!/usr/bin/env node
/**
 * render-mind-map — the human view of a Test Mind Map. The JSON stays the only source; this is a
 * projection of it, regenerated on demand and never committed, so the picture cannot drift from the map.
 *
 *   npm run models:view -- <slug|file>                    Mermaid (mindmap + state diagram) to stdout
 *   npm run models:view -- <slug|file> --format html --out <file.html>
 *
 * WHY. The mind map answers "how can this domain behave?" for agents and `models:check`, but nobody
 * can walk a developer or a product owner through a JSON file — and scope review is what a mind map is
 * for. The tree is the `contains` / `branches_to` edges; each node carries its status and the number of
 * distinct cases that stamp it OR anything below it in the edge graph (from the same `Behavior:` stamps
 * `models:check` reads). That is deliberately not TM-014, which counts direct stamps only: a reviewer
 * asks "is this behaviour tested at all?", and a behaviour tested only through its branches is;
 * `transitions_to` edges become a state diagram, because sequence is what a radial tree cannot show.
 * `depends_on` / `affected_by` are listed per node, not drawn — cross-links are what make a drawn map
 * unreadable.
 *
 * Design of the map itself: docs/decisions/test-mind-map-and-data-model.md.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { linkedTests, loadCases, type Finding, type MapNode, type MindMap } from "./check-test-models.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MAP_DIR = join(ROOT, ".claude", "knowledge", "domain");

export interface TreeNode {
  node: MapNode;
  cases: string[];
  /** Distinct cases stamping this node or any node below it in the EDGE GRAPH (not just this tree). */
  covered: string[];
  children: TreeNode[];
}

const TREE_EDGES = new Set(["contains", "branches_to"]);

/**
 * The spanning tree of the map: roots are the nodes with no incoming tree edge (states excluded —
 * they belong to the state diagram). A node reachable twice is DRAWN once, under its first parent, but
 * its cases still count toward every parent — coverage is read off the graph, not the drawing. A node
 * the roots never reach (a cycle, or a state as its only parent) becomes a root of its own rather than
 * vanishing from the view.
 */
export function buildTree(map: MindMap, linked: Map<string, string[]>): TreeNode[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n] as const));
  const kids = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of map.edges) {
    if (!TREE_EDGES.has(e.type) || !byId.has(e.from) || !byId.has(e.to)) continue;
    kids.set(e.from, [...(kids.get(e.from) ?? []), e.to]);
    hasParent.add(e.to);
  }
  const coveredMemo = new Map<string, string[]>();
  const coveredOf = (id: string): string[] => {
    if (coveredMemo.has(id)) return coveredMemo.get(id)!;
    const out = new Set<string>();
    const stack = [id];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const c of linked.get(cur) ?? []) out.add(c);
      stack.push(...(kids.get(cur) ?? []));
    }
    coveredMemo.set(id, [...out]);
    return coveredMemo.get(id)!;
  };
  const seen = new Set<string>();
  const grow = (id: string): TreeNode => {
    seen.add(id);
    const children: TreeNode[] = [];
    for (const c of kids.get(id) ?? []) if (!seen.has(c)) children.push(grow(c));
    return { node: byId.get(id)!, cases: linked.get(id) ?? [], covered: coveredOf(id), children };
  };
  const roots = map.nodes.filter((n) => n.type !== "state" && !hasParent.has(n.id)).map((n) => grow(n.id));
  for (const n of map.nodes) if (n.type !== "state" && !seen.has(n.id)) roots.push(grow(n.id));
  return roots;
}

const MARK: Record<MapNode["status"], string> = { CONFIRMED: "", UNVERIFIED: "? ", DRIFT: "⚠ ", OBSOLETE: "✗ " };

/** Mermaid labels break on brackets, quotes and newlines; strip them rather than escape per shape. */
export function label(text: string): string {
  return text.replace(/[()[\]{}"`<>]/g, "").replace(/\s+/g, " ").trim();
}

function coverageNote(t: TreeNode): string {
  if (t.node.type !== "behavior" && t.node.type !== "branch") return "";
  if (t.node.status === "OBSOLETE") return " · obsolete";
  const k = t.covered.length;
  return k ? ` · ${k} case${k > 1 ? "s" : ""}` : " · NO CASE";
}

export function toMermaidMindmap(map: MindMap, tree: TreeNode[]): string {
  const lines = ["mindmap"];
  let i = 0;
  const emit = (t: TreeNode, depth: number) => {
    const text = `${MARK[t.node.status]}${label(t.node.name)}${coverageNote(t)}`;
    lines.push(`${"  ".repeat(depth)}${depth === 1 ? `root((${text}))` : `n${i++}[${text}]`}`);
    for (const c of t.children) emit(c, depth + 1);
  };
  // mindmap has exactly one root: a multi-root map hangs its trees under the slug.
  if (tree.length === 1) emit(tree[0], 1);
  else {
    lines.push(`  root((${label(map.domain_slug)}))`);
    for (const t of tree) emit(t, 2);
  }
  return lines.join("\n");
}

export function toMermaidStates(map: MindMap): string | null {
  const states = map.nodes.filter((n) => n.type === "state");
  const transitions = map.edges.filter((e) => e.type === "transitions_to");
  if (!states.length) return null;
  const sid = new Map(states.map((s, k) => [s.id, `s${k}`] as const));
  const byId = new Map(map.nodes.map((n) => [n.id, n] as const));
  const lines = ["stateDiagram-v2"];
  for (const s of states) lines.push(`  state "${MARK[s.status]}${label(s.name)}" as ${sid.get(s.id)}`);
  for (const e of transitions) {
    const a = sid.get(e.from);
    const b = sid.get(e.to);
    if (!a || !b) continue;
    const via = e.via && byId.get(e.via) ? ` : ${label(byId.get(e.via)!.name)}` : "";
    lines.push(`  ${a} --> ${b}${via}`);
  }
  for (const s of states) if (s.terminal) lines.push(`  ${sid.get(s.id)} --> [*]`);
  return lines.join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toHtml(map: MindMap, tree: TreeNode[]): string {
  const cross = new Map<string, string[]>();
  for (const e of map.edges) {
    if (e.type === "depends_on" || e.type === "affected_by") cross.set(e.from, [...(cross.get(e.from) ?? []), `${e.type} ${e.to}`]);
  }
  const item = (t: TreeNode, depth: number): string => {
    const n = t.node;
    const kind = n.type === "branch" && typeof n.branch_kind === "string" ? n.branch_kind : n.type;
    const cov = coverageNote(t);
    const drift = n.status === "DRIFT" && n.drift ? `<div class="drift">expected: ${esc(n.drift.expected)}<br>observed: ${esc(n.drift.observed)}<br>route: ${esc(n.drift.route ?? "—")}</div>` : "";
    const links = cross.get(n.id)?.length ? `<div class="meta">${cross.get(n.id)!.map(esc).join(" · ")}</div>` : "";
    const cases = t.cases.length ? `<div class="meta">cases: ${t.cases.map(esc).join(", ")}</div>` : "";
    const head = `<span class="st st-${n.status}">${n.status}</span> <span class="kind">${esc(kind)}</span> ${esc(n.name)}<span class="cov${cov.includes("NO CASE") ? " gap" : ""}">${esc(cov)}</span> <code>${esc(n.id)}</code>`;
    const body = `${drift}${links}${cases}${t.children.map((c) => item(c, depth + 1)).join("")}`;
    return t.children.length || body
      ? `<details${depth < 2 ? " open" : ""}><summary>${head}</summary><div class="kids">${body}</div></details>`
      : `<div class="leaf">${head}</div>`;
  };
  const states = toMermaidStates(map);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(map.domain_slug)} mind map</title>
<style>
:root{--bg:#fbfbfa;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e1dc;--ok:#2f7d4f;--unv:#8a6d00;--drift:#b3431b;--obs:#7a7a7a;--gap:#b3431b;--card:#fff}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#171716;--fg:#ecebe6;--muted:#a3a29c;--line:#34332f;--ok:#6cc58f;--unv:#e0c25a;--drift:#f08a62;--obs:#9a9a9a;--gap:#f08a62;--card:#1f1f1d}}
:root[data-theme="dark"]{--bg:#171716;--fg:#ecebe6;--muted:#a3a29c;--line:#34332f;--ok:#6cc58f;--unv:#e0c25a;--drift:#f08a62;--obs:#9a9a9a;--gap:#f08a62;--card:#1f1f1d}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 20px}
details,.leaf{margin:2px 0}.kids{margin-left:18px;padding-left:10px;border-left:1px solid var(--line)}
summary{cursor:pointer;overflow-wrap:anywhere}code{color:var(--muted);font-size:12px}
.st{font-size:11px;font-weight:600;padding:0 5px;border-radius:3px;border:1px solid currentColor}
.st-CONFIRMED{color:var(--ok)}.st-UNVERIFIED{color:var(--unv)}.st-DRIFT{color:var(--drift)}.st-OBSOLETE{color:var(--obs)}
.kind{color:var(--muted);font-size:12px}.cov{color:var(--muted)}.cov.gap{color:var(--gap);font-weight:600}
.drift{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--drift);padding:6px 10px;margin:4px 0;font-size:13px}
.meta{color:var(--muted);font-size:12px;margin:2px 0}section{margin-top:28px}.mermaid{background:var(--card);padding:12px;border:1px solid var(--line);overflow-x:auto}
</style></head><body><main>
<h1>${esc(map.domain_slug)} — test mind map</h1>
<p class="sub">Generated from the mind map JSON (domain map rev ${map.domain_map_rev}). A projection, not a source — regenerate with <code>npm run models:view</code>.</p>
${tree.map((t) => item(t, 0)).join("\n")}
${states ? `<section><h2>States and transitions</h2><pre class="mermaid">${esc(states)}</pre></section>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>try{mermaid.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"})}catch(e){}</script>` : ""}
</main></body></html>
`;
}

function resolveMap(arg: string): string {
  if (existsSync(arg)) return arg;
  const byName = join(MAP_DIR, `${arg}.mind-map.json`);
  if (existsSync(byName)) return byName;
  for (const f of readdirSync(MAP_DIR)) {
    if (!f.endsWith(".mind-map.json")) continue;
    try {
      if ((JSON.parse(readFileSync(join(MAP_DIR, f), "utf8")) as MindMap).domain_slug === arg) return join(MAP_DIR, f);
    } catch {
      // An unrelated half-written map is models:check's finding, not a reason to fail this lookup.
    }
  }
  throw new Error(`no mind map for \`${arg}\` (a slug, a basename or a path)`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const opt = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const target = argv.find((a, i) => !a.startsWith("--") && !["--format", "--out"].includes(argv[i - 1]));
  if (!target) {
    console.error("usage: npm run models:view -- <slug|file> [--format mermaid|html] [--out <file>]");
    process.exit(2);
  }
  const map = JSON.parse(readFileSync(resolveMap(target), "utf8")) as MindMap;
  const findings: Finding[] = [];
  const tree = buildTree(map, linkedTests(loadCases(findings)));
  for (const f of findings) console.error(`[models:view] ${f.code} ${f.file}: ${f.msg}`);
  const format = opt("--format") ?? "mermaid";
  if (format !== "mermaid" && format !== "html") {
    console.error(`[models:view] unknown --format \`${format}\` — use mermaid or html`);
    process.exit(2);
  }
  const text =
    format === "html" ? toHtml(map, tree) : [toMermaidMindmap(map, tree), toMermaidStates(map)].filter(Boolean).join("\n\n");
  const out = opt("--out");
  if (out) {
    writeFileSync(out, text);
    console.error(`[models:view] wrote ${out}`);
  } else console.log(text);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
