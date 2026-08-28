---
id: CL-CHK-001
title: Guest checkout is disabled on this deployment
scope: client
kind: flow
appliesTo: "*"
relation: suppress FLOW-CHECKOUT-001
status: active
reason: This storefront is B2B-only — every checkout requires an authenticated organization contact, so the guest flow is unreachable and testing it produces false failures.
tags: [checkout, b2b]
audited:
  date: 2026-08-22
  source: live
  ref: acme-qa/run-2026-08-22/CHK-002
---

Guest checkout is switched off. Any scenario reaching checkout must sign in first.
