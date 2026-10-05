// scripts/deploy/upgrade/checks.ts — judge the PROPOSED END STATE, to a fixed point (draft §6.2).
// A failed check drops its change, and dropping one can break another (a dependant now needs a version
// that will not be deployed; a coupled partner loses its pair) — so after any drop, recompute and
// re-run every check until a pass drops nothing. A dropped change keeps the reason it FIRST failed for.
import type { Change } from './types.ts';
import { baseOf, cmpVersion } from './versions.ts';

/** Modules that deploy as a pair: both move, or neither (team rule; extend here, nowhere else). */
export const COUPLED: string[][] = [['VirtoCommerce.XCMS', 'VirtoCommerce.PageBuilderModule']];

export interface Dropped { change: Change; status: 'DEP_CONFLICT' | 'PLATFORM_FLOOR' | 'COUPLED' | 'BLOCKED_ASSET'; reason: string }
export interface Resolution { accepted: Change[]; dropped: Dropped[]; passes: number }
/** What a module's PINNED release requires (from the feed) — checked for every module that does not move. */
export interface Requires { deps: { Id: string; Version: string }[]; platformFloor?: string }

export function resolveEndState(current: Map<string, string>, changes: Change[], atLatest: Set<string>, requires: Map<string, Requires> = new Map(), coupled: string[][] = COUPLED): Resolution {
  const dropped: Dropped[] = changes.filter((c) => !c.assetOk)
    .map((c) => ({ change: c, status: 'BLOCKED_ASSET' as const, reason: `not downloadable anonymously${c.assetNote ? ` (${c.assetNote})` : ''}: ${c.assetUrl}` }));
  let active = changes.filter((c) => c.assetOk);
  for (let passes = 1; ; passes++) {
    const end = new Map(current);
    for (const c of active) end.set(c.component, c.to);
    const endOf = new Map([...end].map(([id, v]) => [id.toLowerCase(), v])); // dependency Ids are matched case-insensitively
    const moving = new Map(active.map((c) => [c.component.toLowerCase(), c]));
    const platform = baseOf(end.get('Platform') ?? '0');
    const drop = new Map<Change, Dropped>();
    for (const c of active) {
      if (c.kind !== 'module') continue;
      if (c.platformFloor && cmpVersion(c.platformFloor, platform) > 0) {
        drop.set(c, { change: c, status: 'PLATFORM_FLOOR', reason: `needs Platform ≥ ${c.platformFloor}; end state has ${platform}` });
        continue;
      }
      const missing = c.deps.find((d) => !endOf.has(d.Id.toLowerCase()));
      if (missing) {
        drop.set(c, { change: c, status: 'DEP_CONFLICT', reason: `needs ${missing.Id} ≥ ${missing.Version}, which is not deployed on this env (this tool never adds modules)` });
        continue;
      }
      const bad = c.deps.find((d) => cmpVersion(baseOf(endOf.get(d.Id.toLowerCase())!), d.Version) < 0);
      if (bad) drop.set(c, { change: c, status: 'DEP_CONFLICT', reason: `needs ${bad.Id} ≥ ${bad.Version}; end state has ${endOf.get(bad.Id.toLowerCase())}` });
    }
    // A module that STAYS still needs what its pinned release requires. A change that takes one of those
    // requirements below it (an approved downgrade, of a module or of the platform) is the one that breaks.
    for (const [id, req] of requires) {
      if (moving.has(id.toLowerCase()) || !end.has(id)) continue; // a moving module was checked against its target's deps above
      const pc = moving.get('platform');
      if (pc && !drop.has(pc) && req.platformFloor && cmpVersion(req.platformFloor, platform) > 0) {
        drop.set(pc, { change: pc, status: 'PLATFORM_FLOOR', reason: `${id} ${end.get(id)} (not moving) needs Platform ≥ ${req.platformFloor}; this change takes it to ${pc.to}` });
      }
      for (const d of req.deps) {
        const c = moving.get(d.Id.toLowerCase());
        if (c && !drop.has(c) && cmpVersion(baseOf(c.to), d.Version) < 0) {
          drop.set(c, { change: c, status: 'DEP_CONFLICT', reason: `${id} ${end.get(id)} (not moving) needs ${d.Id} ≥ ${d.Version}; this change takes it to ${c.to}` });
        }
      }
    }
    for (const group of coupled) {
      const pinned = group.filter((id) => current.has(id));
      if (pinned.length < 2) continue;
      const movingPair = active.filter((c) => pinned.includes(c.component) && !drop.has(c));
      const stuck = pinned.filter((id) => !movingPair.some((m) => m.component === id) && !atLatest.has(id));
      if (movingPair.length && stuck.length) for (const c of movingPair) drop.set(c, { change: c, status: 'COUPLED', reason: `${group.join(' + ')} move together; ${stuck.join(', ')} does not move` });
    }
    if (drop.size === 0) return { accepted: active, dropped, passes };
    dropped.push(...drop.values());
    active = active.filter((c) => !drop.has(c));
  }
}
