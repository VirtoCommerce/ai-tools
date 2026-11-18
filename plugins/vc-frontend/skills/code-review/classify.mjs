#!/usr/bin/env node
// Risk tier of a branch's change in a vc-frontend checkout (upstream or a theme fork).
//
//   node classify.mjs [--base <ref>] [--json] [--out <file>] [--no-graph] [--units-dir <dir>] [--lenses a,b] [--budget n]
//
// Run from anywhere inside the checkout; HEAD must be the branch under review. The diff is
// merge-base(<base>, HEAD)..HEAD, committed changes only. The module graph comes from the
// repository's own dependency-cruiser, so fan-out is what the bundler resolves, not a grep.
// Prints Markdown, or the full result as JSON with --json. --out writes the full JSON to a file and
// prints the Markdown; for a huge change that Markdown is a summary. Exit 0 on success, 2 on bad input.
// --units-dir writes the files review agents read, since they have no shell: overview.md, impact.md,
// base/<path>, rules/ and fixes/<sha>.diff always; for L and XL one diff per review unit and the
// condensed view for the global lenses, for S and M one full.diff. --lenses picks the lenses that get units;
// by default the recommended ones. --budget overrides the mode's review-agent budget for the plan.
//
// Zones, signals and thresholds live in lib/zones.mjs.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { changeGraph, flows, graphCoverage } from "./lib/changegraph.mjs";
import { rulesWarning } from "./lib/context.mjs";
import { globMatch } from "./lib/globs.mjs";
import { changedFiles, defaultBase, exactRenames, git, readHead, whitespaceOnly } from "./lib/git.mjs";
import { facadeExportSet, moduleGraph } from "./lib/graph.mjs";
import { changeMode, clusters, hugeMode, reviewGates } from "./lib/huge.mjs";
import { impactMap } from "./lib/impact.mjs";
import { markMechanical, parseGeneratedAttributes } from "./lib/mechanical.mjs";
import { reviewPlan } from "./lib/plan.mjs";
import { loadQuestions, matchQuestions, pathScopedRules } from "./lib/questions.mjs";
import { hugeMarkdown, markdown, suggestLenses } from "./lib/report.mjs";
import { gitReader, markStyling, tokenChanges, visualCheck } from "./lib/styling.mjs";
import { publicSurface } from "./lib/surface.mjs";
import { classifyFile } from "./lib/tier.mjs";
import { writeUnitsDir } from "./lib/unitfiles.mjs";
import { buildUnits } from "./lib/units.mjs";
import { BIG_DIFF_FILES, BIG_DIFF_LINES, TIERS } from "./lib/zones.mjs";

const args = parseArgs(process.argv.slice(2));
const outFile = args.out ? path.resolve(args.out) : null;
const root = git(["rev-parse", "--show-toplevel"]).trim();
process.chdir(root);

const baseRef = args.base ?? defaultBase() ?? fail("No --base given and none of origin/dev, origin/main, origin/master exists.");
const mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
const head = git(["rev-parse", "--short", "HEAD"]).trim();
const warnings = [];
if (git(["status", "--porcelain", "--untracked-files=no"]).trim()) {
  warnings.push("Uncommitted changes are not part of the classified diff, but the module graph reads the working tree.");
}

const { files, hunks } = changedFiles(mergeBase);
if (!files.length) fail(`No committed changes between ${baseRef} and HEAD.`);

const ctx = { mergeBase, warnings, graph: null, facadeExports: new Set(), commits: new Map() };
ctx.graph = args.noGraph ? null : moduleGraph(ctx);
if (!ctx.graph && !args.noGraph) warnings.push("dependency-cruiser did not run: fan-out and external exposure are unknown, tiers come from paths only.");
if (ctx.graph) ctx.facadeExports = facadeExportSet(ctx.graph);
const rules = pathScopedRules();

for (const f of files) classifyFile(ctx, f);
const read = gitReader(mergeBase, files);
for (const f of files) markStyling(f, read);
const questionSet = loadQuestions(warnings);
for (const f of files) f.questions = matchQuestions(questionSet, f);
const tokens = tokenChanges(files);
const visual = visualCheck(files, tokens, mergeBase);

const codeFiles = files.filter((f) => f.tier >= 1 && f.zone !== "generated" && f.zone !== "build-version");
const changedLines = codeFiles.reduce((n, f) => n + f.added + f.deleted, 0);
let tier = Math.max(...files.map((f) => f.tier));
let escalation = null;
if (changedLines > BIG_DIFF_LINES || codeFiles.length > BIG_DIFF_FILES) {
  escalation = `big change: ${changedLines} changed lines in ${codeFiles.length} non-trivial files (limits ${BIG_DIFF_LINES} / ${BIG_DIFF_FILES}); big diffs get reviewed worse by models and by people`;
  tier = Math.min(3, tier + 1);
}
const huge = hugeMode(codeFiles.length, changedLines);

