// render-mind-map — the derivations only: the tree the edges imply, the coverage note derived from
// stamps, the labels Mermaid can parse, and the state diagram. The pilot maps are the gate's to own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, label, toMermaidMindmap, toMermaidStates, toHtml } from "../maintenance/render-mind-map.ts";
import type { MapNode, MindMap } from "../maintenance/check-test-models.ts";

const n = (id: string, extra: Partial<MapNode> = {}): MapNode => ({ id, type: "behavior", name: `name ${id}`, status: "CONFIRMED", evidence: [], ...extra });
const map: MindMap = {
  domain_slug: "x",
  domain_map_rev: 2,
  nodes: [
    n("x.f", { type: "feature", name: "Feature (root)" }),
    n("x.a"),
    n("x.a.neg", { type: "branch", branch_kind: "negative", status: "DRIFT", drift: { expected: "E", observed: "O", route: "VCST-1" } }),
    n("x.b", { status: "UNVERIFIED" }),
    n("x.s1", { type: "state", name: "Draft" }),
    n("x.s2", { type: "state", name: "Done", terminal: true }),
  ],
  edges: [
    { from: "x.f", to: "x.a", type: "contains" },
    { from: "x.f", to: "x.b", type: "contains" },
    { from: "x.a", to: "x.a.neg", type: "branches_to" },
    { from: "x.b", to: "x.a.neg", type: "branches_to" },
    { from: "x.b", to: "x.a", type: "depends_on" },
    { from: "x.s1", to: "x.s2", type: "transitions_to", via: "x.a" },
  ],
};
const linked = new Map([["x.a", ["C-1", "C-2"]]]);

test("the tree follows contains/branches_to only, draws a shared node once, and leaves states out", () => {
  const [root, ...rest] = buildTree(map, linked);
  assert.equal(rest.length, 0);
  assert.equal(root.node.id, "x.f");
  assert.deepEqual(root.children.map((c) => c.node.id), ["x.a", "x.b"]);
  assert.deepEqual(root.children[0].children.map((c) => c.node.id), ["x.a.neg"]);
  assert.deepEqual(root.children[1].children, [], "x.a.neg already drawn under x.a; depends_on is not a tree edge");
  assert.deepEqual(root.children[0].cases, ["C-1", "C-2"]);
});

test("coverage is read off the edge graph: a shared branch counts for BOTH parents, each case once", () => {
  const m: MindMap = { ...map, edges: [...map.edges, { from: "x.b", to: "x.b.pos", type: "branches_to" }], nodes: [...map.nodes, n("x.b.pos", { type: "branch", branch_kind: "happy" })] };
  const tree = buildTree(m, new Map([["x.a", ["C-1"]], ["x.a.neg", ["C-1", "C-3"]], ["x.b.pos", ["C-4"]]]));
  assert.deepEqual([...tree[0].children[0].covered].sort(), ["C-1", "C-3"]);
  // x.a.neg is DRAWN under x.a only, but x.b branches_to it too, so its C-1/C-3 count for x.b
  assert.deepEqual([...tree[0].children[1].covered].sort(), ["C-1", "C-3", "C-4"]);
  assert.match(toMermaidMindmap(m, tree), /\[\? name x\.b · 3 cases\]/);
});

test("a node the roots never reach is drawn as its own root; an OBSOLETE node is not a gap", () => {
  const m: MindMap = {
    ...map,
    nodes: [...map.nodes, n("x.c1"), n("x.c2", { status: "OBSOLETE" })],
    edges: [...map.edges, { from: "x.c1", to: "x.c2", type: "contains" }, { from: "x.c2", to: "x.c1", type: "branches_to" }],
  };
  const tree = buildTree(m, new Map());
  assert.deepEqual(tree.map((t) => t.node.id), ["x.f", "x.c1"], "the cycle is not silently dropped");
  const mm = toMermaidMindmap(m, tree);
  assert.match(mm, /\[✗ name x\.c2 · obsolete\]/);
  assert.ok(!/x\.c2 · NO CASE/.test(mm));
});

test("mindmap marks status and coverage, and strips what breaks Mermaid", () => {
  assert.equal(label('a (b) [c] "d"\n e'), "a b c d e");
  const mm = toMermaidMindmap(map, buildTree(map, linked));
  assert.match(mm, /^mindmap\n {2}root\(\(Feature root\)\)/);
  assert.match(mm, /\[name x\.a · 2 cases\]/);
  assert.match(mm, /\[⚠ name x\.a\.neg · NO CASE\]/);
  assert.match(mm, /\[\? name x\.b · NO CASE\]/);
});

test("several roots hang under the slug, because a Mermaid mindmap has exactly one root", () => {
  const two: MindMap = { ...map, edges: map.edges.filter((e) => e.to !== "x.b") };
  assert.match(toMermaidMindmap(two, buildTree(two, linked)), /^mindmap\n {2}root\(\(x\)\)\n {4}n0\[/);
});

test("transitions become a state diagram labelled by their via node; a terminal state ends", () => {
  const sd = toMermaidStates(map)!;
  assert.match(sd, /state "Draft" as s0/);
  assert.match(sd, /s0 --> s1 : name x\.a/);
  assert.match(sd, /s1 --> \[\*\]/);
  assert.equal(toMermaidStates({ ...map, nodes: map.nodes.filter((x) => x.type !== "state") }), null);
});

test("html carries the drift record, the cross-links and escapes names", () => {
  const m = { ...map, nodes: map.nodes.map((x) => (x.id === "x.b" ? { ...x, name: "<b>" } : x)) };
  const html = toHtml(m, buildTree(m, linked));
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /route: VCST-1/);
  assert.match(html, /depends_on x\.a/);
  assert.ok(!html.includes("<b></"), "names are escaped");
});
