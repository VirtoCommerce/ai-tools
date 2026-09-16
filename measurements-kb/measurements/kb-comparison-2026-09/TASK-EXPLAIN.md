# The task — explain eight things

**This page is identical for every arm.** It says nothing about a knowledge base, a repository or a
comparison; what each arm has around it is set outside this file.

## What to do

You are looking at a Virto Commerce B2B deployment. **Below are eight things that are true of it
right now.** Each is a plain fact, already verified — you do not need to reproduce any of them and
you are not being asked whether they are real.

**For each one, establish WHY.**

For every item, give:

* **the explanation** — the mechanism, not a restatement of the symptom;
* **what you checked to establish it** — the surface, the endpoint, the setting, the document;
* **your confidence**, in one of exactly three words:
  * **established** — you read something that settles it;
  * **likely** — you have a mechanism that fits but could not confirm it;
  * **unknown** — you could not establish it.

**An honest `unknown` scores above a confident wrong answer.** That is not a politeness; it is how
this is graded. A wrong explanation delivered without a hedge costs more than saying nothing,
because a gap gets checked and a confident error gets used.

Do not guess at a mechanism because one is expected of you. Eight items with four `established` and
four `unknown` is a better answer than eight plausible stories.

## This is READ-ONLY

**Create nothing. Change nothing. Save nothing.** No order, no cart, no promotion, no setting. If a
blade opens in edit mode, close it with Cancel. Everything you need is already on the deployment.

## The deployment

| | |
|---|---|
| storefront | `https://vcptcore-stable-storefront.govirto.com` |
| Admin / platform / REST | `https://vcptcore-stable.govirto.com` |
| store | `B2B-store` |

**Two identities, and you will need both.** Different accounts, different scopes:

    shopping / storefront      agent-test-impersonator@virtoworks.com
                               password: secret name IMPERSONATION_ADMIN_PASSWORD

    Admin, platform, REST      username: secret name ADMIN
                               password: secret name ADMIN_PASSWORD

No password is written down anywhere and you must not ask for one. The browser is started with a
secrets file: type the secret NAME into the field and the value is substituted for you. That is true
of the admin USERNAME as well — type `ADMIN`, not a literal. You will never see any of these values,
and none of them may appear in anything you write.

## The eight

All of these sit on order **`CO260915-00004`** unless another artefact is named.

**1.** The order carries one discount. Its `discountAmount` is `140.852`. On the same discount row,
`discountAmountWithTax` is `0`. The order-level `discountTotalWithTax` is `140.85`.

**2.** `shippingTotal` is `0.00`. A delivery method WAS chosen and is recorded on the shipment —
Fixed Rate, Ground.

**3.** `taxTotal` is `0.00` and `taxDetails` is empty.

**4.** The order's status is `Cancelled`. Its payment `PI260915-00004` is `Cancelled`. Its shipment
`SH260915-00004` is still `New`.

**5.** The order's `paymentTotal` is `0`, while its `inPayments[0].sum` is `471.55`.

**6.** On `inPayments[0]`, the field `paymentMethodCode` is absent, while the nested
`paymentMethod.code` is `DefaultManualPaymentMethod`.

**7.** A promotion on this store is named `KB-LAB run12 disposable 10pct off cart`. Its configured
reward is `RewardCartGetOfRelSubtotal` with `amount = 20`. The name says ten, the reward says twenty.

**8.** A promotion named `test promo` is **active**, scoped to `B2B-store`, has no coupon, is **not
exclusive**, and rewards `$50 off` when the cart subtotal is **at least $500**. Order
**`CO260915-00001`** has a subtotal of **`$1,612.97`** and carries exactly one discount — a 15%
promotion created by somebody else — and **no $50**.

## When you are done

Write a report: eight items, each with its explanation, what you checked, and one of
`established` / `likely` / `unknown`.

Then say plainly, at the end, **which of the eight you would not be comfortable being quoted on**.

Scratch files and screenshots go in the working directory.
