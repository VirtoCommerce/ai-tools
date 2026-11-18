// The lenses a change calls for, and the Markdown the user reads.

import { planLine } from "./plan.mjs";
import { CODE_FILE, HUGE_DIFF_FILES, HUGE_DIFF_LINES, HUGE_LARGEST_FILES, HUGE_TOP_FILES, TIERS, TRIVIAL_KINDS } from "./zones.mjs";

// files: classified files; tier: the change's tier as a number; tokens and matchedRules as in the result.
export function suggestLenses({ files, tier, tokens, matchedRules }) {
  const nonTrivial = files.filter((f) => f.tier >= 1);
  const touched = (id) => files.some((f) => f.zone === id || f.reaches?.zone === id);
  const out = [];
  const add = (id, on, why) => out.push({ id, recommended: Boolean(on), why });

  add("correctness", nonTrivial.length, "bugs, broken UI states, races, edge cases in the changed lines");
  const exposed = files.filter((f) => f.consumers.length || f.external.length);
  add("consumers", tier >= 2 && exposed.length, exposed.length ? `${exposed.length} changed file(s) have consumers or are visible outside the repo` : "no file with consumers");
  const added = files.filter((f) => f.status === "A" && CODE_FILE.test(f.path) && f.tier >= 1);
  add("architecture", tier >= 2 || added.length, added.length ? `${added.length} new code file(s): is each in the right layer and folder` : "layer boundaries and patterns others will copy");
  const addedCode = nonTrivial.filter((f) => CODE_FILE.test(f.path)).reduce((n, f) => n + f.added, 0);
  add("design", tier >= 2 && addedCode >= 80, `${addedCode} added code lines: responsibilities, coupling, reuse instead of duplication`);
  add("conventions", matchedRules.length && nonTrivial.length, matchedRules.length ? `${matchedRules.length} path-scoped rule file(s) apply` : "no path-scoped rules match");
  add("security", files.some((f) => ["html-injection", "federation", "ci"].includes(f.zone)) || touched("auth") || touched("company") || touched("commerce") || touched("content"), "auth, permissions, untrusted HTML, payment, CI or the plugin boundary");
  add("commerce", touched("commerce") || touched("add-to-cart") || touched("context-switch"), "money, cart state, checkout steps, what goes into the cart");
  const styled = files.filter((f) => f.styling);
  add("styles", styled.length || tokens.length || touched("styles"), styled.length ? `${styled.length} file(s) change classes, <style> blocks or tokens${tokens.length ? `; ${tokens.length} token(s)` : ""}` : "design-system conformity: BEM, tokens, Tailwind, designs, presets, dark mode");
  const kitFiles = files.filter((f) => f.zone === "ui-kit" && f.tier >= 1);
  add("ui-kit", kitFiles.length, kitFiles.length ? `${kitFiles.length} ui-kit file(s): public API for forks and plugins` : "no ui-kit file changed");
  const templates = files.filter((f) => f.path.endsWith(".vue") && f.tier >= 1 && f.added + f.deleted > f.styling);
  add("ui", templates.length || files.some((f) => f.zone === "locales"), "accessibility and i18n of changed templates and messages");
  add("tests", files.some((f) => f.zone === "tests"), "weakened or deleted assertions, tests rewritten to fit new behaviour");
  // R0 files skip every other lens; one cheap pass still catches a stray change hidden among them.
  const r0 = files.filter((f) => f.tier === 0);
  add("trivial", r0.length, r0.length ? `${r0.length} R0 file(s) to sweep in one pass: ${kindCounts(r0)}` : "no R0 file (tests, stories, docs, locales, assets, version bump)");
  add("clean-code", false, "naming, dead code, complexity beyond the written rules; noisy, on request only");
  add("performance", false, "Apollo queries and cache, reactivity, bundle size; on request");
  return out;
}

function kindCounts(r0) {
  const counts = new Map();
  for (const f of r0) {
    const kind = TRIVIAL_KINDS[f.zone] ?? f.zone ?? "other";
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => `${kind} (${n})`)
    .join(", ");
}

