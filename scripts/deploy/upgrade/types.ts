// scripts/deploy/upgrade/types.ts — the plan contract between the three phases and the skill.
import type { ManifestEditMode } from '../lib/manifest.ts';

export type Status =
  | 'EQUAL' | 'BEHIND' | 'AHEAD' | 'PRERELEASE→RELEASE' | 'PRERELEASE?'
  | 'NOT_IN_FEED' | 'NO_RELEASE' | 'DUPLICATE'
  | 'DEP_CONFLICT' | 'PLATFORM_FLOOR' | 'COUPLED' | 'BLOCKED_ASSET';
export type Kind = 'module' | 'platform' | 'theme';
export interface Change {
  component: string; kind: Kind; from: string; to: string;
  mode: ManifestEditMode | 'theme';
  status: 'BEHIND' | 'PRERELEASE→RELEASE';
  platformFloor?: string;
  deps: { Id: string; Version: string }[];   // non-optional dependencies of the TARGET version
  assetUrl: string; assetOk: boolean; assetNote?: string;
}
export interface Row {
  component: string; kind: Kind; current: string; source?: 'AzureBlob' | 'GithubReleases';
  latest: string | null; status: Status; note: string;
  trackerKey?: string; prUrl?: string; downgrade?: boolean;
  change?: Change;    // proposed without asking (BEHIND, PRERELEASE→RELEASE)
  replace?: Change;   // offered by a PRERELEASE? question
}
export interface QuestionGroup { key: string; components: string[]; recommended: 'keep' | 'replace'; lines: string[] }
export type Decision = 'keep' | 'replace';
/** group key → one decision for the group, or per component. A group not listed is KEEP. */
export type Decisions = Record<string, Decision | Record<string, Decision>>;
export interface UpgradePlan {
  schema: 1; env: string; deployOwner: string; deployRepo: string; branch: string;
  packagesPath: string; themePath: string; fetchedAt: string; feedUrl: string; platformLatest: string;
  snapshot: { packages: string; theme: string | null };
  rows: Row[]; questions: QuestionGroup[];
  openUpgradePrs: { number: number; url: string; head: string }[];
  live: Record<string, string> | null; notes: string[];
}
