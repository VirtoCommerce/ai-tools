/**
 * requirements-lint — the drift guard of `config/suite-requirements.json`, run by `npm run suites:lint`.
 *
 * The file is declared by hand, and since the pre-flight records every case a WARN row names as BLOCKED without
 * running it, a stale entry is not advisory: it silently takes cases out of the run. So every entry must point at
 * something that exists — a suite in the manifest, case ids in THAT suite's CSV (a case moved by a suite split
 * leaves its entry behind, as BSM-058 did into 078d) — and use the vocabulary `requirements.ts` reads.
 * Offline: reads only the checkout.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import type { RequirementsFile } from "./requirements.ts";

const KINDS = ["storeSetting", "platformSetting", "paymentMethod", "deployConfig", "uploadScope"];
const MATCHERS = ["equals", "notEquals", "nonEmpty", "allowedIncludes"] as const;

export function lintRequirements(root: string, suites: { id: string; file: string }[]): string[] {
  const p = join(root, "config/suite-requirements.json");
  if (!existsSync(p)) return [];
  let file: RequirementsFile;
  try { file = JSON.parse(readFileSync(p, "utf-8")); } catch (e) { return [`config/suite-requirements.json: unreadable JSON (${(e as Error).message})`]; }
  const errors: string[] = [];
  const files = new Map(suites.map((s) => [s.id, s.file]));
  const caseIds = (id: string): Set<string> | null => {
    const f = files.get(id);
    if (!f || !existsSync(join(root, f))) return null;
    try {
      const rows = parseCsv(readFileSync(join(root, f), "utf-8").replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true }) as Record<string, string>[];
      return new Set(rows.map((r) => r.ID).filter(Boolean));
    } catch { return null; }
  };
  for (const [suite, reqs] of Object.entries(file.suites ?? {})) {
    const at = `config/suite-requirements.json suites.${suite}`;
    if (!files.has(suite)) { errors.push(`${at}: suite ${suite} is not in config/test-suites.json`); continue; }
    if (!Array.isArray(reqs)) { errors.push(`${at}: must be an array`); continue; }
    const ids = caseIds(suite);
    reqs.forEach((r, i) => {
      const where = `${at}[${i}]`;
      if (!KINDS.includes(r.kind)) errors.push(`${where}: kind '${r.kind}' not one of ${KINDS.join(" ")}`);
      if (typeof r.name !== "string" || !r.name.trim()) errors.push(`${where}: name is required`);
      if (typeof r.why !== "string" || !r.why.trim()) errors.push(`${where}: why is required — the cause it was declared for`);
      if (r.level !== undefined && r.level !== "warn" && r.level !== "block") errors.push(`${where}: level must be warn or block`);
      const matchers = MATCHERS.filter((m) => r[m] !== undefined);
      if (matchers.length > 1) errors.push(`${where}: one matcher at most (has ${matchers.join(", ")})`);
      if (r.prefix && r.kind !== "deployConfig") errors.push(`${where}: prefix applies to deployConfig only`);
      if (r.allowedIncludes && r.kind !== "platformSetting") errors.push(`${where}: allowedIncludes applies to platformSetting only`);
      if (r.cases !== undefined && !Array.isArray(r.cases)) errors.push(`${where}: cases must be an array of case ids`);
      else if (ids) for (const c of r.cases ?? []) if (!ids.has(c)) errors.push(`${where}: case ${c} is not in suite ${suite} (${files.get(suite)}) — it moved, or the id is wrong`);
    });
  }
  for (const [alias, p] of Object.entries(file.personas ?? {})) {
    if (!p?.module || !p?.why) errors.push(`config/suite-requirements.json personas.${alias}: module and why are required`);
  }
  return errors;
}
