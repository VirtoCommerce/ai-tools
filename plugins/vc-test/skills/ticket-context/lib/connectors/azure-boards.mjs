// plugins/vc-test/skills/ticket-context/lib/connectors/azure-boards.mjs — the Azure Boards tracker connector (spec §7).
// Every read is one `node "$VC_RUN" ado …` launch (vc-fix's qa-fix-routing/ado.mjs, org and project pinned to the
// profile). A work item is normalised to the Jira issue shape buildInventory, ticketFields and the blind cut already
// read, so nothing downstream of prepare knows which tracker ran. A field Azure does not return stays empty — never
// a guessed value; "done" comes only from the profile's role states.
import { bridgeDownload, bridgeRun, bridgeTempFiles } from "../bridge.mjs";
import { CAPS, htmlToText } from "../fetch.mjs";
import { GapError, asGap, gap } from "../gap.mjs";
import { AZURE_ATTACHMENT_RE as ATTACHMENT_RE } from "../inventory.mjs";
import { outputRoot } from "../paths.mjs";

const WORK_ITEM_RE = /\/workItems\/(\d+)$/i;
const PR_ARTIFACT_RE = /^vstfs:\/\/\/Git\/PullRequestId\/(.+)$/i;
const LINK_RELS = /^System\.LinkTypes\.(Related|Duplicate-(Forward|Reverse)|Dependency-(Forward|Reverse))$/i;

/** HTML → the text a Jira field would carry: a link keeps its URL ("label (url)"), an inline image is dropped (it is
 *  an attachment, paired through the rendered HTML), entities decoded. */
export function htmlText(html) {
  if (typeof html !== "string") return html ?? null;
  return htmlToText(html
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
      const text = htmlToText(label).trim();
      return text && text !== url ? `${text} (${url})` : url;
    }));
}

const idOf = (url) => WORK_ITEM_RE.exec(String(url ?? ""))?.[1] ?? null;
const guidOf = (url) => ATTACHMENT_RE.exec(String(url ?? ""))?.[1]?.toLowerCase() ?? null;

function doneKey(profile, type, state) {
  const done = profile.azure?.roleStatesByType?.[type]?.done ?? profile.azure?.roleStates?.done;
  return state && done && state === done ? "done" : null;
}

function comment(c, html) {
  return { id: String(c.id), created: c.createdDate ?? null, updated: c.modifiedDate ?? c.createdDate ?? null, body: html ? (c.text ?? "") : htmlText(c.text ?? "") };
}

/** A work item (`get-workitem --json`, `$expand=all`) and its comments page (`comments`) as a Jira issue. */
export function normalizeWorkItem(item, commentsPage, profile, fieldIds = []) {
  const f = item.fields ?? {};
  const rels = Array.isArray(item.relations) ? item.relations : [];
  const type = f["System.WorkItemType"] ?? null;
  const state = f["System.State"] ?? null;
  const parentId = rels.map((r) => (/Hierarchy-Reverse$/i.test(r.rel) ? idOf(r.url) : null)).find(Boolean);
  const raw = commentsPage?.comments ?? [];
  const fields = {
    summary: f["System.Title"] ?? "",
    issuetype: { name: type },
    status: { name: state, statusCategory: { key: doneKey(profile, type, state) } },
    priority: f["Microsoft.VSTS.Common.Priority"] != null ? { name: String(f["Microsoft.VSTS.Common.Priority"]) } : null,
    labels: String(f["System.Tags"] ?? "").split(";").map((t) => t.trim()).filter(Boolean),
    components: [],
    fixVersions: [],
    created: f["System.CreatedDate"] ?? null,
    updated: f["System.ChangedDate"] ?? null,
    description: htmlText(f["System.Description"] ?? null),
    attachment: rels.filter((r) => r.rel === "AttachedFile" && guidOf(r.url)).map((r) => ({
      id: guidOf(r.url), filename: r.attributes?.name ?? guidOf(r.url), size: r.attributes?.resourceSize ?? null, content: r.url,
      created: r.attributes?.resourceCreatedDate ?? r.attributes?.authorizedDate ?? null,
    })),
    subtasks: rels.filter((r) => /Hierarchy-Forward$/i.test(r.rel) && idOf(r.url)).map((r) => ({ key: idOf(r.url) })),
    // Azure's own link name ("Related", "Duplicate-Forward", "Dependency-Reverse") is the type name rankLinked reads;
    // a -Reverse link points inward, as Jira's inwardIssue does.
    issuelinks: rels.filter((r) => LINK_RELS.test(r.rel) && idOf(r.url)).map((r) => ({
      type: { name: r.rel.replace(/^System\.LinkTypes\./i, "") },
      [/-Reverse$/i.test(r.rel) ? "inwardIssue" : "outwardIssue"]: { key: idOf(r.url) },
    })),
    ...(parentId ? { parent: { key: parentId, fields: { summary: "" } } } : {}),
  };
  const renderedFields = { description: f["System.Description"] ?? null };
  for (const id of fieldIds) {
    if (!(id in f) || id === "System.Description") continue;
    fields[id] = typeof f[id] === "string" ? htmlText(f[id]) : f[id];
    renderedFields[id] = f[id];
  }
  if (commentsPage) {
    fields.comment = { total: Number.isInteger(commentsPage.total) ? commentsPage.total : raw.length, startAt: 0, maxResults: raw.length, comments: raw.map((c) => comment(c, false)) };
    renderedFields.comment = { comments: raw.map((c) => comment(c, true)) };
  }
  return { key: String(item.id), id: String(item.id), fields, renderedFields };
}

