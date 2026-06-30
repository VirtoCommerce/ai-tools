/**
 * JiraTracker — the Tracker implementation extracted VERBATIM from the inline
 * JIRA REST helpers that used to live in ci/run-fix-cycle.ts. Behaviour is
 * identical: same endpoints, same auth (Basic email:token), same guards, same
 * log strings. This is the default tracker, so existing runs are unaffected.
 *
 * Config (unchanged env vars): JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.
 */
import type { Tracker, TrackerTicket, TrackerDeps } from "./tracker.js";
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
  private dryRun: boolean;
  private log: (msg: string) => void;

  constructor(deps: TrackerDeps) {
    // Non-secret base URL: env wins, else the deployment profile. Email + token
    // are secrets and stay env-only. No profile + no env ⇒ "" (disabled) = the
    // original behaviour.
    const profile: any = loadProjectProfile();
    this.baseUrl = (process.env.JIRA_BASE_URL || profile.tracker?.baseUrl || "").replace(/\/$/, "");
    this.email = process.env.JIRA_EMAIL || "";
    this.apiToken = process.env.JIRA_API_TOKEN || "";
    this.enabled = Boolean(this.baseUrl && this.email && this.apiToken);
    this.dryRun = deps.dryRun;
    this.log = deps.log;
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
}
