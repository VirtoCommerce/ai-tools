/**
 * Fingerprint store — the noise gate for online monitoring.
 * ----------------------------------------------------------
 * App Insights emits the same error thousands of times. Without dedup, the
 * monitor would re-triage (and re-report) identical signatures every run. This
 * module turns raw query rows into stable *signals*, persists which signatures
 * we have already seen, and classifies each as NEW, SPIKING, or STABLE so the
 * orchestrator only spends triage budget on genuinely new or surging problems.
 *
 * State lives at reports/monitoring/.seen-fingerprints.json (gitignored — it is
 * local working state, not a report). The flow is:
 *   load → classify(store, signals) → triage NEW+SPIKING → setStatus(...) →
 *   recordRun(store, signals) → save
 * classify reads the *previous* baseline; recordRun updates it. Order matters.
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { Layer, Row } from "./appinsights.js";

export const STORE_VERSION = 1;
export const DEFAULT_STORE_PATH = "reports/monitoring/.seen-fingerprints.json";

/** A normalized error signature for one run. */
export interface Signal {
  fingerprint: string;
  layer: Layer;
  probe: string;
  signature: string;
  count: number;
  firstSeen: string; // earliest timestamp in this window (from the telemetry)
  lastSeen: string; // latest timestamp in this window
  /** Remaining KQL columns, for triage/report context. */
  sample: Row;
}

export type SignalStatus = "new" | "triaged" | "confirmed" | "noise" | "filed";

export interface StoreEntry {
  fingerprint: string;
  layer: Layer;
  probe: string;
  signature: string;
  firstSeenByUs: string; // first run that surfaced it
  lastSeenByUs: string; // most recent run that surfaced it
  totalCount: number; // cumulative occurrences across runs
  runs: number; // how many runs it appeared in
  baselineRate: number; // rolling avg occurrences-per-run
  status: SignalStatus;
  class?: string; // triage classification (REAL_BUG, NOISE, ...)
  severity?: string;
  jiraKey?: string;
  lastReportRunId?: string;
}

export interface Store {
  version: number;
  updatedAt: string;
  entries: Record<string, StoreEntry>;
}

export interface ClassifyOptions {
  /** A signal is SPIKING when count >= max(baseline*factor, baseline+minDelta). */
  spikeFactor?: number;
  spikeMinDelta?: number;
}

export interface Classification {
  fresh: Signal[]; // never seen before
  spiking: Signal[]; // seen before, surging beyond baseline, not yet actioned-as-noise
  stable: Signal[]; // seen before, within baseline — skipped
}

// ---------------------------------------------------------------------------
// Signal construction
// ---------------------------------------------------------------------------

/** Stable fingerprint for a signature within a (layer, probe). */
export function fingerprintOf(layer: Layer, probe: string, signature: string): string {
  const norm = `${layer}|${probe}|${String(signature).trim().toLowerCase().replace(/\s+/g, " ")}`;
  return createHash("md5").update(norm).digest("hex").slice(0, 12);
}

/** Build a Signal from a KQL result row. Rows missing a signature are dropped. */
export function signalFromRow(layer: Layer, probe: string, row: Row): Signal | null {
  const signature = row.signature != null ? String(row.signature) : "";
  if (!signature) return null;
  const count = Number(row.count_ ?? row.count ?? 0) || 0;
  const { signature: _s, count_: _c, ...sample } = row;
  return {
    fingerprint: fingerprintOf(layer, probe, signature),
    layer,
    probe,
    signature,
    count,
    firstSeen: row.firstSeen != null ? String(row.firstSeen) : "",
    lastSeen: row.lastSeen != null ? String(row.lastSeen) : "",
    sample,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadStore(path = DEFAULT_STORE_PATH): Store {
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as Store;
      if (parsed && parsed.entries) return parsed;
    } catch {
      // corrupt store — start fresh rather than crash the run
    }
  }
  return { version: STORE_VERSION, updatedAt: new Date().toISOString(), entries: {} };
}

export function saveStore(store: Store, path = DEFAULT_STORE_PATH): void {
  store.version = STORE_VERSION;
  store.updatedAt = new Date().toISOString();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2));
}

// ---------------------------------------------------------------------------
// Classification + recording
// ---------------------------------------------------------------------------

/**
 * Partition this run's signals into fresh / spiking / stable against the store's
 * *previous* baseline. Call BEFORE recordRun. Signatures already actioned as
 * noise/confirmed/filed are treated as stable (skipped) unless they spike again.
 */
export function classify(
  store: Store,
  signals: Signal[],
  opts: ClassifyOptions = {},
): Classification {
  const spikeFactor = opts.spikeFactor ?? 3;
  const spikeMinDelta = opts.spikeMinDelta ?? 20;
  const fresh: Signal[] = [];
  const spiking: Signal[] = [];
  const stable: Signal[] = [];

  for (const sig of signals) {
    const entry = store.entries[sig.fingerprint];
    if (!entry) {
      fresh.push(sig);
      continue;
    }
    // Already decided to be noise → never re-triage.
    if (entry.status === "noise") {
      stable.push(sig);
      continue;
    }
    const threshold = Math.max(entry.baselineRate * spikeFactor, entry.baselineRate + spikeMinDelta);
    if (sig.count >= threshold) {
      spiking.push(sig);
    } else {
      stable.push(sig);
    }
  }
  return { fresh, spiking, stable };
}

/**
 * Upsert every signal seen this run: bump counts, update lastSeen, and roll the
 * baseline (EMA). New signatures are inserted with status "new". Call AFTER
 * classify + triage so the baseline reflects the latest window.
 */
export function recordRun(store: Store, signals: Signal[], runId: string): void {
  const now = new Date().toISOString();
  for (const sig of signals) {
    const existing = store.entries[sig.fingerprint];
    if (!existing) {
      store.entries[sig.fingerprint] = {
        fingerprint: sig.fingerprint,
        layer: sig.layer,
        probe: sig.probe,
        signature: sig.signature,
        firstSeenByUs: now,
        lastSeenByUs: now,
        totalCount: sig.count,
        runs: 1,
        baselineRate: sig.count,
        status: "new",
        lastReportRunId: runId,
      };
    } else {
      existing.lastSeenByUs = now;
      existing.totalCount += sig.count;
      existing.runs += 1;
      // Exponential moving average — recent windows weigh more.
      existing.baselineRate = existing.baselineRate * 0.7 + sig.count * 0.3;
      existing.lastReportRunId = runId;
    }
  }
}

/** Update the triage outcome for a fingerprint (no-op if unknown). */
export function setStatus(
  store: Store,
  fingerprint: string,
  status: SignalStatus,
  extra: { class?: string; severity?: string; jiraKey?: string } = {},
): void {
  const entry = store.entries[fingerprint];
  if (!entry) return;
  entry.status = status;
  if (extra.class) entry.class = extra.class;
  if (extra.severity) entry.severity = extra.severity;
  if (extra.jiraKey) entry.jiraKey = extra.jiraKey;
}
