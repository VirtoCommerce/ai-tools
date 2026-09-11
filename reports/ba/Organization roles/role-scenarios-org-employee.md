# Role scenarios — Organization employee (worked Part 0r reference)

**What this is.** The reference fill for a Test Model's `Part 0r — ROLE SCENARIOS`
(`.claude/skills/qa-test/test-model.md` §Part 0r). Three scenarios across the membership lifecycle —
invited, transacting, blocked — for the baseline B2B role.

**Prior art, not an oracle.** Derived from the domain map's `### Actors` table
(`.claude/knowledge/domain/b2b-organizations.md`), whose `Org employee / buyer` row is `UNVERIFIED`
(gap `G1`, source-only). Expectations below therefore inherit `{HYPOTHESIS}`, not `{DOC}`.

**Roles in scope**

| Role | Fixture |
|---|---|
| Organization employee (`org-employee`) | **FIXTURE-GAP `G1`** — no employee login exists; `ORG_USER_EMAIL` is a second maintainer. Routed to `3a` |
| Organization maintainer (`org-maintainer`) | `@td(TECHFLOW_ADMIN.email)` — the counterpart role, present in each scenario as the actor who set things up |

Permission strings: `test-data/b2b/roles.csv`. `org-employee` carries
`storefront:organization:view;storefront:user:view` — read-only on both org axes.

---

## BSC-1 — First sign-in as a new employee

**Role:** Organization employee · **Situation:** Invited by the maintainer, has never signed in

| # | Action | Sees | Can do | Expected |
|---|--------|------|--------|----------|
| 1 | Opens invite link | Set-password form | Set password | Nothing else in the org is reachable until the invite is accepted |
| 2 | Signs in | Company branding, contract prices | Browse | Effective role is **employee** — not whatever the invite endpoint defaulted to (`D9`) |
| 3 | Adds an item to cart | Cart under company context | Add, change quantity | Cart is company-scoped from the first add, not after a later refresh |
| 4 | Opens Company → Members | Roster: maintainer + other employees | Read only | No *Invite* button, no *Actions* column on any row, including their own (`BL-B2B-005`) |
| 5 | Re-opens the consumed invite link | Error page | — | Consumed invite fails cleanly and grants nothing |

**Outcome:** Employee is active in the company with buying rights only.
**Not allowed:** manage members · edit the company · re-use the invite.

---

## BSC-2 — Reorder from a shared company list

**Role:** Organization employee · **Situation:** Needs stock on site; the maintainer is unavailable

| # | Action | Sees | Can do | Expected |
|---|--------|------|--------|----------|
| 1 | Opens a shared company list | List created by the maintainer | Order from it | Cannot rename, edit or delete it |
| 2 | Adds items | Company contract prices | Add to cart | Same prices the maintainer sees — role must not change price |
| 3 | Goes to checkout | Company's saved ship-to addresses | Select one | Cannot add or edit an address |
| 4 | Places the order | Company payment terms | Place order | Order is created under the company, not personally |
| 5 | Opens Orders | Own orders | View | Other employees' orders absent — **and absent from the response body**, not only from the screen |
| 6 | Calls the member-management API with their own token | — | — | Refused, and nothing persists |

**Outcome:** Order placed on company terms without any company data being changed.
**Not allowed:** edit addresses · edit the shared list · see other members' orders · manage members.

---

## BSC-3 — Blocked when leaving the company

**Role:** Organization employee (blocked) · **Situation:** The maintainer blocks them; they keep a
personal account and a membership in a second company

| # | Action | Sees | Can do | Expected |
|---|--------|------|--------|----------|
| 1 | Maintainer blocks them | — | — | Their open session ends — not left to expire (`G13`: server-immediate, session-stale) |
| 2 | Signs in again | First company absent | — | Its orders, addresses, lists, prices and roster gone on **every** surface — direct URL and API included |
| 3 | Opens the second company | Second company as normal | Browse, order | The other membership is untouched |
| 4 | Opens the personal account | Personal orders | Browse, order | The personal account is untouched |
| 5 | Maintainer opens Orders | The blocked member's past company orders | View | Company history is kept — revoking a person deletes nothing |

**Outcome:** Access removed from one company only; everything else intact.
**Not allowed:** any access to the first company · over-broad revocation of the second company or the
personal account.

---

## Notes for whoever authors from this

- **Every `Not allowed` item is its own case** (`authoring.md` §Artifact A), asserted at the server with
  the employee's own token — a hidden button is a separate, weaker assertion. Stamp `Archetype:SCOPE`,
  or `SILENT` where the risk is a `200` that quietly no-ops.
- **None of these can run today.** `G1` (no employee fixture), `G3` (no locked membership) and `G6`
  (no mixed-status org) all block them. The demand is the deliverable; do not author against an `@td()`
  that does not resolve.
- **No approval step anywhere, deliberately.** `BL-B2B-004` records that the product has no native
  pre-purchase approval, and five buyer→approver cases are already `Deprecated` with *"do not re-author"*.
