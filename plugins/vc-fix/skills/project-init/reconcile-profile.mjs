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
 *            EXCEPTION: a scan-written open map under `tracker` on the explicit
 *            TRACKER_PRESERVED_KEYS allowlist (`tracker.formLayout` / `tracker.fieldsMeta`, which
 *            PROFILE_DEFAULTS does not enumerate) is PRESERVED, not dropped — it is discovered data,
 *            and losing `tracker.formLayout` sends the bug body to an off-form field (VCST-5702).
 *            Reported under `preserved`. Any OTHER unknown key under `tracker` — a renamed schema
 *            object, or an unknown scalar — is still removed, so reconcile keeps pruning obsolete
 *            fields.
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
import { PROFILE_DEFAULTS } from "../../scripts/lib/project-profile.mjs";
import { resolveOutPath } from "./lib/paths.mjs";

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
  // NOTE: `feedback` (the UPSTREAM-delivery consent, VCST-5509) is DELIBERATELY NOT a managed
  // "ask" field any more (PR #172 item 4). It used to prompt the operator here and on every
  // `/project-init --check`, but the delivery flow already asks once, per finding, at the moment a
  // BROKEN/DEGRADED finding actually exists — the onboarding question was a second, context-free
  // ask for a decision the operator can only meaningfully make when there is something to send. It
  // now fills silently from PROFILE_DEFAULTS (`feedback.mode: "ask"`), hand-editable for CI (`auto`)
  // or as a kill switch (`off`) via `gen-profile --feedback-mode <v>` or a direct edit. With no
  // MANAGED_FIELDS entry, reconcile adds it as an ordinary safe-default field (`via: "default"`),
  // so `--check` no longer surfaces it as a pending decision.
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
// A work-item field whose VALUE is time-varying (a sprint/area NODE id: `System.IterationId`
// = 22 in Sprint 19, 23 in Sprint 20). Persisting it as a fieldDefaults constant is a time bomb —
// after the sprint rolls over, every new bug lands in a CLOSED sprint (VCST-5582 A3). Iteration is
// resolved at CREATE time via `--iteration current`; the Path field is stored, never the id.
const ILLEGAL_FIELDDEFAULT_REF = /(^|\.)(iteration|area)id$/i;

