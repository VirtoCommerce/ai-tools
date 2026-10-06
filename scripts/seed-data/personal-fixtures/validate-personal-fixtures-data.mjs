#!/usr/bin/env node
/**
 * scripts/seed-data/personal-fixtures/validate-personal-fixtures-data.mjs
 *
 * STATIC drift guard for the personal-fixtures family (personal-fixtures-specs.mjs). No network, no
 * env — safe in CI. A VACUITY guard first: it FAILS when the address fixture stops making CHK-110 /
 * CHK-114 decidable (a needle that matches all/none of the seeded rows or matches through the wrong
 * column; tied recipient names; a seed order already sorted), then the ordinary hygiene.
 *
 * Checks (exit 1 on any ✗):
 *   [1] validateSpec — rows resolve in us-addresses.csv, needles (read from @td(ADDRESS_SEARCH)) and
 *       sort order discriminate, list names prefixed, products distinct, persona aliases resolve with
 *       {{VAR}} passwords, the zero-address persona is not an account this family writes to.
 *   [2] owned aliases registered in aliases.json with NO runtime GUID in the committed base.
 *   [3] SEEDED state (aliases.<env>.json overlays): a recorded live count below the contract fails —
 *       address book < min, a list short of its items, or the zero-address persona holding addresses.
 *
 * Usage: npm run td:validate:personal-fixtures
 */
import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  ADDRESS_BOOK, ADDRESS_SOURCE_CSV, LISTS, ZERO_ADDRESS_PERSONA, OWNED_ALIASES, validateSpec, findGuidLeaks,
} from './personal-fixtures-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));

console.log('\n[1] personal-fixtures-specs.mjs — decidability + self-consistency');
const errs = validateSpec({ addressRows: readCsv(ADDRESS_SOURCE_CSV), aliases, loadRows: (f) => readCsv(`test-data/${f}.csv`) });
if (errs.length) errs.forEach(fail);
else ok(`${ADDRESS_BOOK.rowIds.length} addresses discriminate ${Object.keys(ADDRESS_BOOK.needles).join(' + ')} and every recipient-name sort; ${LISTS.length} lists; personas resolve`);

console.log('\n[2] aliases.json — owned aliases registered, no runtime GUID in the base');
for (const name of OWNED_ALIASES) {
  const a = aliases[name];
  if (!a) { fail(`alias ${name} missing from aliases.json`); continue; }
  const leaks = findGuidLeaks(JSON.stringify(a));
  if (leaks.length) { fail(`alias ${name} pins a runtime GUID (${leaks[0]}) — it belongs in aliases.<env>.json`); continue; }
  ok(`${name}`);
}
for (const l of LISTS) if (aliases[l.alias] && aliases[l.alias].name !== l.listName) fail(`${l.alias}.name "${aliases[l.alias].name}" ≠ spec "${l.listName}" — the seeder finds the list BY NAME`);
const book = aliases[ADDRESS_BOOK.alias];
if (book && book.row_ids !== ADDRESS_BOOK.rowIds.join(';')) fail(`${ADDRESS_BOOK.alias}.row_ids "${book.row_ids}" ≠ spec "${ADDRESS_BOOK.rowIds.join(';')}"`);
const zero = aliases[ZERO_ADDRESS_PERSONA.alias];
if (zero && (zero.file !== ZERO_ADDRESS_PERSONA.csvFile || zero.filter?.user_id !== ZERO_ADDRESS_PERSONA.rowId)) fail(`${ZERO_ADDRESS_PERSONA.alias} must point at ${ZERO_ADDRESS_PERSONA.csvFile} ${ZERO_ADDRESS_PERSONA.rowId}`);

console.log('\n[3] seeded state — last recorded live read-back per env overlay');
const overlays = readdirSync(join(ROOT, 'test-data')).filter((f) => /^aliases\.[\w-]+\.json$/.test(f));
let seen = 0;
for (const f of overlays) {
  let o; try { o = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8')); } catch { continue; }
  const env = f.slice(8, -5);
  const b = o[ADDRESS_BOOK.alias];
  if (b && b.live_count !== undefined && b.live_count !== '') {
    seen++;
    if (Number(b.live_count) < ADDRESS_BOOK.minSeeded) fail(`${env}: ${ADDRESS_BOOK.alias}.live_count=${b.live_count} < ${ADDRESS_BOOK.minSeeded} (torn down? re-run seed:personal-fixtures)`);
    else ok(`${env}: ${ADDRESS_BOOK.alias} live_count=${b.live_count}`);
    if (b.live_order_sort_discriminating === false) fail(`${env}: the last read-back found the storefront's default address order already sorted/tied — CHK-114 would pass vacuously`);
  }
  for (const l of LISTS) {
    const e = o[l.alias];
    if (!e || !e.id) continue;
    seen++;
    if (Number(e.items_count) < l.minItems) fail(`${env}: ${l.alias} has ${e.items_count} item(s) < ${l.minItems}`);
    else ok(`${env}: ${l.alias} id set, ${e.items_count} item(s)`);
  }
  const z = o[ZERO_ADDRESS_PERSONA.alias];
  if (z && z.live_address_count !== undefined) {
    seen++;
    if (Number(z.live_address_count) !== 0) fail(`${env}: ${ZERO_ADDRESS_PERSONA.alias} recorded ${z.live_address_count} address(es) — CHK-095 needs 0`);
    else ok(`${env}: ${ZERO_ADDRESS_PERSONA.alias} has 0 addresses`);
  }
}
if (!seen) console.log('  · no env overlay records a personal-fixtures read-back yet (run seed:personal-fixtures)');

console.log(`\n=== personal-fixtures validation: ${problems.length} problem(s) ===`);
process.exit(problems.length ? 1 : 0);
