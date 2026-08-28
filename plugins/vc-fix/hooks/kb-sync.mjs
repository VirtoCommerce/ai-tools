#!/usr/bin/env node
/**
 * hooks/kb-sync.mjs — SessionStart. Keeps the pinned platform brain current, silently.
 *
 * The platform brain has no releases: it is a continuous `main`, and a client pins a
 * COMMIT (VCST-5776 §D1). Something therefore has to move that pin, and the design
 * decision was that it moves ITSELF — one light request at session start, no operator
 * ceremony, because a knowledge base a human has to remember to update is a knowledge
 * base that silently goes stale, and stale compiled knowledge misleads with confidence.
 *
 * What one run does:
 *   1. Compare the recorded pin against the platform brain's newest commit (one fetch).
 *   2. Equal -> nothing to say. Not equal -> fast-forward the local cache.
 *   3. Run `drift-check` over the client's overrides against the NEW platform tree.
 *      Clean -> bump the pin and say one line. Conflicting overrides (their quoted
 *      wording changed, or their target id is gone) -> bump the pin anyway, record the
 *      conflicts in `.vc-fix/kb-review.json`, and name them in that one line.
 *   4. If the last consolidation run is older than the staleness window, start one
 *      locally in the background — the fallback for a deployment whose brain repo has
 *      no CI (D5).
 *
 * Why the pin advances even with conflicts: the cache is pinned to a COMMIT, so there
 * is no such thing as a partial fast-forward — holding it back would freeze the whole
 * platform layer because ONE client override went stale. What is actually held back is
 * the DECISION about those overrides: this hook never rewrites a client entry, because
 * how a deployment should react to a changed platform rule is knowledge about that
 * deployment, and that is the one thing this toolchain has no authority to guess.
 *
 * FAIL-OPEN IS ABSOLUTE. No network, no git, no profile, a corrupt cache, an outright
 * bug — every path ends in exit 0 with at most a stderr note. A session must never fail
 * to start because the knowledge cache could not be refreshed. Opt out with
 * VC_FIX_KB_SYNC=off.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { outputRoot, platformRoot, clientRoot, readBrain, LAYOUT } from "../skills/kb/kb-paths.mjs";
import { driftCheck, conflicting } from "../skills/kb/drift-check.mjs";

/** One network call, hard-bounded: a session start must not wait on a slow remote. */
export const FETCH_TIMEOUT_MS = 8000;
/** Consolidation older than this and the local fallback runs in the background. */
export const DEFAULT_STALE_DAYS = 7;
/** How many conflicting override ids the one-line summary names before it says "and N more". */
const REVIEW_PREVIEW = 3;

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));

/* -------------------------------------------------------------- pure planner */

/**
 * Decide what a sync run should do. Pure: no filesystem, no network, no clock — so the
 * decision itself is unit-testable without a remote.
 *
 * @param {{enabled?: boolean, offline?: boolean, pin?: string, latest?: string,
 *          drift?: {counts: object, results: object[]}, lastConsolidateDays?: number|null,
 *          staleDays?: number}} input
 * @returns {{action: string, pin: string, latest: string, holdBack: string[],
 *            contextLine: string, runConsolidate: boolean, reason: string}}
 */
export function planSync(input) {
  const i = input || {};
  const staleDays = Number.isFinite(i.staleDays) ? i.staleDays : DEFAULT_STALE_DAYS;
  const age = i.lastConsolidateDays;
  const runConsolidate = age === null || age === undefined ? false : Number(age) > staleDays;

  if (i.enabled === false) {
    return { action: "disabled", pin: i.pin || "", latest: "", holdBack: [], contextLine: "", runConsolidate: false, reason: "knowledge sync disabled" };
  }
  if (i.offline) {
    return { action: "offline", pin: i.pin || "", latest: "", holdBack: [], contextLine: "", runConsolidate, reason: "the platform brain could not be reached — keeping the current pin" };
  }
  const pin = String(i.pin || "");
  const latest = String(i.latest || "");
  if (!latest || latest === pin) {
    return { action: "up-to-date", pin, latest: latest || pin, holdBack: [], contextLine: "", runConsolidate, reason: "already on the newest platform commit" };
  }

  const holdBack = i.drift ? conflicting(i.drift) : [];
  const short = latest.slice(0, 8);
  if (!holdBack.length) {
    return {
      action: "fast-forward", pin: latest, latest, holdBack: [],
      contextLine: "vc-fix kb: platform brain updated to " + short + " (all client overrides still match the wording they quote).",
      runConsolidate,
      reason: "clean fast-forward",
    };
  }
  const preview = holdBack.slice(0, REVIEW_PREVIEW).join(", ");
  const more = holdBack.length > REVIEW_PREVIEW ? " and " + (holdBack.length - REVIEW_PREVIEW) + " more" : "";
  return {
    action: "fast-forward-with-review", pin: latest, latest, holdBack,
    contextLine:
      "vc-fix kb: platform brain updated to " + short + ". " + holdBack.length +
      " client override(s) need review — " + preview + more +
      " — the platform wording they quote has changed or their target id is gone. Everything else updated; run `npm run kb:drift` for the detail.",
    runConsolidate,
    reason: "fast-forward with " + holdBack.length + " conflicting override(s)",
  };
}

/* ------------------------------------------------------------------- helpers */

