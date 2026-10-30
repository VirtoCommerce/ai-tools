// md-to-wiki — render a /qa-docs Markdown document as Jira wiki markup for its comment.
//
// A comment that embeds screenshots goes through the v2 API, where the WHOLE body is wiki markup
// (tracker-ops.md §5c); a Markdown body posted there shows literal `##` / `**` and renders no image.
// The guide file stays Markdown (MkDocs); its comment is this rendering of it.
//
//   npm run tracker:wiki -- <document.md> <out.wiki.txt>
//
// Covers what the /qa-docs template uses: headings, bold/italic/code/links, numbered and bulleted lists
// (nested by any indent of 2+ spaces, mixed `#*` markers, a step's indented screenshot kept inside its item —
// a blank line ends a Jira list), image lines and inline images (→ `!<file>|width=700!` / `!<file>!`, the file
// attached by name), fenced code (→ `{code:<lang>}` / `{noformat}`, verbatim), tables (→ `||h||` / `|c|`),
// MkDocs admonitions (→ {info}/{tip}/{warning}/{panel}), blockquotes and rules. Wiki-special `{ } [ ]` in text
// and code spans are escaped, so `{{VAR}}` and `[optional]` stay literal.

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PANEL = { note: "info", info: "info", tip: "tip", success: "tip", warning: "warning", danger: "warning", example: "panel" };
const IMG = String.raw`!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)`;
const fileOf = (p) => p.split(/[\\/]/).pop();
const esc = (s) => s.replace(/[{}[\]]/g, "\\$&");

function inline(s) {
  const keep = [];
  const hold = (v) => `\u0000${keep.push(v) - 1}\u0000`;
  return s
    .replace(/`([^`]+)`/g, (_, c) => hold(`{{${esc(c)}}}`))
    .replace(new RegExp(IMG, "g"), (_, p) => hold(`!${fileOf(p)}!`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => hold(`[${esc(t).replace(/\|/g, "\\|")}|${u}]`))
    .replace(/[{}[\]]/g, "\\$&")
    .replace(/(?<![*\w])\*(?!\*)([^*\n]+?)(?<!\*)\*(?![*\w])/g, "_$1_")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}

const indentOf = (l) => l.match(/^\s*/)[0].length;
const LIST = /^(\s*)(\d+\.|[-*+])\s+(.*)$/;
const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => inline(c.trim()));

/** Jira wiki markup for one Markdown document. */
export function mdToWiki(md) {
  const out = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let stack = [];                                  // open lists: [{ indent, marker }]
  let joinable = false;                            // the last line out is a list item's text
  const nextText = (i) => { let j = i + 1; while (j < lines.length && !lines[j].trim()) j++; return lines[j]; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const afterItem = joinable;
    joinable = false;

    const fence = line.match(/^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
    if (fence) {
      const [, pad, mark, lang] = fence;
      out.push(lang ? `{code:language=${lang}}` : "{noformat}");
      while (i + 1 < lines.length && !lines[i + 1].trim().startsWith(mark)) out.push(lines[++i].slice(Math.min(pad.length, indentOf(lines[i]))));
      i++;
      out.push(lang ? "{code}" : "{noformat}");
      continue;
    }

    if (!line.trim()) {
      const next = nextText(i);
      if (stack.length && next !== undefined && (LIST.test(next) || indentOf(next) > 0)) continue; // keep the list open
      stack = [];
      out.push("");
      continue;
    }

    const li = line.match(LIST);
    if (li) {
      const n = li[1].length, marker = /\d/.test(li[2]) ? "#" : "*";
      while (stack.length && stack.at(-1).indent > n) stack.pop();
      if (stack.length && stack.at(-1).indent === n) stack.at(-1).marker = marker;
      else stack.push({ indent: n, marker });
      out.push(`${stack.map((s) => s.marker).join("")} ${inline(li[3])}`);
      joinable = true;
      continue;
    }
    if (stack.length && indentOf(line) === 0) stack = [];
    // A wrapped line of a list item joins it: a line break inside a Jira list item reads as a new paragraph.
    if (stack.length && !new RegExp(`^\\s*${IMG}\\s*$`).test(line) && afterItem) { out[out.length - 1] += ` ${inline(line.trim())}`; joinable = true; continue; }

    const adm = line.match(/^\s*!!!\s+(\w+)(?:\s+"([^"]*)")?\s*$/);
    if (adm) {
      const macro = PANEL[adm[1].toLowerCase()] ?? "panel";
      const title = adm[2]?.replace(/[|}{]/g, " ").replace(/\s+/g, " ").trim();
      out.push(title ? `{${macro}:title=${title}}` : `{${macro}}`);
      const body = indentOf(line) + 4;
      while (i + 1 < lines.length && (indentOf(lines[i + 1]) >= body && lines[i + 1].trim() || (!lines[i + 1].trim() && nextText(i + 1) !== undefined && indentOf(nextText(i + 1)) >= body))) {
        const l = lines[++i];
        if (l.trim()) out.push(inline(l.trim()));
      }
      out.push(`{${macro}}`);
      continue;
    }

    const img = line.match(new RegExp(`^\\s*${IMG}\\s*$`));
    if (img) { out.push(`!${fileOf(img[1])}|width=700!`); continue; }
    if (/^\s*\|/.test(line)) {
      const sep = /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "") && lines[i + 1].includes("|");
      if (sep) { out.push(`||${cells(line).join("||")}||`); i++; }
      else out.push(`|${cells(line).join("|")}|`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`h${h[1].length}. ${inline(h[2])}`); continue; }
    if (/^>\s?/.test(line)) { out.push(`bq. ${inline(line.replace(/^>\s?/, ""))}`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("----"); continue; }
    out.push(inline(line.trim()));
  }
  return out.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) { console.error("usage: npm run tracker:wiki -- <document.md> <out.wiki.txt>"); process.exit(1); }
  writeFileSync(dst, mdToWiki(readFileSync(src, "utf8")) + "\n");
  console.log(`  ✓ ${dst}`);
}