const zones = [...new Set(files.filter((f) => f.tier >= 2).map((f) => f.zone).filter(Boolean))];
const matchedRules = rules
  .map((r) => ({ file: r.file, files: files.filter((f) => f.tier >= 1 && r.globs.some((g) => globMatch(g, f.path))).map((f) => f.path) }))
  .filter((r) => r.files.length);
const lenses = suggestLenses({ files, tier, tokens, matchedRules });
const unknownLens = args.lenses?.find((id) => !lenses.some((l) => l.id === id));
if (unknownLens) fail(`Unknown lens in --lenses: ${unknownLens}. Lenses: ${lenses.map((l) => l.id).join(", ")}.`);

// One `git diff` each for exact renames and whitespace-only files; renames need an add and a delete.
const statuses = new Set(files.map((f) => f.status));
const mechanicalGroups = markMechanical(files, hunks, {
  renames: statuses.has("A") && statuses.has("D") ? exactRenames(mergeBase) : [],
  whitespace: whitespaceOnly(mergeBase),
  generatedGlobs: parseGeneratedAttributes(readHead(".gitattributes")),
  facadeExports: ctx.facadeExports,
});

// How the changed files link, and the units each lens reads: only when the final mode is L or XL. An
// S or M change is read whole by every lens, so the graph, the soft-link greps and the per-unit diffs
// would be waste.
const clusterList = clusters({ files, tokens, matchedRules });
const mode = changeMode(files, huge, clusterList.length);
const split = ["L", "XL"].includes(mode.id);
const clusterOf = new Map(clusterList.flatMap((c) => c.files.map((p) => [p, c.key])));
const cg = split ? changeGraph({ graph: ctx.graph, files, clusterOf }) : null;
const flowList = split ? flows(cg, files, clusterOf) : null;
const surface = split ? publicSurface(files, read) : null;
// Every mode: a small change in a critical file is judged by what it touches.
const impact = impactMap(files, hunks, { read: readHead, graph: ctx.graph });
const units = split ? buildUnits({ files, clusters: clusterList, flows: flowList, surface, lenses, clusterOf, chosen: args.lenses }) : null;

const plan = reviewPlan({
  mode,
  chosen: args.lenses ?? lenses.filter((l) => l.recommended).map((l) => l.id),
  units,
  files,
  tier: TIERS[tier],
  budget: args.budget,
});

// Reviewers read rules/ from the merge-base; say so when the change edits them.
const rulesNote = args.unitsDir ? rulesWarning({ rules: matchedRules, files }) : null;
if (rulesNote) warnings.push(rulesNote);

const result = {
  base: baseRef,
  mergeBase: mergeBase.slice(0, 9),
  head,
  tier: TIERS[tier],
  escalation,
  mode,
  gates: reviewGates(files),
  huge,
  changedLines,
  zones,
  files: files.map(({ tier: t, ...rest }) => ({ tier: TIERS[t], ...rest })),
  questions: [...new Set(files.flatMap((f) => f.questions))],
  tokens,
  visual,
  rules: matchedRules,
  lenses,
  clusters: clusterList,
  mechanicalGroups,
  changeGraph: cg,
  flows: flowList,
  graphCoverage: cg && graphCoverage(cg),
  publicSurface: surface,
  units,
  plan,
  impact,
  warnings,
};

const json = JSON.stringify(result, null, 2) + "\n";
if (outFile) writeFileSync(outFile, json);
if (args.unitsDir) writeUnitsDir(args.unitsDir, result, { fullMergeBase: mergeBase });
process.stdout.write(args.json ? json : huge.on ? hugeMarkdown(result, outFile) : markdown(result));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i];
    else if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--out") out.out = argv[++i] ?? fail("--out needs a file name.");
    else if (argv[i] === "--no-graph") out.noGraph = true;
    else if (argv[i] === "--units-dir") out.unitsDir = path.resolve(argv[++i] ?? fail("--units-dir needs a directory."));
    else if (argv[i] === "--budget") {
      out.budget = Number.parseInt(argv[++i], 10);
      if (!(out.budget > 0)) fail("--budget needs a positive number.");
    }
    else if (argv[i] === "--lenses") out.lenses = (argv[++i] ?? fail("--lenses needs a list.")).split(",").map((l) => l.trim()).filter(Boolean);
    else fail(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

function fail(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}
