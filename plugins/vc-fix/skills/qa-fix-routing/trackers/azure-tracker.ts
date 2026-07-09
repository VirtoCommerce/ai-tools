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
import type { Tracker, TrackerTicket, TrackerDeps } from "./tracker.js";
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
    const res = await fetch(
      `${this.base()}/_apis/wit/workitems/${encodeURIComponent(key)}?$expand=all&api-version=${API_VERSION}`,
      { headers: { Authorization: await adoAuthHeader(), Accept: "application/json" } },
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
    const res = await fetch(`${this.base()}/_apis/wit/wiql?api-version=${API_VERSION}`, {
      method: "POST",
      headers: {
        Authorization: await adoAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: wiql }),
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
    const res = await fetch(
      `${this.base()}/_apis/wit/workItems/${encodeURIComponent(key)}/comments?api-version=${COMMENTS_API_VERSION}`,
      {
        method: "POST",
        headers: {
          Authorization: await adoAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text }),
      },
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
    const res = await fetch(
      `${this.base()}/_apis/wit/workitems/${encodeURIComponent(key)}?api-version=${API_VERSION}`,
      {
        method: "PATCH",
        headers: {
          Authorization: await adoAuthHeader(),
          "Content-Type": "application/json-patch+json",
          Accept: "application/json",
        },
        body: JSON.stringify([{ op: "add", path: "/fields/System.State", value: targetState }]),
      },
    );
    if (!res.ok) this.log(`ADO: transition ${key} → ${targetState} failed — ${res.status}`);
  }
}
