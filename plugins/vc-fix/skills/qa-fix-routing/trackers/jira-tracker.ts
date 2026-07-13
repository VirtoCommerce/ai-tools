/**
 * JiraTracker — the Tracker implementation extracted VERBATIM from the inline
 * JIRA REST helpers that used to live in ci/run-fix-cycle.ts. Behaviour is
 * identical: same endpoints, same auth (Basic email:token), same guards, same
 * log strings. This is the default tracker, so existing runs are unaffected.
 *
 * Config (unchanged env vars): JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.
 */
import type { Tracker, TrackerTicket, TrackerDeps, CreateWorkItemInput } from "./tracker.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

/** Flatten Atlassian Document Format (ADF) to plain text (best-effort). */
function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[]; type?: string };
  if (typeof n.text === "string") return n.text;
  let out = "";
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += adfToText(child);
    if (["paragraph", "heading", "listItem", "blockquote"].includes(n.type || "")) out += "\n";
  }
  return out;
}

export class JiraTracker implements Tracker {
  readonly kind = "jira";
  readonly enabled: boolean;
  private baseUrl: string;
  private email: string;
  private apiToken: string;
  private projectKey: string;
  private dryRun: boolean;
  private log: (msg: string) => void;

  constructor(deps: TrackerDeps) {
    // Non-secret base URL + project key: env wins, else the deployment profile.
    // Email + token are secrets and stay env-only. No profile + no env ⇒ "" base
    // (disabled) and projectKey "VCST" = the original VC-internal behaviour.
    const profile: any = loadProjectProfile();
    this.baseUrl = (process.env.JIRA_BASE_URL || profile.tracker?.baseUrl || "").replace(/\/$/, "");
    this.email = process.env.JIRA_EMAIL || "";
    this.apiToken = process.env.JIRA_API_TOKEN || "";
    this.projectKey = process.env.JIRA_PROJECT_KEY || profile.tracker?.projectKey || "VCST";
    this.enabled = Boolean(this.baseUrl && this.email && this.apiToken);
    this.dryRun = deps.dryRun;
    this.log = deps.log;
  }

  defaultQuery(label: string): string {
    // Preserves the historical VC-internal query verbatim when projectKey = VCST.
    return `project = ${this.projectKey} AND issuetype = Bug AND statusCategory != Done AND labels = "${label}" ORDER BY priority DESC`;
  }

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
  }

  async getIssue(key: string): Promise<TrackerTicket | null> {
    if (!this.enabled) return null;
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${key}`, {
      headers: { Authorization: this.authHeader(), Accept: "application/json" },
    });
    if (!res.ok) {
      this.log(`JIRA: failed to fetch ${key} — ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    const f = data.fields || {};
    return {
      key: data.key,
      summary: f.summary || "",
      description: adfToText(f.description).trim(),
      status: f.status?.name || "",
      priority: f.priority?.name || "",
      components: (f.components || []).map((c: any) => c.name),
      labels: f.labels || [],
      assignee: f.assignee?.displayName || null,
      raw: data,
    };
  }

  async search(jql: string, max: number): Promise<string[]> {
    if (!this.enabled) return [];
    const res = await fetch(`${this.baseUrl}/rest/api/3/search`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ jql, maxResults: max, fields: ["key"] }),
    });
    if (!res.ok) {
      this.log(`JIRA: search failed — ${res.status}`);
      return [];
    }
    const data = (await res.json()) as any;
    return (data.issues || []).map((i: any) => i.key);
  }

  async comment(key: string, text: string): Promise<void> {
    if (!this.enabled || this.dryRun) {
      this.log(`JIRA: (skipped${this.dryRun ? " dry-run" : ""}) comment on ${key}`);
      return;
    }
    const body = {
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    };
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue/${key}/comment`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) this.log(`JIRA: comment on ${key} failed — ${res.status}`);
  }

  async transition(key: string, transitionName: string): Promise<void> {
    if (!this.enabled || this.dryRun) {
      this.log(`JIRA: (skipped${this.dryRun ? " dry-run" : ""}) transition ${key} → ${transitionName}`);
      return;
    }
    const tRes = await fetch(`${this.baseUrl}/rest/api/3/issue/${key}/transitions`, {
      headers: { Authorization: this.authHeader(), Accept: "application/json" },
    });
    if (!tRes.ok) return;
    const tData = (await tRes.json()) as any;
    const match = (tData.transitions || []).find(
      (t: any) => t.name.toLowerCase() === transitionName.toLowerCase(),
    );
    if (!match) {
      this.log(`JIRA: no transition "${transitionName}" available for ${key}`);
      return;
    }
    await fetch(`${this.baseUrl}/rest/api/3/issue/${key}/transitions`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ transition: { id: match.id } }),
    });
  }

  async createWorkItem(
    input: CreateWorkItemInput,
  ): Promise<{ key: string; url: string } | null> {
    if (!this.enabled || this.dryRun) {
      this.log(`JIRA: (skipped${this.dryRun ? " dry-run" : ""}) create ${input.type} "${input.title}"`);
      return null;
    }
    // Description is ADF. Repro steps (an Azure-native field) fold into the description
    // as a second paragraph. `severity` is Azure-only and has no Jira field.
    const paras = [input.description, input.reproSteps]
      .filter((t): t is string => Boolean(t))
      .map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }));
    const fields: any = {
      project: { key: this.projectKey },
      summary: input.title,
      // Assumes the project's issue-type scheme has this type name (default "Bug");
      // an unknown name surfaces as the create 400 logged below, not a silent miss.
      issuetype: { name: input.type || "Bug" },
      description: { type: "doc", version: 1, content: paras },
    };
    // Jira priority is set by id, and Jira priority-id-to-meaning is scheme/instance-specific
    // — NOT guaranteed to be the same small "1 = highest" ordinal space as Azure's
    // Microsoft.VSTS.Common.Priority. This best-effort mapping assumes the project's default
    // scheme; a create that fails or lands on the wrong priority for a customized scheme
    // surfaces as the logged 400 below, not a silent miss.
    if (input.priority !== undefined) fields.priority = { id: String(input.priority) };
    if (input.labels?.length) fields.labels = input.labels;
    const res = await fetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      this.log(`JIRA: create ${input.type} failed — ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    if (!data?.key) {
      this.log(`JIRA: create ${input.type} succeeded but returned no key`);
      return null;
    }
    return { key: data.key, url: `${this.baseUrl}/browse/${data.key}` };
  }
}
