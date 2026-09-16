# Conditions

What is true of the setup when the arms start. **No prediction and no expected outcome appears on
this page** — those are sealed as a hash, outside both repositories, and published beside the result.

## The corpus, frozen

`VirtoCommerce/vc-knowledge` at commit **`7b66ecb`** — **590 derived + 74 captured (65 active) + 3
flows**. `kb validate` green. The demand loop has no open questions.

**Nothing has been written to the base since 2026-09-14, and nothing will be written between the
arms.** Arm C may write freely, because it runs last.

**One thing I deliberately did not do.** Verifying the shipping value below amounted to an
independent second observation of `KB-6AA0D7FB`, which would ordinarily earn a `kb confirm` and
raise that entry from single-observation to confirmed. `KB-6AA0D7FB` is the entry item **S4** scores.
Raising its trust hours before sealing — however honest the observation — is exactly the kind of act
that makes a result impossible to defend, so the confirm waits until the arms are done. The
observation is recorded here instead.

## What the base holds about this task

Measured by probing a COPY of the corpus, not by recollection:

| entry | plane | what it is |
|---|---|---|
| `KB-EB228603` | flow, confirmed | create a percentage-off promotion and see it apply on the storefront |
| `KB-AFB2D3C5` | flow, confirmed | an order placed on the storefront and read back in Admin — six steps, four amendments |
| `KB-6AA0D7FB` | experiential, single-observation | why every delivery option costs 0.00; cited from inside the flow above |
| `KB-D992AF44` | experiential, confirmed | an order's discount row is a snapshot, not a live reference |
| `KB-23769765` | derived | `OrderPaymentMethodType` |

**The base holds the recipe, not hints.** That is stated here, in the ticket, and on the result page,
rather than left for a reader to discover.

**Tax:** nothing in the corpus explains how tax is CALCULATED. That is narrower than what this page
first claimed — *"a MISS under every phrasing tried"* was three phrasings, not every phrasing. Arm C
asked about shipping and tax in one sentence and was served `KB-A646D086`, which sits on a
`taxProvider=none` scope axis and answers what a missing tax provider does to an order's discount
fields. Corrected here rather than quietly: generalising from three probes is the same mistake this
corpus's known retrieval gap is made of.

**One known retrieval gap sits on item S4.** `"why is the delivery option price zero"` returns
`KB-6AA0D7FB` at rank 1; `"what does shipping cost on this deployment"` MISSES. Same entry, same
corpus. Each arm's exact wording is recorded for that reason.

## The deployment

`vcptcore_stable`, platform 3.1007.26, pin `c2f9c438eba4cd95`.

**Checked today, 2026-09-15, against the oracle's one pre-set expected value:**

    GET /api/platform/settings/VirtoCommerce.Shipping.FixedRateShippingMethod.Ground.Rate
      value=null  defaultValue=0   -> effective 0
    GET /api/platform/settings/VirtoCommerce.Shipping.FixedRateShippingMethod.Air.Rate
      value=null  defaultValue=0   -> effective 0

So **shipping 0.00 holds** and the oracle stands as written.

Two earlier readings of this were **vacuous and were discarded**: `/api/stores/{id}` carries no
`shippingMethods` key at all, and `GET /api/shipping` returns the registry entries with
`settings: null`. Both produced an empty loop and a reassuring "no rate configured" that was
evidence of nothing. An empty read is not a negative result, and the third query is the first one
that actually asked the question.

### Residue a reader should know about

* Orders `CO260913-00001` … `CO260915-00001`, all **Cancelled**. Orders cannot be deleted here.
  Shipments remain `New` after a cancel — four of them now, arm B's included.
* **Four older orders are still `New`**, not cancelled: `CO260809-00002`, `CO260909-00001`,
  `CO260909-00002`, `CO260910-00001`. They predate this comparison and belong to nobody in it.
  This page previously listed only the residue from runs 07–12 and implied everything was
  cancelled; it was not, and an incomplete residue list is worse than none because a reader stops
  looking.
* **Nineteen shopping carts exist on `B2B-store`, ten of them holding items** — all either
  anonymous sessions or other people's accounts (`Agent Vcst5705`, `Elena Mutykova`). **The
  shopper's own cart is empty**, checked over REST rather than taken from arm B's report, which is
  the only claim that matters for an arm about to build one.
