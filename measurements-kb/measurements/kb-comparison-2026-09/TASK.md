# The task

**This page is identical for every arm.** Nothing here says anything about a knowledge base, a
repository or a comparison; what each arm has around it is the only thing that differs, and that is
set outside this file.

## What to do

You are working on a Virto Commerce B2B deployment as a signed-in customer.

**Place one order, then prove it is correct.**

The order must contain **at least three distinct products**, with a quantity greater than one on at
least one line, and it must be placed under a **percentage-off promotion that you create yourself
and that is active at the time of placement**.

Then verify the placed order. For each item below, state the value **and where you read it**:

1. the order number and its status
2. every line: product, quantity, unit price, line total
3. the discount — which promotion applied, and the exact amount
4. the shipping cost, **and why it is that amount**
5. the tax, and why it is that amount
6. the payment method the order records
7. the grand total, shown to add up from the parts above

The order must read the same on **all three surfaces**: the storefront order page, the Admin order
blade, and the REST API. Where two surfaces disagree, **say so** — a disagreement is a finding, not
a failure to complete the task.

## The deployment

| | |
|---|---|
| storefront | `https://vcptcore-stable-storefront.govirto.com` |
| Admin / platform / REST | `https://vcptcore-stable.govirto.com` |
| store | `B2B-store` |

**There are TWO identities and you will need both.** They are different accounts with different
scopes, and neither can do the other's half of this task:

| for | username | password |
|---|---|---|
| **shopping** — the storefront, the cart, placing the order | `agent-test-impersonator@virtoworks.com` | secret name `IMPERSONATION_ADMIN_PASSWORD` |
| **Admin and REST** — the Marketing module, the order blade, the API | secret name `ADMIN` | secret name `ADMIN_PASSWORD` |

The storefront account is a **company administrator of its organization, scoped to the storefront**.
It has no platform permissions: it cannot open the Marketing module and it cannot open an order in
Admin. The second identity is the platform administrator and is what those parts of the task need.

**No password is written down anywhere and you must not ask for one.** The browser is started with a
secrets file: type the secret NAME into the field and the value is substituted for you. That is true
of the admin USERNAME as well — type `ADMIN`, not a literal. You will never see any of these values,
and none of them may appear in anything you write.

The storefront account's organization already has a shipping address.

## Scope

* **Work until the task is done.** There is no call budget — how much it costs to finish is part of
  what this is for. Do not ration, and do not stop early because it is taking a while.
* **You may create ONE promotion**, and edit or disable the one you created. Name it so it is
  obviously yours and obviously disposable.
* **Do not touch any promotion that existed before you arrived.** Several are deliberately left
  disabled by earlier work, and none of them is yours.
* **One order.** An order cannot be deleted on this platform — cancel what you place.
* Do not modify catalog or pricing data. Do not create or delete member accounts.

## When you are done

Empty your cart, cancel your order, and leave your promotion **disabled, not deleted**.

Then write a report that answers the seven items, names the surface each value was read from, and
states plainly anything you could not establish. **An item you could not settle is an honest
"unknown", never a plausible guess** — a wrong confident answer is worse here than a gap.

Scratch files and screenshots go in the working directory, not in the repository root.
