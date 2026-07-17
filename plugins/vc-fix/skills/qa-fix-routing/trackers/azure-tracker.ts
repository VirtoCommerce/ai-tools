/**
 * AzureTracker — Tracker implementation for Azure Boards (Azure DevOps work
 * items), mirroring the patterns proven in LEO's ado-api.sh.
 *
 * Auth is delegated to qa-fix-routing/ado-rest (PAT via ADO_PAT, or an `az login`
 * browser/device token — no passwords). Config: org/project from env
 * ADO_ORG / ADO_PROJECT (fallback to the profile's tracker.azure.*); status
 * mapping from the profile's tracker.azure.roleStates (lifecycle ROLE key, e.g.
 * "in-progress" → the deployment's real System.State, scanned by
 * /project-init's discover-tracker.mjs) with tracker.azure.stateMap (legacy
 * free-form name → state) as a fallback for any caller still passing a raw
 * transition name instead of a role key.
 *
 * Azure Boards has no named transitions — `transition()` PATCHes System.State.
 */
import type { Tracker, TrackerTicket, TrackerDeps, CreateWorkItemInput } from "./tracker.js";
import { adoAuthHeader, adoConfigured, adoBase } from "../ado-rest.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

const API_VERSION = "7.0";
const COMMENTS_API_VERSION = "7.0-preview.3";

/** Strip the HTML Azure stores in System.Description / comments to plain text. */
function htmlToText(html: string): string {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Markdown -> HTML safety net (Azure Description/ReproSteps/comments are HTML) ──────
// Mirror of ado.mjs's `ensureAzureHtml` — the two are maintained independently (TS tracker
// class vs CLI script, same split as every other op in this file), so keep them in sync.
// Author HTML passes through untouched; Markdown that would otherwise render as a literal
// #/**/| wall is converted. See knowledge/execution/azure-html-format.md.
//
// Detection must not fire on tag-LIKE text that isn't markup: a bare `<` comparison (`a<b`,
// `(a<i)`), a generic (`List<T>`), an inline mention of an element (`the <div> wrapper`), or an
// angle bracket inside a code fence. So we strip fenced + inline code first, then require a real
// FULL-HTML signal — a CLOSING tag or a block tag anchored at the start of a line — none of which a
// stray `<tag` substring in prose produces. A lone self-closing void element (`<br>`/`<img>`/`<hr>`)
// is deliberately NOT a full-HTML signal on its own: a mostly-Markdown body that embeds one must
// still be Markdown-converted, with the embed preserved verbatim by mdToHtml's raw-HTML-line
// passthrough (NOT passed through whole, which would leave the surrounding Markdown as a literal wall).
const HTML_SIGNAL_RE =
  /<\/(?:h[1-6]|ol|ul|li|p|table|thead|tbody|tr|td|th|div|pre|code|b|strong|em|i|a|img|details|summary|blockquote)>|(?:^|\n)\s*<(?:h[1-6]|ol|ul|li|p|table|thead|tbody|tr|td|th|div|pre|code|blockquote|details)\b/i;

function looksLikeHtml(s: string): boolean {
  const outsideCode = s.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  return HTML_SIGNAL_RE.test(outsideCode);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s: string): string {
  return s
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    // Images: MUST run before the link regex below — `![alt](url)` would otherwise be matched by
    // the link pattern (which sees `[alt](url)` and ignores the leading `!`), degrading a screenshot
    // embed into a bare text link. Same scheme allowlist as links, restricted to http(s) (no
    // `mailto:` image src); a disallowed/unsupported scheme drops the tag and keeps the alt text.
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, u: string) => {
      const url = String(u).trim();
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
      if (scheme && !/^https?$/i.test(scheme[1])) return alt;
      return `<img src="${url.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}">`;
    })
    // Links: `&`/`<`/`>` already escaped by escapeHtml; escape `"` so it can't break the href attribute.
    // Allow ONLY http(s)/mailto + relative/anchor URLs — a disallowed scheme (javascript:/data:/…) drops
    // the anchor and keeps the visible text, so a poisoned link can't inject an executable href.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t: string, u: string) => {
      const url = String(u).trim();
      const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
      if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) return t; // unsafe scheme → text only, no <a>
      return `<a href="${url.replace(/"/g, "&quot;")}">${t}</a>`;
    });
}

