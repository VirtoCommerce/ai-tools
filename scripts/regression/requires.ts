// scripts/regression/requires.ts — a suite's `requiresModules` entry → a module id, and gating against
// the fact core (spec §6 row 4, §14 D10). One rule, never fuzzy: "cms" must not become XCms.
import { isUnknown, type EnvFacts } from "../lib/env-facts.ts";
import type { Ledger } from "../lib/release-ledger-read.ts";
import { moduleIdToRepoGuess } from "../../plugins/vc-fix/skills/qa-fix-routing/module-registry.ts";

export interface SuiteRef { id: string; layer?: string; requiresModules?: string[] }
export interface ResolvedModule { id: string; pascal: string }
export type ReqState = "deployed" | "load-error" | "not-deployed" | "storefront-invisible" | "unmapped";
export interface Gated { suite: string; module: string; state: "load-error" | "not-deployed" | "storefront-invisible" }
export interface GatingResult {
  gated: Gated[];
  /** `module` is the rule-resolved Pascal id — not deployed, not declared, not in the ledger. */
  unmapped: { entry: string; module: string; suites: string[] }[];
  requiredBySuite: Record<string, string[]>;
  gatingOff: string | null;
}

/** Full id (any case) as is; otherwise VirtoCommerce. + PascalCase of the kebab entry. */
export function resolveRequiredModule(entry: string): ResolvedModule {
  const s = entry.trim();
  const m = /^virtocommerce\.(.+)$/i.exec(s);
  const pascal = m ? `VirtoCommerce.${m[1]}` : `VirtoCommerce.${s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
  return { id: pascal.toLowerCase(), pascal };
}

function classify(mod: ResolvedModule, layer: string | undefined, f: EnvFacts, ledgerRepos: Set<string>): ReqState {
  if (isUnknown(f.deployed)) return "unmapped"; // never reached: gateSuites returns early
  const live = f.deployed.modules[mod.id];
  if (live) {
    if (live.loadErrors.length > 0) return "load-error";
    const sf = f.storefrontVisible;
    if (layer === "frontend" && sf && !isUnknown(sf) && !sf.versionsHidden && !(mod.id in sf.modules)) return "storefront-invisible";
    return "deployed";
  }
  if (!isUnknown(f.declared) && mod.id in f.declared.modules) return "not-deployed";
  if (ledgerRepos.has(moduleIdToRepoGuess(mod.pascal))) return "not-deployed";
  return "unmapped";
}

export function gateSuites(suites: SuiteRef[], facts: EnvFacts, ledger: Ledger | null): GatingResult {
  const requiredBySuite: Record<string, string[]> = {};
  for (const s of suites) requiredBySuite[s.id] = (s.requiresModules ?? []).map((e) => resolveRequiredModule(e).id);
  if (isUnknown(facts.deployed)) return { gated: [], unmapped: [], requiredBySuite, gatingOff: `deployed ${facts.deployed.unknown}` };

  const ledgerRepos = new Set((ledger?.latest ?? []).map((l) => l.repo));
  const gated: Gated[] = [];
  const unmappedMap = new Map<string, { module: string; suites: string[] }>();
  for (const s of suites) {
    for (const entry of s.requiresModules ?? []) {
      const mod = resolveRequiredModule(entry);
      const state = classify(mod, s.layer, facts, ledgerRepos);
      if (state === "deployed") continue;
      if (state === "unmapped") unmappedMap.set(entry, { module: mod.pascal, suites: [...(unmappedMap.get(entry)?.suites ?? []), s.id] });
      else gated.push({ suite: s.id, module: mod.id, state });
    }
  }
  return { gated, unmapped: [...unmappedMap].map(([entry, u]) => ({ entry, module: u.module, suites: u.suites })), requiredBySuite, gatingOff: null };
}
