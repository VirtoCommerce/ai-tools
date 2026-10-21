// plugins/vc-fix/skills/qa-report/lib/template.mjs
// The qa-report template engine — the ONE place a result comment's shape and budget are applied.
// A template is Markdown with a front-matter block; its `budget` (chars) is declared there and
// nowhere else. Over budget, the lists named in `trim` collapse to "+N more"; if that is not
// enough the render FAILS (BudgetError) rather than cutting a verdict mid-line.
// Rule source: ../reference.md §Templates.

export class BudgetError extends Error {
  constructor(kind, length, budget) {
    super(`${kind} comment is ${length} chars, budget ${budget}, with every trimmable list already at one item`);
    this.length = length;
    this.budget = budget;
  }
}

export function parseTemplate(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error("template has no front-matter block");
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const raw = kv[2].trim();
    // A quoted value is the YAML-safe spelling of the same one (a bare `[` fails the frontmatter guard).
    const v = raw.length >= 2 && (raw[0] === '"' || raw[0] === "'") && raw.at(-1) === raw[0] ? raw.slice(1, -1) : raw;
    meta[kv[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean)
      : /^\d+$/.test(v) ? Number(v) : v;
  }
  if (!Number.isInteger(meta.budget) || meta.budget <= 0) throw new Error("template front-matter needs a positive integer `budget`");
  // D7: the lede is the one slot the renderer will not trim, so its own cap is declared here too.
  if (!Number.isInteger(meta.lede_max) || meta.lede_max <= 0) throw new Error("template front-matter needs a positive integer `lede_max`");
  return { meta, body: m[2].replace(/\r\n/g, "\n") };
}

// A value can never break a table row, start a new line, or fill another slot.
const cell = v => String(v ?? "")
  .replace(/\s*\r?\n\s*/g, " ")
  .replace(/\|/g, "/")
  .replace(/\{\{|\}\}/g, s => `${s[0]} ${s[1]}`);

// A BLOCK section (`{{#L}}` ends its line) swallows its own closing newline; an INLINE one
// (`**Bugs** {{#L}}…{{/L}}`) keeps it, or the next line would be glued onto this one.
const SECTION = /\{\{([#^?])(\w+)\}\}(\n?)([\s\S]*?)\{\{\/\2\}\}(\n?)/g;

export function fill(body, data) {
  const withSections = body.replace(SECTION, (_, op, key, openNl, inner, closeNl) => {
    if (!(key in data)) throw new Error(`template section {{${op}${key}}} has no value`);
    const tail = openNl ? "" : closeNl;
    const v = data[key];
    const list = Array.isArray(v) ? v : v ? [v] : [];
    if (op === "^") return (list.length ? "" : inner) + tail;
    if (op === "?") return (list.length ? inner : "") + tail;
    return list.map(item => inner.replace(/\{\{(\.|\w+)\}\}/g, (__, f) => {
      if (f === ".") return cell(item);
      if (item === null || typeof item !== "object" || !(f in item)) throw new Error(`list ${key} item has no field "${f}"`);
      return cell(item[f]);
    })).join("") + tail;
  });
  return withSections.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in data)) throw new Error(`template slot {{${k}}} has no value`);
    return cell(data[k]);
  });
}

// The budget is measured on the Markdown, BEFORE the dialect transform: it is a reading-length budget,
// and the same run must fit in every dialect — counted after it, Azure's HTML tags alone pushed real
// summaries over. Lists collapse in the template's `trim` order: the first list down to one item, then
// the next. "+N more" promises the full report only when a page link is going out with the comment.
export function fitBudget(tpl, data, transform = s => s) {
  const d = { ...data };
  const keys = tpl.meta.trim ?? [];
  for (const k of keys) {
    if (!Array.isArray(d[k])) throw new Error(`trim key ${k} is not a list slot`);
    d[k] = [...d[k]];
    d[`${k}_MORE`] = null;
  }
  const dropped = Object.fromEntries(keys.map(k => [k, 0]));
  const where = d.PAGE_URL ? " in the full report" : "";
  const tidy = s => s.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const render = () => tidy(fill(tpl.body, d));
  let md = render();
  while (md.length > tpl.meta.budget) {
    const k = keys.find(x => d[x].length > 1);
    if (!k) throw new BudgetError(tpl.meta.kind, md.length, tpl.meta.budget);
    d[k].pop();
    dropped[k]++;
    d[`${k}_MORE`] = `+${dropped[k]} more${where}`;
    md = render();
  }
  const text = tidy(transform(md));
  return { text, chars: md.length, budget: tpl.meta.budget, dropped };
}

const cells = row => row.trim().replace(/^\||\|$/g, "").split("|").map(s => s.trim());
const DIVIDER = /^\|[\s:|-]+\|\s*$/;
const ROW = /^\|.*\|\s*$/;

/** Markdown subset → Jira wiki (v2 API) — the only dialect that embeds an attached image inline (tracker-ops.md §5c). */
export function toWiki(md) {
  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/`([^`]+)`/g, "{{$1}}")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[$1|$2]");
  // An empty cell would print `||`, which Jira wiki reads as a header delimiter — it gets one space.
  const wikiCell = s => inline(s) || " ";
  const lines = md.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const b = /^(\s*)[-*]\s+(.*)$/.exec(l);
    if (h) out.push(`h${h[1].length}. ${inline(h[2])}`);
    else if (ROW.test(l) && DIVIDER.test(lines[i + 1] ?? "")) { out.push(`||${cells(l).map(wikiCell).join("||")}||`); i++; }
    else if (ROW.test(l)) out.push(`|${cells(l).map(wikiCell).join("|")}|`);
    else if (b) out.push(`${"*".repeat(1 + Math.floor(b[1].length / 2))} ${inline(b[2])}`);
    else out.push(inline(l));
  }
  return out.join("\n");
}

/** Markdown subset → the HTML an Azure Boards comment field renders (azure-html-format.md). */
export function toHtml(md) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => /^https?:\/\//.test(url) ? `<a href="${url}">${text}</a>` : text);
  const lines = md.split("\n");
  const out = [];
  let list = false, table = false;
  const close = () => {
    if (list) { out.push("</ul>"); list = false; }
    if (table) { out.push("</table>"); table = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const b = /^\s*[-*]\s+(.*)$/.exec(l);
    if (h) { close(); out.push(`<b>${inline(h[2])}</b><br/>`); continue; }
    if (ROW.test(l)) {
      if (DIVIDER.test(l)) continue;
      if (list) close();
      if (!table) { out.push("<table>"); table = true; }
      const tag = DIVIDER.test(lines[i + 1] ?? "") ? "th" : "td";
      out.push(`<tr>${cells(l).map(c => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`);
      continue;
    }
    if (b) {
      if (table) close();
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(b[1])}</li>`);
      continue;
    }
    close();
    if (l.trim()) out.push(`${inline(l)}<br/>`);
  }
  close();
  return out.join("\n");
}
