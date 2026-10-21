// .claude/skills/ticket-context/lib/inventory.mjs — Q1. The list of inputs the gate checks the bundle
// against, built from the tracker's own data so no model writes it. Pure: one issue in, items out.
// Nothing leaves silently: every attachment, inline image, link and linked issue becomes an item (possibly
// carrying a gap) or is routed (PR -> prRefs; an attachment URL of THIS issue -> its existing item; a link to
// the issue itself -> dropped).
import { createHash } from "node:crypto";
import { CAPS } from "./fetch.mjs";
import { gap } from "./gap.mjs";
import { redactText, redactUrlLabel } from "./scrub.mjs";

const URL_RE = /https?:\/\/[^\s<>"'`)\]}|]+/g;
const trimUrl = (u) => u.replace(/[.,;:!?]+$/, "");
/** A link's ref: the URL with query values (and token shapes) redacted, plus a short hash of the full URL when
 *  redaction changed it, so two links differing only in a redacted value stay two items. The full URL is the
 *  item's `url`, in prepare.json only — never in a ref, stdout, the bundle or the cache. */
export function linkRef(url) {
  const label = redactUrlLabel(url);
  return label === url ? `link:${url}` : `link:${label}~${createHash("sha256").update(String(url)).digest("hex").slice(0, 8)}`;
}
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

// A tracker attachment URL names an id; only an id on THIS issue is already an item.
const TRACKER_ATTACHMENT_RE = /^\/(?:secure\/(?:attachment|thumbnail)|rest\/api\/[23]\/attachment)\//;
const attachmentIdOf = (pathname) =>
  /^\/(?:secure\/(?:attachment|thumbnail)\/|rest\/api\/[23]\/attachment\/(?:(?:content|thumbnail)\/)?)(\d+)/.exec(pathname)?.[1] ?? null;

/** ownAttachmentIds (a Set of id strings) tells this issue's attachments from another issue's; omitted, every
 *  tracker attachment URL is "skip". Returns "foreign-attachment" for an attachment URL not on this issue. */
export function classifyLink(url, trackerBase, ownAttachmentIds) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const tracker = trackerBase ? new URL(trackerBase).host : null;
  if (PR_URL_RE.test(url)) return "pr";
  if (tracker && u.host === tracker) {
    if (/^\/wiki\//.test(u.pathname)) return "confluence";
    if (/^\/browse\/[A-Z][A-Z0-9]*-\d+/.test(u.pathname)) return "ticket";
    if (TRACKER_ATTACHMENT_RE.test(u.pathname)) {
      const id = attachmentIdOf(u.pathname);
      return !ownAttachmentIds || (id && ownAttachmentIds.has(id)) ? "skip" : "foreign-attachment";
    }
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
    if (n.type === "media" || n.type === "mediaInline") {
      if (n.attrs?.url) links.add(n.attrs.url); // external media is a link, not an attachment
      else media.push({ id: n.attrs?.id ?? null, alt: n.attrs?.alt ?? null });
    }
  });
  return { links: [...links], media };
}

export function renderedAttachmentIds(html = "") {
  const ids = new Set();
  for (const m of String(html).matchAll(/\/(?:rest\/api\/[23]\/attachment\/(?:content|thumbnail)|secure\/(?:attachment|thumbnail))\/(\d+)/g)) ids.add(m[1]);
  return [...ids];
}

/** Links and media of one field value: a string, an ADF document, an array of those, or an object carrying url/value. */
function valueRefs(value) {
  const out = { links: [], media: [] };
  const add = (r) => { out.links.push(...r.links); out.media.push(...r.media); };
  if (value == null) return out;
  if (typeof value === "string") out.links.push(...(value.match(URL_RE) ?? []).map(trimUrl));
  else if (Array.isArray(value)) for (const v of value) add(valueRefs(v));
  else if (typeof value === "object") {
    if (value.type === "doc" || Array.isArray(value.content)) add(adfRefs(value));
    else {
      if (typeof value.url === "string") out.links.push(value.url.trim());
      add(valueRefs(value.value));
    }
  }
  return out;
}

