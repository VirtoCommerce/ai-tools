---
id: CL-AUTH-001
title: This deployment locks an account after three failed sign-in attempts
scope: client
kind: invariant
appliesTo: "*"
relation: override BL-AUTH-004
status: active
tags: [auth, lockout, security]
audited:
  date: 2026-08-22
  source: live
  ref: acme-qa/run-2026-08-22/AUTH-011
quotes: |
  The account is locked after five consecutive failed sign-in attempts and stays locked
  for fifteen minutes.
---

This deployment tightens the platform rule: the account is locked after **three**
consecutive failed sign-in attempts and stays locked for one hour.
