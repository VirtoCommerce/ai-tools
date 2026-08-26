# NOT A BUG — `rejectOrganizationInvite` "returns a stale statusInOrganization" was a test-assertion error

## Status: CLOSED — false positive (test defect, not a product defect)

**Env:** vcst-qa @ Platform `3.1061.0` · `VirtoCommerce.ProfileExperienceApiModule` `3.1016.0`
**Raised:** 2026-08-25 · **Retracted:** 2026-08-26 after re-verification

## What was claimed

That `rejectOrganizationInvite` persists `Rejected` but returns `statusInOrganization: "Approved"`,
i.e. a stale response projection. Filed P2 with a root cause naming the `BL-B2B-013` fallback chain.

## Why it is not a defect

**The write is correct.** Across four independent reproductions the membership row read `"Rejected"`
immediately after the mutation, confirmed by `POST /api/customer/organization-memberships/search`.
Nothing is lost, stale, or inconsistent in the data.

**The field cannot mean what the test assumed.** Live introspection (2026-08-26) of `ContactType`:

```
statusInOrganization   args: []   type: String
```

No organization argument. It is a **contact-scoped scalar**, so it structurally cannot express a
per-membership status — for a contact in several organizations there is exactly one value. Asserting
`= "Rejected"` on it after rejecting *one* membership asserts something the field does not model.

**The membership row is the authoritative record** — which is what `BL-B2B-012` actually says
("declining changes a status, never deletes the row"), and what the REST cross-check in `PRF-GQL-072`
was already verifying correctly all along.

## What was actually wrong

`PRF-GQL-072` and `PRF-GQL-076` (suite `050d`, both `Draft`) each carried:

```
[DATA label=reject_invite] data.rejectOrganizationInvite.statusInOrganization = "Rejected" {BL}
```

Wrong target, and tagged `{BL}` against **`BL-B2B-009`** — the *invite-creates-a-membership* invariant,
which makes no claim about rejection at all. Both were fixed on 2026-08-26: the contact-scoped assertion
was replaced with a structural check plus an executable **membership** assertion, and the citation
corrected to `BL-B2B-012`. `PRF-GQL-076` gained a real `verify_membership_rejected` REST step — its
membership check had previously been prose in `Cross_Layer_Checks`, never executed.

## Corrections to the retracted report

- The claimed root cause (`GetContactAggregateAsync` returning a stale projection) was **not
  established**. A control holding the membership at `Approved` while varying `contact.status` across
  four values showed the field did **not** track `contact.status` — refuting the contact-fallback
  mechanism the report asserted.
- A follow-up matrix intended to pin the exact semantics returned a constant value in all 8 cells,
  which is inconsistent with earlier observations; the membership `PUT` in that script was most likely
  a silent no-op. It is recorded as **inconclusive** and no conclusion rests on it.
- The exact resolution rule for `statusInOrganization` therefore remains **uncharacterised**. That is a
  documentation gap worth closing, not a defect — the field is simply not the per-membership status.

## Lesson

The original evidence could not distinguish its own hypotheses: the fixture contact's status was
`"Approved"` and the `BL-B2B-013` default is also `"Approved"`, so both explanations predicted the same
observation. A control that makes rival hypotheses predict *different* results was needed before, not
after, filing.
