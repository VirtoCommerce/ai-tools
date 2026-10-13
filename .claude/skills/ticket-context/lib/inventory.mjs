// .claude/skills/ticket-context/lib/inventory.mjs — Q1. The list of inputs the gate checks the bundle
// against, built from the tracker's own data so no model writes it. Pure: one issue in, items out.
import { gap } from "./gap.mjs";

const URL_RE = /https?:\/\/[^\s<>"'`)\]}|]+/g;
const trimUrl = (u) => u.replace(/[.,;:!?]+$/, "");
export const PR_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i;

export function attachmentKind(filename = "", mime = "") {
  const f = filename.toLowerCase();
  if (/\.har$/.test(f)) return "har";
  if (/\.(log|txt|json|xml|csv)$/.test(f)) return "log"; // text that can hold a token is scrubbed like a log
  if (/\.(trace|stacktrace)$/.test(f)) return "trace";
  if (/^image\//.test(mime) || /\.(png|jpe?g|gif|webp|bmp)$/.test(f)) return "screenshot";
  if (/^video\//.test(mime) || /\.(mp4|webm|mov|mkv|avi)$/.test(f)) return "video";
  if (/\.(pdf|md)$/.test(f)) return "document";
  return "other";
}

export function classifyLink(url, trackerBase) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const tracker = trackerBase ? new URL(trackerBase).host : null;
  if (PR_URL_RE.test(url)) return "pr";
  if (tracker && u.host === tracker) {
    if (/^\/wiki\//.test(u.pathname)) return "confluence";
    if (/^\/browse\/[A-Z][A-Z0-9]*-\d+/.test(u.pathname)) return "ticket";
    if (/^\/(secure\/attachment|rest\/api\/[23]\/attachment)\//.test(u.pathname)) return "skip"; // already an attachment item
  }
  if (/(^|\.)loom\.com$/.test(u.hostname)) return "loom";
  if (/(^|\.)figma\.com$/.test(u.hostname)) return "figma";
  if (u.hostname === "claude.ai" && /^\/(design|code\/artifact|artifact)\//.test(u.pathname)) return "claude-design";
  return "external";
}

function walkAdf(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const c of node.content ?? []) walkAdf(c, visit);
}

export function adfRefs(adf) {
  const links = new Set();
  const media = [];
  walkAdf(adf, (n) => {
    for (const m of n.marks ?? []) if (m.type === "link" && m.attrs?.href) links.add(m.attrs.href);
    if (["inlineCard", "blockCard", "embedCard"].includes(n.type) && n.attrs?.url) links.add(n.attrs.url);
    if (n.type === "text" && n.text) for (const u of n.text.match(URL_RE) ?? []) links.add(trimUrl(u));
    if (n.type === "media" && n.attrs?.type === "file") media.push({ id: n.attrs.id ?? null, alt: n.attrs.alt ?? null });
  });
  return { links: [...links], media };
}

export function renderedAttachmentIds(html = "") {
  const ids = new Set();
  for (const m of String(html).matchAll(/\/(?:rest\/api\/[23]\/attachment\/content|secure\/attachment)\/(\d+)/g)) ids.add(m[1]);
  return [...ids];
}

/** D8: the profile's fieldMap override wins; else every CUSTOM field whose name matches. */
export function resolveFieldsByName(allFields, override, nameRe) {
  if (override) return [{ id: override, name: allFields.find((f) => f.id === override)?.name ?? override }];
  return allFields.filter((f) => f.custom && nameRe.test(f.name ?? "")).map((f) => ({ id: f.id, name: f.name }));
}

export function buildInventory({ issue, remoteLinks = [], trackerBase, linkFieldIds = [], devPrUrls = [] }) {
  const f = issue.fields ?? {};
  const r = issue.renderedFields ?? {};
  const items = new Map();
  const prRefs = new Map();
  const push = (arr, v) => { if (!arr.includes(v)) arr.push(v); };

  const attachments = f.attachment ?? [];
  const byName = new Map(attachments.map((a) => [a.filename, a]));
  for (const a of attachments) {
    items.set(`attachment:${a.id}`, { ref: `attachment:${a.filename}#${a.id}`, kind: attachmentKind(a.filename, a.mimeType), where: ["attachments"],
      id: String(a.id), filename: a.filename, size: a.size ?? null, url: a.content ?? null, inline_in: [] });
  }

  const addIssue = (key, where) => {
    if (key === issue.key) return;
    const id = `issue:${key}`;
    if (!items.has(id)) items.set(id, { ref: id, kind: "ticket", where: [], key });
    push(items.get(id).where, where);
  };
  const addLink = (url, where) => {
    const kind = classifyLink(url, trackerBase);
    if (!kind || kind === "skip") return;
    if (kind === "pr") {
      const m = PR_URL_RE.exec(url);
      const ref = `${m[1]}/${m[2]}#${m[3]}`;
      if (!prRefs.has(ref)) prRefs.set(ref, { ref, owner: m[1], repo: m[2], number: Number(m[3]), where: [] });
      push(prRefs.get(ref).where, where);
      return;
    }
    if (kind === "ticket") { addIssue(/\/browse\/([A-Z][A-Z0-9]*-\d+)/.exec(url)[1], where); return; }
    const id = `link:${url}`;
    if (!items.has(id)) items.set(id, { ref: id, kind, where: [], url });
    push(items.get(id).where, where);
  };

  const sources = [
    ["description", f.description, r.description],
    ...(f.comment?.comments ?? []).map((c, i) => [`comment:${c.id}@${c.created}`, c.body, r.comment?.comments?.[i]?.body]),
    ...linkFieldIds.map((id) => [`field:${id}`, f[id], r[id]]),
  ];
  for (const [where, value, html] of sources) {
    if (value == null) continue;
    const { links, media } = typeof value === "string" ? { links: (value.match(URL_RE) ?? []).map(trimUrl), media: [] } : adfRefs(value);
    const inline = new Set(renderedAttachmentIds(typeof html === "string" ? html : ""));
    for (const m of media) {
      const a = m.alt ? byName.get(m.alt) : null;
      if (a) inline.add(String(a.id));
      else if (m.alt) items.set(`inline:${m.alt}@${where}`, { ref: `inline:${m.alt}@${where}`, kind: "image", where: [where],
        gap: gap(`inline:${m.alt}@${where}`, "not-found", "inline image with no matching attachment") });
      // a media node with no alt is matched through the rendered HTML ids above
    }
    for (const id of inline) { const it = items.get(`attachment:${id}`); if (it) push(it.inline_in, where); }
    for (const url of links) addLink(url, where);
  }
  for (const rl of remoteLinks) if (rl.object?.url) addLink(rl.object.url, "remotelink");
  for (const url of devPrUrls) addLink(url, "dev-status");
  for (const l of f.issuelinks ?? []) {
    const other = l.outwardIssue ?? l.inwardIssue;
    if (other?.key) addIssue(other.key, `issuelinks:${l.type?.name ?? "link"}`);
  }
  return { items: [...items.values()], prRefs: [...prRefs.values()] };
}
