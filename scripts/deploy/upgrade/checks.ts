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

export function resolveEndState(current: Map<string, string>, changes: Change[], atLatest: Set<string>, coupled: string[][] = COUPLED): Resolution {
  const dropped: Dropped[] = changes.filter((c) => !c.assetOk)
    .map((c) => ({ change: c, status: 'BLOCKED_ASSET' as const, reason: `not downloadable anonymously${c.assetNote ? ` (${c.assetNote})` : ''}: ${c.assetUrl}` }));
  let active = changes.filter((c) => c.assetOk);
  for (let passes = 1; ; passes++) {
    const end = new Map(current);
    for (const c of active) end.set(c.component, c.to);
    const platform = baseOf(end.get('Platform') ?? '0');
    const drop = new Map<Change, Dropped>();
    for (const c of active) {
      if (c.kind !== 'module') continue;
      if (c.platformFloor && cmpVersion(c.platformFloor, platform) > 0) {
        drop.set(c, { change: c, status: 'PLATFORM_FLOOR', reason: `needs Platform ≥ ${c.platformFloor}; end state has ${platform}` });
        continue;
      }
      const bad = c.deps.find((d) => end.has(d.Id) && cmpVersion(baseOf(end.get(d.Id)!), d.Version) < 0);
      if (bad) drop.set(c, { change: c, status: 'DEP_CONFLICT', reason: `needs ${bad.Id} ≥ ${bad.Version}; end state has ${end.get(bad.Id)}` });
    }
    for (const group of coupled) {
      const pinned = group.filter((id) => current.has(id));
      if (pinned.length < 2) continue;
      const moving = active.filter((c) => pinned.includes(c.component) && !drop.has(c));
      const stuck = pinned.filter((id) => !moving.some((m) => m.component === id) && !atLatest.has(id));
      if (moving.length && stuck.length) for (const c of moving) drop.set(c, { change: c, status: 'COUPLED', reason: `${group.join(' + ')} move together; ${stuck.join(', ')} does not move` });
    }
    if (drop.size === 0) return { accepted: active, dropped, passes };
    dropped.push(...drop.values());
    active = active.filter((c) => !drop.has(c));
  }
}
