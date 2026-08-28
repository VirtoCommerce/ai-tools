---
id: CL-CART-020
title: This deployment shows an estimated tax line on an address-less cart
scope: client
kind: invariant
appliesTo: "*"
relation: override BL-CART-010
status: active
tags: [cart, tax]
audited:
  date: 2026-05-02
  source: live
  ref: acme-qa/run-2026-05-02/CART-030
quotes: |
  The cart summary hides the tax row entirely until a shipping address is supplied.
---

A store-default tax jurisdiction produces an ESTIMATED tax line before any address is
entered. The quoted platform wording is deliberately stale in this fixture: the
platform entry now says something else, so drift-check must report `changed`.
