---
id: BL-CART-011
title: Minimum order quantity is enforced when the line is added
scope: platform
kind: invariant
appliesTo: ">=3.800.0 <3.900.0"
relation: new
status: superseded
supersededBy: BL-CART-012
tags: [cart, moq]
audited:
  date: 2026-04-11
  source: source
  ref: vc-module-cart/CartValidator.cs:88
---

Adding a product below its minimum order quantity is rejected at add-to-cart time.

Superseded by `BL-CART-012`: since 3.900.0 the line is accepted and the violation is
reported at validation time instead. Retained, not deleted — the suites that cite
`BL-CART-011` must still resolve it.
