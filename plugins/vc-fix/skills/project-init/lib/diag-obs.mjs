/**
 * skills/project-init/lib/diag-obs.mjs
 *
 * The INSIDE channel of the self-diagnostics capture layer: let a plugin script report its own
 * structured verdict, so the collector no longer has to infer it from prose (or miss it entirely).
 *
 * ─── WHY ─────────────────────────────────────────────────────────────────────
 * `verify-access.mjs` computes a complete PASS/FAIL/WARN/SKIP readiness table (`results[]`),
 * renders it for the operator, and then throws it away — exiting 0 unless there is a hard FAIL.
 * `discover-tracker.mjs` catches an HTTP 400 on the Bug field-contract scan, warns to stderr,
 * writes `fields: {}` and exits 0. So the plugin literally computed "the Bug field contract was
 * never scanned, /qa-bug will send unverified defaults" and no part of self-diagnostics could
 * learn it: a documented, operator-visible degradation self-diagnosed as
 * `no plugin issues detected`. The collector's transcript-side capture
 * (`toolUseResult.stderr`) catches the same class from the OUTSIDE; this is the inside channel,
 * and it carries STRUCTURE (class / subject / code) rather than prose a regex has to guess at.
 *
 * ─── CONTRACT ────────────────────────────────────────────────────────────────
 *  - Capture-only. It NEVER decides whether a signal matters — no severity, no verdict. That is
 *    `/vc-self-check`'s job (knowledge/diagnostics/skill-expectations.md §1f).
 *  - Fully swallowed: telemetry must never break onboarding. Any failure (missing hook, spawn
 *    error, timeout, capture disabled) is ignored, exactly like verify-access's existing
 *    `signalSelfDiagnosticsComplete()`.
 *  - The hook's `obs` subcommand applies the closed class vocabulary, the slugified subject,
 *    secret redaction and the per-session caps — a script-supplied record gets the same
 *    treatment as an in-process one, so this module stays a thin, dumb transport.
 *  - No stdin/argv quoting hazards: the payload is a JSON array on stdin (execFileSync `input`),
 *    which is Windows-safe and covers a whole readiness table in ONE spawn.
 */
import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { pluginRoot } from "./paths.mjs";

/**
 * Send observation records to the collector. Best-effort and silent.
 * @param {Array<object>} records  [{ class, subject, code?, evidence?: { snippet?, exitCode?, httpStatus?, path? } }]
 * @param {{ skill?: string, source?: string }} opts
 */
export function emitObservations(records, { skill = null, source = "script" } = {}) {
  try {
    const list = (Array.isArray(records) ? records : [records]).filter((r) => r && typeof r === "object");
    if (!list.length) return;
    const hook = resolve(pluginRoot(), "hooks", "session-telemetry.mjs");
    if (!existsSync(hook)) return;
    const args = [hook, "obs"];
    if (skill) args.push("--skill", skill);
    if (source) args.push("--source", source);
    execFileSync(process.execPath, args, {
      input: JSON.stringify(list),
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 5000,
    });
  } catch {
    /* never throw — a broken telemetry path must not affect the caller's exit code or output */
  }
}

/**
 * Pull an HTTP status out of a probe's own detail text (`→ 401`, `probe → 403`, `HTTP 400`,
 * `(→ 404)`) so the observation carries the number as DATA instead of burying it in a snippet.
 * Returns null when there is no plausible status. Pure.
 *
 * Deliberately conservative: a 3-digit number with no HTTP context nearby is far more often a
 * count, a port, or an exit code, and a wrong status is worse than none.
 */
export function httpStatusFrom(text) {
  const m = /(?:→|->|\bHTTP\b|\bstatus\b|\bcode\b|probe\s*(?:→|->))\s*\(?\s*([1-5]\d\d)\b/i.exec(String(text ?? ""));
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 100 && n <= 599 ? n : null;
}

/**
 * Replace any URL with `<url>` before it becomes evidence. An Azure DevOps / GitHub API URL
 * carries the client's org and project name; the observation only needs the STATUS and the
 * failing step, both of which travel as structured fields. Local diagnostics are already
 * secret-redacted by the collector, so this is about client-identifying SHAPE, not secrets —
 * cheap containment discipline at the point where the text is produced (§2a in spirit: never
 * put a client identifier anywhere it does not need to be).
 */
export function scrubUrls(text) {
  return String(text ?? "").replace(/https?:\/\/\S+/gi, "<url>");
}

/**
 * The readiness-table status word → observation class. The capture layer records WHAT the row
 * said; whether a WARN matters is decided later. A PASS row is not an anomaly and is not
 * recorded (the finalize rollup already reports totals per class).
 */
export function classForStatus(status) {
  switch (String(status ?? "").toUpperCase()) {
    case "FAIL":
    case "NOT AUTH":
      return "self_reported_fail";
    case "WARN":
    case "NEEDS OAUTH":
      return "self_reported_warn";
    case "SKIP":
    case "NO KEY":
      return "self_reported_skip";
    default:
      return null; // PASS / OK / AUTHORIZED — nothing to record
  }
}
