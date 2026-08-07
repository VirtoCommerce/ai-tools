# Business Logic Proposals — BA-2026-08-07

> **These are drafts. They are NOT applied to `knowledge/oracles/business-logic.md`.**
> Promotion requires **explicit user approval per proposal**. Review, edit as needed,
> approve individual entries, assign final `BL-*` IDs, then direct Claude to promote
> only the approved entries. Claude will never modify `business-logic.md` on its own.
>
> Source: `/ba-analyze docs admin and customer VCST-5281` run `2026-08-07` — see
> `reports/ba/Organization roles/ba-admin-doc-VCST-5281-org-membership-status-2026-08-07.md`
> and `ba-customer-doc-VCST-5281-member-status-invites-2026-08-07.md`.
>
> Env: vcst-qa @ Platform `3.1058.0-pr-3077-8295`, vc-frontend theme `2.55.0-pr-2423-a4e7`.

---

## New Invariants Proposed

### PROPOSED-BL-B2B-014: Storefront status labels are lossy — Rejected and Deleted are indistinguishable and unfilterable `[P2-ux]`

- **Rule:** The storefront Company Members grid maps the four legal effective membership statuses onto three
  visible states — **Active** (`Approved`), **Invited** (`Invited`), and a residual **Inactive** bucket that
  collapses both `Rejected` and `Deleted` — while **Blocked** is driven by the *independent* lock predicate and
  overrides whatever status the row would otherwise show. The Filters panel's Status facet is statically defined
  and exposes only `Active` / `Invited` / `Blocked`; there is no filter value for `Rejected` or `Deleted`, so an
  org maintainer cannot isolate declined-from-revoked members from the storefront alone. The Admin SPA does not
  share this loss — its `Invite status` column shows the raw wire value.
- **Verify:**
  - Seed memberships at each of the four legal statuses plus one locked membership.
  - Open **Company members** as an org maintainer; confirm the badge/tooltip text per row is exactly
    `Active` / `Invited` / `Inactive` / `Blocked`.
  - Open **FILTERS**; confirm the Status group offers exactly three checkboxes (`Active`, `Invited`, `Blocked`).
  - Confirm no filter combination separates a `Rejected` row from a `Deleted` row.
  - Cross-check the same memberships in Admin → contact → **Organization memberships** → `Invite status`:
    the raw values must still be distinguishable there.
- **Violation signal:** Documentation, support guidance, or a test assertion implies the storefront can
  distinguish or filter `Rejected` vs `Deleted`; or the Admin grid starts collapsing them too, removing the last
  surface where the distinction is observable.
- **Agents:** qa-frontend-expert, ba-doc-writer
- **Source:** Live UI observation 2026-08-07 on vcst-qa —
  `reports/tickets/Sprint26-15/VCST-5281/screenshots/DOC-customer-filters-panel.png`,
  `DOC-customer-company-members-grid.png`,
  `DOC-admin-org-memberships-widget-grid.png`; four legal values confirmed at
  `vc-module-customer` `src/VirtoCommerce.CustomerModule.Core/ModuleConstants.cs:42-47`.
- **Triggered by:** `/ba-analyze docs` VCST-5281 doc-grounding pass (storefront axis)
- **Relationship to existing entries:** distinct from **BL-B2B-012** (revoke/decline mutates status rather than
  deleting the row — a persistence rule) and **BL-B2B-013** (per-org-first status *resolution* — a precedence
  rule). This one is about the lossy **presentation** of an already-resolved status.

---

### PROPOSED-BL-NOTIF-008: Retiring a notification type orphans its store-level template customization `[P1-data]`

- **Rule:** When a notification type is retired and replaced — as the pre-VCST-5281 registration-invitation types
  were superseded by `CustomerInviteNewUserEmailNotification`,
  `OrganizationInviteNewUserEmailNotification`, and `OrganizationInviteExistingUserEmailNotification` — the
  retired type is **relabelled** `Unregistered notification` in the Notification list rather than removed, and
  any store-level or per-language template customization authored against it is **not** migrated to the
  successor type. The successor ships with only its predefined (English) default until an operator re-authors a
  template per store and per language. A type retirement must therefore be treated as a breaking change with an
  operator-facing remediation step, never as silent continuity.
- **Verify:**
  - On an environment that crossed the type-retirement boundary, open **Notifications → Notification list** and
    search for the retired type's name.
  - Confirm it renders as `Unregistered notification` with the subtext
    `Original notification type: <OldName>`.
  - Open one of the successor types → **TEMPLATES**.
  - Confirm only the `default` / `Predefined` row exists, even on a store that had customized the retired type.
- **Violation signal:** A store's branded invite email silently reverts to a plain English default after upgrade,
  with no operator-facing pointer to re-create the template; or the retired type disappears entirely, destroying
  the evidence that a customization ever existed.
- **Agents:** qa-backend-expert, ba-doc-writer
- **Source:** Live UI observation 2026-08-07, Notification list on vcst-qa Platform `3.1058.0-pr-3077-8295` —
  `reports/tickets/Sprint26-15/VCST-5281/screenshots/DOC-admin-notification-list-invite-types-live.png`
  shows `Unregistered notification / Original notification type: CustomerInvitationNotification` as a distinct
  orphaned entry; the three successor classes confirmed in `vc-module-customer` at
  `CustomerInviteNewUserEmailNotification.cs:5`, `OrganizationInviteNewUserEmailNotification.cs:5`,
  `OrganizationInviteExistingUserEmailNotification.cs:5` (all extending `RegistrationInvitationNotificationBase`);
  breaking-change behaviour also stated in the VCST-5281 upgrade-notes comment (2026-07-29).
- **Triggered by:** `/ba-analyze docs` VCST-5281 doc-grounding pass (Notifications axis)
- **Relationship to existing entries:** distinct from **BL-NOTIF-005** (editing a *predefined* template warns and
  stays restorable — a within-type authoring rule). No existing `BL-NOTIF-*` entry covers what happens to a
  customization when the **type itself** is retired.

---

## Stale BL-* Flagged

None. `BL-B2B-012`, `BL-B2B-013`, and `BL-AUTH-012`/`-013`/`-015`/`-016` were all checked against live and
source behaviour in this pass and still hold as written.

> Note: a `PROPOSED-BL-AUTH-015`-style draft on **auth-pipeline resolver symmetry** already sits in
> `reports/ba/Organization roles/test-model-VCST-5281-2026-08-03.md` §BL Drafts. It was deliberately **not**
> duplicated here. It is also not the same as the now-promoted `BL-AUTH-015`/`-016` — if you intend to act on
> it, take it from the test model, not from this file.

---

## Application Notes

1. `BL-B2B-014` and `BL-NOTIF-008` are the next free IDs in their domains as of 2026-08-07
   (`BL-B2B-*` runs to 013, `BL-NOTIF-*` runs to 007) — re-check `business-logic.md` before promoting in case
   another run landed first.
2. Replace the `PROPOSED-` prefix with the final ID.
3. Paste the edited entry into the correct domain section of `business-logic.md`.
4. After the entry lands, re-run `/qa-review-tests suite <ID> --verify` for the affected suites
   (`Frontend/b2b/008-b2b-members.csv`, `Backend/customer/027-customer-orgs-invites.csv`,
   `Backend/notifications/057-*`) so the cases gain their `Business_Rule` mapping.
5. Alternatively, hand both entries to **`/qa-review-oracles bl`** — it triangulates each against docs + live +
   source and auto-applies only what clears the three-source bar, routing the rest back to a proposals file.
   Each entry above currently has **two** axes (live + source); neither has a docs anchor, because no published
   page documents either behaviour.
