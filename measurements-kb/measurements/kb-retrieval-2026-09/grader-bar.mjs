#!/usr/bin/env node
/**
 * The bar for the retrieval change, written by somebody else.
 *
 *   node measurements/kb-retrieval-2026-09/grader-bar.mjs
 *   node measurements/kb-retrieval-2026-09/grader-bar.mjs --base <path>
 *
 * THE BAR THIS REPLACES, AND WHY. The plan agreed after run 05 said: "the ten rows BOTH graders
 * marked PARTLY rise, and nothing else falls." That bar cannot be evaluated without a third blind
 * grade, and a fourth after the next change -- so in practice it would have been evaluated by me,
 * reading the new lists and deciding they looked better. That is exactly the self-grading the
 * blind re-grade existed to remove.
 *
 * What the graders left behind is narrower and mechanical. In their prose they named ENTRIES, by
 * name, in two directions:
 *
 *   offTopic  an entry that was served and should not have been -- "unrelated", "off-topic",
 *             "the wrong surface". A slot spent on it is a slot the reader had to discard.
 *   missing   an entry that answers the question and was not served, which the corpus HOLDS. The
 *             grader did not know it existed; it named the content ("OrderDiscountType's fields --
 *             the thing asked for -- are never shown") and the id is the corpus's answer to that.
 *
 * Both passes are quoted for every row below, and only entries BOTH passes support are listed. Two
 * graders naming the same entry unprompted is the strongest evidence available here that the
 * judgement is about the material rather than about the reader.
 *
 * WHAT THIS CANNOT SAY. A row with no `missing` is a row the corpus cannot answer at all -- r01.1
 * (nothing describes the Admin SPA promotion flow), r03.1 (no entry names a single role), r03.2
 * (nothing says what decides order scope). Retrieval cannot raise an entry that does not exist, and
 * counting those rows as failures of a ranking change would mean tuning against an unreachable
 * target. They are listed with `contentGap` and excluded from the score, visibly.
 */
import { fileURLToPath } from 'node:url';
import { deliver } from '../../src/deliver.mjs';
import { QUESTIONS } from './questions.mjs';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : (process.env.KB_BASE ?? 'C:/_VIRTO/vc-knowledge');

