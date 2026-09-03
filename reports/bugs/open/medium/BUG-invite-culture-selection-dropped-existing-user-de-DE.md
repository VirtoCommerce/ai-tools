# BUG — Admin "Invite customer" blade: selecting a non-default Language drops `cultureName` from the invite payload · Medium

**Env:** vcst-qa @ Platform 3.1051.0 · Customer 3.1021.0-pr-312-2257
**Found by:** `/qa-regression` REG-2026-07-30-1040, suite 027 (CUST-079) · triaged `REAL_BUG`

## Summary

Selecting a language in the Admin "Invite customer" blade's Language dropdown is not reflected in the
`POST /api/members/customers/invite` payload unless that language happens to be the store's auto-populated
default. Selecting `de-DE` explicitly sends **no `cultureName` key at all**, and the resulting notification
is journaled in `en-US`.

## Steps to reproduce

1. Open the Invite customer blade, select store `B2B-store` (auto-populates Language = `en-US`, the store
   default) — confirm the payload includes `cultureName:"en-US"`.
2. Change Language to `de-DE` from the 15-culture dropdown.
3. Submit the invite and capture the `POST /api/members/customers/invite` request body.
4. Read the resulting notification journal entry's `languageCode`.

## Expected vs actual

**Expected:** payload includes `cultureName:"de-DE"`; journal entry `languageCode="de-DE"`.

**Actual:** payload omits `cultureName` entirely; journal entry `languageCode="en-US"` — the explicit
selection is silently lost end-to-end, even though the UI clearly showed `de-DE` selected at send time.

```
POST /api/members/customers/invite
{"message":"...","emails":["AGENT-TEST-c073-employee@yopmail.com"],"roleIds":["org-employee"],
 "organizationId":"90670e3a-...","storeId":"B2B-store"}   <-- no cultureName key
```

Contrast: the earlier auto-populated-default send **did** include `cultureName:"en-US"` — so the field is
wired correctly for the default-selection path and only breaks on an explicit non-default change.

## Fix Routing

- **Layer:** L2 Backend Admin (blade form binding) or L4 REST (payload construction)
- **Repo:** `vc-module-customer` — Invite customer blade / controller
- **Suggested fix:** verify the Language select's `ng-model` binding actually updates the field the invite
  payload builder reads; likely reads a stale/unbound property that only the auto-populate handler writes.
- Do NOT auto-merge — human review required.
