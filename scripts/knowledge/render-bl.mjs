/**
 * `bl:render` — the BL oracle page, rendered FROM the records rather than edited as a page.
 *
 * WHY THIS EXISTS. The 217 `BL-*` invariants are entries in the base's normative plane now, which is
 * what lets `kb show BL-CART-003` resolve the 5,785 citations the regression suites carry, and what
 * will one day let a rule and an observation contradict each other in one ranked list. But
 * `business-logic.md` is named 413 times across 172 files and PARSED by five scripts — `lint-bl`,
 * `extract-bl` and three more — all of which depend on its markdown shape. Deleting the page to
 * "finish" the cut would rewrite all of that for no gain.
 *
 * So the page stays, byte for byte, and changes which side is authoritative:
 *
 *     entries in rules/  ->  business-logic.md (GENERATED)  ->  172 consumers, untouched
 *
 * Same technique as `graphql-schema.md` via `schema:refresh`, and as the catalogs `kb reindex`
 * writes. Nothing downstream can tell the difference, which is the point.
 *
 * THE SCAFFOLD IS NOT DERIVABLE FROM THE RECORDS, so it is stored. An entry knows its own markdown;
 * it does not know the frontmatter, the "How to Use This File" preamble, the internal-reference
 * banner, or which of the 25 `## Domain N:` headings it belongs under, in what order. That is 138 of
 * the page's 1,995 lines and it is authored, not generated. It lives beside the page in the base as
 * `business-logic.scaffold.md`, with one `<!--RULE BL-…-->` marker per entry.
 *
 * THE GATE IS A BYTE COMPARE, and it has to be: a renderer whose output differs from the page it
 * replaced is a silent rewrite of 217 invariants, and nobody reviews a diff they did not expect.
 * `--check` renders in memory and compares; it writes nothing and is what CI runs.
 *
 *   npm run bl:render -- --scaffold   # bootstrap: split the current page into scaffold + markers
 *   npm run bl:render                 # write the page from the records
 *   npm run bl:render -- --check      # render in memory, byte-compare, exit 1 on any difference
 *
 * Exit: 0 clean · 1 drift (or a marker with no record) · 2 no base.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { knowledgePath, knowledgeLabel, KnowledgeBaseMissing } from "../lib/knowledge-base.mjs";
import { readRules } from "../../plugins/vc-kb/src/capture.mjs";
import { ruleIdOf, ruleDomainOf, severityOf } from "../../plugins/vc-kb/src/rules.mjs";
import { resolveBase } from "../../plugins/vc-kb/src/base.mjs";

export const PAGE_REL = "oracles/business-logic.md";
export const SCAFFOLD_REL = "oracles/business-logic.scaffold.md";

/** `### BL-CART-003: …` — the same heading shape `lint-bl.ts` parses, kept deliberately in step. */
const HEADING = /^### (BL-[A-Z0-9]+-[0-9]+)\b/;
const marker = (id) => `<!--RULE ${id}-->`;

/**
 * Split a rendered page into the scaffold (everything authored) and the entry bodies.
 *
 * An entry runs from its `### BL-…` line to just before the next `###`/`##` heading, with trailing
 * blank lines left in the SCAFFOLD rather than in the body — the separator between entries is a
 * property of the page's layout, not of any one rule, and putting it in the body would make the
 * round trip depend on which entry came last.
 */
export function split(page) {
  const lines = page.split("\n");
  const out = [];
  const bodies = new Map();
  let id = null;
  let buf = [];

  // THE BLANK LINES AFTER AN ENTRY ARE THE PAGE'S, AND THEY ARE NOT UNIFORM. This normalised them
  // to one, which was wrong in both directions on five of the 217: some entries are followed
  // immediately by the next heading, and two are followed by a blank pair. A round trip that
  // "tidies" whitespace is a rewrite of somebody else's file — the byte compare is what caught it.
  // So the count travels with the scaffold, where layout belongs, and the body carries none.
  const flush = () => {
    if (!id) return;
    let trailing = 0;
    while (buf.length && buf[buf.length - 1].trim() === "") { buf.pop(); trailing += 1; }
    bodies.set(id, `${buf.join("\n")}\n`);
    out.push(marker(id));
    for (let i = 0; i < trailing; i += 1) out.push("");
    id = null;
    buf = [];
  };

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m) {
      flush();
      id = m[1];
      buf = [line];
      continue;
    }
    if (id && /^#{1,3} /.test(line)) {
      flush();
      out.push(line);
      continue;
    }
    if (id) buf.push(line);
    else out.push(line);
  }
  flush();
  return { scaffold: out.join("\n"), bodies };
}