function mdToHtml(md: string): string {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ol" | "ul" | null = null;
  const closeList = (): void => {
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
  const isRawHtmlLine = (l: string): boolean => {
    const t = l.trim();
    return /^<\/?[a-zA-Z]/.test(t) && t.endsWith(">");
  };
  const isBlockStart = (l: string): boolean =>
    isRawHtmlLine(l) || /^(#{1,6}\s|```|\s*\|.*\|\s*$|\s*\d+\.\s|\s*[-*+]\s)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(escapeHtml(lines[i++]));
      i++;
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
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string): string[] => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const isSep = (r: string): boolean => /-/.test(r) && /^\s*\|?[\s:|-]+\|?\s*$/.test(r) && !/[^\s:|-]/.test(r);
      let html = '<table border="1" style="border-collapse:collapse;">';
      let headerDone = false;
      const hasSep = rows.some(isSep);
      for (const r of rows) {
        if (isSep(r)) {
          headerDone = true;
          continue;
        }
        const tag = !headerDone && hasSep ? "th" : "td";
        html += "<tr>" + cells(r).map((c) => `<${tag}>${inlineMd(escapeHtml(c))}</${tag}>`).join("") + "</tr>";
      }
      out.push(html + "</table>");
      continue;
    }
    let m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      closeList();
      const lvl = Math.min(m[1].length + 2, 6);
      out.push(`<h${lvl}>${inlineMd(escapeHtml(m[2]))}</h${lvl}>`);
      i++;
      continue;
    }
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
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }
    closeList();
    const para: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      para.push(inlineMd(escapeHtml(lines[i++])));
    }
    out.push(`<p>${para.join("<br/>")}</p>`);
  }
  closeList();
  return out.join("\n");
}

/** Author-provided HTML passes through; Markdown is converted. Empty stays empty. */
function ensureAzureHtml(text: string): string {
  const s = String(text || "").trim();
  if (!s) return s;
  return looksLikeHtml(s) ? s : mdToHtml(s);
}

export class AzureTracker implements Tracker {
  readonly kind = "azure";
  readonly enabled: boolean;
  private org: string;
  private project: string;
  private roleStates: Record<string, string>;
  private stateMap: Record<string, string>;
  private dryRun: boolean;
  private log: (msg: string) => void;

  constructor(deps: TrackerDeps) {
    const profile: any = loadProjectProfile();
    const az = profile.tracker?.azure || {};
    this.org = process.env.ADO_ORG || az.organization || "";
    this.project = process.env.ADO_PROJECT || az.project || "";
    this.roleStates = az.roleStates || {};
    this.stateMap = az.stateMap || {};
    this.enabled = Boolean(this.org && this.project && adoConfigured());
    this.dryRun = deps.dryRun;
    this.log = deps.log;
  }

  private base(): string {
    return adoBase(this.org, this.project);
  }

