# Sales Rep with no org membership: "My customers" hub link is shown but the page redirects to Dashboard (dead-end)  `[Severity: Medium]`

**Env:** vcptcore-qa @ Storefront theme `2.54.0-pr-2380-11b6-11b645c3` (vc-module-sales-rep `SalesRep_3.1000.0-pr-2-e6e9`)

## Summary
A sales rep provisioned with a **global** `sales-rep:access` role and **zero organization memberships** sees the **"Sales Rep hub → My customers"** link in the account left rail, but both clicking it and hitting `/company/my-customers` directly **redirect to `/account/dashboard`**. The page — including its "No customers found" empty view — is unreachable for exactly the accounts that would show it. Navigation is a visible-but-dead link.

## Steps to Reproduce
1. Sign in to the storefront as a sales rep holding `sales-rep:access` but belonging to **no** organization — fixture `SR_REP_NOCUSTOMERS` (`agent-test-sr-nocustomers@example.com` / `Password1!`, "Nora None").
2. Go to `/account`. Observe the left rail shows **"Sales Rep hub"** with a **"My customers"** link (no badge, correct — count is 0).
3. Click **"My customers"** (target `/company/my-customers`).
4. Also try navigating directly to `{{FRONT_URL}}/company/my-customers`.

## Expected vs Actual
- **Expected:** The My Customers page loads and, for a rep serving 0 customers, shows the **"No customers found"** empty view (the case the code already ships an empty state for).
- **Actual:** Both the link click and the direct URL land on **`/account/dashboard`**. The My Customers page component never mounts, so its `salesRepCustomers` query is never issued and the empty view is never reachable.

![Hub "My customers" link shown for a zero-membership rep, but the page it points to redirects away](screenshots/BUG-salesrep-mycustomers-hub-link-shown.png)

## Root Cause (source-confirmed, vc-frontend @ master)
- `client-app/router/routes/main.ts` — the parent `/company` route carries `meta: { requiresAuth: true, requiresOrganization: true }`.
- `client-app/vue-router.d.ts` — `requiresOrganization` = *"The route requires the user to be a member of the Organization."* The global navigation guard redirects to `Dashboard` when the signed-in user has no organization.
- The sales-rep module registers **`my-customers` as a child of `corporateRoutes`** (i.e. under `/company`), so it **inherits `requiresOrganization: true`**.
- A global-role sales rep has **no org membership**, so the guard fires and bounces every `/company/*` hit to Dashboard.
- The hub link itself is registered via `registerAccountSection`, gated **only** on the `sales-rep:access` permission (not org membership) — so the link renders while the destination is blocked. Hence the inconsistency.

A sales rep's customer list is defined by the orgs they *serve* (`salesRepCustomers`), which is independent of the rep's *own* org membership — so mounting My Customers under the org-gated `/company` tree is the mismatch.

## Suggested Fix (dev decision)
Make the My Customers route reachable for any `sales-rep:access` holder regardless of org membership — e.g. register it outside the `requiresOrganization` `/company` subtree (or clear that meta for this child) — **or**, if the org-gating is intended, hide/disable the hub link when the rep has no org context so the nav isn't a dead-end. Preferred: the former, since serving customers ≠ being a corporate member.

## Notes
- Only affects reps with **zero** org memberships. A rep who is also an org member reaches the page normally, so this is an edge of the provisioning model, not a general regression.
- Related: suite `089-sales-rep-my-customers-storefront.csv` **SR-FE-013** (this case) and **SR-FE-021** (badge correctly hidden at count 0 — passes). Backend contract is fine (050m SR-GQL-009). Parent ticket: VCST-5469.

---

## Resolution — FIXED (verified live 2026-08-26)

Fixed in `vc-frontend` shortly after this was written, and **exactly the way this report recommended** — the preferred option of the two it offered.

**Source (`client-app/modules/sales-rep/routes.ts@dev`)** now carries the override plus a comment restating this report's own argument:
```ts
// `requiresOrganization: true`. But a sales rep serves organizations they don't belong to — their
// … gate here lets them through (child meta overrides parent meta in vue-router); the `beforeEnter`
const repRouteMeta = { requiresOrganization: false };
```
`repRouteMeta` is applied to `myCustomersRoute`, the hub `dashboardRoute`, and the customer-profile route, and a `guardSalesRep()` `beforeEnter` redirects to `Dashboard` only when the rep lacks `sales-rep:access`. So org membership no longer gates the route; the permission does — which is the correct axis, per this report's point that *serving* customers is independent of *being* a corporate member.

**Live verification — the exact STR, with the exact fixture.** Signed in to vcst-qa as `agent-test-sr-nocustomers@example.com` ("Nora None", `SR_REP_NOCUSTOMERS`, zero org memberships) and navigated directly to `/company/my-customers`:

| Probe | Reported | Now |
|---|---|---|
| final URL | `/account/dashboard` (redirected) | **`/company/my-customers`** — no redirect |
| `<h1>` | never mounted | **"My customers"** |
| empty view | unreachable | **present** |

The "No customers found" empty state this report noted the code already shipped is now actually reachable for the accounts that need it.

**Note on which build fixed it:** this was reported against theme `2.54.0-pr-2380` — i.e. PR #2380, the My Customers page itself. `routes.ts` was subsequently touched by #2383 (customer profile, 07-17) and #2388 (hub Dashboard, 07-24); I did not bisect which added `repRouteMeta`, only that `dev` has it and vcst-qa @ `2.56.0-pr-2451` serves the fixed behaviour.

Suite `089` **SR-FE-013** should now pass and is worth re-running to pin it.

**Verdict: VERIFIED FIXED.**
