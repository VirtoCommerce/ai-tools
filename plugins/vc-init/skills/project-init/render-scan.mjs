#!/usr/bin/env node
/**
 * render-scan.mjs — the operator's confirmation tables for /project-init §4a and §4b, as Markdown.
 *
 * A scan result is confirmed by a person, so what they see must be COMPLETE and identical on every run:
 * every state the tracker scan found with the role it was mapped to, every client repo with its default
 * branch and PR target. Rendering that by hand let the table shrink to a parenthetical inside the
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
  ["in-progress", "work started (/qa-fix takes the bug)"],
  ["in-review", "PR open, under review"],
  ["ready-for-test", "fix merged, ready for QA"],
  ["testing", "QA is testing it"],
  ["tested", "QA passed"],
  ["reopen", "QA failed, back to dev"],
  ["done", "closed"],
];

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim() || "—";

/** The tracker table: every state of the type transitions are driven on, with the role(s) mapped to it. */
export function renderTracker(t) {
  if (!t || t.kind !== "azure") {
    return "**Tracker: Jira.** Transitions are discovered live on each ticket, so there is no status map to confirm.\n";
  }
  const types = t.workItemTypes || {};
  const primary = t.primaryType && types[t.primaryType] ? t.primaryType : Object.keys(types)[0];
  if (!primary) return "**Tracker scan found no work-item types.** Nothing to confirm — fix the Azure DevOps access first.\n";
  const roleStates = t.roleStates || {};
  const cats = (t.stateCategories || {})[primary] || {};
  const states = types[primary].states || [];
  const byState = new Map();
  for (const [role] of ROLES) {
    const s = roleStates[role];
    if (s) byState.set(s, [...(byState.get(s) || []), role]);
  }
  const mapped = ROLES.filter(([r]) => roleStates[r]).length;
  const lines = [
    `**${primary}** — ${states.length} state(s) found, ${mapped} of ${ROLES.length} roles mapped. A mapped state is where the plugins move a ticket for that role, without asking.`,
    "",
    "| State | Category | Mapped role | Meaning |",
    "|---|---|---|---|",
  ];
  const meaning = Object.fromEntries(ROLES);
  for (const s of states) {
    const roles = byState.get(s) || [];
    lines.push(`| ${cell(s)} | ${cell(cats[s])} | ${roles.length ? roles.map((r) => `\`${r}\``).join(", ") : "—"} | ${roles.length ? cell(roles.map((r) => meaning[r]).join("; ")) : "not used"} |`);
  }
  // A role mapped to a state the type does not list (a hand edit) still has to be visible.
  for (const [s, roles] of byState) {
    if (!states.includes(s)) lines.push(`| ${cell(s)} (not on this board) | — | ${roles.map((r) => `\`${r}\``).join(", ")} | ${cell(roles.map((r) => meaning[r]).join("; "))} |`);
  }
  const missing = ROLES.filter(([r]) => !roleStates[r]);
  if (missing.length) {
    lines.push("", `**Not mapped:** ${missing.map(([r, m]) => `\`${r}\` (${m})`).join(", ")} — the plugins will ask before that move.`);
  }
  const others = Object.keys(types).filter((n) => n !== primary);
  if (others.length) {
    lines.push("", "Other types (states listed; transitions are driven on " + primary + " only):", "");
    for (const n of others) lines.push(`- **${n}**: ${(types[n].states || []).join(" · ") || "—"}`);
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
  try {
    if (r) process.stdout.write(renderRepos(read(r)));
    if (t) process.stdout.write((r ? "\n" : "") + renderTracker(read(t)));
  } catch (err) {
    console.error(`[render-scan] ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