function parseArgs(argv) {
  const args = { set: [], unset: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key === "set" || key === "unset") {
      if (next !== undefined && !next.startsWith("--")) {
        args[key].push(next);
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

// Scan-written open maps under `tracker` that PROFILE_DEFAULTS does not enumerate but the
// discover-tracker scan legitimately writes — preserved through reconcile rather than pruned as
// obsolete (VCST-5702). An EXPLICIT allowlist (not a blanket "any object under tracker") so a
// genuinely-renamed schema object still prunes; a new scan-written map is added here by hand.
const TRACKER_PRESERVED_KEYS = new Set(["formLayout", "fieldsMeta"]);
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Set a dotted sub-path (e.g. "mode") into `obj`, creating intermediate objects. */
function setDeep(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cur[parts[i]])) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// ─── the reconcile core ──────────────────────────────────────────────────────
/**
 * Reconcile `existing` (a raw profile object, _meta already stripped) against the
 * `schema` (PROFILE_DEFAULTS), applying `decisions` (path → value) for managed fields.
 * Pure — returns { migrated, added, removed, pending, rescan }. `migrated` omits any
 * pending (unresolved ask/rescan) field, so it is always safe to write.
 */
function reconcile(schema, existing, decisions, unsets = []) {
  const report = { added: [], removed: [], pending: [], rescan: [], unset: [], rejected: [], preserved: [] };
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
            // Sub-key resolution for an object-valued managed field: `--set feedback.mode=off`
            // folds into the object (so the operator resolves a nested opt-in the same way).
            // NB: like every managed field, this applies only when the field is being ADDED
            // (an old profile that lacks `feedback`). reconcile PRESERVES an existing value —
            // to CHANGE an already-set feedback.mode, edit project-profile.json or re-run
            // `gen-profile --feedback-mode <v>` (same add-only contract as `selfDiagnostics`).
            const subKeys = Object.keys(decisions).filter((dk) => dk.startsWith(`${path}.`));
            // Validate the resolved value against the field's own contract before writing —
            // a bad `--set` (e.g. feedback.mode=bogus) must NOT land a garbage value, even
            // though the downstream readers are defensive. On failure, leave the field
            // pending (unresolved) rather than write it. (R2-F2 defense-in-depth.)
            let candidate;
            let resolved = false;
            if (path in decisions) { candidate = decisions[path]; resolved = true; }
            else if (subKeys.length) {
              candidate = clone(managed.default) ?? clone(schemaNode[k]) ?? {};
              for (const dk of subKeys) setDeep(candidate, dk.slice(path.length + 1), decisions[dk]);
              resolved = true;
            }
            if (resolved && (!managed.validate || managed.validate(candidate))) {
              out[k] = candidate;
              report.added.push({ path, value: candidate, via: `${managed.policy}-resolved` });
            } else if (resolved) {
              report.pending.push({ path, policy: managed.policy, default: managed.default, question: managed.question, options: managed.options, invalid: true });
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
      // Report + drop OBSOLETE keys (present in the profile, gone from the schema) — EXCEPT a
      // KNOWN scan-written subtree under `tracker`. `tracker.formLayout` / `tracker.fieldsMeta` are
      // DATA the discover-tracker scan writes, not a stale schema field: PROFILE_DEFAULTS.tracker
      // does not enumerate them, so the plain prune below silently DROPPED them — and losing
      // tracker.formLayout sends the bug body to an off-form (invisible) field (VCST-5702 ITEM 0).
      // Preserve them by an EXPLICIT ALLOWLIST, not a blanket "any object/array under tracker": a
      // blanket rule would make a genuinely-renamed tracker object (e.g. a future
      // `tracker.fields` → `tracker.fieldContract`) un-prunable forever, defeating the reconciler's
      // whole job. A new scan-written map must be added to TRACKER_PRESERVED_KEYS. Everything else
      // not in the schema — unknown scalar OR unknown object under a renamed key — is still removed.
      for (const k of Object.keys(ex)) {
        if (!(k in schemaNode)) {
          const path = prefix ? `${prefix}.${k}` : k;
          if (prefix === "tracker" && TRACKER_PRESERVED_KEYS.has(k) && (isPlainObject(ex[k]) || Array.isArray(ex[k]))) {
            out[k] = ex[k];
            report.preserved.push({ path });
            continue;
          }
          report.removed.push({ path, value: ex[k] });
        }
      }
      return out;
    }
    // Scalar leaf — keep the existing value, else the default.
    return existingNode === undefined ? schemaNode : existingNode;
  }

  const migrated = walk(schema, existing, "");

  // ─── `--set` into an OPEN MAP (VCST-5582 E-b) ──────────────────────────────────────
  // The walk above only consults `decisions` for MANAGED_FIELDS. But the open maps
  // (tracker.fieldMap / tracker.fieldDefaults / tracker.azure.roleStates / stateMap) are exactly
  // where a per-deployment ANSWER has to be persisted — "which field is this process's
  // Environment?", asked once at the first bug creation. Their KEYS are data, and an Azure field
  // ref contains dots (`Custom.Environment`), so a naive split-on-every-dot would write
  // `{Custom:{Environment:"QA"}}` instead of `{"Custom.Environment":"QA"}`. So: walk the dotted
  // path against the SCHEMA and, the moment the schema node is an empty-object open map, treat
  // the ENTIRE remainder as one literal key.
  for (const [dotted, value] of Object.entries(decisions || {})) {
    const parts = dotted.split(".");
    let schemaCur = schema;
    let objCur = migrated;
    let i = 0;
    let openMap = false;
    for (; i < parts.length - 1; i++) {
      const next = isPlainObject(schemaCur) ? schemaCur[parts[i]] : undefined;
      if (next === undefined) break; // not a schema path — a MANAGED_FIELDS decision or a typo
      if (!isPlainObject(objCur[parts[i]])) objCur[parts[i]] = {};
      objCur = objCur[parts[i]];
      schemaCur = next;
      if (isPlainObject(schemaCur) && Object.keys(schemaCur).length === 0) { openMap = true; i++; break; }
    }
    if (!openMap) continue; // only open-map writes are handled here; everything else is unchanged
    const openMapPath = parts.slice(0, i).join(".");
    const key = parts.slice(i).join("."); // the ref, dots and all
    if (!key) continue;
    // A3 — REFUSE to persist a time-varying id (System.IterationId / System.AreaId) into
    // tracker.fieldDefaults. A stored sprint-node id silently sends every future bug to a closed
    // sprint; store the *Path (resolved at create time via `--iteration current`) instead.
    if (openMapPath === "tracker.fieldDefaults" && ILLEGAL_FIELDDEFAULT_REF.test(key)) {
      report.rejected.push({
        path: dotted, value,
        reason: `refusing to persist "${key}" — its value is a sprint/area NODE id that changes when the sprint rolls over, so a stored default silently files future bugs into a CLOSED sprint. Iteration/area are resolved at create time (\`--iteration current\` → System.IterationPath); store the *Path field, never the id.`,
      });
      continue;
    }
    objCur[key] = value;
    report.added.push({ path: dotted, value, via: "set-open-map" });
  }

  // ─── `--unset <path>` — remove a key from a writable OPEN MAP (VCST-5582 A4) ────────────
  // The mirror of the open-map `--set` above: walk the SCHEMA to the open-map boundary, then delete
  // the literal remainder key. A path that is NOT inside a writable open map (a fixed-shape struct
  // key, a managed field, a typo) is REJECTED — reconcile-profile must never let a hand-edit strip a
  // schema field. This is how the stale System.IterationId workaround is removed WITHOUT hand-editing
  // project-profile.json (the very thing this tool exists to avoid).
  for (const dotted of unsets || []) {
    const parts = dotted.split(".");
    let schemaCur = schema;
    let objCur = migrated;
    let i = 0;
    let openMap = false;
    let reachable = true;
    for (; i < parts.length - 1; i++) {
      const next = isPlainObject(schemaCur) ? schemaCur[parts[i]] : undefined;
      if (next === undefined) break; // not a schema path
      if (!isPlainObject(objCur?.[parts[i]])) { reachable = false; break; }
      objCur = objCur[parts[i]];
      schemaCur = next;
      if (isPlainObject(schemaCur) && Object.keys(schemaCur).length === 0) { openMap = true; i++; break; }
    }
    const key = parts.slice(i).join(".");
    if (!openMap || !reachable || !key) {
      report.rejected.push({ path: dotted, reason: "--unset only removes a key from a writable open map (tracker.fieldMap / tracker.fieldDefaults / tracker.azure.roleStates / stateMap)" });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(objCur, key)) {
      report.unset.push({ path: dotted, value: objCur[key], via: "unset-open-map" });
      delete objCur[key];
    } else {
      report.rejected.push({ path: dotted, reason: `key "${key}" is not present — nothing to unset` });
    }
  }

  // ─── tracker.fields rescan (VCST-5582 E5) ──────────────────────────────────────────
  // tracker.fields on an Azure profile is DISCOVERED live (discover-tracker.mjs). It is an OPEN
  // MAP, so the walk keeps whatever is there and never flags it — but an existing profile whose
  // scan ran before the `$expand=all` fix (E1) carries an EMPTY tracker.fields, so /qa-bug silently
  // sends the legacy "unverified defaults" field set. Surface it under `rescan` so `/project-init
  // --check` re-derives the contract (re-run discover-tracker.mjs + gen-profile --merge) without a
  // full re-onboarding. Jira bakes no field contract, so an empty `fields` there is correct.
  const trackerKind = migrated?.tracker?.kind ?? existing?.tracker?.kind ?? schema?.tracker?.kind;
  const contractFields = migrated?.tracker?.fields;
  const fieldsEmpty = !contractFields || (typeof contractFields === "object" && Object.keys(contractFields).length === 0);
  if (trackerKind === "azure" && fieldsEmpty && !report.rescan.some((r) => r.path === "tracker.fields")) {
    report.rescan.push({ path: "tracker.fields", source: "discover-tracker" });
  }

  return { migrated, ...report };
}

// ─── main ────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));
  const decisions = parseDecisions(args.set);
  const outPath = resolveOutPath(args.out, "project-profile.json");

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

  const { migrated, added, removed, pending, rescan, unset, rejected, preserved } = reconcile(PROFILE_DEFAULTS, raw, decisions, args.unset);
  const hasStructuralChange = added.length > 0 || removed.length > 0 || unset.length > 0;
  // `rescan` (e.g. an Azure profile with an empty tracker.fields, VCST-5582 E5) also counts as
  // "changes" so the skill knows to re-run the live discover step — even when nothing structural
  // was added/removed. It does NOT trigger a --write (a rescan needs a live scan, not a struct edit).
  const status = hasStructuralChange || pending.length > 0 || rescan.length > 0 || rejected.length > 0 ? "changes" : "current";

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
          unset,
          rejected,
          pending,
          rescan,
          preserved,
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
    try {
      writeFileSync(outPath, JSON.stringify(withMeta, null, 2) + "\n");
      wrote = true;
    } catch (err) {
      // Honor the file's contract: a genuine IO failure prints an {error} report on stdout and still
      // exits 0 (the skill parses stdout to decide next steps) — symmetric with the parse-error path
      // above and the same-PR hardening of the sibling verify-access.mjs. Never a stack trace on stderr.
      console.log(JSON.stringify({ status: "error", path: outPath, error: `write: ${err.message}`, wrote: false }, null, 2));
      return;
    }
  }

  console.log(
    JSON.stringify(
      { status, path: outPath, wrote, added, removed, unset, rejected, pending, rescan, preserved },
      null,
      2,
    ),
  );
}

main();