* **Five disabled `KB-LAB` promotions**, from runs 09, 10, 12, an earlier one, and arm B's own. **No arm may touch any of them**, its own included, once it has finished. Run
  12's still describes itself as 10% while its reward is 20%; that mismatch is deliberate evidence
  and is not to be fixed.
* **One permanent product configuration** from run 11, neutralised to `isActive: false,
  sections: []`. Nothing on this platform can delete a configuration.
* An undeletable contact from run 05.

## The arms

| arm | working directory | context | base | order |
|---|---|---|---|---|
| **B** | `C:/_VIRTO/vc-mcp-testing-module` | skills, `.claude/knowledge/`, CLAUDE.md | no | first |
| **A** | `C:/_VIRTO/_arena` | none | no | second, if time allows |
| **C** | `C:/_VIRTO/_arena` | none | **yes** | **last** |

**Sequential, never parallel** — promotions are global on this deployment, so two arms at once would
apply each other's discounts to each other's carts.

**C last**, on the residue the others leave, so nobody can say it had the clean stand.

**No call budget.** Removed after arm B finished at 149 of a 150 cap — one call short of binding. Cost-to-completion is the measurement, and a cap that nearly binds compresses the arms towards it instead of separating them. `VC_MEASURE_CAP` is 600, a runaway stop that annotates the log; no arm is told a number.

### The arena

`C:/_VIRTO/_arena` holds `.mcp.json` (one browser server), `.env` (URLs, store id, the sign-in
literal), and a `.claude/settings.json` that contains **the instrument and nothing else** — one
`PostToolUse` logging hook, the runaway stop, and for arm C the one variable that IS the treatment,
`KB_BASE`. **No `CLAUDE.md`, no skills, no rules, no knowledge directory, not a git repository.**
Emptied of artifacts between arms.

The per-arm settings files are committed beside this page in `arena-settings/`, so the only
difference between arm A and arm C is visible as a diff: one environment variable.

**All three arms are counted by the same build of the counter** —
`vc-kb-lab/vendor/agent-log/tool-log.mjs`, the copy runs 07–12 used and the one the port carries.
The QA repository was already wired to a DIFFERENT copy under `_kb-work/instrument/`, which has
since diverged; it was repointed for arm B. Two arms counted by two builds of the counter are not
comparable, and that was worth catching before the first arm rather than after the third.

No secret is in that directory. The browser runs with `--secrets`, so an arm types the NAME
`IMPERSONATION_ADMIN_PASSWORD` and never sees a value.

### Arm B runs before `qa-investigate` learns about the base

VCST-5963 teaches that skill to consult the base. Once it does, an arm without a base is neither a
clean B nor the shipped configuration — it is "the repository with a broken base". So the
measurement runs ahead of the construction, deliberately.

## Arm B's first attempt was aborted, and why

The first launch of arm B was stopped after about **20 tool calls, with nothing created or changed
on the deployment**. It found two defects, both in the apparatus rather than in the task:

**The brief named one identity and the task needs two.** `agent-test-impersonator` is a company
administrator of its organization, **scoped to the storefront**. It cannot open the Marketing module
and it cannot open an order in Admin — so "create a percentage-off promotion yourself" and "verify
on the Admin order blade" were not reachable with the account the brief gave. The platform
administrator credentials existed in the environment the whole time; I simply failed to put them in
the brief. Both identities are now named, as secret NAMES rather than literals, so nothing sensitive
sits in a public file.

**No browser permissions.** The twelve measured runs ran with an explicit allow-list of fourteen
Playwright tools. Neither the QA repository nor the arena had it, so the sign-in submit was refused
by the auto-mode classifier as credential exploration. All three arms now carry the identical
fourteen. `browser_network_request` (singular) stays deliberately absent — it returned a sign-in POST
body in plaintext during run 02.

**The seal is unaffected.** It covers the PREDICTIONS, which are about outcomes and are unchanged.
A task that cannot be performed as written has to be fixed or the comparison measures nothing; the
fix is recorded here, applies identically to every arm, and no arm has produced a gradable result
yet.

This is prediction **P16** — that the first arm would find something wanting in the apparatus rather
than me — arriving on the twentieth tool call. Six of the seven instrument fixes across the previous
twelve runs came from a run rather than from its author, and budgeting for that is the reason the
prediction was written down instead of being a surprise.

## What is not being changed for this comparison

No code in the base or the tool. No entry retired, corrected, re-anchored or confirmed. No catalog
or pricing data. No promotion that existed before an arm arrived.
