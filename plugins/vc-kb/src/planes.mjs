// Where each plane lives on disk, named once.
//
// These paths were twenty string literals across six modules and five test files, which is exactly
// the shape that loses one on a rename — and a lost one does not fail loudly: the extractor keeps
// writing to the old path, the gate keeps comparing the old path, and the corpus quietly grows a
// second copy of itself.
//
// The layout says which plane a file belongs to, because nothing else did. `entries/` and
// `derived/` used to be the same plane under two names while `captured/` was the other one, so a
// reader opening the base could not tell from the tree which half was regenerated and which was
// written by hand — the single most important thing to know about any file in it.
//
//   derived/            the projected plane. Regenerated wholesale, byte-compared, never edited.
//     entries/          one .md per capability surface
//     rest/ graphql/    the contract tables those entries cite
//     pin.json …        what the projection was taken from
//   captured/           the written plane. One .md per fact an agent recorded.
//
// The experiential plane stays flat: it holds entries and nothing else, so a nested `entries/`
// there would be a directory with no siblings, added only to make two trees look alike.

export const DERIVED_DIR = 'derived';
export const DERIVED_ENTRIES = 'derived/entries';
export const DERIVED_INDEX = 'derived-index.json';
export const DERIVED_CATALOG = 'derived-catalog.md';

export const CAPTURED_DIR = 'captured';
export const CAPTURED_INDEX = 'captured-index.json';
export const CAPTURED_CATALOG = 'captured-catalog.md';

//   flows/              the procedural plane. One .md per goal somebody can reach.
//
// WHY A THIRD PLANE AND NOT A FIELD ON THE SECOND. Measured on 2026-09-14, and it cost an hour
// rather than the week the design would have cost. One flow entry -- a route sequence for placing
// an order -- was written into the experiential plane as an ordinary capture. It cleared the
// relevance floor on 18 of 34 replay rows, took rank 1 on "which endpoint lists the payment methods
// a store has enabled" and on a question about how the storefront xAPI scopes an order query, and
// had to be retired the same day.
//
// It is NOT a size effect, which was assumed and then checked: at 142 distinct terms it has fewer
// than two of the facts that disturb 6 rows each. A long fact accumulates SPECIFIC terms --
// OrderConfigurationItemType, sectionId. A procedure accumulates the generic nouns of a journey --
// cart, order, payment, product, search, Admin -- so it is a plausible answer to most questions
// asked in ordinary words. `dedupeTokens` removes the bias from REPEATED terms and is structurally
// inapplicable to a document whose problem is DISTINCT ones.
//
// A separate directory alone would not have fixed it: derived and captured already have separate
// indexes and still compete, because `ask` merges both by raw score. What removes the competition
// is a separate QUESTION -- `kb how` searches this plane and nothing else, and `kb ask` searches
// the other two and never this one. The plane exists so that the question can.
// OPEN, FOUND BY RUN 08 ON THE PLANE'S FIRST DAY: there is no way to AMEND a flow. Run 08 walked
// KB-AFB2D3C5, confirmed it, and reported two gaps in its steps -- no shipping-address selection,
// and only one of the store's two delivery options named. It could not record either:
//
//   dispute   is for a claim contradicted by an observation. An omission contradicts nothing, and
//             the run was right not to reach for it.
//   supersede mints the id from the subject, and a flow's subject IS its goal -- which by
//             definition does not change when a STEP is fixed. Tested: it refuses with
//             "id ... is already held by a DIFFERENT fact. Change the subject."
//
// So the choices were to lose the improvement or to fragment one procedure into two goals, and the
// run chose to lose it: one gap survived as an ordinary captured fact (KB-6AA0D7FB, the two
// delivery options), the other exists only in a run report nobody will read again.
//
// This is the `reanchor` argument one level along. An anchor is an address rather than a claim, so
// correcting it must not destroy the id; a flow's STEPS are not its identity either, its goal is,
// so amending them must not destroy the id.
//
// BUILT as `kb amend`, on 2026-09-14, after run 09 hit the same wall a second time -- it found that
// the step saying this storefront has no `/checkout` route is wrong about `/checkout/completed`,
// and confirmed the flow rather than lose the correction. Three gaps, two runs, one of them lost
// entirely; that is the measurement this base's rule asks for before a mechanism is built, and it
// arrived in a day rather than being assumed on the plane's first afternoon.
export const FLOWS_DIR = 'flows';
export const FLOWS_INDEX = 'flows-index.json';
export const FLOWS_CATALOG = 'flows-catalog.md';

// Which store a written entry lives in, keyed by its own `plane` field, so nothing has to be told
// twice. `plane` in this base has always named WHICH STORE AND WHICH GATE rather than where the
// knowledge came from -- the derived plane is defined by being regenerated and byte-compared, the
// experiential by being written through the door. A flow is written through the same door, stored
// separately, indexed separately, and identified by a different rule. That is a plane by this
// base's own definition, and it is not the `kind` field that was measured out: `kind` proposed to
// label facts that sit in one store, and this decides which store a thing is in.
export const WRITTEN_STORES = {
  experiential: { dir: CAPTURED_DIR, index: CAPTURED_INDEX, catalog: CAPTURED_CATALOG },
  flow: { dir: FLOWS_DIR, index: FLOWS_INDEX, catalog: FLOWS_CATALOG },
};

// Everything the extractor writes, and therefore everything it is responsible for removing. The
// captured plane is deliberately absent: it is written by agents rather than regenerated, so a
// byte-compare against a regeneration would be meaningless and `kb extract` must never wipe it.
export const OWNED_ROOTS = [DERIVED_DIR];
export const OWNED_FILES = [DERIVED_CATALOG, DERIVED_INDEX];
