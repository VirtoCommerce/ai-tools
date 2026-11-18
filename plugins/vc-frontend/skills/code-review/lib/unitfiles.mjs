// The files review agents read. Agents have no shell, so they cannot run `git diff` themselves: the
// script writes one diff per unit, a condensed view of the whole change for the global lenses, and an
// overview for the step that maps the change before any lens runs.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rewrittenFixes, writeBaseFiles, writeFixDiffs, writeRuleFiles } from "./context.mjs";
import { git } from "./git.mjs";
import { impactMarkdown } from "./impact.mjs";
import { mechanicalLines } from "./report.mjs";
import { OVERVIEW_COMMITS } from "./zones.mjs";

const code = (s) => "`" + String(s).replace(/`/g, "'") + "`";
// Inside the link list paths drop the `client-app/` prefix: it repeats on almost every line.
const rel = (p) => p.replace(/^client-app\//, "");

function apiText(api) {
  if (!api) return "";
  return Object.entries(api)
    .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k} ${Object.entries(v).map(([side, ls]) => `${side === "added" ? "+" : "−"}[${ls.join(" | ")}]`).join(" ")}`))
    .join("; ");
}

// The whole change in a form one agent can read: what changed where, how the changed files link,
// what public API moved, and what the mechanical groups did. No diff text.
export function condensedView(r, note = null) {
  const fixes = rewrittenFixes(r);
  const files = r.files.filter((f) => !f.mechanical);
  const mech = r.files.length - files.length;
  const plus = r.files.reduce((n, f) => n + f.added, 0);
  const minus = r.files.reduce((n, f) => n + f.deleted, 0);
  const lines = [
    `# Change ${r.head} against ${r.base} (merge-base ${r.mergeBase}): risk ${r.tier}`,
    "",
    `${r.files.length} files, +${plus}/−${minus}; ${r.huge.nonTrivialFiles} non-trivial with ${r.changedLines} changed lines${mech ? `; ${mech} mechanical file(s), explained under Mechanical groups and left out below` : ""}.${r.escalation ? ` Raised one tier: ${r.escalation}.` : ""}`,
    "",
    ...(r.mode ? [`Mode ${r.mode.id}: ${r.mode.reason}.`, ""] : []),
    ...(note ? [note, ""] : []),
    "## Files",
    "",
    "| File | Status | Tier | Zone | +/− |",
    "|---|---|---|---|---|",
    ...files.map((f) => `| ${code(f.path)}${fixes.has(f.path) ? ` (rewrites a recent fix: \`fixes/${fixes.get(f.path)}.diff\`)` : ""} | ${f.status} | ${f.tier} | ${f.zone ?? "—"} | +${f.added}/−${f.deleted} |`),
  ];
  const added = files.filter((f) => f.status === "A");
  if (added.length) lines.push("", "## New files", "", ...added.map((f) => `- ${code(f.path)}`));
  if (r.changeGraph) linkLines(r, lines);
  if (r.publicSurface?.length) {
    lines.push("", `## Public surface (${r.publicSurface.length})`, "");
    for (const s of r.publicSurface) {
      lines.push(`- ${code(s.path)} (${s.status}, ${s.tier}, ${s.consumers} consumer(s)): ${s.why.join("; ")}`);
      if (s.api) lines.push(`  - API: ${apiText(s.api)}`);
    }
  }
  if (r.mechanicalGroups.length) {
    const mechLines = [];
    mechanicalLines(r, mechLines);
    lines.push(...mechLines.map((l) => l.replace(/^## Mechanical changes: one representative per group$/, "## Mechanical groups")));
  }
  return lines.join("\n") + "\n";
}

function linkLines(r, lines) {
  const { edges, crossCluster } = r.changeGraph;
  const kinds = {};
  for (const e of edges) kinds[e[2]] = (kinds[e[2]] ?? 0) + 1;
  lines.push("", `## Links between changed files (${edges.length}; ${crossCluster.length} cross-cluster)`, "");
  if (edges.length) {
    lines.push(`By kind: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}. \`import\` is a real import; the other kinds are soft links (kit tag, GraphQL name, shared rare identifier, glob loader).`, "");
    lines.push("One line per file and link kind: `from` → targets; `*` marks a target in another cluster; paths without `client-app/`.", "");
    const cross = new Set(crossCluster.map((e) => e.join("\n")));
    const grouped = new Map();
    for (const e of edges) {
      const key = `${e[0]}\n${e[2]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(`${code(rel(e[1]))}${cross.has(e.join("\n")) ? "*" : ""}${e[3] ? ` (${code(e[3])})` : ""}`);
    }
    for (const [key, targets] of grouped) {
      const [from, kind] = key.split("\n");
      lines.push(`- ${code(rel(from))} → ${kind}: ${targets.join(", ")}`);
    }
  } else lines.push("None found.");
}

// The condensed view plus the clusters, the flows, the files no link explains and the PR's commits.
export function overview(r, subjects) {
  const lines = [condensedView(r, "Base versions in `base/` (each changed file as it was at the merge-base), the impact map in `impact.md`, review rules as at the merge-base in `rules/`, and the earlier fix a file rewrites in `fixes/<sha>.diff` (named in the file table).").trimEnd()];
  lines.push("", `## Clusters (${r.clusters.length})`, "", "| # | Cluster | Layer | Tier | Files | Changed lines | Lenses |", "|---|---|---|---|---|---|---|");
  for (const c of r.clusters) lines.push(`| ${c.order} | ${code(c.key)} | ${c.layer} | ${c.tier} | ${c.files.length} | ${c.changedLines} | ${c.lenses.join(", ") || "—"} |`);
  if (r.flows) flowLines(r, lines);
  lines.push("", `## Commits (${Math.min(subjects.length, OVERVIEW_COMMITS)}${subjects.length > OVERVIEW_COMMITS ? ` of ${subjects.length}` : ""})`, "", ...subjects.slice(0, OVERVIEW_COMMITS).map((s) => `- ${s}`));
  return lines.join("\n") + "\n";
}

function flowLines(r, lines) {
  lines.push("", `## Flows (${r.flows.length})`, "");
  if (!r.flows.length) lines.push("No two changed files link to each other.");
  for (const f of r.flows) {
    lines.push(`- **${f.id}** ${f.tier}, ${f.files.length} files, links: ${Object.entries(f.edgeKinds).map(([k, n]) => `${k} ${n}`).join(", ")}; zones: ${f.zones.join(", ") || "—"}; clusters: ${f.clusters.map(code).join(", ")}`);
    if (!f.parts) lines.push(`  - ${f.files.map(code).join(", ")}`);
    for (const [i, pt] of (f.parts ?? []).entries()) lines.push(`  - part ${i + 1} (${pt.files.length}${pt.hubs.length ? `, via hubs ${pt.hubs.map(code).join(", ")}` : ""}): ${pt.files.map(code).join(", ")}`);
  }
  const g = r.graphCoverage;
  lines.push("", `## Changed code files with no link (${g.orphans.length} of ${g.codeFiles})`, "");
  if (g.warning) lines.push(`> ${g.warning}.`, "");
  lines.push(g.orphans.length ? g.orphans.map((p) => `- ${code(p)}`).join("\n") : "None.");
}

// L and XL: one `git diff` per diff unit, the condensed view per global unit, and overview.md.
// S and M have no units: overview.md and full.diff, every non-mechanical file, which each lens reads
// whole. Paths go after `--`, so a file name never reads as an option or a revision.
// Every mode also gets base/<path> (each changed file as it was), fixes/<sha>.diff, rules/ and impact.md.
export function writeUnitsDir(dir, r, { fullMergeBase, diff = (files) => git(["diff", "--no-renames", `${fullMergeBase}..HEAD`, "--", ...files]), subjects = null, show, showFix, questions = [] } = {}) {
  mkdirSync(dir, { recursive: true });
  const condensed = condensedView(r);
  const written = [];
  if (!r.units) {
    const all = r.files.filter((f) => !f.mechanical).map((f) => f.path);
    // An empty path list would make `git diff` print the whole change, mechanical files included.
    writeFileSync(path.join(dir, "full.diff"), all.length ? diff(all) : "");
    written.push("full.diff");
  }
  for (const u of r.units ?? []) {
    if (!u.diffFile) continue;
    const text = u.diffFile.endsWith(".md") ? condensed : diff(u.files);
    writeFileSync(path.join(dir, u.diffFile), text);
    written.push(u.diffFile);
  }
  const commits = subjects ?? git(["log", "--format=%s", `${fullMergeBase}..HEAD`]).split("\n").filter(Boolean);
  writeFileSync(path.join(dir, "overview.md"), overview(r, commits));
  written.push("overview.md");
  written.push(...writeBaseFiles(dir, r, fullMergeBase, show));
  written.push(...writeFixDiffs(dir, r, showFix));
  written.push(...writeRuleFiles(dir, r, fullMergeBase, show));
  writeFileSync(path.join(dir, "impact.md"), impactMarkdown(r.impact ?? []));
  written.push("impact.md");
  writeFileSync(path.join(dir, "questions.md"), questionsMarkdown(r, questions));
  written.push("questions.md");
  return written;
}

// questions.md: only the risk questions this change matched, in full, each with the files it matched,
// so the reviewer reads a few questions instead of the whole list.
export function questionsMarkdown(r, questions) {
  const filesOf = new Map();
  for (const f of r.files) for (const id of f.questions ?? []) filesOf.set(id, [...(filesOf.get(id) ?? []), f.path]);
  const matched = questions.filter((q) => filesOf.has(q.id));
  const lines = [
    "# Risk questions this change matched",
    "",
    "Answer each yes or no for the files listed under it. The question is the rule; the examples show how it broke here before. A change that fits the question without resembling any example is still a yes.",
  ];
  for (const q of matched) {
    const fs = filesOf.get(q.id);
    lines.push("", q.text, "", `Files: ${fs.slice(0, 12).map((p) => `\`${p}\``).join(", ")}${fs.length > 12 ? `, … (${fs.length})` : ""}`);
  }
  if (!matched.length) lines.push("", "No question matched.");
  return lines.join("\n") + "\n";
}
