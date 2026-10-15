# Demo profiles — presentation-grade data beside the AGENT-TEST fixtures

A data family with a **demo profile** owns a second dataset, built to be shown to a customer: real-looking
names, no `AGENT-TEST` string on any rendered surface, no real mailbox notified. It lives next to the
family's fixtures behind the family entrypoint, and the two are **mutually exclusive on one environment**
(they share one surface — a rep list, the Admin Return list).

## Run it

```bash
TEST_ENV=virtostart npm run seed:demo -- --list      # which families have a demo profile, in order
TEST_ENV=virtostart npm run seed:demo                # seed all of them, dependencies first
TEST_ENV=virtostart npm run seed:demo:teardown       # reverse order
TEST_ENV=virtostart npm run seed:demo -- --family returns
```

`seed-demo.mjs` only orders the family entrypoints; each family keeps its own guard and stamp.

| Family | Entrypoint | Dataset | Stamp in `aliases.<env>.json` | Detail |
|---|---|---|---|---|
| sales-rep | `seed:sales-rep-family -- --profile demo` | `sales-rep/sales-rep-demo-specs.mjs` | `_meta.dataset_profile` | [`sales-rep-profiles.md`](sales-rep-profiles.md) |
| returns (after sales-rep) | `seed:returns-family -- --profile demo` | `test-data/orders/returns-demo/returns-demo.json` | `_meta.dataset_profiles.returns` | below |
| loyalty-missions (after returns) | `seed:missions-family -- --profile demo` | `test-data/loyalty/missions-demo/missions-demo.json` | `_meta.dataset_profiles.loyalty-missions` | below |

## Returns demo

Delivered orders and returns on the sales-rep demo's four organizations — eight buyer orders with fourteen returns covering every status the store allows —
Draft, Requested ×3, New (agent-logged), Approved ×2, PartiallyApproved ×2, Processing ×2, Rejected, Cancelled,
Completed — plus two freshly delivered orders with no return for a live Request-return walkthrough. **Alla's own orders**
(fixture `owner: {rep, login}`): three per login (`record` and `email`) in her served orgs, four returns each
on "My returns", every order still returnable so **Request return** shows; returns are submitted as her via her
password or, without it, an operator logging in on her behalf.

- **Data is the fixture**, never the script: edit `returns-demo.json`; `returns-demo-specs.mjs` loads and
  derives; `npm run td:validate:returns-demo` gates it. A copy change (reference, comment, decline reason)
  is detected on the next seed and that return is rebuilt.
- **Through the mechanism:** each return is created, evidenced and submitted with the buyer's own token,
  cancelled with `cancelReturn`, and decided through `POST /api/return/{id}/authorize`.
- **Nothing environment-specific is declared:** store = `STORE_ID`; reason codes and window are read live
  and checked before any write; products are discovered per organization family.
- **Delete handle:** `DEMO-RET:ORD:<key>` in order `outerId` + the `_demo_returns_ledger`. Teardown
  removes every return on a marked order, then the order.
- **Prerequisite:** the sales-rep demo (it reads its ledger for orgs and buyer accounts); the buyer
  password is `{{SR_DEMO_BUYER_PASSWORD}}`.
- **`seed:bootstrap`** skips `returns-org` while the returns family holds its demo profile.
- **Organization returns view:** no role on the store carries `xapi:my_organization:return:view`, so the
  demo owns a view-only role, `Organization returns viewer`, and ADDS it to the memberships listed in the
  fixture's `orgReturnsAccess` (maintainer buyers + both of Alla's logins in her served orgs). Built-in roles
  are never edited; teardown removes the role from those memberships and deletes it.

## Loyalty missions demo

Six store-wide missions — order count, order value, featured SKUs; one ending within 10 days (red badge),
one open-ended — and nine orders placed by four demo buyers after the missions exist. On `/account/missions`:
Margaret Hale has three completed (rewards in Points history) and two part-way; Priya Raman, James Whitfield
and Daniel Okafor are part-way or completed on others; Thomas, Elena and Marcus have nothing started.

- **Progress cannot be written, reset or reversed**, and every order feeds every active mission, so the set
  is reused WHOLE or rebuilt WHOLE (`--fresh`). Granted points stay in the buyers' ledgers after a rebuild
  or teardown. The seeder derives the expected progress from the fixture and polls until it is reached.
- **Ordering:** after returns in `seed:demo` — any order a demo buyer gets later counts toward the missions.
- **Store-wide:** every account sees every Published mission, including ones the demo did not create; the
  family warns when AGENT-TEST missions are live. `seed:bootstrap` skips `loyalty-missions` while the demo holds.
- The 083d E2E set (`seed:missions-e2e`) is per-run and stays outside the family.

**Adding a family:** give it a demo dataset as a `test-data/` fixture, a family entrypoint built on
`scripts/lib/seed-family.mjs` (`runFamily`: profiles, stamp, mutual exclusion, teardown), then one row in
`DEMO_FAMILIES` (`seed-demo.mjs`).
