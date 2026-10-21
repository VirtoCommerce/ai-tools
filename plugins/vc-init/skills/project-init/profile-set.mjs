#!/usr/bin/env node
/**
 * skills/project-init/profile-set.mjs — the ONE way another plugin writes project-profile.json.
 *
 * vc-init owns the deployment profile and is its only writer (VCST-6402). Two callers outside
 * onboarding still have something to persist into it:
 *   - /qa-bug (vc-fix) — the answer to "which field is this process's Environment?", asked once at
 *     the first bug creation: `--set 'tracker.fieldDefaults.<ref>=<value>'` / `tracker.fieldMap.<slot>`.
 *   - /perf-init (vc-perf) — its whole `perf` block: `--merge 'perf=<json>'`.
 * Before this script each of them edited the file its own way (the profile writer of the day for
 * one, a hand deepMerge for the other), and the next `/project-init --check` pruned whatever the
 * schema did not list — the `perf` block included. Routing both through here keeps one writer, the
 * same schema walk (reconcile-profile.mjs `reconcile`) and the same guards.
 *
 * Usage (callers resolve this file through `claude plugin list --json` → the vc-init install):
 *   node profile-set.mjs --set 'tracker.fieldDefaults.Custom.Environment=QA'
 *   node profile-set.mjs --set 'tracker.fieldMap.environment=Custom.Environment'
 *   node profile-set.mjs --unset 'tracker.fieldDefaults.System.IterationId'
 *   node profile-set.mjs --merge 'perf={"storeId":"B2B-store","benchmark":{"xapiTargets":["cart"]}}'
 *   node profile-set.mjs --merge 'perf=@perf-block.json'
 *
 * Writable paths are an ALLOWLIST (WRITABLE below); anything else is refused — the topology
 * (tracker kind, code host, repos, auth) is decided by /project-init, never patched from outside.
 *
 * Prints one JSON report on stdout. Exit codes: 0 written (or nothing to change), 1 refused (a path
 * outside the allowlist, an invalid value, a malformed --merge, a reconcile that would prune
 * ≥5 fields), 2 no profile — run /project-init first.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PROFILE_DEFAULTS, PROFILE_SCHEMA_VERSION, deepMerge } from "../../scripts/lib/project-profile.mjs";
import { reconcile } from "./reconcile-profile.mjs";
import { outputRoot, resolveOutPath } from "./lib/paths.mjs";

/** `--set` / `--unset` targets another plugin may write. A prefix ending in "." takes any key below it. */
export const WRITABLE = [
  "tracker.fieldDefaults.",
  "tracker.fieldMap.",
  "tracker.azure.roleStates.",
  "tracker.azure.stateMap.",
];
/** `--merge` roots: a whole block another plugin owns. */
export const MERGEABLE = ["perf"];

export function isWritable(path) {
  return WRITABLE.some((p) => path.startsWith(p) && path.length > p.length);
}

function parseArgs(argv) {
  const args = { set: [], unset: [], merge: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = a.startsWith("--") ? a.slice(2) : null;
    if (!key) continue;
    const next = argv[i + 1];
    if (["set", "unset", "merge"].includes(key)) {
      if (next === undefined || next.startsWith("--")) throw new Error(`--${key} needs a value`);
      args[key].push(next);
      i++;
    } else if (key === "out") {
      if (next === undefined || next.startsWith("--")) throw new Error("--out needs a value");
      args.out = next;
      i++;
    } else if (key === "print") {
      args.print = true;
    } else {
      throw new Error(`unknown flag --${key}`);
    }
  }
  return args;
}

/** Same coercion reconcile-profile applies to `--set` values. */
function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

/** Parse one `--merge root=<json>` / `root=@file.json` into [root, object]. */
export function parseMerge(spec, base = outputRoot()) {
  const eq = spec.indexOf("=");
  if (eq < 1) throw new Error(`--merge expects <root>=<json>, got ${JSON.stringify(spec)}`);
  const root = spec.slice(0, eq);
  if (!MERGEABLE.includes(root)) throw new Error(`--merge root "${root}" is not writable from outside onboarding (allowed: ${MERGEABLE.join(", ")})`);
  let text = spec.slice(eq + 1);
  if (text.startsWith("@")) text = readFileSync(resolve(base, text.slice(1)), "utf8");
  let value;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error(`--merge ${root}: not valid JSON (${e.message})`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`--merge ${root}: expected a JSON object`);
  return [root, value];
}

function emit(report, code) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    emit({ status: "refused", error: e.message }, 1);
  }
  const outPath = resolveOutPath(args.out, "project-profile.json");
  if (!existsSync(outPath)) {
    emit({ status: "no-profile", path: outPath, error: "no project-profile.json — run /project-init (the vc-init plugin) first" }, 2);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(outPath, "utf8"));
  } catch (e) {
    emit({ status: "error", path: outPath, error: `parse: ${e.message} — fix it or run /project-init --check` }, 1);
  }
  const meta = raw._meta;
  delete raw._meta;
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > PROFILE_SCHEMA_VERSION) {
    emit({ status: "newer-schema", path: outPath, error: `schemaVersion ${raw.schemaVersion} was written by a newer vc-init — update vc-init` }, 1);
  }

  const refused = [...args.set.map((s) => s.slice(0, Math.max(0, s.indexOf("=")))), ...args.unset]
    .filter((p) => !isWritable(p));
  if (refused.length) {
    emit({ status: "refused", path: outPath, error: `not writable from outside onboarding: ${refused.join(", ")} (allowed: ${WRITABLE.map((p) => `${p}*`).join(", ")}; --merge ${MERGEABLE.join(", ")})` }, 1);
  }
  const decisions = {};
  for (const s of args.set) {
    const eq = s.indexOf("=");
    decisions[s.slice(0, eq)] = coerce(s.slice(eq + 1));
  }
  let merges;
  try {
    merges = args.merge.map((m) => parseMerge(m));
  } catch (e) {
    emit({ status: "refused", path: outPath, error: e.message }, 1);
  }

  const { migrated, added, removed, unset, rejected, pending, rescan } = reconcile(PROFILE_DEFAULTS, raw, decisions, args.unset);
  const merged = [];
  for (const [root, value] of merges) {
    migrated[root] = deepMerge(migrated[root] && typeof migrated[root] === "object" ? migrated[root] : {}, value);
    merged.push({ path: root, keys: Object.keys(value) });
  }
  if (rejected.length) emit({ status: "refused", path: outPath, wrote: false, rejected }, 1);
  if (removed.length >= 5) {
    emit({ status: "needs-check", path: outPath, wrote: false, removed, error: "this write would prune 5+ fields the schema does not list — run /project-init --check first" }, 1);
  }

  const withMeta = {
    _meta: { ...(meta || {}), lastSetBy: "project-init/profile-set.mjs" },
    ...migrated,
  };
  writeFileSync(outPath, JSON.stringify(withMeta, null, 2) + "\n");
  const report = { status: "written", path: outPath, wrote: true, added, merged, unset, removed, pending, rescan };
  if (args.print) report.profile = withMeta;
  emit(report, 0);
}

main();