function git(root, args, timeout) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: timeout || FETCH_TIMEOUT_MS,
  }).trim();
}

/** The project's knowledge block, with every field optional. Never throws. */
export function loadKnowledgeConfig(root) {
  const cfg = {
    enabled: true,
    platformRoot: platformRoot(),
    clientRoot: clientRoot(),
    pin: "",
    staleDays: DEFAULT_STALE_DAYS,
    profileFile: join(root, "project-profile.json"),
  };
  try {
    if (!existsSync(cfg.profileFile)) return cfg;
    const profile = JSON.parse(readFileSync(cfg.profileFile, "utf8"));
    const k = (profile && profile.knowledge) || {};
    if (k.enabled === false) cfg.enabled = false;
    if (k.platformRoot) cfg.platformRoot = join(root, k.platformRoot);
    if (k.clientRoot) cfg.clientRoot = join(root, k.clientRoot);
    if (k.pin) cfg.pin = String(k.pin);
    if (Number.isFinite(k.consolidateStaleDays)) cfg.staleDays = k.consolidateStaleDays;
  } catch { /* a malformed profile must not stop a session */ }
  return cfg;
}

/** Days since the newest consolidation digest, or null when there has never been one. */
export function lastConsolidateAgeDays(root, now) {
  try {
    const dir = join(root, LAYOUT.digest);
    if (!existsSync(dir)) return null;
    const stamps = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try { return Date.parse(JSON.parse(readFileSync(join(dir, f), "utf8")).at || ""); } catch { return NaN; }
      })
      .filter((n) => Number.isFinite(n));
    if (!stamps.length) return null;
    const newest = Math.max.apply(null, stamps);
    return Math.floor(((now || Date.now()) - newest) / 86400000);
  } catch {
    return null;
  }
}

function writePin(cfg, pin) {
  try {
    if (!existsSync(cfg.profileFile)) return false;
    const profile = JSON.parse(readFileSync(cfg.profileFile, "utf8"));
    profile.knowledge = Object.assign({}, profile.knowledge, { pin });
    writeFileSync(cfg.profileFile, JSON.stringify(profile, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

function writeReviewList(root, holdBack, report) {
  try {
    mkdirSync(join(root, ".vc-fix"), { recursive: true });
    writeFileSync(
      join(root, ".vc-fix", "kb-review.json"),
      JSON.stringify({
        note: "Client overrides whose platform base moved. This file is a REVIEW LIST, not a change: nothing here has been rewritten. Resolve each, then it disappears on the next sync.",
        at: new Date().toISOString(),
        holdBack,
        detail: (report && report.results ? report.results : []).filter((r) => r.verdict !== "ok"),
      }, null, 2) + "\n",
      "utf8",
    );
  } catch { /* a review list that cannot be written must not fail the session */ }
}

/** Start a local consolidation in the background; never waited on, never fatal. */
function startBackgroundConsolidate(clientDir) {
  try {
    const script = join(HOOK_DIR, "..", "skills", "kb", "consolidate.mjs");
    if (!existsSync(script)) return false;
    const child = spawn(process.execPath, [script, "--root", clientDir], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------------- CLI */

function emit(line) {
  if (!line) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: line },
  }));
}

function main() {
  try {
    if (String(process.env.VC_FIX_KB_SYNC || "").toLowerCase() === "off") return 0;
    const root = outputRoot();
    const cfg = loadKnowledgeConfig(root);
    if (!cfg.enabled) return 0;
    // Nothing onboarded yet (VCST-5820 wires this up) — stay completely silent.
    if (!readBrain(cfg.platformRoot)) return 0;

    let latest = "";
    let offline = false;
    try {
      git(cfg.platformRoot, ["fetch", "--quiet", "origin"]);
      latest = git(cfg.platformRoot, ["rev-parse", "FETCH_HEAD"]);
    } catch {
      offline = true;
    }

    const pin = cfg.pin || (() => {
      try { return git(cfg.platformRoot, ["rev-parse", "HEAD"]); } catch { return ""; }
    })();

    let report = null;
    if (!offline && latest && latest !== pin) {
      // Fast-forward first, then measure the client's overrides against the NEW tree —
      // the drift verdict has to be about the wording that is now upstream.
      try {
        git(cfg.platformRoot, ["checkout", "--quiet", "--detach", latest]);
      } catch {
        offline = true; // a cache we cannot move is treated exactly like no network
      }
      if (!offline && readBrain(cfg.clientRoot)) {
        try { report = driftCheck({ platform: cfg.platformRoot, client: cfg.clientRoot }); } catch { report = null; }
      }
    }

    const plan = planSync({
      enabled: cfg.enabled,
      offline,
      pin,
      latest,
      drift: report,
      lastConsolidateDays: lastConsolidateAgeDays(cfg.clientRoot),
      staleDays: cfg.staleDays,
    });

    if (plan.action === "fast-forward" || plan.action === "fast-forward-with-review") {
      writePin(cfg, plan.pin);
      if (plan.holdBack.length) writeReviewList(root, plan.holdBack, report);
    }
    if (plan.runConsolidate && readBrain(cfg.clientRoot)) startBackgroundConsolidate(cfg.clientRoot);

    emit(plan.contextLine);
    return 0;
  } catch (err) {
    process.stderr.write("kb-sync hook error (failing open): " + ((err && err.message) || err) + "\n");
    return 0;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main());

export { main };
