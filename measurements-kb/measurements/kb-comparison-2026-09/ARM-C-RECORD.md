# Arm C — what actually happened

**Not a grade.** The repeat of arm B is still to run, and knowing a score changes how the next
report reads. Independent record only.

## The run

| | arm B | arm C |
|---|---|---|
| context | the QA repository | nothing but the base |
| **logged calls** | **149** | **194** |
| wall clock | 13 min | **20 min** |
| call budget | stated 150, and it rationed | none stated |
| `Bash` calls | 11 | **84** |
| `kb` invocations | — | 6 |
| order | CO260915-00001, subtotal 1612.97 | CO260915-00002, subtotal 263.75 |

**Arm C used MORE calls and more time, not fewer.** Prediction **P4** — arm C finishes in at least
25% fewer calls — is **falsified as stated**.

It is also not a clean comparison, and the reason cuts both ways: arm B was told "150 tool calls"
and rationed against it, finishing at 149; arm C was told nothing and worked until done. **That is
what the repeat of arm B, uncapped, exists to settle.** Until it runs, the only honest statement is
that the two numbers were produced under different rules.

What the tool mix says is not about speed at all. Arm B spent its budget on the UI — 42 clicks, 26
snapshots, 21 screenshots, 11 shell calls. Arm C spent 84 calls in the shell driving REST: diffing
the full promotions payload before and after its own change, reading the order's own
`shippingMethod.settings` inline, comparing tax configuration across stores. **Arm C was not faster.
It verified more.** Whether that is worth 45 calls is a judgement the oracle will make, not this
page.

## What it asked the base

Seven questions, **five hits and two MISSes**, recorded by the door itself rather than by the arm:

| | | |
|---|---|---|
| hit | `create a percentage-off promotion in the Marketing module and make it active` | flow |
| hit | `place an order on the B2B storefront: add products to cart and complete checkout` | flow |
| hit | `call the platform REST API for a customer order as an authenticated admin` | |
| hit | `why is the shipping cost zero on this store` | → used `KB-6AA0D7FB` |
| **MISS** | `how is tax calculated on orders in this deployment` | |
| hit | `what does the customer order REST API return for an order` | |
| **MISS** | `sign in to the Admin platform UI` | |
| hit | `which endpoints does this deployment serve under /api/tax` | |

**The two MISSes are the honest half of the result** and belong on the demo page beside the hits.
Tax is the gap this comparison already knew about. "Sign in to the Admin platform UI" missing is
new — the corpus has no procedure for the thing every arm has to do first.

**And the tax MISS did not stop it.** It asked the derived plane which endpoints exist under
`/api/tax`, got them, and went and read the store's tax providers itself — establishing that
`B2B-store`'s only provider is `FixedRate` and inactive, **and that other stores on the same
deployment do have tax** (Electronics 10%, TestStorePostman 15%), so the zero is store-specific
rather than platform-wide. That is a better answer than the base holds, produced by an arm the base
had just refused.

Two records disagree slightly: the door logged seven `ask` rows, the tool log six `kb` invocations.
One shell call carried more than the logger attributed to it. Noted rather than chased.

## Cleanup, read over REST rather than taken on trust

* `CO260915-00002` — **Cancelled**. Subtotal 263.75, discount 31.65, total 232.10.
* `SH260915-00002` — still `New`, the same platform behaviour arm B reported as F3 and runs 07–11
  left four times before.
* `AGENT-ARENA disposable 12pct off cart` — **disabled, not deleted**.
* Five earlier `KB-LAB` promotions untouched; **eight pre-existing active promotions unchanged**.
* Cart empty.

Arm C diffed the full promotions payload before and after its own change and reported thirteen
pre-existing promotions bit-identical. That is a stronger cleanup claim than arm B made, and it is
the kind of claim that is worth more than a sentence saying "cleaned up".

## Secrets

`browser_network_request` — **singular**, the tool deliberately kept out of the measured runs'
allow-list because it returned a sign-in POST body in plaintext during run 02 — was used **nine
times**. Every artifact arm C left was scanned.

**Nothing leaked.** Zero secret-shaped strings in the tool log. Four matches across the arena's
files were all false positives: three are the reward type name
`RewardItemForEveryNumOtherItemInGetOfRel`, 43 characters long, and one is a cache-busting hash in a
script URL (`app.js?v=…`). One redaction marker in the tool log shows the logger blanked something
by value, which is what it is for.

The allow-list omission was a measured-runs convention that the arena never inherited. It did no
harm here and it is luck rather than design; if the arena runs again, the tool should be denied
explicitly the way `browser_evaluate` now is.

## What it found that arm B did not

**The second promotion.** Before building a cart, arm C read the promotions API, opened `test promo`
— active since 2023, `B2B-store`, no coupon, non-exclusive, **$50 off at subtotal ≥ $500** — and
sized its cart to $263.75 to stay under the threshold, so its own discount would be cleanly
attributable. Arm B's cart was $1,612.97 and carried no $50. Full account in
`FINDING-second-promotion.md`.

**It stated the unknown it created.** *"Whether my promotion would have stacked with test promo …
I never observed the two together and don't claim either way."* That is the S10 standard met
without being reminded of it.

## What it found that arm B also found

`discounts[0].discountAmountWithTax` is 0 while `discountAmount` is 31.65. **Both arms met this
independently**, on different orders, hours apart. Arm B called it a candidate defect it could not
settle; `KB-A646D086` answered it five days before either ran. See `ARM-C-ABORTED.md` — that
entry was served to arm C in its aborted first attempt.

## Residue

The arena holds arm C's scratch JSON and 100-odd browser artifacts. They are evidence until the
comparison is written up, then they go.
