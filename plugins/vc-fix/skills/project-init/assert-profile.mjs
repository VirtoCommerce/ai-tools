#!/usr/bin/env node
/**
 * skills/project-init/assert-profile.mjs
 *
 * Assert the SHAPE of the profile `/project-init` just wrote, and record every violation as a
 * self-diagnostics observation.
 *
 * ─── WHY THIS EXISTS (VCST-5582 H) ───────────────────────────────────────────
 * Every discovery step in `/project-init` degrades GRACEFULLY — warn, write a partial result,
 * exit 0 — which is the right onboarding behaviour and was also a total blind spot. A scan can
 * come back empty with no HTTP error reaching any catch: a filtered response, a `value: []`, a
 * partial permission, an unattempted step. What matters downstream is not which call failed but
 * the SHAPE of what got persisted, because THAT is what `/qa-fix` and `/qa-bug` read at runtime:
 *
 *   - `tracker.fields == {}`        ⇒ /qa-bug sends the legacy "unverified defaults" field set
 *   - `roleStatesComplete: false`  ⇒ /qa-fix cannot transition the ticket by lifecycle role
 *   - `repos.client == []` on a CLIENT project ⇒ /qa-fix's Gate 1 has nothing to route to
 *   - `upstreamRefResolved: false` ⇒ Gate 1b can't diff the fork against its upstream anchor
 *   - `githubForkCapable != "yes"` while the upstream path is needed ⇒ Gate 1 STOPs before clone
 *
 * So assert on the RESULT, not on the calls that produced it. This is CAPTURE ONLY: it records
 * `degraded_artifact` observations and prints them, and it assigns NO severity — `/vc-self-check`
 * judges them against the oracle (§1f), which knows which of these are required outputs.
 *
 * Read-only, never throws, ALWAYS exits 0: this is a diagnostic, not a gate. `verify-access.mjs`
 * owns the readiness verdict and the non-zero exit; duplicating that here would turn a
 * best-effort observation into a second, competing definition of "ready".
 *
 * Usage:  node skills/project-init/assert-profile.mjs [--json]
 */
import { resolve } from "path";
import { fileURLToPath } from "url";
import { loadProjectProfile } from "../../scripts/lib/project-profile.mjs";
import { resolveSlots } from "../qa-fix-routing/bug-contract.mjs";
import { emitObservations } from "./lib/diag-obs.mjs";

/**
 * Pure: profile → [{ subject, snippet }]. Exported so a unit test can assert the invariant set
 * without spawning the collector or touching a real profile on disk.
 * @param {object} profile  a loaded project-profile (PROFILE_DEFAULTS-shaped)
 * @returns {Array<{subject:string, snippet:string}>}
 */