/** D8 name rule: the WHOLE field name is the term — "Acceptance" or the misspelt "Acceptence", with or without
 *  " criteria", any case. A name that only extends the term ("Acceptance criteria improvement", "Acceptance date")
 *  is a different field, so the match is anchored at both ends. */
export const AC_FIELD_NAME_RE = /^\s*accept[ae]nce(\s+criteria)?\s*$/i;

/** D8: the profile's fieldMap override wins; else every CUSTOM field whose name matches. */
export function resolveFieldsByName(allFields, override, nameRe) {
  if (override) return [{ id: override, name: allFields.find((f) => f.id === override)?.name ?? override }];
  return allFields.filter((f) => f.custom && nameRe.test(f.name ?? "")).map((f) => ({ id: f.id, name: f.name }));
}

export function buildInventory({ issue, remoteLinks = [], trackerBase, acFieldIds = [], linkFieldIds = [], devPrUrls = [] }) {
  const f = issue.fields ?? {};
  const r = issue.renderedFields ?? {};
  const items = new Map();
  const prRefs = new Map(); // keyed on the lower-cased ref: GitHub owner/repo are case-insensitive; first spelling kept
  const push = (arr, v) => { if (!arr.includes(v)) arr.push(v); };

  const attachments = f.attachment ?? [];
  const byName = new Map(attachments.map((a) => [a.filename, a]));
  const byId = new Map(attachments.map((a) => [String(a.id), a]));
  const ownIds = new Set(byId.keys());
  for (const a of attachments) {
    items.set(`attachment:${a.id}`, { ref: `attachment:${a.filename}#${a.id}`, kind: attachmentKind(a.filename, a.mimeType), where: ["attachments"],
      id: String(a.id), filename: a.filename, size: a.size ?? null, url: a.content ?? null, inline_in: [] });
  }

  const addIssue = (key, where) => {
    if (key === issue.key) return; // a self-link adds nothing
    const id = `issue:${key}`;
    if (!items.has(id)) items.set(id, { ref: id, kind: "ticket", where: [], key });
    push(items.get(id).where, where);
  };
  const addLink = (raw, where) => {
    let url = raw;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) { // relative href: resolve against the tracker before classifying
      if (raw.startsWith("#")) return; // in-page anchor, nothing to fetch
      try { url = new URL(raw, trackerBase).href; } catch { url = raw; }
    }
    const kind = classifyLink(url, trackerBase, ownIds);
    if (kind === "skip") return; // an attachment of THIS issue: already its own item
    const id = linkRef(url);
    if (kind == null) {
      if (!items.has(id)) items.set(id, { ref: id, kind: "external", where: [], url, gap: gap(id, "unreadable", "not an http(s) URL; not fetched") });
    } else if (kind === "pr") {
      const m = PR_URL_RE.exec(url);
      const ref = `${m[1]}/${m[2]}#${m[3]}`;
      const key = ref.toLowerCase();
      if (!prRefs.has(key)) prRefs.set(key, { ref, owner: m[1], repo: m[2], number: Number(m[3]), where: [] });
      push(prRefs.get(key).where, where);
      return;
    } else if (kind === "ticket") {
      addIssue(/\/browse\/([A-Z][A-Z0-9]*-\d+)/.exec(url)[1], where);
      return;
    } else if (kind === "foreign-attachment") {
      const path = new URL(url).pathname;
      const image = /\.(png|jpe?g|gif|webp|bmp)$/i.test(path) || /\/thumbnail\//.test(path);
      if (!items.has(id)) items.set(id, { ref: id, kind: image ? "image" : "other", where: [], url, gap: gap(id, "not-found", "attachment of another issue") });
    } else if (!items.has(id)) items.set(id, { ref: id, kind, where: [], url });
    push(items.get(id).where, where);
  };

  const sources = [
    ["description", f.description, r.description],
    ...(f.comment?.comments ?? []).map((c, i) => [`comment:${c.id}@${c.created}`, c.body, r.comment?.comments?.[i]?.body]),
    // AC fields (D8) and link fields: `field:<id>`, the same notation the TICKET agent cites as an AC's source.
    ...[...new Set([...acFieldIds, ...linkFieldIds])].map((id) => [`field:${id}`, f[id], r[id]]),
  ];
  for (const [where, value, html] of sources) {
    if (value == null) continue;
    const { links, media } = valueRefs(value);
    const rendered = renderedAttachmentIds(typeof html === "string" ? html : "");
    const inline = new Set();
    let anon = 0;
    const inlineGap = (label, detail) => {
      const ref = `inline:${label}@${where}`;
      items.set(ref, { ref, kind: "image", where: [where], gap: gap(ref, "not-found", detail) });
    };

    const claimed = new Set();
    const unmatched = [];
    for (const m of media) {
      const a = (m.alt ? byName.get(m.alt) : null) ?? (m.id ? byId.get(String(m.id)) : null);
      if (a) { inline.add(String(a.id)); claimed.add(String(a.id)); }
      else if (m.alt) inlineGap(m.alt, "inline image with no matching attachment");
      else unmatched.push(m);
    }
    // A media node with no alt can only be matched through the rendered HTML: pair each with a rendered
    // attachment id nothing else claimed; one the HTML does not account for is a gap, never a silent drop.
    const pool = rendered.filter((id) => !claimed.has(id));
    for (const m of unmatched) {
      if (pool.length) pool.shift();
      else inlineGap(m.id ?? `media#${++anon}`, `media node${m.id ? ` ${m.id}` : ""} with no alt and no rendered attachment id`);
    }
    for (const id of rendered) {
      if (byId.has(id)) inline.add(id);
      else inlineGap(id, `rendered inline image: attachment ${id} is not an attachment of this issue`);
    }
    for (const id of inline) push(items.get(`attachment:${id}`).inline_in, where);
    for (const url of links) addLink(url, where);
  }
  for (const rl of remoteLinks) if (rl.object?.url) addLink(rl.object.url, "remotelink");
  for (const url of devPrUrls) addLink(url, "dev-status");
  for (const l of f.issuelinks ?? []) {
    const other = l.outwardIssue ?? l.inwardIssue;
    // The direction phrase ("is blocked by", "causes") goes with the type name: rankLinked reads both.
    const dir = l.outwardIssue ? l.type?.outward : l.type?.inward;
    if (other?.key) addIssue(other.key, `issuelinks:${l.type?.name ?? "link"}${dir ? ` (${dir})` : ""}`);
  }
  // A sub-task is an item whether or not any text names it: its developer's resolution note lives in its comments
  // (VCST-5903 round 2). Any parent is already the bundle's `epic` (cli.mjs), but only an item has its fields and
  // comments read. The parent is an item only when this ticket is itself a sub-task — that parent is the story or
  // bug whose ACs it implements, worth a cap slot; an epic parent is not.
  for (const t of f.subtasks ?? []) if (t?.key) addIssue(t.key, "subtasks");
  if (f.issuetype?.subtask && f.parent?.key) addIssue(f.parent.key, "parent");
  return { items: [...items.values()], prRefs: [...prRefs.values()] };
}