/**
 * The records' bodies, keyed by rule id, restored to the PAGE's shape.
 *
 * The import normalised two things on the way in, and both have to come back out:
 *
 *   `### BL-PRICE-001: ...`  ->  `BL-PRICE-001: ...`  the heading marker is page layout, not
 *                                                     content; the id and title are the subject
 *   heading, then a blank    ->  heading, no blank    `capture` separates frontmatter from body
 *
 * Reversed here rather than by re-importing, so the records keep the shape the TOOL reads them in:
 * `kb show` prints a subject line, not a markdown heading. Whether the reversal is exact for all 217
 * is not asserted here — it is checked, by the byte compare, which is the only claim worth making.
 */
export function bodiesFromBase(base) {
  const map = new Map();
  for (const e of readRules(base)) {
    const rid = ruleIdOf(e.data.subject);
    if (!rid) continue;
    const ls = e.body.trimEnd().split("\n");
    while (ls.length && ls[0].trim() === "") ls.shift();

    // TWO SHAPES, BECAUSE RULES ARRIVE TWO WAYS, and assuming one was a bug this file shipped with.
    //
    // A rule TRANSCRIBED from the page carries the page's own heading as its first body line, with
    // the colon and the severity tag the page uses. A rule CAPTURED through the door does not: its
    // id and title are the `subject`, and the body is the claim alone. Prefixing "### " blindly
    // turned the second kind into a heading made of its own claim text — and the entry then
    // vanished from the page, while `missing` and `unused` both read zero because the marker had
    // been substituted with something. Found by adding a rule, not by reading the code.
    if (ls.length && ls[0].startsWith(rid)) {
      if (ls.length > 1 && ls[1].trim() === "") ls.splice(1, 1);
      ls[0] = `### ${ls[0]}`;
    } else {
      // Synthesised in the page's own shape: `### <id>: <title> `[severity]``. The title is what
      // the subject says after the id; the severity is read off the claim, where `severityOf`
      // already looks for it, and is omitted rather than invented when the claim carries none.
      const title = String(e.data.subject).slice(rid.length).trim().replace(/^[:\-\s]+/, "");
      const sev = severityOf(e.body);
      ls.unshift(`### ${rid}: ${title}${sev ? ` \`[${sev}]\`` : ""}`);
    }
    map.set(rid, `${ls.join("\n")}\n`);
  }
  return map;
}

/**
 * Substitute every marker with its record's body.
 * @returns {{text: string, missing: string[], unused: string[]}}
 */
export function render(scaffold, bodies) {
  const missing = [];
  const seen = new Set();
  const text = scaffold.replace(/^<!--RULE (BL-[A-Z0-9]+-[0-9]+)-->$/gm, (_, id) => {
    seen.add(id);
    const body = bodies.get(id);
    if (body === undefined) {
      missing.push(id);
      return marker(id);
    }
    return body.replace(/\n$/, "");
  });
  return { text, missing, unused: [...bodies.keys()].filter((id) => !seen.has(id)) };
}

function main(argv) {
  let pagePath;
  let scaffoldPath;
  let base;
  try {
    base = resolveBase();
    pagePath = knowledgePath(PAGE_REL);
    scaffoldPath = knowledgePath(SCAFFOLD_REL);
  } catch (e) {
    if (e instanceof KnowledgeBaseMissing) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }

  // BOOTSTRAP. Run once, when the page is still the authored artifact: it writes the scaffold that
  // every later render reads. Separate from the normal path on purpose — a mode that can rewrite the
  // scaffold from a page is exactly the mode that would launder a hand edit into the template.
  if (argv.includes("--scaffold")) {
    const { scaffold, bodies } = split(readFileSync(pagePath, "utf8"));
    writeFileSync(scaffoldPath, scaffold, "utf8");
    console.log(`[bl:render] scaffold written — ${knowledgeLabel(SCAFFOLD_REL)}, ${bodies.size} marker(s)`);
    return 0;
  }

  if (!existsSync(scaffoldPath)) {
    console.error(`[bl:render] no ${knowledgeLabel(SCAFFOLD_REL)} — run \`npm run bl:render -- --scaffold\` once.`);
    return 1;
  }

  let scaffoldText = readFileSync(scaffoldPath, "utf8");
  let { text, missing, unused } = render(scaffoldText, bodiesFromBase(base));

  if (missing.length) {
    console.error(`[bl:render] FAIL — ${missing.length} marker(s) name a rule the base does not hold:`);
    for (const id of missing) console.error(`  ${id}`);
    return 1;
  }
  // A rule with no marker would be INVISIBLE on the page while still being in the corpus — the exact
  // asymmetry that makes a generated file untrustworthy.
  //
  // IT IS PLACED, NOT REFUSED, when its domain already has a heading — because that is not an
  // authoring decision. `BL-CART-099` belongs under `## Domain 2: Cart (BL-CART)`; the id says so,
  // all 25 domain headings carry their prefix in brackets, and the only free choice is the position
  // WITHIN the domain, where the end is the obvious answer. Making a person hand-edit the scaffold
  // for that was a step whose entire content was "type what the id already said" — and a step like
  // that is forgotten, after which `--check` fails on somebody else's commit.
  //
  // `--check` never writes, so CI still reports the omission rather than quietly repairing it.
  //
  // A rule in a domain the page has NO heading for is still refused: a new domain needs a title, a
  // position among the others and usually a sentence, and none of that is derivable from an id.
  if (unused.length && !argv.includes("--check")) {
    const placed = [];
    for (const id of [...unused]) {
      const domain = ruleDomainOf(id);
      // Found by scanning lines rather than with a pattern: the heading is `## <title> (<DOMAIN>)`,
      // and a regex for that needs three escapes, each of them a chance to write `(` where an
      // escaped one was meant — which is exactly how this went wrong once. Scanning asks the same
      // question with no escaping at all.
      const all = scaffoldText.split("\n");
      const at = all.findIndex((l) => l.startsWith("## ") && l.trimEnd().endsWith("(" + domain + ")"));
      if (at === -1) continue;
      let last = all.length;
      for (let n = at + 1; n < all.length; n += 1) {
        if (all[n].startsWith("## ")) { last = n; break; }
      }
      while (last > at + 1 && all[last - 1].trim() === "") last -= 1;
      all.splice(last, 0, "", marker(id));
      scaffoldText = all.join("\n");
      placed.push(id);
    }
    if (placed.length) {
      writeFileSync(scaffoldPath, scaffoldText, "utf8");
      for (const id of placed) console.log("[bl:render] placed " + id + " under " + ruleDomainOf(id));
      ({ text, missing, unused } = render(scaffoldText, bodiesFromBase(base)));
    }
  }
  if (unused.length) {
    console.error(`[bl:render] FAIL — ${unused.length} rule(s) in the base have no marker on the page:`);
    for (const id of unused) console.error(`  ${id}`);
    console.error(`\nAdd \`<!--RULE <id>-->\` to ${knowledgeLabel(SCAFFOLD_REL)} under the right domain heading.`);
    return 1;
  }

  const current = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : null;

  if (argv.includes("--check")) {
    if (current === text) {
      console.log(`[bl:render] OK — ${knowledgeLabel(PAGE_REL)} is exactly what the records render`);
      return 0;
    }
    console.error(
      `[bl:render] FAIL — ${knowledgeLabel(PAGE_REL)} is not what the records render. Either the page was`
        + "\nhand-edited (edit the RECORD — `kb amend` — and re-render) or the renderer changed."
        + "\nRun `npm run bl:render` to see the diff in git.",
    );
    return 1;
  }

  if (current === text) {
    console.log(`[bl:render] unchanged — ${knowledgeLabel(PAGE_REL)}`);
    return 0;
  }
  writeFileSync(pagePath, text, "utf8");
  console.log(`[bl:render] written — ${knowledgeLabel(PAGE_REL)}`);
  return 0;
}

const isCli = !!process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("render-bl.mjs");
if (isCli) process.exit(main(process.argv.slice(2)));
