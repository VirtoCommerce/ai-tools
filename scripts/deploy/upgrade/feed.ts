// scripts/deploy/upgrade/feed.ts — VirtoCommerce/vc-modules modules_v3.json: the module release feed.
import { cmpVersion } from './versions.ts';

export interface FeedDep { Id: string; Version: string; Optional?: boolean }
export interface FeedVersion { Version: string; VersionTag?: string; PlatformVersion?: string; PackageUrl?: string; Dependencies?: FeedDep[] | null }
export interface FeedEntry { Id: string; ProjectUrl?: string; Versions: FeedVersion[] }
/** The feed's location (not a value it holds); override with VC_MODULES_FEED_URL. */
export const DEFAULT_FEED_URL = 'https://raw.githubusercontent.com/VirtoCommerce/vc-modules/master/modules_v3.json';
/** A release: empty VersionTag AND a GitHub release-download PackageUrl. `Version` alone carries no suffix even for alphas. */
export const isRelease = (v: FeedVersion): boolean =>
  !v.VersionTag && /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(v.PackageUrl ?? '');
export function latestRelease(e: FeedEntry): FeedVersion | null {
  return e.Versions.filter(isRelease).sort((a, b) => cmpVersion(b.Version, a.Version))[0] ?? null;
}