export function azureBoardsConnector({ profile, key, run = bridgeRun, root = outputRoot() }) {
  const base = profile.trackerBase;
  const origin = new URL(base).origin;
  const items = new Map(); // id → the raw work item, for the relation reads after issue()
  const tempFile = bridgeTempFiles(key, root);
  const getItem = async (id) => {
    if (!items.has(String(id))) items.set(String(id), await run("ado", ["get-workitem", "--id", String(id), "--json"]));
    return items.get(String(id));
  };
  const wiql = (query, extra = []) => run("ado", ["wiql", "--query", query, ...extra]);
  return {
    base,
    fields: async () => profile.fieldList.map((x) => ({ ...x, custom: true })), // the fields /project-init scanned
    issue: async (k, fieldIds, { gaps = [] } = {}) => {
      const item = await getItem(k);
      let page = null;
      if (fieldIds.includes("comment")) {
        try {
          page = await run("ado", ["comments", "--id", String(k), "--max", String(CAPS.comments)]);
          if (page.truncated) gaps.push(gap("comments", "over-cap", `${page.total - page.comments.length} of ${page.total} comments not read: more than ${CAPS.comments} comments; the ${CAPS.comments} oldest are read`));
        } catch (e) { const g = asGap("comments", e); gaps.push(gap("comments", g.reason, `comments not read: ${g.detail ?? g.reason}`)); }
      }
      const issue = normalizeWorkItem(item, page, profile, fieldIds);
      if (issue.fields.parent) {
        try { issue.fields.parent.fields.summary = (await getItem(issue.fields.parent.key)).fields?.["System.Title"] ?? ""; } catch { /* the epic's title is context only */ }
      }
      return issue;
    },
    latestComments: async (k, count) => {
      const page = await run("ado", ["comments", "--id", String(k), "--newest", "--max", String(count)]);
      const comments = (page.comments ?? []).slice(0, count).map((c) => comment(c, false));
      return { comments, total: Number.isInteger(page.total) ? page.total : comments.length };
    },
    remoteLinks: async (k) => ((await getItem(k)).relations ?? []).filter((r) => r.rel === "Hyperlink").map((r) => ({ object: { url: r.url, title: r.attributes?.comment ?? "" } })),
    /** The work item's own pull-request links (ArtifactLink) — a stronger link than a key search (§7). */
    linkedPrs: async (issue) => ({
      urls: [],
      refs: ((await getItem(issue.key)).relations ?? []).flatMap((r) => {
        const m = r.rel === "ArtifactLink" && PR_ARTIFACT_RE.exec(r.url ?? "");
        const [project, repo, number] = m ? decodeURIComponent(m[1]).split("/") : [];
        return m && project && repo && /^\d+$/.test(number ?? "") ? [{ ref: `${project}/${repo}#${number}`, owner: project, repo, number: Number(number) }] : [];
      }),
    }),
    siblings: async (parentKey, k) => ((await wiql(`SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = ${parentKey} AND [System.Id] <> ${k} ORDER BY [System.ChangedDate] DESC`,
      ["--fields", "System.Title,System.State,System.WorkItemType", "--top", "50"])).items ?? []).map((w) => ({
      key: String(w.id),
      fields: { summary: w["System.Title"] ?? "", status: { name: w["System.State"] ?? null, statusCategory: { key: doneKey(profile, w["System.WorkItemType"], w["System.State"]) } } },
    })),
    recency: async (keys) => ((await wiql(`SELECT [System.Id] FROM WorkItems WHERE [System.Id] IN (${keys.join(",")}) ORDER BY [System.ChangedDate] DESC`,
      ["--top", String(Math.min(keys.length, 100))])).ids ?? []).map(String),
    download: async (url) => {
      const target = new URL(url);
      if (target.origin !== origin) throw new GapError("private-host", `not sent: ${target.host} is not the tracker (${new URL(base).host})`);
      const guid = guidOf(target.pathname);
      if (!guid) throw new GapError("unreadable", `no attachment id in ${target.pathname}`);
      return bridgeDownload(run, "ado", ["download-attachment", "--guid", guid], tempFile("bin"));
    },
    page: async () => { throw new GapError("connector-unavailable", "a Confluence page needs a Jira tracker"); },
  };
}
