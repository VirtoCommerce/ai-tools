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

## Returns demo

Eight delivered orders and eight returns on the sales-rep demo's four organizations, one return per status
a buyer or agent can see — Draft, Requested ×2, Approved, PartiallyApproved (two lines), Rejected, Cancelled,
Completed — plus two freshly delivered orders with no return for a live Request-return walkthrough.

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
- **Organization returns view:** the seeder reports whether `Organization maintainer` carries
  `xapi:my_organization:return:view`; it never edits a built-in role.

**Adding a family:** give it a demo dataset as a `test-data/` fixture, a family entrypoint with
`--profile demo` and its own `_meta.dataset_profiles.<family>` stamp, then one row in `DEMO_FAMILIES`
(`seed-demo.mjs`).
