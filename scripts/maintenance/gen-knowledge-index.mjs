#!/usr/bin/env node
/**
 * gen-knowledge-index — the file-level roster for `.claude/knowledge/`.
 *
 *   npm run knowledge:index          rewrite the generated block in knowledge/README.md
 *   npm run knowledge:index:check    exit 1 when that block is stale   (CI gate)
 *   npm run knowledge:index -- --json
 *
 * WHY THIS IS GENERATED, WHEN THE README USED TO SAY "NO EXHAUSTIVE LISTING".
 *
 * The README's old ban was right about the failure and wrong about the cause. What went stale twice
 * was a HAND-WRITTEN roster — and a third one was found stale on 2026-09-25 in `.claude/ROUTING.md`
 * §Knowledge bases: it named 38 files when 60 existed, missing every `regression-*.md`,
 * `quality-gates.md`, `reports-policy.md`, `when-to-write-a-test.md`, and all eight domain maps
 * added since it was typed.
 *
 * That staleness is worse than no roster, in a direction nothing was catching: `DOC-003` ratchets
 * DANGLING paths (a listed file that vanished), so a roster can only ever be caught SHRINKING, never
 * lagging. An agent reading the short list sees no `quality-gates.md` and concludes it does not
 * exist — a confident wrong NEGATIVE, arriving with a written artifact's authority. That is the same
 * asymmetry `check-domain-maps.mjs` encodes for a stale map: stale fails, absent passes.
 *
 * So the rule survives intact — "run the script that prints them", CLAUDE.md §Where the rules live —
 * and this is that script. The roster is derived on every run and gated, so it cannot lag; the
 * hand-written duplicate in ROUTING.md was deleted in the same commit, leaving ROUTING.md the
 * read-before-you-write RULES, which are the part no generator can derive.
 *
 * WHAT IT DOES NOT DO. It never writes a file's scope line — it READS the one the file already opens
 * with. A file whose own first paragraph does not say what it answers fails KB-IDX-002, and the fix
 * is to write that line in the file, not to describe the file here. The index is a view, not a source.
 *
 * CHECKS
 *   KB-IDX-001  the block in README.md differs from the derived roster        (hard, --check only)
 *   KB-IDX-002  a knowledge file with no derivable scope line                 (hard)
 *   KB-IDX-003  the BEGIN/END markers are missing from README.md              (hard)
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// fileURLToPath, not .pathname — a space in the repo path URL-encodes to %20 and the read fails
// SILENTLY, which reads as "no files to index" and passes. This repo (".../My Projects/...") hits it.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const KB = join(ROOT, ".claude", "knowledge");
const README = join(KB, "README.md");
const BEGIN = "<!-- BEGIN GENERATED INDEX — npm run knowledge:index -->";
const END = "<!-- END GENERATED INDEX -->";
const MAX_SCOPE = 150;

const check = process.argv.includes("--check");
const json = process.argv.includes("--json");
const findings = [];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function splitFrontmatter(text) {
  if (!text.startsWith("---")) return { fm: "", body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { fm: "", body: text };
  return { fm: text.slice(4, end), body: text.slice(end + 4) };
}

const strip = (s) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\|/g, "\\|") // a scope line reaching a table cell must not split the cell
    .replace(/\s+/g, " ")
    .trim()
    // a YAML one-liner (`applicability_rationale: "…"`) arrives still quoted
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

function firstSentence(s) {
  const t = strip(s);
  const m = t.match(/^(.{25,}?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > MAX_SCOPE) out = out.slice(0, MAX_SCOPE - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}

/**
 * One frontmatter field, block scalar (`rationale: |`) or quoted one-liner, first match wins.
 *
 * NOT the `m` flag: under `m` the trailing `$` matches END OF LINE, so the lazy `[\s\S]*?` stops at
 * the first newline and a block scalar is captured one line deep — measured, it cut every domain
 * map's rationale mid-clause ("…the surface inventory per"). `(?:^|\n)` anchors without it.
 */
function fmField(fm, names) {
  for (const n of names) {
    const m = fm.match(
      new RegExp(`(?:^|\\n)${n}:[ \\t]*(?:[|>]-?)?[ \\t]*\\n?([\\s\\S]*?)(?=\\n[a-z_][a-z_0-9]*:|$)`, "i"),
    );
    if (m && strip(m[1]).length > 15) return firstSentence(m[1]);
  }
  return null;
}

// A lead paragraph that is a provenance header ("Captured: … Browser: …") states when the file was
// made, not what it answers. Skip it and take the next paragraph.
const META_LEAD =
  /^(Captured|Generated|Source|Sources|Updated|Last updated|Base URL|Browser|Rev|Env|Environment|Date|Author|Status|Version)\b\s*:/i;

