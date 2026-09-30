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

export const AGENT_LABEL = "found-by-agent";
export const HUMAN_LABEL = "reported-by-human";
export const WHEN_LABELS = ["found-in-testing", "found-in-regression"];

/** Pull the issue type and labels out of the tool input of any Atlassian MCP create call. */
export function readCreateInput(toolName, toolInput) {
  let input = toolInput ?? {};
  // Atlassian_MCP routes discovered operations through executeWrite({ name, inputs }).
  if (/__executeWrite$/.test(toolName ?? "")) {
    if (!/createJiraIssue/i.test(String(input.name ?? ""))) return null;
    input = input.inputs ?? {};
  } else if (!/__createJiraIssue$/.test(toolName ?? "")) {
    return null;
  }
  const type = String(
    input.issueTypeName ?? input.issueType ?? input.fields?.issuetype?.name ?? input.additional_fields?.issuetype?.name ?? "",
  );
  const raw = input.additional_fields?.labels ?? input.fields?.labels ?? input.labels ?? [];
  const labels = (Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/)).map((l) => String(l).trim()).filter(Boolean);
  return { type, labels };
}

const HELP =
  `  found-by-agent + found-in-testing      Claude found it while testing a ticket\n` +
  `  found-by-agent + found-in-regression   Claude found it in a regression run\n` +
  `  reported-by-human                      a person found it; Claude only filed it (also when unsure)\n` +
  `Add them to additional_fields.labels (keep any labels already there) and create the issue again.`;

/**
 * @returns {string|null} a refusal message when a Bug is being created without a valid label
 *   set, otherwise null (not a create call, not a Bug, or labelled correctly).
 */
export function bugLabelRefusal(toolName, toolInput) {
  const read = readCreateInput(toolName, toolInput);
  if (!read || read.type.toLowerCase() !== "bug") return null;
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
