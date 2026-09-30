// Required labels on a bug that Claude files in Jira.
//
// Rule source: .claude/knowledge/execution/tracker-ops.md §Labels on bugs Claude files.
//
// WHY. The detection trials (docs/bug-detection-requirements.md §10) need to know who found a
// bug and when. Every bug Claude files lands under one human reporter, so the reporter cannot
// tell an agent's finding from a person's, and the `qa-found` label is applied by hand and
// unreliably. The only moment the answer is known for certain is when the bug is created, so the
// labels are required there, by the PreToolUse hook that calls this module.
//
// The scheme — exactly one WHO label, and for an agent finding exactly one WHEN label:
//   found-by-agent        — Claude saw the failure itself in its own run
//     found-in-testing    —   while testing a ticket (/qa-test, /qa-test-fast, exploratory)
//     found-in-regression —   in a regression run (/qa-regression, ci:regression, triage)
//   reported-by-human     — a person found it (the user, a Teams/partner report); Claude only filed it
// A bug a person described — even one Claude then reproduced — is `reported-by-human`, and so is
// any bug whose origin is unclear.
//
// WHAT COUNTS AS A BUG. Issue type `Bug`, and a `Sub-task` that is one: /qa-test files an in-scope
// bug as a Sub-task of the ticket (tracker-ops.md §5b), but /ba-analyze files story sub-tasks too, so
// a Sub-task is checked only when it carries a bug's marks — the `## Fix Routing` block every
// /qa-bug report ends with, or an origin / auto-fix label.
//
// SCOPE. The labels are VC-internal. A checkout whose project-profile.json says
// `projectType: "client"` files into a client's tracker, and nothing is required there.

export const AGENT_LABEL = "found-by-agent";
export const HUMAN_LABEL = "reported-by-human";
export const WHEN_LABELS = ["found-in-testing", "found-in-regression"];
const BUG_MARK_LABELS = [AGENT_LABEL, HUMAN_LABEL, ...WHEN_LABELS, "vc-fix", "qa-autofix"];

const asLabels = (raw) =>
  raw == null ? [] : (Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/)).map((l) => String(l).trim()).filter(Boolean);

/**
 * Pull the issue type, labels and description out of the tool input of any Atlassian MCP create
 * call. Labels are the UNION of every place a connector accepts them: the claude.ai connector has a
 * top-level `labels` parameter, the others take `additional_fields.labels` or `fields.labels`.
 */
export function readCreateInput(toolName, toolInput) {
  let input = toolInput ?? {};
  // Atlassian_MCP routes discovered operations through executeWrite({ name, inputs }).
  if (/__executeWrite$/.test(toolName ?? "")) {
    if (String(input.name ?? "") !== "createJiraIssue") return null;
    input = input.inputs ?? {};
  } else if (!/__createJiraIssue$/.test(toolName ?? "")) {
    return null;
  }
  const type = String(
    input.issueTypeName ?? input.issueType ?? input.fields?.issuetype?.name ?? input.additional_fields?.issuetype?.name ?? "",
  );
  const labels = [...new Set([input.additional_fields?.labels, input.fields?.labels, input.labels].flatMap(asLabels))];
  const description = String(input.description ?? input.fields?.description ?? "");
  return { type, labels, description };
}

/** A Bug, or a Sub-task carrying a bug's marks (see WHAT COUNTS AS A BUG above). */
export function isBug({ type, labels, description }) {
  const t = type.toLowerCase().replace(/[\s-]/g, "");
  if (t === "bug") return true;
  if (t !== "subtask") return false;
  return /^#{1,3}\s*Fix Routing\b/m.test(description) || labels.some((l) => BUG_MARK_LABELS.includes(l));
}

const HELP =
  `  found-by-agent + found-in-testing      Claude found it while testing a ticket\n` +
  `  found-by-agent + found-in-regression   Claude found it in a regression run\n` +
  `  reported-by-human                      a person found it; Claude only filed it (also when unsure)\n` +
  `Add them to the call's labels (the \`labels\` parameter where the tool has one, else additional_fields.labels),\n` +
  `keep any labels already there, and create the issue again.`;

/**
 * @param {{projectType?: string}} [profile] the deployment profile; `client` ⇒ nothing is required
 * @returns {string|null} a refusal message when a Bug is being created without a valid label
 *   set, otherwise null (not a create call, not a Bug, a client tracker, or labelled correctly).
 */
export function bugLabelRefusal(toolName, toolInput, profile = {}) {
  if (profile?.projectType === "client") return null;
  const read = readCreateInput(toolName, toolInput);
  if (!read || !isBug(read)) return null;
  const agent = read.labels.includes(AGENT_LABEL);
  const human = read.labels.includes(HUMAN_LABEL);
  const when = WHEN_LABELS.filter((l) => read.labels.includes(l));
  const rule = "(tracker-ops.md §Labels on bugs Claude files)";

  if (agent && human) return `A bug cannot be both \`${AGENT_LABEL}\` and \`${HUMAN_LABEL}\` ${rule}. Keep one.\n${HELP}`;
  if (!agent && !human) return `A bug Claude files must say who found it: \`${AGENT_LABEL}\` or \`${HUMAN_LABEL}\` ${rule}.\n${HELP}`;
  if (human) return null;
  if (when.length === 0) return `\`${AGENT_LABEL}\` needs when it was found: \`found-in-testing\` or \`found-in-regression\` ${rule}.\n${HELP}`;
  if (when.length > 1) return `A bug has one origin — keep either \`found-in-testing\` or \`found-in-regression\`, not both ${rule}.\n${HELP}`;
  return null;
}
