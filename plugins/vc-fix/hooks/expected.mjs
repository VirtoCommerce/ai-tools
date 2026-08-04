// .vc-fix/expected.json — the operator-declared EXPECTED-observation suppression list (VCST-5582 C4).
//
// The self-diagnostics flow needs planted fixtures to test itself, and a real deployment sometimes
// hits a KNOWN-benign friction it does not want re-surfaced every turn. Before this there was no
// way to say "this signal is expected" short of `VC_FIX_DIAG_CONSENT=off`, which silences
// EVERYTHING. An `.vc-fix/expected.json` entry suppresses ONE matching signal:
//   • the collector's `finalize` excludes a matching observation from ROUTING (it is still RECORDED
//     and COUNTED — capture is total — it just does not arm the diagnostician);
//   • the deliverer REFUSES to file a matching finding, even on an explicit operator yes.
//
// A suppression is SAFETY-CRITICAL: a forgotten entry could quietly mask a real regression. So a
// non-empty file is ALWAYS reported (a startup note + a finalize count), an entry MUST carry a
// `reason`, and an optional `expires` auto-retires it.
//
// File shape — an array, or `{ expected: [...] }`. Each entry:
//   { class?, subject?, pluginFile?, reason (required), expires? }
// with at least ONE of class/subject/pluginFile. `class` is the collector's observation class
// (e.g. "degraded_artifact"); `subject` is the observation subject / finding subject (compared
// through `subjectEq` so the raw collector slug and the reduced enum both match); `pluginFile` is a
// plugin-relative path (finding-side only). `expires` is an ISO date or an epoch-ms number.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function expectedPath(root) {
  return join(root, ".vc-fix", "expected.json");
}

/**
 * Load + validate `.vc-fix/expected.json`. Never throws (a hook/CLI must not die on a bad file).
 * Returns { entries, expired, invalid } — `entries` are the ACTIVE, well-formed suppressions.
 * `nowMs` is injectable for tests.
 */
export function loadExpected(root, nowMs = Date.now()) {
  const out = { entries: [], expired: 0, invalid: 0 };
  let raw;
  try {
    const p = expectedPath(root);
    if (!existsSync(p)) return out;
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return out; // unreadable / malformed ⇒ no suppressions (fail OPEN: never hide a signal by accident)
  }
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.expected) ? raw.expected : [];
  for (const e of list) {
    if (!e || typeof e !== "object") { out.invalid++; continue; }
    const cls = typeof e.class === "string" && e.class.trim() ? e.class.trim() : null;
    const subject = typeof e.subject === "string" && e.subject.trim() ? e.subject.trim() : null;
    const pluginFile = typeof e.pluginFile === "string" && e.pluginFile.trim() ? e.pluginFile.trim() : null;
    const reason = typeof e.reason === "string" && e.reason.trim() ? e.reason.trim() : null;
    if ((!cls && !subject && !pluginFile) || !reason) { out.invalid++; continue; } // must be justified + targeted
    if (e.expires != null) {
      const t = typeof e.expires === "number" ? e.expires : Date.parse(e.expires);
      if (Number.isFinite(t) && t < nowMs) { out.expired++; continue; }
    }
    out.entries.push({ class: cls, subject, pluginFile, reason });
  }
  return out;
}

/**
 * Does `entry` suppress `signal`? EVERY constraint the entry declares that the signal can be tested
 * against must match; at least one such comparison must actually happen (so a subject-only entry
 * never suppresses a signal that carries no subject). A constraint the signal cannot express (e.g.
 * an obs has no `pluginFile`, a finding has no `class`) is simply not tested — the entry can still
 * match on its other constraints. `subjectEq` lets the deliver side normalize the enum comparison.
 */
export function matchesExpected(entry, signal = {}, subjectEq = (a, b) => a === b) {
  const { cls = null, subject = null, pluginFile = null } = signal;
  let tested = false;
  if (entry.class) {
    if (cls != null) { if (entry.class !== cls) return false; tested = true; }
  }
  if (entry.subject) {
    if (subject != null) { if (!subjectEq(entry.subject, subject)) return false; tested = true; }
  }
  if (entry.pluginFile) {
    if (pluginFile != null) { if (entry.pluginFile !== pluginFile) return false; tested = true; }
  }
  return tested;
}

/** First matching entry, or null. */
export function findExpected(entries, signal, subjectEq) {
  for (const e of entries || []) if (matchesExpected(e, signal, subjectEq)) return e;
  return null;
}