// Keyed by the replay's row ids. `quotes` are verbatim from verdicts-pass1.json and verdicts.json.
export const BAR = [
  {
    row: 'r1.1',
    contentGap: 'nothing in the corpus describes the Admin SPA promotion flow or the reward expression tree',
    offTopic: [{ id: 'KB-B321AACD', subject: 'gql-mutations-createorderfromcart' }],
    missing: [],
    quotes: [
      'pass1: the createOrderFromCart entry is off-topic',
      'pass2: the second entry (createOrderFromCart) is unrelated',
    ],
  },
  {
    row: 'r1.2',
    offTopic: [{ id: 'KB-48999910', subject: 'gql-mutations-initializecartpayment', note: 'no longer in the corpus under this id' }],
    missing: [
      { id: 'KB-D61E2FFA', subject: 'gql-type-carttype' },
      { id: 'KB-C495274F', subject: 'gql-type-discounttype' },
    ],
    quotes: [
      'pass1: no served entry names a discount field (CartType.discounts, discountTotal, LineItemType.discounts); initializeCartPayment is off-topic',
      'pass2: DiscountType is never expanded and nothing says a promotion reward lands at cart level rather than on line items',
    ],
  },
  {
    row: 'r2.2',
    offTopic: [{ id: 'KB-4A446E42', subject: 'gql-type-customerorderconnection' }],
    missing: [{ id: 'KB-3BD60965', subject: 'gql-type-orderdiscounttype' }],
    quotes: [
      "pass1: the Discount type's own fields are not served; CustomerOrderConnection is off-topic",
      'pass2: OrderDiscountType\u2019s fields - the thing asked for - are never shown; the second entry (CustomerOrderConnection) is unrelated',
    ],
  },
  {
    row: 'r2.5',
    // Both passes call the served pair order-side for a question about the cart, and both name the
    // cart types the asker was left to go and check.
    offTopic: [{ id: 'KB-D1F02657', subject: 'gql-type-customerordertype' }],
    missing: [
      { id: 'KB-D61E2FFA', subject: 'gql-type-carttype' },
      { id: 'KB-C495274F', subject: 'gql-type-discounttype' },
    ],
    quotes: [
      'pass1: the served CustomerOrderType and OrderLineItemType are order-side ... still has to check LineItemType, CartType and DiscountType',
      'pass2: order objects, not the cart the question named ... the asker still has to go and check CartType and DiscountType',
    ],
  },
  {
    row: 'r2.8',
    offTopic: [{ id: 'KB-C9337EB7', subject: 'gql-type-cartconnection' }],
    missing: [{ id: 'KB-D4A064A5', subject: 'promotion discount rounding on the cart' }],
    quotes: [
      'pass1: KB-996BDF08 answers where the reward lands ... but says nothing about rounding; CartConnection is off-topic',
      'pass2: the rounding entry KB-D4A064A5 existed in the same corpus and CartConnection was served instead',
    ],
  },
  {
    row: 'r2.9',
    offTopic: [],
    missing: [{ id: 'KB-D4A064A5', subject: 'promotion discount rounding on the cart' }],
    quotes: [
      'pass1: no served entry states how many decimal places either carries',
      'pass2: a GraphQL type name carries no scale, so nothing in either entry states a number of decimal places',
    ],
  },
  {
    row: 'r3.1',
    contentGap: 'no entry in the corpus names a single storefront role or what it permits',
    offTopic: [{ id: 'KB-58272EB5', subject: 'gql-type-inventoryinfo' }],
    missing: [],
    quotes: [
      'pass1: no role name and nothing about what any role allows is served; InventoryInfo is unrelated',
      'pass2: the second entry (InventoryInfo) is entirely unrelated',
    ],
  },
  {
    row: 'r3.2',
    contentGap: 'nothing in the corpus says what decides order scope -- role, permission, or default organization',
    offTopic: [{ id: 'KB-746B7535', subject: 'rest-api-order-customerorders' }],
    missing: [],
    quotes: [
      'pass1: nothing served explains what decides the scope (role, permission, default organization); the REST orders table is off-topic',
      'pass2: the other entry is the Admin REST order API, the wrong surface',
    ],
  },
  {
    row: 'r3.3',
    offTopic: [],
    missing: [
      { id: 'KB-9F032D18', subject: 'gql-mutations-inviteuser' },
      { id: 'KB-F51DA09D', subject: 'gql-mutations-changeorganizationcontactrole' },
    ],
    quotes: [
      'pass1: inviteUser and changeOrganizationContactRole are not [served], although the latter exists in the packet',
      'pass2: invite and change-role are not, though the change-role entries were served to r03.4 in the same run',
    ],
  },
  {
    row: 'r3.4',
    offTopic: [],
    missing: [{ id: 'KB-B34B9C8A', subject: 'gql-type-roletype' }],
    quotes: [
      'pass1: the role object as read on a contact (RoleType under securityAccounts.roles) and its possible values are not served',
      'pass2: neither the object nor any value set is served',
    ],
  },
];

export function measure(atBase = base) {
  const byRow = new Map(QUESTIONS.map((q) => [q.row, q]));
  return BAR.map((b) => {
    const q = byRow.get(b.row);
    const served = (deliver(atBase, q.q, { limit: q.limit }).citations ?? []).map((c) => c.id);
    return {
      ...b,
      limit: q.limit,
      served,
      junkServed: b.offTopic.filter((o) => served.includes(o.id)),
      missingServed: b.missing.filter((m) => served.includes(m.id)),
    };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = measure();
  let junk = 0;
  let junkTotal = 0;
  let found = 0;
  let foundTotal = 0;
  console.log(`grader bar against ${base}`);
  console.log('');
  for (const r of rows) {
    const reachable = r.missing.length > 0;
    junkTotal += r.offTopic.length;
    junk += r.junkServed.length;
    if (reachable) {
      foundTotal += r.missing.length;
      found += r.missingServed.length;
    }
    const gap = r.contentGap ? `  CONTENT GAP: ${r.contentGap}` : '';
    console.log(`  ${r.row.padEnd(6)} served ${r.served.join(', ') || '(MISS)'}`);
    if (r.offTopic.length) {
      console.log(`         off-topic named by both graders: ${r.offTopic.map((o) => `${o.id} ${o.subject}${r.junkServed.includes(o) ? '  <-- STILL SERVED' : ''}`).join('; ')}`);
    }
    if (r.missing.length) {
      for (const m of r.missing) {
        console.log(`         wanted: ${m.id} ${m.subject}  ${r.missingServed.includes(m) ? 'SERVED' : 'not served'}`);
      }
    }
    if (gap) console.log(`        ${gap}`);
    console.log('');
  }
  console.log(`off-topic entries both graders named, still served: ${junk} of ${junkTotal}`);
  console.log(`entries the corpus holds and the graders wanted:    ${found} of ${foundTotal} served`);
  console.log('');
  console.log('Rows with no wanted entry are content gaps, excluded from the second number: retrieval');
  console.log('cannot raise an entry the corpus does not contain.');
}
