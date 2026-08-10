/**
 * ado-html.mjs — shared Azure DevOps HTML helpers + Bug JSON-Patch builder.
 *
 * The single source of truth for two things that used to be hand-mirrored between the CLI
 * (`ado.mjs`) and the TS tracker (`trackers/azure-tracker.ts`):
 *   1. Markdown→HTML conversion for the HTML-typed ADO fields (`ensureAzureHtml`/`mdToHtml`),
 *      plus `isHtmlField()` — the EXACT set of field refs that are HTML (never a suffix match).
 *   2. `buildBugFields()` — the JSON-Patch body for creating/updating a Bug work item.
 *
 * Both consumers import from here so a new Bug field or a formatting tweak is made ONCE.
 * `azure-tracker.ts` importing this `.mjs` is the same proven pattern it already uses for
 * `../../../scripts/lib/project-profile.mjs`; tsx resolves it at runtime and `ado-html.d.mts`
 * carries the types for `tsc`.
 */

// ── Markdown → HTML (Azure Description/ReproSteps/SystemInfo/comments are HTML fields) ──
// A full-HTML body passes through untouched; a Markdown body is converted; a mixed body
// (Markdown with an embedded raw-HTML line, e.g. an <img>) is converted with the embed
// preserved verbatim. See looksLikeHtml for why a lone void element isn't a full-HTML signal.
const HTML_SIGNAL_RE =
  /<\/(?:h[1-6]|ol|ul|li|p|table|thead|tbody|tr|td|th|div|pre|code|b|strong|em|i|a|img|details|summary|blockquote)>|(?:^|\n)\s*<(?:h[1-6]|ol|ul|li|p|table|thead|tbody|tr|td|th|div|pre|code|blockquote|details)\b/i;

function looksLikeHtml(s) {
  // Ignore angle brackets inside code — that's content, not markup.
  const outsideCode = s.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  return HTML_SIGNAL_RE.test(outsideCode);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    // Images: MUST run before the link regex below — `![alt](url)` would otherwise be matched by
    // the link pattern (which sees `[alt](url)` and ignores the leading `!`), degrading a screenshot
    // embed into a bare text link. Same scheme allowlist as links, restricted to http(s) (no
    // `mailto:` image src); a disallowed/unsupported scheme drops the tag and keeps the alt text.
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, u) => {
      const url = String(u).trim();
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
      if (scheme && !/^https?$/i.test(scheme[1])) return alt;
      return `<img src="${url.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}">`;
    })
    // Links: `&`/`<`/`>` were already escaped by escapeHtml (runs before inlineMd); escape `"` too so a
    // quote in the URL can't break out of the href attribute. Allow ONLY http(s)/mailto + relative /
    // anchor URLs — a disallowed scheme (javascript:/data:/vbscript:/…) drops the anchor and keeps the
    // visible text, so a poisoned link can't inject an executable href.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
      const url = String(u).trim();
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
      if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) return t; // unsafe scheme → text only, no <a>
      return `<a href="${url.replace(/"/g, "&quot;")}">${t}</a>`;
    });
}

