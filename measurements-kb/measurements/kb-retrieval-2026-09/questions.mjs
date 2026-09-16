// The 23 questions three live runs actually asked, in the order asked -- the only held-out set
// this base has. Lifted into its own module when a second consumer appeared: the replay says
// whether a served list changed, the diagnostic says why, and a list that exists twice is a list
// that will disagree with itself the first time a row is corrected.
//
// `held` is each run's judgement at the point of use, not a grade added afterwards. `want` is an
// entry id read out of that row's own answer column -- what the agent wrote down once it knew.
// `limit` is the limit that run passed: run 01 used --limit 2, runs 02 and 03 took the default 3,
// and replaying everything at one limit would compare against a list no agent ever saw.
//
//   run 01  MEASUREMENT-archive/run-01-promotions/questions-5534eddb.csv     promotions, API only
//   run 02  MEASUREMENT-archive/run-02-order-discount/questions-82e15c99.csv discount through checkout
//   run 03  MEASUREMENT-archive/run-03-org-roles/questions-95777cf8.csv      organization role gating

export const QUESTIONS = [
  { row: 'r1.1', limit: 2, held: 'HELD', q: 'how do I create a percentage-discount promotion in the Virto Commerce Admin SPA?' },
  { row: 'r1.2', limit: 2, held: 'HELD', want: 'KB-D61E2FFA', q: 'how does the storefront cart show an applied promotion discount in GraphQL?' },
  { row: 'r1.3', limit: 2, held: 'HELD', q: 'which GraphQL mutation adds a product to the shopping cart, and what input does it need?' },
  { row: 'r1.4', limit: 2, held: 'NOT-USED', q: 'which GraphQL mutation adds a product to the shopping cart, and what input does it need?' },
  { row: 'r1.5', limit: 2, held: 'HELD', q: 'Mutations.addItem InputAddItemType' },
  { row: 'r1.6', limit: 2, held: 'HELD', q: 'which mutation changes the quantity of a line item already in the cart?' },
  { row: 'r1.7', limit: 2, held: 'HELD', q: 'InputChangeCartItemQuantityType fields' },
  { row: 'r1.8', limit: 2, held: 'UNANSWERED', q: 'what fields does CartTotalType have?' },
  { row: 'r1.9', limit: 2, held: 'UNANSWERED', q: 'what fields does CartTotalType have?' },

  { row: 'r2.1', limit: 3, held: 'UNANSWERED', q: 'how does a percentage discount appear on a CustomerOrder in Virto Commerce' },
  { row: 'r2.2', limit: 3, held: 'HELD', q: 'what fields does the Discount type carry on a CustomerOrder and its line items' },
  { row: 'r2.3', limit: 3, held: 'HELD', q: 'OrderDiscountType fields' },
  { row: 'r2.4', limit: 3, held: 'NOT-USED', q: 'how do I create a percentage discount promotion in the marketing module' },
  // SETTLED BY RUN 09, AND NOT RE-ANCHORED, because the evidence settles the QUESTION and not the
  // id. Run 09 was sent at this exact subject and answered it in 244 calls without one mention of
  // KB-12CEF821 or the string `orderlineitemtype` -- the contract table this row was anchored on.
  // Its own question row for "does the shopping cart record the discount percentage rate" reads
  // HELD, backed_by KB-EXPERIENTIAL. So the displacement that made this row LOST for two runs cost
  // nothing: the entries that took the slots answered it.
  //
  // WHICH of the three it read is not recoverable. The run left `found_via` empty on four of its
  // six rows -- the one column that would have named the entry -- so picking one by reading the
  // answer text would be the guess this row exists to expose. The override is therefore REMOVED
  // rather than moved, and the row falls back to the baseline like every other.
  //
  // That is the fourth row on which "rank 1 is what was acted on" has been wrong, after r3.2, r2.10
  // and this row itself -- and the first settled by a run sent to settle it rather than by reading.
  { row: 'r2.5', limit: 3, held: 'HELD', q: 'does a cart line item or the cart total keep the discount percentage anywhere, or only the money amount' },
  { row: 'r2.6', limit: 3, held: 'HELD', q: 'OrderLineItemType discount fields' },
  { row: 'r2.7', limit: 3, held: 'HELD', q: 'DiscountType fields on the cart' },
  { row: 'r2.8', limit: 3, held: 'HELD', q: 'where does a cart-level promotion reward land on the cart and how is it rounded' },
  { row: 'r2.9', limit: 3, held: 'HELD', want: 'KB-D4A064A5', q: 'how many decimal places does a promotion discount amount have on the cart' },
  { row: 'r2.10', limit: 3, held: 'NOT-USED', anchor: 'KB-35A09C64', by: 'the author of the floor change, 2026-09-12', because: "this row is NOT-USED: the run asked and did nothing with the answer, so rank 1 records nothing anybody acted on. What the raised floor removed from it was three entries whose whole evidence was the word 'cart', leaving the one entry that matches every content term of the question", q: 'when are promotions re-evaluated on a cart' },

  { row: 'r3.1', limit: 3, held: 'HELD', q: 'What roles can a member of an organization have in the B2B storefront, and what does each one allow?' },
  { row: 'r3.2', limit: 3, held: 'HELD', want: 'KB-6FE58084', anchor: 'KB-6FE58084', by: 'both blind graders, independently', because: "rank 1 was rest-api-order-customerorders, which pass 1 called 'off-topic' and pass 2 'the Admin REST order API, the wrong surface'. Neither grader could see the other's answer or mine. The entry run 03 actually cited by id is KB-6FE58084", q: 'How does the storefront xAPI decide whether an order query returns only my orders or the whole organization\u2019s orders?' },
  { row: 'r3.3', limit: 3, held: 'HELD', q: 'Which GraphQL mutations let a storefront user invite, lock, unlock a member or change an organization contact\u2019s role?' },
  { row: 'r3.4', limit: 3, held: 'HELD', q: 'What is the role object on an organization contact in the storefront API, and what values can it take?' },

  // Run 06, wishlists — the first rows from a run that never saw the configuration these settings
  // were tuned on. That is the whole reason they are here: the 23 above are runs 01-03, the floor
  // was chosen against them, and a setting checked only on its own training set is not checked.
  //
  //   MEASUREMENT-archive/run-06-shared-lists/questions-6341e00a.csv
  { row: 'r6.1', limit: 3, held: 'NOT-USED', q: 'How does a storefront user create a wishlist scoped to the organization, and what does the scope field accept?' },
  { row: 'r6.2', limit: 3, held: 'HELD', q: 'What fields does InputCreateWishlistType have?' },
  { row: 'r6.3', limit: 3, held: 'HELD', q: 'What arguments does Query.wishlists take and what does its scope argument do?' },
  { row: 'r6.4', limit: 3, held: 'HELD', q: 'Does Query.sharedWishlist require the caller to be signed in, and what can the holder of a sharingKey do with the list?' },
  { row: 'r6.5', limit: 3, held: 'HELD', want: 'KB-27B4CD10', q: 'Does the Active column on the storefront company members page reflect the security account lock state?' },

  // Run 07, an order carrying three kinds of product. Six questions, and the second set from a run
  // that never saw the configuration these settings were tuned on.
  //
  // r7.6 is the one that matters. `OrderConfigurationItemType` was in the derived plane the whole
  // time and the run had to open the file by hand; both slots went to entries it had written itself
  // an hour earlier. That is r1.2 and r6.1 a third time -- short experiential entries crowding out
  // the derived entry that names the exact type asked about -- and the first of the three to carry
  // a `want`, because the corpus demonstrably holds the answer.
  //
  //   MEASUREMENT-archive/run-07-order-fields/questions-6d4f2631.csv
  { row: 'r7.1', limit: 3, held: 'HELD', q: 'how does a configurable product become a line item in the cart' },
  { row: 'r7.2', limit: 3, held: 'HELD', q: 'which REST route searches catalog products by product type' },
  { row: 'r7.3', limit: 3, held: 'HELD', q: 'which money fields does an order line item carry with and without tax' },
  { row: 'r7.4', limit: 3, held: 'NOT-USED', q: 'does the admin order screen show the same totals the storefront charged' },
  { row: 'r7.5', limit: 3, held: 'NOT-USED', q: 'how does a percentage reward land on the money fields of a customer order' },
  { row: 'r7.6', limit: 3, held: 'HELD', want: 'KB-4869F834', q: 'what shape does a chosen configuration take on an order line item' },
];
