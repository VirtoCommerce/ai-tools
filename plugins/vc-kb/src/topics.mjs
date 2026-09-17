// SECTIONS FOR THE CATALOG — so that a list stays readable as it grows.
//
// The redesign hands the written catalog to an agent whole instead of making it search. That works
// at 78 entries and stops working somewhere above it, and the thing that fails is the READING, not
// the context window: there is room for a thousand rows in a tenth of a 200k window, but a list of
// five hundred one-line claims gets skimmed, and a skimmed list is retrieval again — performed by
// the reader, over rows that until today were sorted by an id, which is a hash.
//
// A menu of 120 dishes is unreadable on any size of paper and perfectly readable in eight sections.
// Sections do not make the list shorter; they make the part you must read short. That is why this
// exists, and it is why the catalog budget's row threshold matters less than it looks.
//
// A TOPIC IS NOT AN ADDRESS. `measurements/kb-arrival-2026-09/addressing.mjs`, over 3,621 archived
// tool calls: arrival keyed on a topic fires on 33.2% of calls and surfaces 18 distinct entries;
// keyed on the exact coordinate it fires on 6.7% and surfaces 33. **Topics lose on both axes** — five
// times the interruptions for half the reach. A mechanism that fires on one call in three is
// wallpaper and gets tuned out inside a run. Topics organise the list a reader CHOOSES from;
// coordinates decide what is pushed at somebody who did not ask. Do not wire this into `arrive.mjs`.
//
// These figures replace ones quoted here and in a letter to the reviewer before any script produced
// them: "1.8%", "33.7%", "3,392", "292 to 37". They came from throwaway one-liners with different
// definitions of an event and were wrong. The reviewer asked where the script was; there wasn't one.
//
// DERIVED, NOT DECLARED, and the trade is deliberate. A `topic:` field on each entry would be
// auditable but needs a schema change and 78 edits before a run we want to hold. Deriving keeps the
// rule in one committed, tested place and re-derives for free when an entry is written — and the
// assignment is PRINTED IN THE CATALOG, so a wrong one is visible in the artefact itself rather than
// hidden in a lookup table. If this survives the run, it should become a field.

// Order is priority: the first match wins the section an entry is filed under. Measured on the
// 2026-09-16 corpus, 27 of 78 entries match more than one — topics are TAGS, not folders — so the
// row also shows the others rather than pretending the fact belongs to one place.
//
// The order runs narrow to broad. `promotions` before `orders` because a discount fact reads as an
// order fact by vocabulary and almost never the reverse; `lists & sharing` before everything because
// its nouns are borrowed from carts and members.
export const TOPICS = [
  ['lists & sharing', /wishlist|shared.?list|sharing/i],
  ['promotions & discounts', /promotion|discount|coupon|marketing|reward/i],
  ['members & accounts', /member|account|contact|sign.?in|log.?in|\buser\b|\brole\b|organi[sz]|invit|lock(ed|out)?\b|password|security/i],
  ['catalog & products', /product|catalog|variation|configur/i],
  ['stores & tax', /\bstore\b|\btax\b/i],
  ['cart & checkout', /\bcart\b|checkout/i],
  ['orders & shipments', /order|shipment|line.?item|payment|fulfil/i],
];

export const UNFILED = 'unfiled';

/** Every topic a text lands in, in priority order. */
export function topicsOf(text) {
  const s = String(text ?? '');
  return TOPICS.filter(([, re]) => re.test(s)).map(([name]) => name);
}

/**
 * The section an entry is filed under, plus the other topics it touches.
 *
 * WHAT THE ENTRY CLAIMS TO BE ABOUT OUTRANKS WHERE IT POINTS, and the anchors are only consulted
 * when the claim places it nowhere. Filing on both at once put `KB-358A70CB` — "storefront order
 * page projection of the shipment", an order fact by any reading — under *members & accounts*,
 * because its anchor is `/account/orders/{id}` and a URL segment spelled `account` is not a claim
 * about accounts. Caught by reading the generated catalog, which is why the filing is printed there.
 *
 * The fallback still matters: "the amount a payment is for is not the payment's total" never says
 * "order" and its anchors do.
 */
export function fileUnder(entry) {
  const claim = `${entry.subject ?? ''} ${entry.question ?? ''} ${entry.goal ?? ''}`;
  const fromClaim = topicsOf(claim);
  if (fromClaim.length) return { section: fromClaim[0], also: fromClaim.slice(1) };

  const anchors = (entry.anchors ?? []).map((a) => a.coordinate ?? a).join(' ');
  const fromAnchors = topicsOf(anchors);
  return { section: fromAnchors[0] ?? UNFILED, also: fromAnchors.slice(1) };
}

/**
 * Entries grouped into sections, biggest section first, and within a section the best-attested
 * first.
 *
 * ORDER INSIDE A SECTION IS LOAD-BEARING and was a hash until today. A reader who stops early should
 * stop on the entries most parties have seen, so the sort is by independent confirmations, then by
 * whether anybody disputes it — a contested fact is worth reading before a calm one — and only then
 * by id, for stability.
 */
export function sectioned(entries, { confirmations, disputed }) {
  const groups = new Map();
  for (const e of entries) {
    const { section, also } = fileUnder(e.data ?? e);
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push({ entry: e, also });
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => {
      const ea = a.entry.data ?? a.entry; const eb = b.entry.data ?? b.entry;
      return (disputed(eb) ? 1 : 0) - (disputed(ea) ? 1 : 0)
        || confirmations(eb) - confirmations(ea)
        || String(ea.id).localeCompare(String(eb.id));
    });
  }
  // Biggest first, but `unfiled` always last: it is a list of entries the rule could not place, and
  // a reader should meet it as an admission rather than as a section.
  return [...groups.entries()]
    .sort((a, b) => (a[0] === UNFILED ? 1 : b[0] === UNFILED ? -1 : 0) || b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
