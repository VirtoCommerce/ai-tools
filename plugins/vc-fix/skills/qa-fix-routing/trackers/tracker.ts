/**
 * Tracker — bug-tracker abstraction for the auto-fix pipeline.
 *
 * The pipeline reads a ticket, posts progress comments, and transitions status.
 * Historically these were inline JIRA REST calls in run-fix-cycle.ts; they now
 * sit behind this interface so a client deployment can swap in Azure Boards (or
 * any tracker) via the project profile WITHOUT touching the pipeline.
 *
 * Default resolution is "jira" (see ./index.ts) — an unconfigured /
 * VirtoCommerce-internal checkout behaves exactly as before.
 */

/** Tracker-agnostic ticket shape (was JiraTicket inline in run-fix-cycle.ts). */
export interface TrackerTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  components: string[];
  labels: string[];
  assignee: string | null;
  raw: unknown;
}

export interface TrackerDeps {
  /** When true, mutating ops (comment/transition) are logged and skipped. */
  dryRun: boolean;
  /** Pipeline logger (timestamped). */
  log: (msg: string) => void;
}

/** Tracker-agnostic new-ticket shape (Jira issue / Azure Boards work item). */
export interface CreateWorkItemInput {
  /** Work item type — "Bug" (Azure); the Jira issuetype name (defaults to "Bug"). */
  type: string;
  title: string;
  description?: string;
  /** Repro steps — Azure Microsoft.VSTS.TCM.ReproSteps; folded into the Jira description. */
  reproSteps?: string;
  /** Free-form severity label, e.g. "2 - High" (Azure only; ignored by Jira). */
  severity?: string;
  priority?: number;
  labels?: string[];
}

export interface Tracker {
  /** Short kind label for logs: "jira" | "azure". */
  readonly kind: string;
  /** True iff this tracker has the creds/config to reach its backend. */
  readonly enabled: boolean;
  /** Fetch a ticket by key/id. Null when unreachable, disabled, or not found. */
  getIssue(key: string): Promise<TrackerTicket | null>;
  /** Find ticket keys/ids via the tracker's query language (JQL / WIQL). */
  search(query: string, max: number): Promise<string[]>;
  /**
   * The tracker's own default "open auto-fix bugs" discovery query, in ITS query
   * language (Jira → JQL over the profile/env project key; Azure → WIQL over the
   * team project, tags-as-labels). Used when the caller sets no explicit query.
   * `label` is the auto-fix label/tag to filter on.
   */
  defaultQuery(label: string): string;
  /** Post a progress comment (no-op on dryRun / when disabled). */
  comment(key: string, text: string): Promise<void>;
  /** Move the ticket to a named status/state (no-op on dryRun / when disabled). */
  transition(key: string, transitionName: string): Promise<void>;
  /**
   * Create a new ticket/work item. OPTIONAL — not every caller needs it, so the
   * bug-filing path can feature-detect (`tracker.createWorkItem?.(…)`). Returns the
   * created key/id + web URL, or null on dryRun / when disabled.
   */
  createWorkItem?(input: CreateWorkItemInput): Promise<{ key: string; url: string } | null>;
}