const byRisk = (a, b) => b.tier.localeCompare(a.tier) || a.path.localeCompare(b.path);
const consumerCell = (f) => (f.consumers.length ? `${f.consumers.length}: ${f.consumers.slice(0, 4).map((c) => "`" + c + "`").join(", ")}${f.consumers.length > 4 ? ", …" : ""}` : "—");
const fileRow = (f) => `| ${f.tier} | \`${f.path}\` (${f.status}, +${f.added}/−${f.deleted}) | ${f.reasons.join("; ")} | ${consumerCell(f)} | ${f.external.join("; ") || "—"} |`;
const FILE_HEADER = ["| Tier | File | Why | Consumers | Visible outside |", "|---|---|---|---|---|"];

function header(r, lines) {
  lines.push(`# Risk ${r.tier} — ${r.head} against ${r.base} (merge-base ${r.mergeBase})`, "");
  if (r.mode) lines.push(`Mode ${r.mode.id}: ${r.mode.reason}.`, "");
  if (r.plan) lines.push(planLine(r.plan), "");
  for (const g of r.gates ?? []) lines.push(`Gate **${g.id}**: ${g.note}.`, "");
  if (r.escalation) lines.push(`Raised one tier: ${r.escalation}.`, "");
}

function footer(r, lines) {
  lines.push("", "## Lenses", "");
  for (const l of r.lenses) lines.push(`- [${l.recommended ? "x" : " "}] **${l.id}** — ${l.why}`);
  if (r.rules.length) {
    lines.push("", "## Path-scoped rules that apply", "");
    for (const rule of r.rules) lines.push(`- \`${rule.file}\`: ${rule.files.length} file(s)`);
  }
  unitLines(r, lines);
}

// How the review splits: units per lens, how the changed files link, what is public.
function unitLines(r, lines) {
  if (!r.units) return;
  const per = new Map();
  for (const u of r.units) if (u.id) per.set(u.lens, (per.get(u.lens) ?? 0) + 1);
  const offered = r.units.filter((u) => u.recommended === false && u.units);
  const g = r.graphCoverage;
  lines.push("", "## Review units", "");
  lines.push(`- Units: ${[...per].map(([l, n]) => `${l} ${n}`).join(", ") || "none"}${offered.length ? `; on request: ${offered.map((u) => `${u.lens} ${u.units}`).join(", ")}` : ""}.`);
  lines.push(`- ${r.flows.length} flow(s)${r.flows.length ? ` (${r.flows.slice(0, 8).map((f) => f.files.length).join(", ")}${r.flows.length > 8 ? ", …" : ""} files)` : ""}; ${r.changeGraph.edges.length} link(s) between changed files, ${r.changeGraph.crossCluster.length} across clusters; ${r.publicSurface.length} public file(s).`);
  lines.push(`- ${g.orphans.length} of ${g.codeFiles} changed code file(s) link to no other changed file.${g.warning ? ` **${g.warning}.**` : ""}`);
}

function warningLines(r, lines) {
  for (const w of r.warnings) lines.push(`> ${w}`);
  if (r.warnings.length) lines.push("");
}

export function markdown(r) {
  const lines = [];
  header(r, lines);
  warningLines(r, lines);
  lines.push(...FILE_HEADER);
  const sorted = [...r.files].sort(byRisk);
  for (const f of sorted) lines.push(fileRow(f));
  if (r.questions.length) {
    lines.push("", "## Risk questions matched", "");
    for (const f of sorted) if (f.questions?.length) lines.push(`- \`${f.path}\`: ${f.questions.join(", ")}`);
  }
  mechanicalLines(r, lines);
  footer(r, lines);
  return lines.join("\n") + "\n";
}

