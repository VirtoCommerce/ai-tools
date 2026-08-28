---
id: CL-GONE-001
title: Override of a platform entry that no longer exists
scope: client
kind: quirk
appliesTo: "*"
relation: override BL-GONE-999
status: active
tags: [drift]
audited:
  date: 2026-03-15
  source: docs
  ref: acme-qa/notes/legacy-overrides
quotes: |
  Wishlists are limited to one list per contact.
---

The platform id this override targets is absent from the platform brain, so drift-check
must report `retired` — the override has nothing left to override.
