/**
 * scripts/seed-data/carts/check-competing-carts.mjs
 *
 * PREFLIGHT GUARD: fail fast when a test account holds more than one *shopping* cart for the same
 * (customerId, storeId, currency), because xAPI then resolves reads and writes to DIFFERENT carts and
 * every checkout case on that account fails for a reason that is not the product under test.
 *
 * `[PRE:RESET_CART]` cannot cover this: it empties the RENDERED cart through the UI, so a competing cart
 * is invisible to it. Classification rules + the null-vs-"" trap live in ./cart-hygiene-specs.mjs.
 *
 * Usage
 *   npm run carts:check                         # every resolvable test account in the role registry
 *   npm run carts:check -- --email a@b.com      # one account (repeatable)
 *   npm run carts:check -- --json               # machine-readable
 *   npm run carts:sweep -- --email a@b.com      # delete surplus carts (soft delete), then re-verify
 *   npm run carts:sweep -- --email a@b.com --force   # also delete surplus carts that hold line items
 *
 * Exit codes:  0 = clean · 1 = exposed account(s) found · 2 = operational failure
 * Read-only unless --apply is passed. --apply refuses on ENV_RISK=production.
 */
import { readFileSync, existsSync } from 'node:fs';
import { authenticate, getApi, findUserByEmail, ENV_RISK, TEST_ENV, ROOT } from '../../lib/user-provision.mjs';
import { USER_ROLES, resolveRole } from '../../lib/user-roles.mjs';
import { findExposed, collectAliasRefs } from './cart-hygiene-specs.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const APPLY = flag('apply');
const FORCE = flag('force');
const JSON_OUT = flag('json');
const emails = argv.reduce((acc, a, i) => (a === '--email' && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

const log = (...a) => { if (!JSON_OUT) console.log(...a); };

/** Fixture-referenced carts must never be auto-deleted — derive the list, never hardcode it. */
function aliasRefs() {
  const load = (rel) => {
    const f = `${ROOT}/${rel}`;
    try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; }
  };
  return collectAliasRefs(load('test-data/aliases.json'), load(`test-data/aliases.${TEST_ENV}.json`));
}

function targetEmails() {
  if (emails.length) return emails;
  const out = [];
  for (const role of USER_ROLES) {
    const r = resolveRole(role);
    if (r.present && r.email && r.email.includes('@')) out.push(r.email);
  }
  return [...new Set(out)];
}

async function main() {
  if (APPLY && ENV_RISK === 'production') {
    console.error('REFUSING: --apply is not allowed with ENV_RISK=production');
    process.exit(2);
  }
  await authenticate();
  const api = getApi();

  const refs = aliasRefs();
  const report = [];
  for (const email of targetEmails()) {
    const user = await findUserByEmail(email);
    if (!user?.id) { log(`  ?  ${email} — no security account, skipped`); continue; }
    // cart.customerId is the SECURITY ACCOUNT id (what xAPI passes as `userId`), not the contact id.
    // responseGroup MUST be WithLineItems: under `Default` the search returns items=undefined for every
    // cart, which silently makes the risky/--force guard inert and reports full carts as empty.
    const res = await api('POST', '/api/carts/search', { customerId: user.id, take: 200, responseGroup: 'WithLineItems' });
    const exposed = findExposed(res?.results || [], { refs });
    if (!exposed.length) { log(`  OK ${email}`); continue; }

    for (const g of exposed) {
      const [, storeId, currency] = g.key.split('|');
      log(`  !! ${email} — ${g.carts.length} competing carts (${storeId}/${currency})`);
      log(`       keep    ${g.keep.id} name=${JSON.stringify(g.keep.name)} (${g.keptBecause})`);
      for (const c of g.surplus) {
        const items = c.items?.length ?? c.itemsCount ?? 0;
        const tags = [items > 0 ? 'risky' : null, g.guarded.includes(c) ? 'FIXTURE — will not delete' : null].filter(Boolean);
        log(`       surplus ${c.id} name=${JSON.stringify(c.name)} items=${items}${tags.length ? '  [' + tags.join('; ') + ']' : ''}`);
      }
      report.push({ email, store: storeId, currency, keep: g.keep.id, surplus: g.surplus.map((c) => c.id), risky: g.risky.map((c) => c.id), guarded: g.guarded.map((c) => c.id) });

      if (APPLY) {
        // guarded is excluded unconditionally — --force covers line items, never a fixture cart.
        const candidates = g.surplus.filter((c) => !g.guarded.includes(c));
        const deletable = FORCE ? candidates : candidates.filter((c) => !g.risky.includes(c));
        const skipped = g.surplus.length - deletable.length;
        if (deletable.length) {
          const qs = deletable.map((c) => `ids=${encodeURIComponent(c.id)}`).join('&');
          await api('DELETE', `/api/carts?${qs}`, null, { expectStatus: [200, 204, 404] });
          log(`       deleted ${deletable.length} surplus cart(s)`);
        }
        if (skipped) log(`       kept ${skipped} cart(s): fixture-referenced carts are never deleted; --force covers only carts holding line items`);
      }
    }
  }

  if (APPLY && report.length) {
    // Re-verify: a sweep that did not actually clear the exposure must not report success.
    let still = 0;
    for (const email of [...new Set(report.map((r) => r.email))]) {
      const user = await findUserByEmail(email);
      const res = await api('POST', '/api/carts/search', { customerId: user.id, take: 200, responseGroup: 'WithLineItems' });
      const left = findExposed(res?.results || []);
      if (left.length) {
        still++;
        const onlyFixture = left.every((g) => g.surplus.length && g.surplus.every((c) => g.guarded.includes(c)));
        log(`  !! ${email} STILL exposed after sweep${onlyFixture ? ' — only fixture carts remain: re-point the fixture or remove the default cart by hand' : ''}`);
      }
    }
    if (JSON_OUT) console.log(JSON.stringify({ swept: report, stillExposed: still }, null, 2));
    process.exit(still ? 1 : 0);
  }

  if (JSON_OUT) console.log(JSON.stringify({ exposed: report }, null, 2));
  else log(report.length ? `\n${report.length} exposed group(s). Re-run with npm run carts:sweep to clear.` : '\nNo competing carts.');
  process.exit(report.length ? 1 : 0);
}

main().catch((e) => { console.error(e?.message || e); process.exit(2); });
