# Run 08 — the task

Read `RUN-BRIEF-unprompted.md` first. This page is the work.

## The task

**Place one order on `vcptcore_stable` containing two different products, then establish in the
Admin what the order's SHIPMENT carries — field by field — and what the storefront never showed.**

A shipment is created alongside the order and run 07 left one behind in state `New` without ever
looking at it. Nothing in the base describes it.

* **what a shipment is, as a record.** Does one order get one shipment or many? What identifies it
  — run 07's was numbered `SH260913-00001`, which looks like the order's own numbering scheme with
  a different prefix. Is it?
* **which line items it carries**, and whether a shipment line item is the same shape as an order
  line item or a third shape again. Quantity, price, the product link — say which fields exist and
  which of them repeat what the order already holds.
* **the delivery address and the method.** The order carries a shipping address and a chosen
  delivery method. Does the shipment carry its own copy, a reference, or neither? If a copy — can
  the two disagree?
* **the money.** Does a shipment carry a price, and does it equal the order's shipping total?
* **the states.** `New` is where run 07's stopped. What else can a shipment be, and what moves it —
  is there a control in Admin, or is it only a background process?
* **what the storefront shows of it.** `/account/orders/{id}` renders the order. Does it render the
  shipment, and does it agree with Admin?

Report what each field holds, and every place the two surfaces disagree.

## Where to work

Storefront signed in as described in the brief; the Admin SPA for the verification half. The
account the brief names already belongs to an organization with a usable shipping address.

**If checkout needs a payment method that cannot be completed here**, say so and get an order by
whatever route the deployment does allow.

## What this is deliberately not

Not a repeat of run 07. The order's own fields — line item money, `productType`, configuration
shape — are covered by six entries already in the base. If one of them is wrong, say so and
`kb dispute` it; otherwise do not re-derive them.

Not a fulfilment exercise. Whether a shipment can be driven to `Sent` is worth knowing; making it
happen on a live store is not the task.

## Scope — this run may place orders

**You may place orders.** **An order cannot be deleted.** Cancel what you place, and say in your
report what remains and in what state. Do not touch an order or a shipment you did not create.

Keep quantities at one or two. Do not modify catalog, pricing or promotion data, do not touch
another organization, and do not create or delete member accounts — runs 04 and 05 left one behind
that nothing can remove.
