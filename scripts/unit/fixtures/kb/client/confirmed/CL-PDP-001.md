---
id: CL-PDP-001
title: The theme adds a second add-to-cart control in the sticky bar
scope: client
kind: locator
appliesTo: "*"
relation: extend LOC-PDP-002
status: active
tags: [pdp, locator, theme]
audited:
  date: 2026-08-23
  source: live
  ref: acme-qa/run-2026-08-23/PDP-004
---

Below 1024px this theme renders a sticky bottom bar carrying a SECOND control with the
same accessible name. Scope the locator to the main product form, or the click lands on
the sticky bar and the assertion reads the wrong control.