export function mdToHtml(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let listType = null; // "ol" | "ul"
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  // A standalone embedded element (`<img …>`, `<br/>`, or a whole `<tag>…</tag>`) — matched on the
  // TRIMMED line so leading/trailing whitespace doesn't hide it. MUST also gate the paragraph
  // continuation below (isBlockStart), not just the top-of-loop dispatch: without that, a tag on the
  // line right after plain prose (no blank-line separator) gets swallowed into the in-progress
  // paragraph and HTML-escaped instead of passed through verbatim.
  const isRawHtmlLine = (l) => {
    const t = l.trim();
    return /^<\/?[a-zA-Z]/.test(t) && t.endsWith(">");
  };
  const isBlockStart = (l) => isRawHtmlLine(l) || /^(#{1,6}\s|```|\s*\|.*\|\s*$|\s*\d+\.\s|\s*[-*+]\s)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    // fenced code block
    if (/^\s*```/.test(line)) {
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(escapeHtml(lines[i++]));
      i++; // closing fence
      out.push(`<pre><code>${buf.join("\n")}</code></pre>`);
      continue;
    }
    // raw HTML line — emitted VERBATIM (never escaped) so authored HTML survives inside an
    // otherwise-Markdown body (mixed content — the deliberate embed passthrough).
    if (isRawHtmlLine(line)) {
      closeList();
      out.push(line);
      i++;
      continue;
    }
    // pipe table
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const isSep = (r) => /-/.test(r) && /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && !/[^\s:|-]/.test(r);
      let html = '<table border="1" style="border-collapse:collapse;">';
      let headerDone = false;
      for (const r of rows) {
        if (isSep(r)) {
          headerDone = true;
          continue;
        }
        const tag = !headerDone && rows.some(isSep) ? "th" : "td";
        html += "<tr>" + cells(r).map((c) => `<${tag}>${inlineMd(escapeHtml(c))}</${tag}>`).join("") + "</tr>";
      }
      out.push(html + "</table>");
      continue;
    }
    // heading
    let m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      closeList();
      const lvl = Math.min(m[1].length + 2, 6); // "# " -> h3
      out.push(`<h${lvl}>${inlineMd(escapeHtml(m[2]))}</h${lvl}>`);
      i++;
      continue;
    }
    // ordered list item
    m = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (m) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inlineMd(escapeHtml(m[1]))}</li>`);
      i++;
      continue;
    }
    // unordered list item
    m = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (m) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inlineMd(escapeHtml(m[1]))}</li>`);
      i++;
      continue;
    }
    // blank line
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }
    // paragraph
    closeList();
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      para.push(inlineMd(escapeHtml(lines[i++])));
    }
    out.push(`<p>${para.join("<br/>")}</p>`);
  }
  closeList();
  return out.join("\n");
}

/**
 * Author-provided HTML passes through; Markdown is converted. Empty stays empty.
 * NOTE: the pass-through branch does NOT escape — the `mdToHtml`/`inlineMd` scheme
 * allowlist + `escapeHtml` only run on the Markdown path. Safe here because (a) bodies
 * are model/QA-authored, not attacker-controlled, and (b) Azure DevOps server-side
 * sanitizes work-item HTML on save. Do not treat this as an XSS boundary.
 */
export function ensureAzureHtml(text) {
  const s = String(text || "").trim();
  if (!s) return s;
  return looksLikeHtml(s) ? s : mdToHtml(s);
}

// ── HTML-field classification ───────────────────────────────────────────────────────
// The EXACT set of Bug field refs Azure stores as HTML. Matched exactly, never by suffix:
// a suffix match (`/(SystemInfo|Description|ReproSteps)$/`) would wrongly HTML-convert a
// plain-text custom field like `Custom.ProblemDescription` or `Custom.EnvSystemInfo`.
export const HTML_FIELD_REFS = new Set([
  "System.Description",
  "Microsoft.VSTS.TCM.ReproSteps",
  "Microsoft.VSTS.TCM.SystemInfo",
]);
export function isHtmlField(ref) {
  return HTML_FIELD_REFS.has(String(ref));
}

// ── inline-image counting (VCST-5702 ITEM 1 / ITEM 2) ────────────────────────────────
// A 200 + a non-empty HTML body still isn't proof the SCREENSHOTS rendered: an <img> whose
// upload silently failed leaves the body non-empty with the image gone. These pure counters let
// the post-create read-back assert "N submitted ⇒ N rendered" and let get-workitem's stripped
// reader show an image count instead of implying zero. Both are exact-tag scans, never suffix.
/** Count every inline <img> tag in an HTML value. */
export function countImages(html) {
  if (!html || typeof html !== "string") return 0;
  return (html.match(/<img\b[^>]*>/gi) || []).length;
}
/**
 * Count only <img> whose `src` points at an uploaded ADO attachment
 * (`…/_apis/wit/attachments/…`). A submitted screenshot must come back as a real attachment
 * ref — a dangling external/blob src is exactly the "persisted != rendered" gap.
 */
export function countAttachmentImages(html) {
  if (!html || typeof html !== "string") return 0;
  return (html.match(/<img\b[^>]*\bsrc\s*=\s*["'][^"']*_apis\/wit\/attachments\/[^"']*["'][^>]*>/gi) || []).length;
}

// ── Bug work-item JSON-Patch builder ──────────────────────────────────────────────────
const norm = (v) => (typeof v === "string" ? v : "");

/** Split "a; b, c" or ["a","b"] into a normalized "a; b; c" ADO tag string. */
function normalizeTags(tags) {
  const parts = Array.isArray(tags) ? tags : norm(tags) ? String(tags).split(/[,;]/) : [];
  return parts.flatMap((t) => String(t).split(/[,;]/)).map((s) => s.trim()).filter(Boolean).join("; ");
}
function normalizeList(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  return norm(v) ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Build the JSON-Patch `add` ops for a Bug create/update. Pure — every value is already
 * resolved by the caller (the CLI resolves --assign-self/--iteration current to concrete
 * values first). Callers: ado.mjs `create-workitem` and AzureTracker.createWorkItem.
 * @param {import("./ado-html.d.mts").BugFieldInput} input
 */
export function buildBugFields(input = {}) {
  // Title is the one required field — assert here so the shared builder fails loudly instead
  // of emitting a title-less op that ADO rejects with an opaque 400. (Both callers already
  // guard, but this is the single source of truth, so it validates its own contract.)
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new Error("buildBugFields: input.title is required (non-empty string)");
  }
  const raw = !!input.raw;
  const html = (v) => (raw ? String(v) : ensureAzureHtml(v));
  // Which refs are HTML. PREFER the caller's contract-derived resolver (VCST-5582 E-a:
  // the field's real data type from the organization's own metadata — `html` ⇒ HTML,
  // `plainText` ⇒ text). It returns null for a field the contract doesn't know, and is
  // absent entirely when no contract was scanned; both fall back to HTML_FIELD_REFS, the
  // hardcoded set of the three canonical Azure HTML fields. That hardcoding was the
  // assumption E-a replaces — it survives only as the "unverified defaults" fallback.
  const htmlRef = (ref) => {
    if (typeof input.isHtmlRef === "function") {
      const v = input.isHtmlRef(ref);
      if (v === true || v === false) return v;
    }
    return isHtmlField(ref);
  };
  const body = (ref, v) => (htmlRef(ref) ? html(v) : String(v));
  // The concrete field ref each long-text slot lands in is RESOLVED per work-item type from the
  // scanned form layout (VCST-5702 ITEM 0) — never assumed. On the Agile process a Bug's body is
  // Microsoft.VSTS.TCM.ReproSteps while a User Story / Task use System.Description, and
  // System.Description may not even be ON the Bug form — writing to it then yields an item whose
  // body is INVISIBLE (the OPUS symptom: create reported PASS on an off-form field). The caller
  // (create-workitem) passes the form-visible target it resolved via resolveSlots; absent a
  // contract these fall back to the three canonical refs (the "unverified defaults" rung).
  const bodyRef = input.bodyRef || "System.Description";
  const reproRef = input.reproRef || "Microsoft.VSTS.TCM.ReproSteps";
  const systemInfoRef = input.systemInfoRef || "Microsoft.VSTS.TCM.SystemInfo";
  const fields = [{ op: "add", path: "/fields/System.Title", value: input.title }];
  // Dedup by ref: on a process where body resolves to ReproSteps (no distinct repro field), the
  // caller merges repro into the body content, so a second op to the same ref must never be emitted.
  const emitted = new Set(["System.Title"]);
  const pushField = (ref, value) => {
    if (!ref || emitted.has(ref)) return;
    fields.push({ op: "add", path: `/fields/${ref}`, value });
    emitted.add(ref);
  };
  if (input.description) pushField(bodyRef, body(bodyRef, input.description));
  if (input.reproSteps) pushField(reproRef, body(reproRef, input.reproSteps));
  if (input.severity) fields.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Severity", value: input.severity });
  if (input.priority !== undefined && input.priority !== null && input.priority !== true)
    fields.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: Number(input.priority) });
  const tags = normalizeTags(input.tags);
  if (tags) fields.push({ op: "add", path: "/fields/System.Tags", value: tags });
  if (input.systemInfo) pushField(systemInfoRef, body(systemInfoRef, input.systemInfo));
  // Arbitrary custom fields (the deployment's Bug picklists). HTML-normalize ONLY html-typed refs
  // (the contract resolver, else isHtmlField exact match) — a plaintext custom field is sent
  // verbatim. Skip any ref already emitted above so a contract field can't duplicate a slot op.
  for (const [path, value] of Object.entries(input.fields || {})) {
    if (emitted.has(path)) continue;
    fields.push({ op: "add", path: `/fields/${path}`, value: htmlRef(path) ? html(value) : value });
    emitted.add(path);
  }
  // Attachment relations (Attachments tab). Inline <img> in the HTML is independent.
  for (const url of normalizeList(input.attachments)) {
    fields.push({ op: "add", path: "/relations/-", value: { rel: "AttachedFile", url, attributes: { comment: "" } } });
  }
  if (input.assignedTo) fields.push({ op: "add", path: "/fields/System.AssignedTo", value: input.assignedTo });
  if (input.iterationPath) fields.push({ op: "add", path: "/fields/System.IterationPath", value: input.iterationPath });
  // Parent link — Hierarchy-Reverse relation; work-item relation URLs are ORG-scoped.
  if (input.parentId !== undefined && input.parentId !== null && `${input.parentId}` !== "") {
    fields.push({
      op: "add",
      path: "/relations/-",
      value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: `${input.orgUrl}/_apis/wit/workItems/${encodeURIComponent(input.parentId)}` },
    });
  }
  return fields;
}
