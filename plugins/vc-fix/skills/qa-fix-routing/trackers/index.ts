/**
 * Tracker factory. Resolves which bug-tracker adapter the auto-fix pipeline
 * should use, from (in priority order):
 *   1. TRACKER_KIND env override   ("jira" | "azure" | "azure-boards" | "ado")
 *   2. project-profile.json        → tracker.kind
 *   3. "jira"                      (preserves pre-existing behaviour)
 */
import type { Tracker, TrackerDeps } from "./tracker.js";
import { JiraTracker } from "./jira-tracker.js";
import { AzureTracker } from "./azure-tracker.js";
import { loadProjectProfile } from "../../../scripts/lib/project-profile.mjs";

export type { Tracker, TrackerTicket, TrackerDeps } from "./tracker.js";

export type TrackerKind = "jira" | "azure";

export function resolveTrackerKind(): TrackerKind {
  const profile: any = loadProjectProfile();
  const raw = (process.env.TRACKER_KIND || profile.tracker?.kind || "jira").toLowerCase();
  if (raw === "azure" || raw === "azure-boards" || raw === "ado") return "azure";
  return "jira";
}

export function getTracker(
  deps: TrackerDeps,
  kind: TrackerKind = resolveTrackerKind(),
): Tracker {
  return kind === "azure" ? new AzureTracker(deps) : new JiraTracker(deps);
}
