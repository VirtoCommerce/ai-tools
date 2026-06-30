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

export interface Tracker {
  /** Short kind label for logs: "jira" | "azure". */
  readonly kind: string;
  /** True iff this tracker has the creds/config to reach its backend. */
  readonly enabled: boolean;
  /** Fetch a ticket by key/id. Null when unreachable, disabled, or not found. */
  getIssue(key: string): Promise<TrackerTicket | null>;
  /** Find ticket keys/ids via the tracker's query language (JQL / WIQL). */
  search(query: string, max: number): Promise<string[]>;
  /** Post a progress comment (no-op on dryRun / when disabled). */
  comment(key: string, text: string): Promise<void>;
  /** Move the ticket to a named status/state (no-op on dryRun / when disabled). */
  transition(key: string, transitionName: string): Promise<void>;
}
