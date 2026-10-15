/**
 * scripts/seed-data/orders/quote-buyers.mjs — WHO the seeded quotes belong to, resolved LIVE.
 *
 * Suite 015 signs in as the agent-pool B2B buyer of whichever lane runs it
 * (test-data/users/agent-user-pool.csv, `b2b_email`), and the buyer's quote list filters on that
 * buyer's LOGIN id AND current organization (KB-874B24DD). So both are read from the platform here,
 * never from the pool CSV's informational `b2b_org` / `b2b_org_id` columns — on vcst 2026-10-15 slot 1's
 * CSV said TechFlow while the live member belonged to AcmeCorp, and a quote stamped from the CSV
 * would have been invisible to the very buyer it was seeded for (GOLDEN RULE).
 *
 * Shared by seed-quotes.mjs (stamps attribution) and reconcile-test-data.mjs (checks it).
 * Network only through the caller-supplied `api` — no env reads, no writes.
 */
import { loadCsv } from '../../lib/seed-common.mjs';

/** The pool slot whose quotes own the alias's default `id`/`number` — suite 015's manifest lane (playwright-chrome). */
export const DEFAULT_QUOTE_SLOT = '1';

/** Pool rows that carry a seeded B2B buyer, in slot order. */
export function poolBuyerRows() {
  return loadCsv('test-data/users/agent-user-pool.csv')
    .filter((r) => /^\d+$/.test(String(r.slot || '')) && r.b2b_email && r.b2b_email !== 'n/a' && /^(true|yes|1)$/i.test(String(r.seeded || '')))
    .sort((a, b) => Number(a.slot) - Number(b.slot));
}

/**
 * Resolve one pool row to { slot, email, userId, organizationId, organizationName, orgCount, passwordRaw }
 * or { slot, email, error }. `organizationId` is the member's FIRST organization; `orgCount` > 1 means
 * the token's current organization is not determined by membership alone (the caller warns).
 */
export async function resolveQuoteBuyer(api, row) {
  const base = { slot: String(row.slot), email: row.b2b_email, passwordRaw: row.b2b_password };
  const user = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.b2b_email)}`, null, { expectStatus: [200, 204, 404] });
  if (!user?.id) return { ...base, error: 'no security account' };
  if (!user.memberId) return { ...base, userId: user.id, error: 'security account has no contact (memberId)' };
  const member = await api('GET', `/api/members/${user.memberId}`, null, { expectStatus: [200, 204, 404] });
  const orgs = member?.organizations || [];
  if (!orgs.length) return { ...base, userId: user.id, error: 'contact belongs to no organization' };
  const org = await api('GET', `/api/members/${orgs[0]}`, null, { expectStatus: [200, 204, 404] });
  return { ...base, userId: user.id, organizationId: orgs[0], organizationName: org?.name || null, orgCount: orgs.length };
}

/** Field names a slot's runtime values are written under in aliases.<env>.json. */
export const slotField = (field, slot) => `${field}_slot${slot}`;