const code = (s) => "`" + String(s).replace(/`/g, "'") + "`";
const capped = (items, n, fmt = code) => items.slice(0, n).map(fmt).join(", ") + (items.length > n ? `, … (${items.length} in all)` : "");

export function mechanicalLines(r, lines) {
  if (!r.mechanicalGroups?.length) return;
  lines.push("", "## Mechanical changes: one representative per group", "");
  for (const g of r.mechanicalGroups) {
    if (g.kind === "repeated") {
      lines.push(`- **${g.id}** repeated (${g.match}), ${g.count} file(s): ${g.explanation}. Representative: ${code(g.representative)}.`);
      lines.push(`  - before: ${g.before.length ? g.before.map(code).join(" ") : "—"}`, `  - after: ${g.after.length ? g.after.map(code).join(" ") : "—"}`);
      if (g.outliers.length) lines.push(`  - same edit plus more (stay in review): ${capped(g.outliers, 10)}`);
      lines.push(`  - files: ${capped(g.files, 5)}`);
    } else if (g.kind === "generated") {
      lines.push(`- **${g.id}** generated (${g.what}), ${g.count} file(s)${g.suspicious ? ", **suspicious**" : ""}: ${g.explanation}.`);
      if (g.sources.length) lines.push(`  - sources: ${capped(g.sources, 5)}`);
      lines.push(`  - files: ${capped(g.files, 5)}`);
    } else if (g.kind === "rename") {
      lines.push(`- **rename**, ${g.count} file(s): ${g.explanation}: ${capped(g.pairs, 5, (p) => `${code(p.from)} → ${code(p.to)}`)}`);
    } else {
      lines.push(`- **${g.kind}**, ${g.count} file(s): ${g.explanation}: ${capped(g.files, 5)}`);
    }
  }
}

const size = (f) => f.added + f.deleted;

// A huge change: its size, clusters, mechanical groups and the riskiest files instead of every file.
export function hugeMarkdown(r, outFile) {
  const lines = [];
  header(r, lines);
  lines.push(
    `Huge change: ${r.huge.reason}. ${outFile ? `Full result: \`${outFile}\`.` : "Run with --out <file> for the full result."} Review it cluster by cluster in the order below, and one representative per mechanical group.`,
    "",
    `Size: ${r.huge.nonTrivialFiles} non-trivial files (huge above ${HUGE_DIFF_FILES}) with ${r.changedLines} changed lines (huge above ${HUGE_DIFF_LINES}); ${r.files.length} files in all.`,
    "",
    "| Largest files | +/− | Tier | Mechanical |",
    "|---|---|---|---|",
  );
  const largest = [...r.files].sort((a, b) => size(b) - size(a) || a.path.localeCompare(b.path)).slice(0, HUGE_LARGEST_FILES);
  for (const f of largest) lines.push(`| \`${f.path}\` | +${f.added}/−${f.deleted} | ${f.tier} | ${f.mechanical ?? "—"} |`);
  lines.push("");
  warningLines(r, lines);

  lines.push("## Files by tier", "", "| Tier | Files | Changed lines |", "|---|---|---|");
  for (const t of [...TIERS].reverse()) {
    const fs = r.files.filter((f) => f.tier === t);
    if (fs.length) lines.push(`| ${t} | ${fs.length} | ${fs.reduce((n, f) => n + size(f), 0)} |`);
  }
  lines.push("", "## Files by zone", "", "| Zone | Files | Highest tier |", "|---|---|---|");
  const zones = new Map();
  for (const f of r.files) {
    const z = f.zone ?? "(no zone)";
    const cur = zones.get(z) ?? { n: 0, tier: "R0" };
    zones.set(z, { n: cur.n + 1, tier: f.tier > cur.tier ? f.tier : cur.tier });
  }
  for (const [z, { n, tier }] of [...zones].sort((a, b) => b[1].tier.localeCompare(a[1].tier) || b[1].n - a[1].n || a[0].localeCompare(b[0]))) lines.push(`| ${z} | ${n} | ${tier} |`);

  lines.push("", `## Clusters in reading order (${r.clusters.length})`, "", "| # | Cluster | Layer | Tier | Files | Changed lines | Lenses |", "|---|---|---|---|---|---|---|");
  for (const c of r.clusters) lines.push(`| ${c.order} | \`${c.key}\` | ${c.layer} | ${c.tier} | ${c.files.length} | ${c.changedLines} | ${c.lenses.join(", ") || "—"} |`);

  mechanicalLines(r, lines);

  const top = r.files
    .filter((f) => !f.mechanical && f.tier !== "R0")
    .sort((a, b) => b.tier.localeCompare(a.tier) || b.consumers.length - a.consumers.length || size(b) - size(a) || a.path.localeCompare(b.path))
    .slice(0, HUGE_TOP_FILES);
  lines.push("", `## Highest-risk files (${top.length} shown)`, "", ...FILE_HEADER);
  for (const f of top) lines.push(fileRow(f));
  if (r.questions.length) lines.push("", `${r.questions.length} risk question(s) matched; per file in the JSON (\`files[].questions\`).`);
  footer(r, lines);
  return lines.join("\n") + "\n";
}
