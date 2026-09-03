# Admin SPA discards the server's 400 explanation on a membership status save; "Error details" is empty `[Medium]`

**Env:** vcst-qa @ Platform 3.1055.0, `VirtoCommerce.Customer` 3.1021.0-pr-312-3aa7

## Summary

Saving an out-of-contract Invite status on an organization membership fails with HTTP 400, and the
platform returns a body naming exactly which values are legal. The Admin SPA shows only a generic
`400: Bad request` banner, and its **"Error details" modal opens completely empty** — so the
admin never sees the explanation. Nothing persists, so this is an observability defect rather than
data corruption, but it would mask **any** 400 raised on this blade.

## STR

> **⚠ Original trigger removed 2026-08-05** — `Locked` was an admin-added dictionary row and has been
> deleted (verified: `allowedValues` is now the compiled four), so no out-of-set status is selectable.
> Root cause **(a) is resolved by configuration**; defect **(b) is unchanged and still open** — it just
> has no one-click trigger left, because the fault is in the client's error handling, not in the value.

1. Sign in to the Admin SPA at `{{BACK_URL}}` as an administrator.
2. Temporarily add an out-of-set value (e.g. `AGENT-TEST-NotAStatus`) to the
   `Customer.OrganizationMembershipStatuses` dictionary setting — **remove it afterwards**, or you
   reintroduce the config defect just fixed. (Any other 400 on this blade works equally well.)
3. Contacts → open `@td(MULTI_ORG_TF_BR.email)` → **Organization memberships** → the TechFlow row.
4. In **Invite status**, select the out-of-set value → **Save** → click **View details** on the banner.

*Originally observed 2026-08-04 with `Locked`, which the dictionary then offered.*

## Expected vs Actual

| | |
|---|---|
| **Expected** | The failure surfaces the server's explanation — `Status must be one of: Invited, Approved, Rejected, Deleted.` — either in the banner or in the "Error details" modal, so the admin can pick a legal value. |
| **Actual** | Banner reads only `400: Bad request`. **"Error details" opens with a warning icon and an OK button and no text at all.** The response body carrying the legal set is discarded by the client. |

The server side is correct: `PUT /api/customer/organization-memberships/{id}` → **400** with body verbatim
`Status must be one of: Invited, Approved, Rejected, Deleted.` (read off the network response). Read-back
confirms the membership status is unchanged.

![Save fails with a bare 400 banner](../screenshots/BUG-admin-membership-status-400-empty-details.png)

![The "Error details" modal is empty](../screenshots/BUG-admin-membership-status-400-details-modal.png)

## Root cause

Two separable issues; **this report covers (b)** and (b) is worth fixing regardless of how (a) is resolved.

- **(a) Why a doomed value was offered — RESOLVED 2026-08-05 by deleting the row.** The blade populates
  Invite status from the `Customer.OrganizationMembershipStatuses` **dictionary** setting, which had a
  fifth value; the write path validates against the four compiled
  `ModuleConstants.MembershipStatuses.ManuallySelectableStatuses` and refuses anything else (per-value
  probe: the four → 200, `Locked` → 400). `IsDictionary = true`, so it was env data, not code — the
  right fix was removing the row. Locking is a **separate axis** (`IsLocked` + `LockoutEnd` →
  `IsCurrentlyLocked`), which is why `Locked` is structurally absent from the status vocabulary.
- **(b) The client drops the error body.** The 400 body never reaches the UI and the modal renders
  empty rather than falling back to the raw message — independent of (a); any 400 here is as opaque.

## Notes

- **Not a duplicate of VCST-5061** (CLOSED — cannot reproduce), which was the *same surface* with a
  different symptom: toasts rendering the raw key `platform.errors.generic-error`. Here every string is
  human-readable and the modal is **empty** — the body is dropped, not mis-localized.
- `CUST-122` assertion 6 asserts the compiled-vs-dictionary divergence end-to-end; this is the **UI**
  half no test case covers.
- The **create path** has its own filed gap — `BUG-org-membership-create-no-input-validation-VCST-5028`
  (JIRA VCST-5314): `POST` accepts an empty `userId` (200, orphan) and 500s on a missing one.
- Related invariants: `BL-B2B-013`, `BL-AUTH-016`. Minor, unfiled: the **New membership** blade renders
  a read-only `Locked state: Unlocked` row for a record that does not exist yet.
