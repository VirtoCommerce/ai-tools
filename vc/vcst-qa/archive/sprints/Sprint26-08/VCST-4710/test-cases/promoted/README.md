# VCST-4710 — Promoted Test Cases

**Promotion date:** 2026-04-23
**TLC run:** TLC-2026-04-23-1230
**Stage:** Stage-2 (regression append)

These files are archived copies of the sprint-staged test cases after promotion to regression suites.
The originals remain at `tests/Sprint-current/VCST-4710/test-cases/*.csv`.

## ID Mapping

| Source ID | New Regression ID | Target Suite | Automation_Status |
|---|---|---|---|
| VCST-4710-SF-001 | CHK-087 | 011-checkout-flow | ready |
| VCST-4710-SF-002 | CHK-088 | 011-checkout-flow | ready |
| VCST-4710-SF-003 | CHK-089 | 011-checkout-flow | ready |
| VCST-4710-SF-004 | CHK-090 | 011-checkout-flow | ready |
| VCST-4710-SF-005 | CHK-091 | 011-checkout-flow | ready |
| VCST-4710-SF-006 | CHK-092 | 011-checkout-flow | ready |
| VCST-4710-SF-007 | CHK-093 | 011-checkout-flow | ready |
| VCST-4710-SF-008 | CHK-094 | 011-checkout-flow | blocked-by-VCST-4992 |
| VCST-4710-SF-009 | CHK-095 | 011-checkout-flow | ready |
| VCST-4710-SF-010 | CHK-096 | 011-checkout-flow | ready |
| VCST-4710-SF-011 | CHK-097 | 011-checkout-flow | ready |
| VCST-4710-SF-012 | CHK-098 | 011-checkout-flow | ready |
| VCST-4710-SF-013 | CHK-099 | 011-checkout-flow | blocked-by-VCST-4993 |
| VCST-4710-SF-014 | CHK-100 | 011-checkout-flow | blocked-by-VCST-4994 |
| VCST-4710-SF-015 | CHK-101 | 011-checkout-flow | ready |
| VCST-4710-SF-016 | CHK-102 | 011-checkout-flow | ready |
| VCST-4710-SF-017 | CHK-103 | 011-checkout-flow | ready |
| VCST-4710-SF-018 | CHK-104 | 011-checkout-flow | ready |
| VCST-4710-SF-019 | CHK-105 | 011-checkout-flow | ready |
| VCST-4710-SF-020 | CHK-106 | 011-checkout-flow | ready |
| VCST-4710-GQ-001 | GQL-048 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-002 | GQL-049 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-003 | GQL-050 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-004 | GQL-051 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-005 | GQL-052 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-006 | GQL-053 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-007 | GQL-054 | 050d-graphql-xprofile | ready |
| VCST-4710-GQ-008 | GQL-055 | 050d-graphql-xprofile | ready |
| VCST-4710-ADM-001 | CUST-063 | 026-customer-contacts | ready |
| VCST-4710-ADM-002 | CUST-064 | 026-customer-contacts | ready |
| VCST-4710-SF-021 | CHK-107 | 011-checkout-flow | Manual |
| VCST-4710-SF-022 | CHK-108 | 011-checkout-flow | Manual |

## Bug-Blocked Cases

| New ID | Blocking Bug | Reason |
|---|---|---|
| CHK-094 | VCST-4992 | Column sort not wired (P0) |
| CHK-099 | VCST-4993 | aria-label reads 'Search pickup locations' |
| CHK-100 | VCST-4994 | Mobile 375px CITY facet clipped |

## Target File testCount Updates (config/test-suites.json)

| Suite | Before | After | Delta |
|---|---|---|---|
| 011-checkout-flow | 42 | 62 | +20 |
| 050d-graphql-xprofile | 14 | 22 | +8 |
| 026-customer-contacts | 51 | 53 | +2 |