// D12: which linked issues CAPS.linkedIssues keeps. Group 0 = a subtask or the parent (an epic parent is an item
// only when a link or text names it); then the link kinds, by
// their type name or direction phrase; 4 = everything else (another link type, a key named only in text).
const LINK_GROUPS = Object.freeze([[/block|caus|problem|incident/i, 1, "blocks/causes"], [/clon|duplicat/i, 2, "clones/duplicates"], [/relat/i, 3, "relates"]]);
const GROUP_LABEL = Object.freeze(["subtask/parent", "blocks/causes", "clones/duplicates", "relates", "other"]);
export function linkGroup(item, parentKey, subtaskKeys) {
  if (item.key === parentKey || subtaskKeys.has(item.key)) return 0;
  let best = 4;
  for (const w of item.where ?? []) {
    if (!w.startsWith("issuelinks:")) continue;
    for (const [re, g] of LINK_GROUPS) if (re.test(w.slice(11))) best = Math.min(best, g);
  }
  return best;
}

/** Linked-issue items, ordered for the cap: by group, then most recently updated first (`order`: key → index in
 *  the tracker's ORDER BY updated DESC result, jira.mjs recencyOrder; a key without one goes last in its group),
 *  then inventory order. Each item gets `link_group`. buildInventory makes every subtask an item. */
