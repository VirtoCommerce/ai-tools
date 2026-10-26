#!/usr/bin/env node
/**
 * render-scan.mjs — the operator's confirmation tables for /project-init §4a and §4b, as Markdown.
 *
 * A scan result is confirmed by a person, so what they see must be COMPLETE and identical on every run:
 * the role → state map of every scanned work-item type, every client repo with its default branch and
 * PR target. Rendering that by hand let the table shrink to a parenthetical inside the
 * question ("done = Closed, not Resolved/HotFixed?"), which the operator cannot check. The skill shows
 * this output verbatim, then asks.
 *
 * Usage:
 *   node render-scan.mjs --tracker .local-env/tracker.json
 *   node render-scan.mjs --repos .local-env/repos.json
 * Read-only; prints Markdown to stdout.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputRoot } from "./lib/paths.mjs";

/** The roles in the order a ticket moves through them, with what each means to the operator. */
export const ROLES = [
  ["in-progress", "work started"],
  ["in-review", "PR open, under review"],
  ["ready-for-test", "fix merged, ready for QA"],
  ["testing", "QA is testing it"],
  ["tested", "QA passed"],
  ["reopen", "QA failed, back to development"],
  ["done", "closed"],
];

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || "—";

/**
 * The tracker table: one row per role, one column per scanned work-item type, each cell the state a
 * ticket of that type is moved to for that role. Only the mapping is shown — the board's other states
 * are not decisions. A scan from before per-type maps falls back to the primary type's map.
 */
export function renderTracker(t) {
  if (!t || t.kind !== "azure") {
    return "**Tracker: Jira.** Transitions are discovered live on each ticket, so there is no status map to confirm.\n";
  }
  const primary = t.primaryType || Object.keys(t.workItemTypes || {})[0];
  const byType = t.roleStatesByType && Object.keys(t.roleStatesByType).length
    ? t.roleStatesByType
    : primary ? { [primary]: t.roleStates || {} } : {};
  const types = Object.keys(byType);
  if (!types.length) return "**Tracker scan found no work-item types.** Nothing to confirm — fix the Azure DevOps access first.\n";
  const lines = [
    "Where the plugins move a ticket for each role, per work-item type — without asking.",
    "",
    `| Role | Meaning | ${types.map(cell).join(" | ")} |`,
    `|---|---|${types.map(() => "---").join("|")}|`,
  ];
  for (const [role, meaning] of ROLES) {
    lines.push(`| \`${role}\` | ${meaning} | ${types.map((ty) => cell(byType[ty]?.[role])).join(" | ")} |`);
  }
  if (types.some((ty) => ROLES.some(([r]) => !byType[ty]?.[r]))) {
    lines.push("", "**—** = no state found for that role on that type: the plugins ask before that move.");
  }
  return lines.join("\n") + "\n";
}

/** The repo table: every client repo, its default branch and PR target, plus a count of platform repos. */
export function renderRepos(r) {
  const client = Array.isArray(r?.client) ? r.client : [];
  const platform = Array.isArray(r?.platform) ? r.platform : [];
  const hosts = [...new Set(client.map((c) => c.host || c.contribution?.host).filter(Boolean))];
  const head = [
    `**${client.length} client repo(s)${hosts.length === 1 ? ` on ${hosts[0]}` : ""}** · ${platform.length} VirtoCommerce platform repo(s) (not listed — not yours to change)` +
      (r?.clientOrg ? ` · client org \`${r.clientOrg}\`` : "") +
      (r?.projectType ? ` · project type \`${r.projectType}\`` : ""),
  ];
  if (!client.length) {
    return head.concat("", "No client repos found — this reads as a native VirtoCommerce platform project.").join("\n") + "\n";
  }
  const mixed = hosts.length > 1;
  const lines = head.concat(
    "",
    `| Repo | Kind |${mixed ? " Host |" : ""} Default branch | PR target | Notes |`,
    `|---|---|${mixed ? "---|" : ""}---|---|---|`,
  );
  for (const c of client) {
    const notes = [];
    if (!c.name) notes.push(`module \`${c.id || "?"}\`: no matching repo found — name it`);
    const target = c.integrationBranch || c.contribution?.prTarget || "";
    if (c.defaultBranch && target && target !== c.defaultBranch) notes.push(`PRs go to \`${target}\`, not the default branch`);
    if (c.kind === "frontend" && c.upstream) {
      notes.push(`fork of ${c.upstream.split("/").pop()}${c.forkVersion ? ` ${c.forkVersion}` : ""}` +
        (c.upstreamRef ? `, base ${c.upstreamRef}${c.upstreamRefResolved === false ? " (NOT verified — give the base tag)" : ""}` : ""));
    }
    if (c.name && c.nameUnverified) notes.push("name not confirmed against the live repo list");
    lines.push(`| ${cell(c.name || c.id)} | ${cell(c.kind)} |${mixed ? ` ${cell(c.host || c.contribution?.host)} |` : ""} ${cell(c.defaultBranch)} | ${cell(target)} | ${cell(notes.join("; "))} |`);
  }
  return lines.join("\n") + "\n";
}

function main() {
  const argv = process.argv.slice(2);
  const val = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const read = (p) => JSON.parse(readFileSync(resolve(outputRoot(), p), "utf8"));
  const t = val("--tracker");
  const r = val("--repos");
  if (!t && !r) {
    console.error("usage: render-scan.mjs --tracker <tracker.json> | --repos <repos.json>");
    process.exit(64);
  }
  // A reminder to the agent reading this output: the operator does not see tool output.
  console.log("<!-- Put the table below VERBATIM in your FINAL message of the turn, then the question; no tool call after it (text before a tool call is collapsed out of the operator's view). Never a summary. -->");
  try {
    if (r) process.stdout.write(renderRepos(read(r)));
    if (t) process.stdout.write((r ? "\n" : "") + renderTracker(read(t)));
  } catch (err) {
    console.error(`[render-scan] ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