/**
 * The lead paragraph is accumulated to the blank line, NOT read line by line — these files are hard
 * wrapped at ~100 cols, so a per-line read cuts the scope mid-clause ("…ba-story-writer, and").
 * A `**bold**` opener is a paragraph, not a bullet: the bullet test needs the trailing space.
 */
function leadParagraph(body) {
  let h1 = "";
  let buf = [];
  for (const line of body.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) {
      if (!buf.length) continue;
      if (META_LEAD.test(strip(buf[0]))) {
        buf = []; // provenance header — keep looking
        continue;
      }
      break;
    }
    if (l.startsWith("#")) {
      if (/^#{2,}\s/.test(l)) break; // reached the first section — no lead paragraph exists
      if (!h1) h1 = l.replace(/^#+\s*/, "");
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(l)) {
      // a `---` rule is not a paragraph; it ends one
      if (buf.length) break;
      continue;
    }
    if (!buf.length && /^([|>]|[-*+]\s|\d+\.\s|<!--|<[a-z/])/i.test(l)) continue; // table/quote/list/html
    if (buf.length && /^(\||<!--)/.test(l)) break;
    buf.push(l);
  }
  if (buf.length && META_LEAD.test(strip(buf[0]))) buf = [];
  return { para: buf.length ? firstSentence(buf.join(" ")) : null, h1 };
}

/**
 * The scope line is the file's OWN opening claim, preferred in this order:
 *   1. a purpose-written frontmatter summary   (domain maps open straight into `## 1.`)
 *   2. the first real body paragraph after H1  (what almost every other file here has)
 *   3. `applicability_rationale`               — LAST, because it answers a different question
 *                                                (can a customer reuse this?), not "what is this?"
 *   4. the H1 itself                           (generated contract dumps, e.g. api/ucp-schema.md)
 */
export function scopeOfText(raw) {
  const { fm, body } = splitFrontmatter(raw);
  const { para, h1 } = leadParagraph(body);
  return (
    fmField(fm, ["description", "summary", "scope", "rationale"]) ??
    para ??
    fmField(fm, ["applicability_rationale"]) ??
    (h1 ? firstSentence(h1) : null)
  );
}

const scopeOf = (file) => scopeOfText(readFileSync(file, "utf8"));

// Importable for the unit test over the scope derivation; the gate itself runs only when invoked.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const files = walk(KB).filter((f) => f !== README);
  const byDir = new Map();
  for (const f of files.sort()) {
    const rel = relative(KB, f).split(sep).join("/");
    const dir = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : ".";
    const scope = scopeOf(f);
    if (!scope) {
      findings.push({
        code: "KB-IDX-002",
        file: rel,
        msg: "no derivable scope line — give the file a lead paragraph saying what it answers",
      });
    }
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push({ rel, scope: scope ?? "—" });
  }

  function render() {
    const out = [
      BEGIN,
      "",
      `_Generated by \`npm run knowledge:index\` — ${files.length} files across ${byDir.size} folders. **Do not hand-edit**: each`,
      "row is the file's own opening line, so a wrong row is fixed in that file, not here._",
      "",
    ];
    for (const dir of [...byDir.keys()].sort()) {
      const rows = byDir.get(dir);
      out.push(`### \`${dir}/\` — ${rows.length} file${rows.length === 1 ? "" : "s"}`, "");
      out.push("| File | What it answers |", "|---|---|");
      for (const r of rows) {
        const name = r.rel.slice(dir.length + 1);
        out.push(`| [\`${name}\`](./${r.rel}) | ${r.scope} |`);
      }
      out.push("");
    }
    out.push(END);
    return out.join("\n");
  }

  const block = render();
  const readme = readFileSync(README, "utf8");
  const b = readme.indexOf(BEGIN);
  const e = readme.indexOf(END);

  if (b === -1 || e === -1) {
    findings.push({
      code: "KB-IDX-003",
      file: ".claude/knowledge/README.md",
      msg: `missing ${BEGIN} / ${END} markers`,
    });
  } else {
    const current = readme.slice(b, e + END.length);
    if (current !== block) {
      if (check) {
        findings.push({
          code: "KB-IDX-001",
          file: ".claude/knowledge/README.md",
          msg: "index block is stale — run `npm run knowledge:index`",
        });
      } else {
        writeFileSync(README, readme.slice(0, b) + block + readme.slice(e + END.length), "utf8");
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ files: files.length, folders: byDir.size, findings }, null, 2));
  } else {
    const mode = check ? "knowledge:index:check" : "knowledge:index";
    console.log(`[${mode}] ${files.length} file(s) across ${byDir.size} folder(s)`);
    for (const f of findings) console.log(`  ${f.code}  ${f.file}  ${f.msg}`);
    if (!findings.length) console.log(`[${mode}] OK — ${check ? "index is current" : "index written"}`);
  }

  process.exit(findings.length ? 1 : 0);

}
