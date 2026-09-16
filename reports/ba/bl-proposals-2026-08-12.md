# Business Logic Proposals — BA-2026-08-12

> **These are drafts. They are NOT applied to `.claude/knowledge/oracles/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze docs VCST-5590` run 2026-08-12 (sales-rep audience) — the two
> updated guides are `reports/ba/Sales-rep/sales-rep-hub-dashboard/read-your-dashboard.md`
> and `reports/ba/Sales-rep/sales-rep-view-customer-profile/view-customer-profile.md`.

---

## New Invariants Proposed

### PROPOSED-BL-SR-033: Rep-facing filter vocabularies are derived from the scope's own data, never from a settings dictionary `[P2-ux]`

- **Rule:** The Recent-orders status filter row and the Top-sellers category chip row are built
  from the data actually in the current scope, not from the store's configured vocabulary. A status
  is offered only if at least one order in that scope carries it (a DISTINCT over the scope's own
  orders — not the `Order.Status` dictionary, so a status written by an external integration is
  offered too, labelled with its raw value); a category is offered only if that scope has sales in
  it. Consequence: **every offered filter returns at least one row** — no dead filters. The two
  scopes (dashboard = all served customers, customer profile = one organization) compute independently,
  a customer-page vocabulary is never the dashboard's, and a selection that does not exist in the new
  scope falls back to the unfiltered baseline rather than staying invisibly applied. Where a scope has
  no categories to offer, the chip container is **not rendered at all** (not an empty bar, not an
  "All categories"-only row); the block still lists its rows.
- **Verify:**
  - The offered status set equals a DISTINCT over that scope's orders — statuses present in the
    platform `Order.Status` dictionary but unused by the scope's orders are absent (live 2026-08-12,
    vcptcore-qa: `Completed` / `Pending` are dictionary values and are offered on neither page).
  - Every offered chip, applied, returns ≥1 row.
  - An order status set outside the store (e.g. `AwaitingErpSync`) is offered and filterable.
  - Dashboard vs customer page: the customer set is a subset of, and never leaks, the dashboard set
    (live: dashboard 5 statuses / 3 categories; TechFlow 3 / 2; BuildRight 1 / **no chip row**).
  - Select a status on customer A, navigate to customer B which has no such status → chips reset to
    the All baseline and B's rows show unfiltered.
- **Violation signal:** A chip that returns "no results" (dead filter); the row rendered from the
  settings dictionary rather than the data (an integration-set status missing, or an unused status
  offered); a dashboard-only value offered on a customer page; a vanished selection left applied
  after a scope change; an empty chip container rendered where nothing can be filtered.
- **Agents:** qa-frontend-expert, qa-backend-expert
- **Source:** JIRA VCST-5590 (Task, *Tested*; parent Epic VCST-5142) — design-decision comment
  2026-07-30 ("Render only non-empty statuses and categories. Retrieve the list of statuses from the
  orders rather than the settings dictionary…") + the QA verification comment 2026-08-06 (14 rule→apply
  round-trips across 5 scopes, live-seeded `AwaitingErpSync` proof); re-verified live 2026-08-12 on
  vcptcore-qa, theme 2.56.0-pr-2409, module `VirtoCommerce.SalesRep_3.1001.0-pr-9`, as SR_REP_PRIMARY.
  Implementation PRs: vc-frontend#2409, vc-module-sales-rep#9.
- **Triggered by:** the docs run above — the pre-existing guides documented the *removed* behavior
  (a fixed status list, and a filter that returns nothing), which is what surfaced the gap.
- **Note for the reviewer:** deliberately **excludes ordering**. The one unreconciled VCST-5590 AC is
  that within the dictionary-known statuses the row comes out **alphabetical** rather than in the
  dictionary's curated order (`Cancelled, New, Payment required, Processing`, unknown appended). Until
  that is settled by a developer call, an ordering clause would encode a contested behavior — and
  BL-SR-010 already owns *sort-rule* semantics, which this is not.

---

## Stale BL-* Flagged

None. BL-SR-012 (filter-aware empty states) is adjacent but not contradicted: it governs what a
zero-match filter *shows*, whereas this proposal is about a zero-match filter never being *offered*.
The two coexist — BL-SR-012 still applies to the search/filter surfaces that can legitimately match
nothing (my-customers search, period windows).

---

## Application Notes

1. Assign the final ID by reading `.claude/knowledge/oracles/business-logic.md` for the next available
   `BL-SR-NNN` (BL-SR-032 is the current highest).
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste the edited entry into the Sales Rep section of `business-logic.md`.
4. After it lands, re-run `/qa-review-tests suite 091 --verify` and `suite 093 --verify` so the
   VCST-5590 / VCST-5649 cases gain their `Business_Rule` mapping.
