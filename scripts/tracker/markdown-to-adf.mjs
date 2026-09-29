// Markdown -> ADF (Atlassian Document Format) for Jira REST v3 comment bodies.
//
// WHY THIS EXISTS. `tracker:comment --amend` sent the body to
// `PUT /rest/api/3/issue/{key}/comment/{id}` as a RAW MARKDOWN STRING, and the helper's own
// comment claimed "v3 takes MARKDOWN". It does not: v3 stores and accepts ADF only, so every
// markdown amend failed with `400 {"errors":{"comment":"Comment body is not valid!"}}`.
// Posting worked because the Atlassian MCP converts markdown -> ADF on the way in; the raw PUT
// had no such step. Measured 2026-09-22 on VCST-5378.
//
// That mattered more than a normal bug: tracker-ops.md §0 routes EVERY correction through
// `--amend` (one comment per ticket per run), so a broken amend pushes whoever hits it toward
// the exact failure the GOLDEN RULE exists to prevent — a second comment.
//
// SCOPE. The block and inline subset the repo's tracker comments actually use. Anything not
// recognised degrades to a plain paragraph rather than throwing, because a comment that renders
// plainly beats a correction that cannot be posted.

const INLINE = /(\*\*[^*]+\*\*|(?<![*\w])\*[^*\n]+\*(?!\w)|`[^`]+`|\[[^\]]+\]\([^)]+\))/;

/** Split one line of markdown into ADF inline nodes (text + marks). */
export function inlineNodes(text) {
  if (!text) return [];
  const out = [];
  for (const part of String(text).split(INLINE)) {
    if (!part) continue;
    let m;
    if ((m = /^\*\*([^*]+)\*\*$/.exec(part))) out.push({ type: 'text', text: m[1], marks: [{ type: 'strong' }] });
    else if ((m = /^`([^`]+)`$/.exec(part))) out.push({ type: 'text', text: m[1], marks: [{ type: 'code' }] });
    else if ((m = /^\*([^*\n]+)\*$/.exec(part))) out.push({ type: 'text', text: m[1], marks: [{ type: 'em' }] });
    else if ((m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part))) out.push({ type: 'text', text: m[1], marks: [{ type: 'link', attrs: { href: m[2] } }] });
    else out.push({ type: 'text', text: part });
  }
  // ADF rejects an empty text node; a paragraph with no content is also invalid.
  return out.filter((n) => n.text !== '');
}

const para = (t) => ({ type: 'paragraph', content: inlineNodes(t) });

/** A markdown table row -> cells, tolerating the leading/trailing pipe. */
const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
const isDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/**
 * Convert a markdown document to an ADF doc.
 * Always returns a valid `{type:'doc',version:1,content:[...]}` with at least one node.
 */
export function markdownToAdf(md) {
  const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
  const content = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // fenced code block
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++; // closing fence
      content.push({
        type: 'codeBlock',
        ...(lang ? { attrs: { language: lang } } : {}),
        content: buf.length ? [{ type: 'text', text: buf.join('\n') }] : [],
      });
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { content.push({ type: 'rule' }); i++; continue; }

    // heading
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      content.push({ type: 'heading', attrs: { level: m[1].length }, content: inlineNodes(m[2]) });
      i++; continue;
    }

    // blockquote (consecutive lines)
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      content.push({ type: 'blockquote', content: [para(buf.join(' '))] });
      continue;
    }

    // table: a header row followed by a divider
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      const cell = (txt, kind) => ({ type: kind, attrs: {}, content: [para(txt)] });
      content.push({
        type: 'table',
        attrs: { isNumberColumnEnabled: false, layout: 'default' },
        content: [
          { type: 'tableRow', content: header.map((h) => cell(h, 'tableHeader')) },
          ...rows.map((r) => ({
            type: 'tableRow',
            // pad/trim so every row matches the header width — ADF requires a rectangular table
            content: Array.from({ length: header.length }, (_, k) => cell(r[k] ?? '', 'tableCell')),
          })),
        ],
      });
      continue;
    }

    // lists (bullet or ordered), consecutive items only
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const sameKind = /^\s*\d+\.\s+/.test(lines[i]) === ordered;
        if (!sameKind) break;
        items.push({ type: 'listItem', content: [para(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, ''))] });
        i++;
      }
      content.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }

    // paragraph: consume until a blank line or a block that starts something else
    const buf = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,6}\s|>\s?|```)/.test(lines[i]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) buf.push(lines[i++]);
    if (buf.length) content.push(para(buf.join(' ')));
    else i++; // never spin
  }

  // ADF refuses an empty doc.
  if (!content.length) content.push({ type: 'paragraph', content: [] });
  return { type: 'doc', version: 1, content };
}

export default markdownToAdf;
