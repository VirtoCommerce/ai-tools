// scripts/regression/baseline.ts — the per-env regression baseline (spec §6 row 5): the deployed build a
// COMPLETED run was planned against. Written at close, never at pre-flight: a run that died mid-way
// must not become the next run's baseline. Replaces reports/deploy-state-cache.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isUnknown, type EnvFacts, type Unknown } from "../lib/env-facts.ts";

export interface Baseline { env: string; runId: string; observedAt: string; platform: string | null; modules: Record<string, string> }
export interface ModuleChange { id: string; from: string | null; to: string | null }

export const baselinePath = (root: string, env: string) => join(root, "reports", "regression", `baseline.${env}.json`);

export function readBaseline(root: string, env: string): Baseline | null {
  const p = baselinePath(root, env);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as Baseline; } catch { return null; }
}

export function baselineFromFacts(f: EnvFacts, env: string, runId: string): Baseline | null {
  if (isUnknown(f.deployed)) return null;
  const modules: Record<string, string> = {};
  for (const [id, m] of Object.entries(f.deployed.modules)) modules[id] = m.version;
  return { env, runId, observedAt: f.observedAt, platform: typeof f.deployed.platform === "string" ? f.deployed.platform : null, modules };
}

export function baselineDelta(b: Baseline | null, f: EnvFacts): ModuleChange[] | Unknown {
  if (!b) return { unknown: "no-baseline" };
  if (isUnknown(f.deployed)) return { unknown: `deployed ${f.deployed.unknown}` };
  const changes: ModuleChange[] = [];
  const nowPlatform = typeof f.deployed.platform === "string" ? f.deployed.platform : null;
  if (b.platform && nowPlatform && b.platform !== nowPlatform) changes.push({ id: "platform", from: b.platform, to: nowPlatform });
  const ids = [...new Set([...Object.keys(b.modules), ...Object.keys(f.deployed.modules)])].sort();
  for (const id of ids) {
    const from = b.modules[id] ?? null, to = f.deployed.modules[id]?.version ?? null;
    if (from !== to) changes.push({ id, from, to });
  }
  return changes;
}

/**
 * Called by regression:close after a COMPLETED close. Reads the run's own preflight.json; never probes.
 * The file is named from the env the facts were OBSERVED on (`facts.env`), never from the caller's
 * `--env`: a mismatch would file one stand's build under another's name. A mismatch still writes,
 * under `facts.env`, and returns a `warning`.
 */
export function writeBaselineFromRun(root: string, runDir: string, env: string, runId: string): { written: boolean; env?: string; reason?: string; warning?: string } {
  const p = join(runDir, "preflight.json");
  if (!existsSync(p)) return { written: false, reason: "no preflight.json in the run folder" };
  let pf: { facts?: EnvFacts };
  try { pf = JSON.parse(readFileSync(p, "utf8")); } catch { return { written: false, reason: "preflight.json does not parse" }; }
  const factsEnv = pf.facts?.env || env;
  const b = pf.facts ? baselineFromFacts(pf.facts, factsEnv, runId) : null;
  if (!b) return { written: false, reason: "the run's pre-flight had no deployed module list" };
  try {
    writeFileSync(baselinePath(root, factsEnv), JSON.stringify(b, null, 2) + "\n", "utf8");
  } catch (e) {
    return { written: false, reason: `could not write baseline: ${(e as Error).message}` };
  }
  return factsEnv === env ? { written: true, env: factsEnv }
    : { written: true, env: factsEnv, warning: `--env ${env} but the run's pre-flight observed ${factsEnv}: baseline written as baseline.${factsEnv}.json` };
}