  /** Shared request helper — builds auth + content-type headers and issues the fetch,
   *  so every op below shares one place for headers/body encoding. */
  private async req(
    method: string,
    pathAndQuery: string,
    opts: { body?: unknown; jsonPatch?: boolean } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: await adoAuthHeader(),
      Accept: "application/json",
    };
    if (opts.body !== undefined) {
      headers["Content-Type"] = opts.jsonPatch ? "application/json-patch+json" : "application/json";
    }
    return fetch(`${this.base()}${pathAndQuery}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  }

  defaultQuery(label: string): string {
    // Azure Boards has no JQL — this is WIQL. Work items are numeric (no letter
    // prefix); labels live in System.Tags; state is a free-text field (default
    // "Done" excluded via the profile stateMap's Done mapping is not needed here —
    // we compare the raw state name). ORDER BY priority ascending (1 = highest).
    return (
      `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${this.project}' ` +
      `AND [System.WorkItemType] = 'Bug' AND [System.State] <> 'Done' ` +
      `AND [System.Tags] CONTAINS '${label}' ORDER BY [Microsoft.VSTS.Common.Priority] ASC`
    );
  }

  async getIssue(key: string): Promise<TrackerTicket | null> {
    if (!this.enabled) return null;
    const res = await this.req(
      "GET",
      `/_apis/wit/workitems/${encodeURIComponent(key)}?$expand=all&api-version=${API_VERSION}`,
    );
    if (!res.ok) {
      this.log(`ADO: failed to fetch ${key} — ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    const f = data.fields || {};
    const tags = String(f["System.Tags"] || "");
    return {
      key: String(data.id ?? key),
      summary: f["System.Title"] || "",
      description: htmlToText(f["System.Description"] || ""),
      status: f["System.State"] || "",
      priority: String(f["Microsoft.VSTS.Common.Priority"] ?? ""),
      components: f["System.AreaPath"] ? [String(f["System.AreaPath"])] : [],
      labels: tags ? tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
      assignee: f["System.AssignedTo"]?.displayName || null,
      raw: data,
    };
  }

  async search(wiql: string, max: number): Promise<string[]> {
    if (!this.enabled) return [];
    const res = await this.req("POST", `/_apis/wit/wiql?api-version=${API_VERSION}`, {
      body: { query: wiql },
    });
    if (!res.ok) {
      this.log(`ADO: WIQL search failed — ${res.status}`);
      return [];
    }
    const data = (await res.json()) as any;
    return (data.workItems || []).map((w: any) => String(w.id)).slice(0, max);
  }

  async comment(key: string, text: string): Promise<void> {
    if (!this.enabled || this.dryRun) {
      this.log(`ADO: (skipped${this.dryRun ? " dry-run" : ""}) comment on ${key}`);
      return;
    }
    // Comments are an HTML field — convert Markdown so it doesn't collapse into one
    // unreadable blob (author HTML is detected and passed through). See azure-html-format.md.
    const res = await this.req(
      "POST",
      `/_apis/wit/workItems/${encodeURIComponent(key)}/comments?api-version=${COMMENTS_API_VERSION}`,
      { body: { text: ensureAzureHtml(text) } },
    );
    if (!res.ok) this.log(`ADO: comment on ${key} failed — ${res.status}`);
  }

  async transition(key: string, transitionName: string): Promise<void> {
    if (!this.enabled || this.dryRun) {
      this.log(`ADO: (skipped${this.dryRun ? " dry-run" : ""}) transition ${key} → ${transitionName}`);
      return;
    }
    // No named transitions in Azure Boards — set System.State directly. `transitionName`
    // is normally a lifecycle ROLE key ("in-progress" | "in-review" | "ready-for-test" |
    // "done") — resolve it via the scanned profile.tracker.azure.roleStates first (the
    // only mechanism /project-init's discover-tracker.mjs ever populates); fall back to
    // the legacy free-form stateMap for a caller still passing a raw display name, then
    // to the raw name itself when neither map has it.
    const targetState = this.roleStates[transitionName] || this.stateMap[transitionName] || transitionName;
    const res = await this.req(
      "PATCH",
      `/_apis/wit/workitems/${encodeURIComponent(key)}?api-version=${API_VERSION}`,
      { body: [{ op: "add", path: "/fields/System.State", value: targetState }], jsonPatch: true },
    );
    if (!res.ok) this.log(`ADO: transition ${key} → ${targetState} failed — ${res.status}`);
  }

  // Field-building mirrors `ado.mjs`'s `create-workitem` command (same endpoint, same
  // JSON-Patch shape) — the two are maintained independently (CLI script vs TS tracker
  // class, same split as every other op in this file), so keep them in sync when either
  // changes: field list, tag normalization, and any new optional field.
  async createWorkItem(
    input: CreateWorkItemInput,
  ): Promise<{ key: string; url: string } | null> {
    if (!this.enabled || this.dryRun) {
      this.log(`ADO: (skipped${this.dryRun ? " dry-run" : ""}) create ${input.type} "${input.title}"`);
      return null;
    }
    // Body is a JSON-Patch array; the leading `$` before the type is required by the
    // create endpoint. Optional fields are only patched when supplied.
    const fields: Array<{ op: string; path: string; value: unknown }> = [
      { op: "add", path: "/fields/System.Title", value: input.title },
    ];
    // Description & ReproSteps are HTML fields — convert Markdown so it doesn't render as a
    // literal #/**/| wall (author HTML is detected and passed through). See azure-html-format.md.
    if (input.description) fields.push({ op: "add", path: "/fields/System.Description", value: ensureAzureHtml(input.description) });
    if (input.reproSteps) fields.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: ensureAzureHtml(input.reproSteps) });
    if (input.severity) fields.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Severity", value: input.severity });
    if (input.priority !== undefined) fields.push({ op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: input.priority });
    // ADO stores tags ";"-separated — normalize the same way ado.mjs's CLI path does, in
    // case a caller passes a label containing a comma (each `labels[]` entry is expected
    // to be one tag, but this guards against a caller splitting on the wrong delimiter).
    if (input.labels?.length) {
      const tags = input.labels
        .flatMap((l) => l.split(/[,;]/))
        .map((s) => s.trim())
        .filter(Boolean)
        .join("; ");
      if (tags) fields.push({ op: "add", path: "/fields/System.Tags", value: tags });
    }
    const res = await this.req(
      "POST",
      `/_apis/wit/workitems/$${encodeURIComponent(input.type)}?api-version=${API_VERSION}`,
      { body: fields, jsonPatch: true },
    );
    if (!res.ok) {
      this.log(`ADO: create ${input.type} failed — ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    if (data?.id === undefined || data?.id === null) {
      this.log(`ADO: create ${input.type} succeeded but returned no id`);
      return null;
    }
    const key = String(data.id);
    return {
      key,
      url: `https://dev.azure.com/${this.org}/${encodeURIComponent(this.project)}/_workitems/edit/${key}`,
    };
  }
}