export function rankLinked(items, { parentKey = null, subtaskKeys = [], order = new Map() } = {}) {
  const subs = new Set(subtaskKeys);
  return items.map((it, i) => ({ it, i, g: linkGroup(it, parentKey, subs), r: order.get(it.key) ?? Infinity }))
    .sort((a, b) => a.g - b.g || (a.r === b.r ? 0 : a.r < b.r ? -1 : 1) || a.i - b.i)
    .map(({ it, g }) => Object.assign(it, { link_group: GROUP_LABEL[g] }));
}

/** The over-cap gap of a linked issue the ranking put past the cap: its key and group are in the detail. */
export function linkedOverCap(item, rank, cap) {
  return gap(item.ref, "over-cap", `more than ${cap} linked issues: ${item.key} (${item.link_group ?? "other"}) ranked ${rank + 1}, past the cap — subtasks/parent, blocks/causes, clones/duplicates, relates are kept first, newest first`);
}

// The ticket's own fields, for consumers that need the story as written and for the strategy's floors
// (priority → F1, type → F2/F7). ticket.json is deleted with the run dir, so the bundle carries them. Plain
// text only; untrusted data (S1).
const ADF_BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "codeBlock", "rule", "tableRow", "panel"]);
export function adfText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfText).filter(Boolean).join("\n"); // a multi-select custom field
  if (!node || typeof node !== "object") return "";
  if (!node.type && typeof node.value === "string") return node.value; // a select/option custom field: { value }
  // A link keeps its URL: a pasted PR or commit (an inlineCard, Jira Cloud's default) is what a "fixed in" comment
  // says, and a link mark's text alone may not name it.
  if (["inlineCard", "blockCard", "embedCard"].includes(node.type)) return node.attrs?.url ? `${node.attrs.url}${node.type === "inlineCard" ? "" : "\n"}` : "";
  if (node.type === "text") {
    const t = node.text ?? "";
    const href = (node.marks ?? []).find((m) => m.type === "link")?.attrs?.href;
    return href && href !== t ? `${t} (${href})` : t;
  }
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") return "@mention"; // a person's name is not testing context
  const inner = (node.content ?? []).map(adfText).join(node.type === "tableRow" ? " | " : "");
  return ADF_BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

// The text fields are redacted here (env secret values, then token shapes): no agent mode writes `fields`, so a
// token pasted into a description would otherwise fail gate rule 6 with nothing able to fix it.
export function ticketFields(issue, acFieldIds = [], secrets = new Set()) {
  const f = issue.fields ?? {};
  const gaps = [];
  const capped = (where, s) => {
    const t = redactText(String(s ?? ""), secrets).replace(/\n{3,}/g, "\n\n").trim();
    if (t.length <= CAPS.fieldText) return t;
    gaps.push(gap(where, "over-cap", `${t.length} chars; the first ${CAPS.fieldText} kept`));
    return t.slice(0, CAPS.fieldText);
  };
  return { gaps, fields: {
    summary: redactText(f.summary ?? "", secrets), type: f.issuetype?.name ?? null, status: f.status?.name ?? null, priority: f.priority?.name ?? null,
    // Every string goes through the scrubber: gate rule 6 scans the whole bundle and no agent mode can repair `fields`.
    components: (f.components ?? []).map((c) => c?.name).filter(Boolean).map((s) => redactText(s, secrets)),
    labels: (f.labels ?? []).filter((s) => typeof s === "string").map((s) => redactText(s, secrets)),
    fix_versions: (f.fixVersions ?? []).map((v) => v?.name).filter(Boolean).map((s) => redactText(s, secrets)),
    description: capped("fields.description", adfText(f.description)),
    acceptance: capped("fields.acceptance", acFieldIds.map((id) => adfText(f[id]).trim()).filter(Boolean).join("\n\n")),
  } };
}
