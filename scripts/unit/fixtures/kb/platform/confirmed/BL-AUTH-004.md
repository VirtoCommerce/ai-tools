---
id: BL-AUTH-004
title: An account locks after five consecutive failed sign-in attempts
scope: platform
kind: invariant
appliesTo: "*"
relation: new
status: active
tags: [auth, lockout, security]
audited:
  date: 2026-08-18
  source: docs
  ref: PlatformUserGuide/security#lockout
---

The account is locked after five consecutive failed sign-in attempts and stays locked
for fifteen minutes. A successful sign-in resets the counter.
