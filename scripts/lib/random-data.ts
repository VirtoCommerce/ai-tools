/**
 * Zero-dependency random test-data generators for QA agents.
 *
 * Use for inputs you do NOT assert against (unique emails, org names,
 * comments, BVA quantities). For entities you assert against, use
 * `@td(ALIAS.field)` instead. For "any product / first address / current
 * catalog root" lookups, use `./live-discover.ts`.
 *
 * **Cleanup contract**: defaults for `uniqueOrgName` / `uniqueSku` use the
 * `AGENT-TEST-` prefix so `/qa-seed-data teardown` sweeps them. If you
 * pass a custom prefix, you take ownership of cleanup.
 *
 * See `.claude/agents/knowledge/live-discovery.md` for the decision tree.
 */
import { randomUUID } from "crypto";

const ADJECTIVES = [
  "Bright", "Quiet", "Bold", "Rapid", "Calm", "Crisp", "Daring", "Eager",
  "Fluid", "Gentle", "Honest", "Iconic", "Jolly", "Keen", "Lively", "Modern",
  "Noble", "Open", "Prime", "Quick",
];

const NOUNS = [
  "Falcon", "River", "Atlas", "Echo", "Forge", "Harbor", "Nova", "Orbit",
  "Pivot", "Quartz", "Summit", "Tempo", "Vector", "Wave", "Zenith", "Helix",
  "Beacon", "Cipher", "Drift", "Ember",
];

const FIRST_NAMES = [
  "Alex", "Jordan", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Hayden",
  "Reese", "Skyler", "Drew", "Sage", "Robin", "Parker", "Rowan", "Emerson",
];

const LAST_NAMES = [
  "Lane", "Brooks", "Reyes", "Cole", "Patel", "Nguyen", "Vega", "Mendez",
  "Hayes", "Pierce", "Morgan", "Ford", "Reed", "Sullivan", "Bennett", "Curtis",
];

const LOREM = [
  "alpha", "beta", "gamma", "delta", "epsilon", "lorem", "ipsum", "dolor",
  "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

/**
 * Returns an email guaranteed unique within a run (timestamp + uuid suffix).
 * Domain is `@qa.test` so it never collides with a real inbox.
 */
export function uniqueEmail(prefix = "agent"): string {
  return `${prefix}-${Date.now()}-${shortId()}@qa.test`;
}

/**
 * Returns a human-readable org name guaranteed unique within a run.
 * Default pattern: `AGENT-TEST-Org-<Adjective>-<ts>` — matches the
 * cleanup convention recognized by `/qa-seed-data teardown`.
 */
export function uniqueOrgName(prefix = "AGENT-TEST-Org"): string {
  return `${prefix}-${pick(ADJECTIVES)}-${Date.now()}`;
}

/**
 * Returns a SKU guaranteed unique within a run.
 * Default pattern: `AGENT-TEST-SKU-<ts>-<rand>` — matches the cleanup
 * convention recognized by `/qa-seed-data teardown`.
 */
export function uniqueSku(prefix = "AGENT-TEST-SKU"): string {
  return `${prefix}-${Date.now()}-${shortId()}`;
}

/** Inclusive on both bounds. Default 1..10. */
export function randomQty(min = 1, max = 10): number {
  return randomInt(min, max);
}

/**
 * Short Lorem-ish comment. Length-capped at `maxLen` (default 200).
 * Never empty; never exceeds the cap.
 */
export function randomComment(maxLen = 200): string {
  const wordCount = randomInt(4, 16);
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) words.push(pick(LOREM));
  const sentence = words.join(" ");
  const capitalized = sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  return capitalized.length > maxLen ? capitalized.slice(0, maxLen - 1) + "." : capitalized;
}

export function randomPersonName(): { first: string; last: string } {
  return { first: pick(FIRST_NAMES), last: pick(LAST_NAMES) };
}

/** US phone in `(NNN) NNN-NNNN` format. Area code starts 2-9 (NANP-valid). */
export function randomUsPhone(): string {
  const area = randomInt(200, 999);
  const prefix = randomInt(200, 999);
  const line = randomInt(0, 9999).toString().padStart(4, "0");
  return `(${area}) ${prefix}-${line}`;
}

/** US 5-digit zip code as a string (no zero-truncation). */
export function randomUsZip(): string {
  return randomInt(10000, 99999).toString();
}

/**
 * Compact address-line-1 string, e.g. "742 Bright Falcon Ln".
 * For more structured address data, prefer `@td(ADDRESS.*)` fixtures or
 * `discoverFirstAddress()` from `./live-discover.ts`.
 */
export function randomAddressLine1(): string {
  return `${randomInt(100, 9999)} ${pick(ADJECTIVES)} ${pick(NOUNS)} Ln`;
}
