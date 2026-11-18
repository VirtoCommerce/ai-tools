#!/usr/bin/env node
// Risk tier of a branch's change in a vc-frontend checkout (upstream or a theme fork).
//
//   node classify.mjs [--base <ref>] [--json] [--out <file>] [--no-graph]
//
// Run from anywhere inside the checkout; HEAD must be the branch under review. The diff is
// merge-base(<base>, HEAD)..HEAD, committed changes only. The module graph comes from the
// repository's own dependency-cruiser, so fan-out is what the bundler resolves, not a grep.
// Prints Markdown, or the full result as JSON with --json. --out writes the full JSON to a file and
// prints the Markdown; for a huge change that Markdown is a summary. Exit 0 on success, 2 on bad input.
//
// Zones, signals and thresholds live in lib/zones.mjs.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { globMatch } from "./lib/globs.mjs";
import { changedFiles, defaultBase, exactRenames, git, readHead, whitespaceOnly } from "./lib/git.mjs";
import { facadeExportSet, moduleGraph } from "./lib/graph.mjs";
import { clusters, hugeMode } from "./lib/huge.mjs";
import { markMechanical, parseGeneratedAttributes } from "./lib/mechanical.mjs";
import { loadQuestions, matchQuestions, pathScopedRules } from "./lib/questions.mjs";
import { hugeMarkdown, markdown, suggestLenses } from "./lib/report.mjs";
import { gitReader, markStyling, tokenChanges, visualCheck } from "./lib/styling.mjs";
import { classifyFile } from "./lib/tier.mjs";
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

// One `git diff` each for exact renames and whitespace-only files; renames need an add and a delete.
const statuses = new Set(files.map((f) => f.status));
const mechanicalGroups = markMechanical(files, hunks, {
  renames: statuses.has("A") && statuses.has("D") ? exactRenames(mergeBase) : [],
  whitespace: whitespaceOnly(mergeBase),
  generatedGlobs: parseGeneratedAttributes(readHead(".gitattributes")),
  facadeExports: ctx.facadeExports,
});

const result = {
  base: baseRef,
  mergeBase: mergeBase.slice(0, 9),
  head,
  tier: TIERS[tier],
  escalation,
  huge,
  changedLines,
  zones,
  files: files.map(({ tier: t, ...rest }) => ({ tier: TIERS[t], ...rest })),
  questions: [...new Set(files.flatMap((f) => f.questions))],
  tokens,
  visual,
  rules: matchedRules,
  lenses,
  clusters: clusters({ files, tokens, matchedRules }),
  mechanicalGroups,
  warnings,
};

const json = JSON.stringify(result, null, 2) + "\n";
if (outFile) writeFileSync(outFile, json);
process.stdout.write(args.json ? json : huge.on ? hugeMarkdown(result, outFile) : markdown(result));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") out.base = argv[++i];
    else if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--out") out.out = argv[++i] ?? fail("--out needs a file name.");
    else if (argv[i] === "--no-graph") out.noGraph = true;
    else fail(`Unknown argument: ${argv[i]}`);
  }
  return out;
}

function fail(msg) {
  process.stderr.write(msg + "\n");
  process.exit(2);
}
