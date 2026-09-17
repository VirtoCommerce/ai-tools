// THE NORMATIVE PLANE'S IDENTITY: a rule is its ID.
//
// Everything else in this base is identified by something the writer could get wrong twice. A fact
// is (coordinates, scope) and two writers spell a coordinate four ways, which is why
// `normalizeAnchor` exists. A flow is (goal, scope) and two writers phrase one goal differently,
// which the flow plane accepts as its known cost. A rule has neither problem and needs no
// normalizing: `BL-CART-003` is a name somebody already assigned, it is already unique in the
// corpus it comes from, and 23 places in the consuming plugin's prompts plus a column in every
// regression suite cite it by that exact string.
//
// SO THE ID TRAVELS IN THE SUBJECT AND NOTHING IS RENAMED. `subject: "BL-CART-003 coupon + sale
// interaction"` keeps the base's one namespace rule -- every entry's own id is still `KB-<hex>`,
// minted from the subject and checked by the gate -- while leaving every existing citation
// resolvable through `kb show BL-CART-003`. The alternative, a second id namespace in `kb.json`,
// would mean the validator can no longer say what a well-formed id is, and the alternative to THAT,
// a migration table mapping 216 old ids to new ones, would mean every consumer is edited on the day
// of the import and a stale citation resolves to nothing.
//
// A RULE WITHOUT AN ID IS REFUSED at the door. That is not bureaucracy: identity here IS the id, so
// a rule that does not carry one cannot be told apart from the next rule about the same subject,
// and the import of 216 of them would silently collapse pairs.

// Two to five leading capitals, a hyphen, then segments of capitals, digits, hyphens and dots:
// `BL-CART-003`, `VC-PROMO-001`, `ECL-13.3`, `BL-A11Y-002`. Anchored at the start and required to
// end on a word boundary, so `BL-CART-003` matches and `BLOCKED-account` does not.
export const RULE_ID = /^([A-Z][A-Z0-9]{1,4}-[A-Z0-9]+(?:[-.][A-Z0-9]+)*)(?=\s|$)/;

/** The rule id a subject leads with, or null when it carries none. */
export const ruleIdOf = (subject) => (String(subject ?? '').trim().match(RULE_ID) ?? [])[1] ?? null;

/**
 * The domain a rule id belongs to: the id minus its final numeric segment.
 *
 * `BL-CART-003` -> `BL-CART`, `ECL-13.3` -> `ECL-13`, `VC-PROMO-001` -> `VC-PROMO`.
 *
 * This is the section key for the rules catalog, and it is deliberately read off the id rather than
 * derived from the text the way `topics.mjs` derives a captured entry's section. The author of a
 * rule already filed it; a regex over its prose would be this base guessing at a filing that is
 * stated, and guessing wrong is how `KB-358A70CB` -- an order fact -- ended up under
 * "members & accounts" because its anchor contained the word `account`.
 */
export function ruleDomainOf(ruleId) {
  if (!ruleId) return null;
  const m = String(ruleId).match(/^(.*)[-.][0-9]+$/);
  return m ? m[1] : String(ruleId);
}

/** The severity tag a rule's body leads with, e.g. `P0-revenue`, or null. */
export const severityOf = (body) => (String(body ?? '').slice(0, 400).match(/\[(P[0-9]-[a-z]+)\]/) ?? [])[1] ?? null;

/**
 * Rules grouped by domain, domains alphabetical, rules by id inside one.
 *
 * Alphabetical and not biggest-first, which is the opposite of the captured catalog's order. The
 * captured catalog is a list somebody SCANS, so the biggest section earns the top; the rules
 * catalog is a list somebody LOOKS UP in, having already decided they are working on carts, so it
 * is ordered the way a reference is. `unfiled` cannot occur here -- a rule with no id is refused at
 * the door -- so there is no admission section to keep last.
 */
export function byDomain(entries) {
  const groups = new Map();
  for (const e of entries) {
    const data = e.data ?? e;
    const domain = ruleDomainOf(ruleIdOf(data.subject)) ?? '(no id)';
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(e);
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => String(ruleIdOf((a.data ?? a).subject)).localeCompare(String(ruleIdOf((b.data ?? b).subject)), 'en', { numeric: true }));
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
