---
id: CL-NEW-001
title: Purchase orders over 50,000 route to the finance approval queue
scope: client
kind: invariant
appliesTo: "*"
relation: new
status: active
tags: [b2b, approval, orders]
audited:
  date: 2026-08-23
  source: source
  ref: acme-custom-approvals/ApprovalRouter.cs:41
---

An order whose total exceeds 50,000 in the store currency is placed in the finance
approval queue instead of being submitted. Knowledge that exists only on this
deployment — there is no platform entry it relates to.
