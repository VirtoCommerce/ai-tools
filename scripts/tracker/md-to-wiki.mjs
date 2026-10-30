// md-to-wiki — render a /qa-docs Markdown document as Jira wiki markup for its comment.
//
// A comment that embeds screenshots goes through the v2 API, where the WHOLE body is wiki markup
// (tracker-ops.md §5c); a Markdown body posted there shows literal `##` / `**` and renders no image.
// The guide file stays Markdown (MkDocs); its comment is this rendering of it.
//
//   npm run tracker:wiki -- <document.md> <out.wiki.txt>
//
// Covers what the /qa-docs template uses: headings, bold/italic/code/links, numbered and bulleted lists
// with indented continuations, image lines (→ `!<file>|width=700!`, the file attached by name),
// MkDocs admonitions (→ {info}/{tip}/{warning}/{panel}), blockquotes and rules.

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PANEL = { note: "info", info: "info", tip: "tip", success: "tip", warning: "warning", danger: "warning", example: "panel" };

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "{{$1}}")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "[$1|$2]")
    .replace(/(?<![*\w])\*(?!\*)([^*\n]+?)(?<!\*)\*(?![*\w])/g, "_$1_")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
}

/** Jira wiki markup for one Markdown document. */
export function mdToWiki(md) {
  const out = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const adm = line.match(/^!!!\s+(\w+)(?:\s+"([^"]*)")?\s*$/);
    if (adm) {
      const macro = PANEL[adm[1].toLowerCase()] ?? "panel";
      out.push(adm[2] ? `{${macro}:title=${adm[2]}}` : `{${macro}}`);
      while (i + 1 < lines.length && /^ {4}\S/.test(lines[i + 1])) out.push(inline(lines[++i].trim()));
      out.push(`{${macro}}`);
      continue;
    }
    const img = line.match(/^\s*!\[[^\]]*\]\(([^)\s]+)\)\s*$/);
    if (img) { out.push(`!${img[1].split(/[\\/]/).pop()}|width=700!`); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`h${h[1].length}. ${inline(h[2])}`); continue; }
    if (/^>\s?/.test(line)) { out.push(`bq. ${inline(line.replace(/^>\s?/, ""))}`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push("----"); continue; }
    const li = line.match(/^(\s*)(\d+\.|[-*])\s+(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].length / 3) + 1;
      out.push(`${(/\d/.test(li[2]) ? "#" : "*").repeat(depth)} ${inline(li[3])}`);
      continue;
    }
    out.push(inline(line.replace(/^\s+(?=\S)/, "")));
  }
  return out.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) { console.error("usage: npm run tracker:wiki -- <document.md> <out.wiki.txt>"); process.exit(1); }
  writeFileSync(dst, mdToWiki(readFileSync(src, "utf8")) + "\n");
  console.log(`  ✓ ${dst}`);
}
