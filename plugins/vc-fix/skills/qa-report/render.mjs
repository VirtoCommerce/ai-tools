#!/usr/bin/env node
// /qa-report renderer — ONE pipeline's machine record → the tracker comment (within the template's
// char budget) + the HTML page. Posts NOTHING; posting, the publish gate and the yes/no are the
// skill's (SKILL.md). Templates and budgets: ./templates/*.md front-matter — never restated.
//
//   node render.mjs --kind test       --source reports/tickets/<S>/<T>/summary.json              --out <dir>
//   node render.mjs --kind fix        --source reports/tickets/<S>/<T>/verification-summary.json --out <dir> [--dialect wiki]
//   node render.mjs --kind regression --source reports/regression/<REG-…>   --verdict GO          --out <dir> [--ticket K] [--bugs K1,K2]
//   node render.mjs --kind smoke      --source reports/regression/<SMOKE-…> --verdict NO_GO       --out <dir>
//   common: --lede "<1-3 sentences>" (required) [--title T] [--extra file.json] [--set KEY=VALUE]...
//           [--page-url URL] [--dialect markdown|wiki|html] [--images ref|embed] [--json]
// Exit: 0 ok · 2 bad input/source · 3 over the comment budget with every list already at one item.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTemplate, fitBudget, toWiki, toHtml, BudgetError } from "./lib/template.mjs";
import { fromQaTest, fromVerifyFix, fromRun, applyExtras, requireLede, templateData, readJson, SourceError } from "./lib/model.mjs";
import { renderPage } from "./lib/page.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KINDS = ["test", "fix", "regression", "smoke"];
const DIALECTS = { markdown: [s => s, "md"], wiki: [toWiki, "wiki"], html: [toHtml, "html"] };

export function parseArgs(argv) {
  const a = { sets: {}, bugs: [], dialect: "markdown", images: "ref" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => { const x = argv[++i]; if (x === undefined) throw new SourceError(`${k} needs a value`); return x; };
    if (k === "--kind") a.kind = v();
    else if (k === "--source") a.source = v();
    else if (k === "--verdict") a.verdict = v();
    else if (k === "--ticket") a.ticket = v();
    else if (k === "--bugs") a.bugs = v().split(",").map(s => s.trim()).filter(Boolean);
    else if (k === "--title") a.title = v();
    else if (k === "--lede") a.lede = v();          // D7 — required; beats --extra.lede
    else if (k === "--extra") a.extra = v();
    else if (k === "--set") {
      const [key, ...rest] = v().split("=");
      if (!key || !rest.length) throw new SourceError("--set expects KEY=VALUE");
      a.sets[key] = rest.join("=");
    }
    else if (k === "--page-url") a.pageUrl = v();
    else if (k === "--dialect") a.dialect = v();
    else if (k === "--images") a.images = v();
    else if (k === "--out") a.out = v();
    else if (k === "--json") a.json = true;
    else throw new SourceError(`unknown argument ${k}`);
  }
  if (!KINDS.includes(a.kind)) throw new SourceError(`--kind must be one of ${KINDS.join(" | ")}`);
  if (!a.source) throw new SourceError("--source is required");
  if (!a.out) throw new SourceError("--out <dir> is required");
  if (!(a.dialect in DIALECTS)) throw new SourceError(`--dialect must be one of ${Object.keys(DIALECTS).join(" | ")}`);
  if (!["ref", "embed"].includes(a.images)) throw new SourceError("--images must be ref | embed");
  if ((a.kind === "regression" || a.kind === "smoke") && !a.verdict) {
    throw new SourceError(`--verdict is required for ${a.kind} (GO | CONDITIONAL_GO | NO_GO): a run folder records no machine verdict`);
  }
  return a;
}

function load(a) {
  const src = resolve(a.source);
  let m = a.kind === "test" ? fromQaTest(src)
    : a.kind === "fix" ? fromVerifyFix(src)
    : fromRun(src, a.kind, a.verdict, a.ticket ?? null);
  if (a.kind === "regression" || a.kind === "smoke") m = { ...m, bugs: a.bugs.map(key => ({ key, severity: "", relation: "" })) };
  m = applyExtras(m, a.extra ? readJson(resolve(a.extra)) : {}, a.sets);
  if (a.title) m.title = a.title;
  if (a.lede) m.lede = a.lede;                      // D7 — the flag wins over --extra.lede
  if (a.pageUrl) m.pageUrl = a.pageUrl;
  return m;
}

export function render(a) {
  const tpl = parseTemplate(readFileSync(join(HERE, "templates", `comment-${a.kind}.md`), "utf8"));
  // D7: validated after load() (so --lede and --extra.lede have both been applied) and before
  // fitBudget, so an over-long lede is named as such instead of surfacing as a budget failure.
  const model = requireLede(load(a), tpl.meta.lede_max);
  const comment = fitBudget(tpl, templateData(model, a.dialect), DIALECTS[a.dialect][0]);
  const page = renderPage(readFileSync(join(HERE, "templates", "page.html"), "utf8"), model, { images: a.images });
  return { model, comment, page };
}

function main() {
  try {
    const a = parseArgs(process.argv.slice(2));
    const r = render(a);
    mkdirSync(a.out, { recursive: true });
    const commentPath = join(a.out, `comment.${DIALECTS[a.dialect][1]}`);
    const pagePath = join(a.out, "page.html");
    writeFileSync(commentPath, r.comment.text);
    writeFileSync(pagePath, r.page);
    const out = {
      kind: a.kind, verdict: r.model.verdict, ticket: r.model.ticket,
      artifact: a.kind === "test" || a.kind === "fix" ? r.model.build : r.model.runLabel,
      comment: commentPath, chars: r.comment.chars, budget: r.comment.budget, dropped: r.comment.dropped,
      page: pagePath, shots: r.model.shots,
    };
    console.log(a.json ? JSON.stringify(out, null, 2) : `comment ${commentPath} (${out.chars}/${out.budget} chars)\npage    ${pagePath}`);
  } catch (e) {
    // Input/source/budget errors are the operator's to fix; anything else is a fault and needs its stack.
    console.error(`qa-report: ${e instanceof SourceError || e instanceof BudgetError ? e.message : (e.stack ?? e.message)}`);
    process.exitCode = e instanceof BudgetError ? 3 : 2;
  }
}

// Windows: the drive letter's case differs between process.argv and import.meta.url.
const same = (x, y) => process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
if (same(resolve(process.argv[1] ?? ""), fileURLToPath(import.meta.url))) main();
