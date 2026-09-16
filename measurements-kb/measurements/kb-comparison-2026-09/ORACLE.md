# The oracle

**Written and sealed before any arm starts.** An oracle written after the arms have run is an oracle
written to fit them.

Nothing here needs a judgment call. Every row is settled by arithmetic, by reading the order off the
deployment, or by looking for a citation in the arm's own report.

## First, a gate — pass or fail, not scored

An arm that did not do the task is not graded on how well it described not doing it.

| | |
|---|---|
| **G1** | an order exists on the account, placed during this arm's window, and the arm names its number |
| **G2** | it has **at least three distinct lines**, and **at least one line with quantity > 1** |
| **G3** | a promotion **this arm created** was active at placement and appears on the order |

A failed gate is recorded as **DID NOT COMPLETE**, with where the arm stopped and why. That is a
result — arm A may well land here — and it is reported, not scored.

## Then ten items, 0 / 0.5 / 1 each

Half a point exists only where an item asks for two things and the arm produced one.

| | check | settled by |
|---|---|---|
| **S1** | every stated line total equals quantity × stated unit price | arithmetic on the arm's own numbers |
| **S2** | every stated unit price equals what the platform serves this account | the order on the deployment |
| **S3** | the stated discount equals the promotion's rate applied to the eligible subtotal | arithmetic |
| **S4** | the stated shipping cost is correct **and** the arm says why | see "the expected values" |
| **S5** | the stated tax is correct **and** the arm names where it comes from | the order |
| **S6** | the payment method on the order is named correctly | the order |
| **S7** | the stated grand total equals the parts above **and** equals what the order holds | arithmetic + the order |
| **S8** | all three surfaces were actually read — storefront, Admin, REST — with evidence, not inferred from one | the arm's report |
| **S9** | any disagreement between surfaces is reported rather than smoothed over | the arm's report |
| **S10** | everything the arm could not settle is stated as an explicit unknown | the arm's report |

### The penalty, and it is the point of S10

**Each confidently-stated wrong value costs one further point**, beyond whatever the item itself
scored. A wrong answer delivered with no hedge is worse than a gap, because a gap gets checked and a
confident error gets used.

This is the same standard the base is held to — its own contract distinguishes an answer, an absence
of coverage, and an absence of the base, precisely so that a MISS is never dressed up as knowledge.
An arm cannot be graded more leniently than the thing being demonstrated.

## The expected values

**Shipping = 0.00**, and the reason is that `FixedRateShippingMethod` prices per OPTION through a
store setting, the settings (`…FixedRateShippingMethod.Ground.Rate` and `.Air.Rate`) have never been
configured, and an unset setting carries `value: null` with `defaultValue: 0`. The store still offers
every option as selectable, so the choice is recorded while the money is not.

An arm that reports 0.00 and says nothing scores **0.5**. One that reports 0.00 and names the reason
scores **1**. One that assumes shipping costs something and folds it into the total fails **S4 and
S7 together**, plus the penalty.

**This value is re-checked on the deployment immediately before the seal.** If somebody has
configured a rate since run 12 observed this on 2026-09-14, the expected value changes **before** the
seal, never after.

**Tax, the discount, the unit prices and the grand total have no pre-set expected value** — they are
whatever the deployment holds when the arm runs, and the oracle checks the arm's numbers against the
order itself. That is deliberate: the arm chooses its own products, so nothing here can be tuned in
advance to suit any arm.

## Recorded, never scored

These are the measurement, not the grade. They go on the demo page.

| | |
|---|---|
| tool calls | to the placed order, and total |
| wall clock | same two marks |
| deployment probes | how often the arm went and looked rather than knew |
| dead ends | actions taken and abandoned |
| **questions asked of the base** | arm C only — the exact wording, whether `ask` or `how`, hit or MISS |
| **entries served** | arm C only — id, **which run wrote it and on what date**, and whether the arm used it |
| citations | `@kb(<id>)` appearing in the arm's report — mechanical evidence of use, as opposed to the arm saying it used something |

**Why the exact wording is recorded.** One item in this task sits on a known retrieval gap:
`"why is the delivery option price zero"` returns `KB-6AA0D7FB` at rank 1, while `"what does
shipping cost on this deployment"` MISSES — same entry, same corpus. So for S4, arm C's score
partly measures how it asked. That is worth seeing rather than hiding, and it cannot be seen unless
the wording is written down.

## Grading

Graded from the arm's written report **plus** the order as it exists on the deployment — never from
the report alone, because the report is the thing being checked.

Blind grading is not claimed. The arithmetic and the deployment reads admit no opinion, and arm C's
report will cite `@kb(…)` in a way no blind could survive. Pretending otherwise would be theatre.
