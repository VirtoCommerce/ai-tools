# Profile page: Last name and Email inputs show the "Enter your first name" placeholder — `[Low]`

## Status: OPEN

**Env:** vcptcore-qa · theme `2.61.0-pr-2597-372a` · also on vc-frontend `dev` (source)
**Found:** 2026-10-27, incidental during VCST-5690 verification · **Ticket:** VCST-6543 (relates to VCST-5690)

## Summary

On `/account/profile` all three text inputs use the same placeholder key, `common.placeholders.first_name`.
So the **Last name** input says *"Enter your first name"* when it is empty, and the (always disabled)
**Email** input carries the same placeholder. It is a copy-paste in the template, not a missing translation:
the right keys already exist.

## STR

1. Sign in to the storefront, open `/account/profile`.
2. Clear the **Last name** input.
3. Observe the placeholder: *"Enter your first name"* (with "This field is required" below).

## Expected vs Actual

| | |
|---|---|
| **Expected** | Last name → "Enter your last name" (`common.placeholders.last_name`); Email → "Enter your email address" (`common.placeholders.email`) |
| **Actual** | Both use `common.placeholders.first_name` → "Enter your first name" |

![Last name input with the first-name placeholder](BUG-Storefront-Profile-Placeholder-First-Name-On-Last-Name-Email.png)

## Root cause

`client-app/pages/account/profile.vue` on `dev`: lines 25 (Last name) and 38 (Email) pass
`:placeholder="$t('common.placeholders.first_name')"`. Introduced in vc-frontend PR #485
(`b26d8faf`, "fix: form validation", 2023-03-22). Not changed by PR #2597.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | accessibility tree: `textbox "Last name"` and `textbox "Email"` both `/placeholder: Enter your first name`; screenshot above |
| 2. Backend Admin | N/A | UI string only |
| 3. GraphQL xAPI | N/A | — |
| 4. Platform REST API | N/A | — |

**Owning layer:** Layer 1 — storefront theme.

## Fix Routing (→ /qa-fix)

- **Repo:** `VirtoCommerce/vc-frontend` (repoKind `frontend`)
- **RCA anchor:** `client-app/pages/account/profile.vue:25` and `:38`
- **Fix:** use `common.placeholders.last_name` and `common.placeholders.email`. Both keys exist in every locale.
- **Routing confidence:** HIGH
