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
    const res = await this.req(
      "POST",
      `/_apis/wit/workItems/${encodeURIComponent(key)}/comments?api-version=${COMMENTS_API_VERSION}`,
      { body: { text } },
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
    if (input.description) fields.push({ op: "add", path: "/fields/System.Description", value: input.description });
    if (input.reproSteps) fields.push({ op: "add", path: "/fields/Microsoft.VSTS.TCM.ReproSteps", value: input.reproSteps });
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
