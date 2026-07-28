#!/usr/bin/env node
/**
 * skills/project-init/reconcile-profile.mjs
 *
 * Migrate an EXISTING project-profile.json to the CURRENT schema.
 *
 * A profile is written once by `/project-init`, but the schema (PROFILE_DEFAULTS in
 * scripts/lib/project-profile.mjs) keeps evolving as the plugin is upgraded: fields
 * are ADDED (e.g. `selfDiagnostics`), REMOVED (e.g. the old baked `pluginRoot`), or
 * need a fresh live RESCAN (repos / tracker role-states drift). A user who ran
 * `/project-init` on an older plugin and then upgraded is left with a stale profile.
 * `/project-init --check` runs this to reconcile it.
 *
 * What it does (deterministically, against PROFILE_DEFAULTS as the source of truth):
 *   - ADD    every schema field missing from the profile. A field with a SAFE default
 *            is filled automatically; a field flagged in MANAGED_FIELDS as needing the
 *            user's decision (`ask`) or a live scan (`rescan`) is reported as PENDING
 *            and left absent until resolved — never silently guessed.
 *   - REMOVE every profile field no longer in the schema (obsolete), pruning fixed-shape
 *            objects key-by-key. OPEN MAPS ({} default — stateMap/workItemTypes/roleStates)
 *            and ARRAYS (repos.*) are kept wholesale: their contents are data, not schema.
 *   - RESCAN report the fields that should be re-derived live (repos, tracker role model),
 *            so the /project-init skill can re-run discover-*.mjs + gen-profile --merge.
 *   - ASK    surface each pending decision's question + options so the skill can drive
 *            AskUserQuestion and feed the answer back via `--set <path>=<value>`.
 *
 * This script NEVER runs a live scan or asks a question itself — it stays pure/deterministic
 * (read profile + schema → JSON report, optional write). The skill orchestrates the
 * interactive/live parts and re-invokes with `--set`.
 *
 * Usage:
 *   # Dry-run: print a JSON reconciliation report (no write).
 *   node skills/project-init/reconcile-profile.mjs --print
 *
 *   # Apply structural changes (adds safe defaults, removes obsolete keys). Pending
 *   # decision/rescan fields are left absent and still reported.
 *   node skills/project-init/reconcile-profile.mjs --write
 *
 *   # Apply WITH the user's answers folded in (skill passes these after asking):
 *   node skills/project-init/reconcile-profile.mjs --write --set selfDiagnostics=true
 *
 * Flags: --out <path> (default project-profile.json under outputRoot), --write (apply;
 * default is dry-run), --set <path>=<value> (repeatable; folds a decision/rescan value
 * in — value is coerced: true/false → boolean, integer → number, else string), --print
 * (echo the full report JSON — implied when not --write), --force (allow a --write that
 * would remove ≥5 fields — without it such a prune returns status "needs-force" and writes
 * nothing, guarding against reconciling a rich profile against a leaner schema).
 *
 * Exit code is always 0 (the skill reads the JSON to decide next steps); a genuine IO/parse
 * failure prints an { "error": ... } report and still exits 0 so the skill can handle it.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { PROFILE_DEFAULTS } from "../../../scripts/lib/project-profile.mjs";

// This file lives at .claude/skills/project-init/reconcile-profile.mjs → climb 3 to repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ─── managed-field migration policy ──────────────────────────────────────────
// The DEFAULT for any schema field not listed here is `policy: "default"` — when it is
// missing from an old profile, fill it silently with its PROFILE_DEFAULTS value (a safe,
// behaviour-preserving default is the whole contract of PROFILE_DEFAULTS). List a field
// here ONLY when adding it needs more than a silent default:
//   - "ask":    a decision belongs to the user (privacy, behaviour opt-in). Reported as
//               PENDING with a question + options; resolved via `--set <path>=<value>`.
//   - "rescan": the value must be re-derived from a live scan (repos/tracker). Reported
//               under `rescan`; the skill re-runs the discover-*.mjs + gen-profile --merge.
// When you ADD or REMOVE a field in PROFILE_DEFAULTS, update this list in the same commit.
const MANAGED_FIELDS = [
  {
    path: "selfDiagnostics",
    policy: "ask",
    default: true,
    validate: (v) => v === true || v === false,
    question:
      "Enable vc-fix self-diagnostics for this project? The passive session-telemetry hook records how the plugin's OWN skills ran (to <project>/.vc-fix/, gitignored) so /vc-self-check can spot plugin quality issues. It never sends anything without a separate consent step and never touches your code.",
    options: [
      { label: "Yes (recommended)", value: true, hint: "record local telemetry to .vc-fix/" },
      { label: "No", value: false, hint: "hook stays a full no-op — no .vc-fix/" },
    ],
  },
  // NB: the `feedback` (upstream-delivery consent) MANAGED entry is intentionally NOT ported here —
  // this `.claude` reconcile lacks the plugin's dotted-path `setDeep`, so `--set feedback.mode=…`
  // would not fold (a dead-end). It fails SAFE regardless (an absent `feedback` ⇒ deliver defaults
  // to "ask", which still requires an explicit --confirm; no auto-send). Fresh onboarding persists
  // the answer via gen-profile's `--feedback-mode`. Modernizing this `.claude` reconcile (setDeep +
  // the feedback entry) is a tracked follow-up; the distributed plugin surface already covers it.
];
const managedFor = (path) => MANAGED_FIELDS.find((m) => m.path === path);

// ─── conditional (discriminated) sub-objects ─────────────────────────────────
// gen-profile.mjs prunes the tracker.azure / vcs.azure blocks from a written profile
// UNLESS the deployment actually uses them (so a Jira+GitHub profile carries no dead
// `azure:{}`). PROFILE_DEFAULTS still declares them, so reconcile must apply the SAME
// discriminator or it would re-ADD an azure block to every non-azure profile on every
// --check. When the predicate is false the sub-object is treated as NOT part of the
// schema for THIS profile: never added when missing, and pruned (reported removed) if a
// stale one is present — exactly matching gen-profile's write.
const CONDITIONAL = [
  { path: "tracker.azure", when: (p) => (p?.tracker?.kind ?? PROFILE_DEFAULTS.tracker.kind) === "azure" },
  { path: "vcs.azure", when: (p) => (p?.vcs?.clientHost ?? PROFILE_DEFAULTS.vcs.clientHost) === "azure-repos" },
];

// ─── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "set") {
      if (next !== undefined && !next.startsWith("--")) {
        args.set.push(next);
        i++;
      }
    } else if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

/** Coerce a `--set path=value` string value into boolean / number / string. */
function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/** Parse the repeated `--set path=value` flags into a { path: coercedValue } map. */
function parseDecisions(setFlags) {
  const decisions = {};
  for (const raw of setFlags) {
    const eq = raw.indexOf("=");
    if (eq < 0) continue;
    decisions[raw.slice(0, eq)] = coerce(raw.slice(eq + 1));
  }
  return decisions;
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// ─── the reconcile core ──────────────────────────────────────────────────────
/**
 * Reconcile `existing` (a raw profile object, _meta already stripped) against the
 * `schema` (PROFILE_DEFAULTS), applying `decisions` (path → value) for managed fields.
 * Pure — returns { migrated, added, removed, pending, rescan }. `migrated` omits any
 * pending (unresolved ask/rescan) field, so it is always safe to write.
 */
function reconcile(schema, existing, decisions) {
  const report = { added: [], removed: [], pending: [], rescan: [] };
  // A conditional sub-object is "disabled" (not in schema for this profile) when its
  // discriminator predicate is false against the existing profile.
  const conditionalDisabled = (path) => {
    const c = CONDITIONAL.find((x) => x.path === path);
    return c ? !c.when(existing) : false;
  };

  function walk(schemaNode, existingNode, prefix) {
    // Arrays are DATA (repos.client/platform) — keep the existing value untouched.
    if (Array.isArray(schemaNode)) {
      return existingNode === undefined ? clone(schemaNode) : existingNode;
    }
    if (isPlainObject(schemaNode)) {
      // An empty-object default ({}) marks an OPEN MAP (stateMap/workItemTypes/roleStates):
      // its keys are runtime data, not schema — keep the existing value as-is, never prune.
      if (Object.keys(schemaNode).length === 0) {
        return existingNode === undefined ? clone(schemaNode) : existingNode;
      }
      // Fixed-shape struct: the reconciled node has EXACTLY the schema's keys.
      const ex = isPlainObject(existingNode) ? existingNode : {};
      const out = {};
      for (const k of Object.keys(schemaNode)) {
        const path = prefix ? `${prefix}.${k}` : k;
        // Conditional block whose discriminator is off ⇒ not schema for this profile:
        // prune a stale one (report removed), never add a missing one.
        if (conditionalDisabled(path)) {
          if (k in ex) report.removed.push({ path, value: ex[k] });
          continue;
        }
        if (!(k in ex)) {
          // Missing field → ADD per policy.
          const managed = managedFor(path);
          if (managed && (managed.policy === "ask" || managed.policy === "rescan")) {
            if (path in decisions) {
              out[k] = decisions[path];
              report.added.push({ path, value: decisions[path], via: `${managed.policy}-resolved` });
            } else {
              // Leave ABSENT until the user/scan resolves it — never guess.
              report.pending.push({
                path,
                policy: managed.policy,
                default: managed.default,
                question: managed.question,
                options: managed.options,
              });
              if (managed.policy === "rescan") report.rescan.push({ path, source: managed.rescanSource });
            }
          } else {
            out[k] = clone(schemaNode[k]);
            report.added.push({ path, value: out[k], via: "default" });
          }
        } else {
          out[k] = walk(schemaNode[k], ex[k], path);
        }
      }
      // Report + drop OBSOLETE keys (present in the profile, gone from the schema).
      for (const k of Object.keys(ex)) {
        if (!(k in schemaNode)) {
          const path = prefix ? `${prefix}.${k}` : k;
          report.removed.push({ path, value: ex[k] });
        }
      }
      return out;
    }
    // Scalar leaf — keep the existing value, else the default.
    return existingNode === undefined ? schemaNode : existingNode;
  }

  const migrated = walk(schema, existing, "");
  return { migrated, ...report };
}

// ─── main ────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const decisions = parseDecisions(args.set);
  const outPath = args.out ? resolve(args.out) : join(REPO_ROOT, "project-profile.json");

  if (!existsSync(outPath)) {
    console.log(JSON.stringify({ status: "no-profile", path: outPath }, null, 2));
    return; // skill: no profile yet ⇒ run the full interview, not a migration
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(outPath, "utf-8"));
  } catch (err) {
    console.log(JSON.stringify({ status: "error", path: outPath, error: `parse: ${err.message}` }, null, 2));
    return;
  }

  // _meta is bookkeeping, not schema — set it aside so it is neither pruned nor walked.
  const meta = raw._meta;
  delete raw._meta;

  const { migrated, added, removed, pending, rescan } = reconcile(PROFILE_DEFAULTS, raw, decisions);
  const hasStructuralChange = added.length > 0 || removed.length > 0;
  const status = hasStructuralChange || pending.length > 0 ? "changes" : "current";

  // Prune safety valve. A normal reconcile drops 0–2 genuinely-obsolete fields; dropping a large
  // batch usually means this tree's schema is a SUBSET of the one that wrote the profile (e.g. a
  // richer plugin profile reconciled against a leaner schema) — writing would strip live config.
  // Refuse to --write such a prune unless the operator confirms with --force. --print is unaffected.
  const REMOVE_GUARD = 5;
  if (args.write && !args.force && removed.length >= REMOVE_GUARD) {
    console.log(
      JSON.stringify(
        {
          status: "needs-force",
          path: outPath,
          wrote: false,
          reason: `refusing to remove ${removed.length} fields without --force — this looks like a schema mismatch (a leaner schema than the one that wrote the profile), not stale fields. Review 'removed'; re-run with --force only if the removals are truly intended.`,
          added,
          removed,
          pending,
          rescan,
        },
        null,
        2,
      ),
    );
    return;
  }

  let wrote = false;
  if (args.write && (hasStructuralChange || Object.keys(decisions).length > 0)) {
    const withMeta = {
      _meta: {
        version: meta?.version ?? "1.0.0",
        generatedBy: meta?.generatedBy ?? "project-init/gen-profile.mjs",
        reconciledBy: "project-init/reconcile-profile.mjs",
      },
      ...migrated,
    };
    writeFileSync(outPath, JSON.stringify(withMeta, null, 2) + "\n");
    wrote = true;
  }

  console.log(
    JSON.stringify(
      { status, path: outPath, wrote, added, removed, pending, rescan },
      null,
      2,
    ),
  );
}

main();