export function profileViolations(profile) {
  const out = [];
  const add = (subject, snippet) => out.push({ subject, snippet });
  const p = profile || {};
  const tracker = p.tracker || {};
  const vcs = p.vcs || {};
  const upstream = p.upstream || {};
  const clientRepos = Array.isArray(p.repos?.client) ? p.repos.client : [];

  // ─── tracker: the bug FIELD CONTRACT ─────────────────────────────────────────
  // Azure Boards only — Jira discovers its transitions live and bakes no field contract, so an
  // empty `fields` there is correct, not degraded.
  //
  // PROFILE SHAPE CONVENTION (VCST-5582 E3). The profile splits tracker data by reader:
  //   • the generic bug FIELD CONTRACT lives at the TOP level — `tracker.fields` / `tracker.fieldMap`
  //     / `tracker.fieldDefaults` — because the tracker-agnostic /qa-bug create path reads it there;
  //   • the Azure-SPECIFIC transition/state model lives NESTED under `tracker.azure.*` —
  //     `roleStates` / `roleStatesComplete` / `qaRoleStatesComplete` / `transitionPolicy` /
  //     `workItemTypes` — because the runtime reader (skills/qa-fix-routing/trackers/azure-tracker.ts
  //     `az.roleStates`) and the writer (gen-profile.mjs `set("tracker.azure.…")`) both use that path.
  // This reader MUST read each field from where its runtime consumer reads it — the earlier top-level
  // `tracker.roleStates` read was the bug: it resolved to undefined and emitted a false
  // roleStatesComplete/qaRoleStatesComplete degradation on EVERY correctly onboarded Azure project.
  if (tracker.kind === "azure") {
    const types = Object.keys(tracker.fields || {});
    const bugType = types.find((t) => /^bug$/i.test(t)) || types[0] || "Bug";
    const contract = tracker.fields?.[bugType] || [];
    if (!contract.length) {
      add("tracker_field_contract", `tracker.fields['${bugType}'] is empty — /qa-bug will send the LEGACY field set labelled "unverified defaults"`);
    } else {
      // resolveSlots is the SAME pure function the create path uses, so this can never claim a
      // mapping /qa-bug would not actually make.
      const slots = resolveSlots(contract, tracker.fieldMap || {});
      if (slots.unmappedRequired.length) {
        add("tracker_required_fields_unmapped", `${slots.unmappedRequired.length} required ${bugType} field(s) map to no semantic slot: ${slots.unmappedRequired.map((f) => f.ref).join(", ")}`);
      }
      if (slots.staleOverrides.length) {
        add("tracker_fieldmap_stale", `tracker.fieldMap points at field(s) this process no longer has: ${slots.staleOverrides.join(", ")} — they are IGNORED`);
      }
    }
    // Role-state completeness — read from tracker.azure.* (the canonical, runtime-read path). A
    // profile that predates the explicit `roleStatesComplete` boolean still resolves correctly:
    // completeness is confirmed by an explicit `true`, OR by transitionPolicy:"auto" (which
    // gen-profile only sets when the scan found every fix role), OR by re-deriving from the map.
    const az = tracker.azure || {};
    const roleStates = az.roleStates || {};
    const FIX_ROLES = ["in-progress", "in-review", "ready-for-test", "done"];
    const QA_ROLES = ["testing", "tested", "reopen"];
    const fixComplete =
      az.roleStatesComplete === true || az.transitionPolicy === "auto" || FIX_ROLES.every((r) => roleStates[r]);
    const qaComplete = az.qaRoleStatesComplete === true || QA_ROLES.every((r) => roleStates[r]);
    if (!fixComplete) {
      const have = Object.keys(roleStates);
      add("tracker_role_states", `tracker.azure.roleStatesComplete:false (resolved: ${have.join(", ") || "none"}) — /qa-fix cannot transition the ticket by lifecycle role`);
    }
    if (!qaComplete) {
      add("tracker_qa_role_states", "tracker.azure.qaRoleStatesComplete:false — affects /qa-verify-fix's transitions only");
    }
  }

  // ─── repos: a CLIENT project with no client repos has nothing to route to ────
  if (p.projectType === "client" && !clientRepos.length) {
    add("client_repos_empty", "projectType:client but repos.client is empty — /qa-fix Gate 1 has no client repo to route a bug to");
  }

  // ─── client MODULE with an UNVERIFIED name (#216 / VCST-5702) ────────────────
  // discover-repos could NOT resolve this module's id (no ProjectUrl) to a repo in the client's
  // live listing, so it left `name: null` (never an invented `vc-module-*` name) and no clone URL —
  // /qa-fix Gate 1 has nothing to route to until the operator completes repos.client.
  for (const r of clientRepos) {
    if (r?.nameUnverified) {
      const label = r.name || (r.moduleId ? `module '${r.moduleId}'` : "a client module");
      add("client_repo_unverified", `${label} has an UNVERIFIED repo (its module id matched no repo in the client's live listing; name:${r.name === null ? "null" : `'${r.name}'`}) — set name + repoId from the listing in repos.client before /qa-fix routes a bug to it`);
    }
  }

  // ─── frontend fork: the Gate-1b provenance anchor ────────────────────────────
  for (const r of clientRepos) {
    if (r?.kind !== "frontend" || !r?.upstream) continue;
    if (!r.upstreamRef) {
      add("storefront_upstream_ref", "a storefront fork has no upstreamRef — Gate 1b cannot diff client customization from a platform bug without reconstructing/asking");
    } else if (r.upstreamRefResolved === false) {
      add("storefront_upstream_ref", `upstreamRefResolved:false for upstreamRef '${r.upstreamRef}' — Gate 1b will reconstruct or ask`);
    }
  }

  // ─── upstream capability: a plan that needs the upstream but cannot reach it ──
  // Mirrors verify-access's "GitHub token kind / upstream capability" row and Gate 1's STOP
  // condition: anything other than a PROVEN "yes" is not fork-capable ("" / "unknown" included).
  const upstreamNeeded = upstream.contributionMode === "fork" || upstream.fileIssues === true;
  if (upstreamNeeded && vcs.githubForkCapable !== "yes") {
    add("github_fork_capability", `upstream path needed (contributionMode:${upstream.contributionMode}, fileIssues:${upstream.fileIssues}) but vcs.githubForkCapable:'${vcs.githubForkCapable || ""}' (tokenKind:'${vcs.githubTokenKind || ""}') — /qa-fix Gate 1 STOPs before clone and deliver cannot route fork-pr`);
  }

  return out;
}

function main() {
  const json = process.argv.includes("--json");
  let violations = [];
  try {
    violations = profileViolations(loadProjectProfile());
  } catch (e) {
    // A profile that will not even load is itself the finding.
    violations = [{ subject: "profile_unreadable", snippet: `project-profile.json could not be loaded/parsed: ${e?.message ?? e}` }];
  }
  emitObservations(
    violations.map((v) => ({ class: "degraded_artifact", subject: v.subject, code: "NONE", evidence: { snippet: v.snippet } })),
    { skill: "project-init", source: "profile-assert" },
  );
  if (json) {
    process.stdout.write(JSON.stringify({ violations }, null, 2) + "\n");
  } else if (violations.length) {
    console.log(`  ! profile shape — ${violations.length} degradation(s) recorded for self-diagnostics:`);
    for (const v of violations) console.log(`   • ${v.subject}: ${v.snippet}`);
    console.log("");
  } else {
    console.log("  + profile shape — every /qa-fix + /qa-bug input is fully populated.\n");
  }
  // ALWAYS 0 — a diagnostic must not become a second readiness gate (verify-access owns that).
  process.exit(0);
}

// CLI only — the pure helpers above are imported by the unit tests (repo-standard main-guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
