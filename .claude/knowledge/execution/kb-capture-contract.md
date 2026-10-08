# The `kb` write contract — what a capture must carry, and where each value comes from

The single statement of what `kb_capture` (and `kb_confirm` / `kb_dispute`) accept. Prompts carry a
one-line trigger and cite this file; they never restate it. *When* to write is
[`CLAUDE.md`](../../../CLAUDE.md) §Essential Rules → *Product context*; *where the write step sits in
a component* is [`../agents/authoring-standard.md`](../agents/authoring-standard.md) §5. The gate
itself is code — `anchorProblems()` in [`scripts/kb/core/coordinates.mjs`](../../../scripts/kb/core/coordinates.mjs)
and `captureRepaired()` in [`scripts/kb/core/verbs.mjs`](../../../scripts/kb/core/verbs.mjs) — and
where this file and the code disagree, the code is right and this file is the bug.

## Why it is written down (VCST-6156)

Roughly three captures in ten were turned away at the door, before and after the MCP-first switch
(VCST-6146): 40 of 131 attempts on 2026-09-30 .. 10-03, 19 of 65 on 10-02 .. 10-06. After VCST-6102
every remaining refusal was the same kind — an anchor written as a **label from the screen** (a button,
a field name) instead of a **coordinate**. Agents learned the contract only from the refusal, after
composing the entry, and the CLI door has no schema to teach it at all.

**The gate stays strict.** The anchor is the dedup key (anchors + scope + claim,
[`scripts/kb/core/identity.mjs`](../../../scripts/kb/core/identity.mjs)): a free-text anchor would let the
same fact in twice. Under the verdict ranker (VCST-6122) the anchor no longer drives *retrieval* — the
question, the claim and the entry's retrieval card do — so a precise question and claim matter as much
as a precise anchor.

## Door: MCP first

Write through `mcp__kb__kb_capture` / `kb_confirm` / `kb_dispute` (deferred — load them with the
`ToolSearch` line in *Product context*). The tool schema names every required field, and the call
carries the tool-use id that says which agent wrote. `npm run kb -- capture …` is the fallback when the
`kb` server is not connected; under Git Bash prefix it with `MSYS_NO_PATHCONV=1`, or a leading `/` is
rewritten into a Windows path (repaired since VCST-6102, but only when the rewrite is exact).

## The fields

| Field | What it is | Where the value comes from |
|---|---|---|
| `subject` | one line naming the behaviour | you — a statement, not a question; it is the entry's title |
| `question` | the question this entry answers | you — word it the way the next agent would ask it, coordinate included |
| `claim` | what you observed, as a statement | you — **button labels, field names and menu paths go here**, never in an anchor |
| `anchors` | ≥ 1 coordinate the behaviour lives at | the table below |
| `scope` | ≥ 1 `axis=value` | `surface=<value>` from `SURFACES` in [`scripts/kb/core/index-load.mjs`](../../../scripts/kb/core/index-load.mjs); an item without `=` is dropped silently, so `surface storefront` ends in a refusal |
| `deployment` | the stand you observed it on | **the stand's name as the base already spells it** — the `on <stand>` of an evidence line that `kb_ask` / `kb_show` printed for that stand (`vcst_qa`, `vcptcore_stable`). **Never the bare `TEST_ENV` value:** `vcst` is not `vcst_qa`, and the base never maps one onto the other (`stand()` in `verbs.mjs`, header). No hit on that stand ⇒ the first label of the `BACK_URL` host with `-` as `_` (`vcst-qa.govirto.com` → `vcst_qa`) |
| `method` | how you established it | optional; `observation` (the default) is the only value the tool description admits — see §Open decision |

`confirm` and `dispute` need the entry `id` and `deployment` (`dispute` also `saw`). A superseded id
is refused with the ids of its successors — confirm or dispute the one you actually observed. An entry
this session has not opened (`kb_show`, or an answer that printed its body) is refused with the command
that opens it (VCST-6191): a list line is not the entry, and its caveats sit below it.

## Anchors — accepted forms

| Form | Example |
|---|---|
| a route with two or more segments | `/account/orders` |
| a one-segment page the base does not use as a namespace | `/cart` |
| an endpoint, verb optional | `POST /api/carts` |
| a GraphQL operation or a dotted type | `Mutation.changeQuoteItemQuantity`, `Query.products` |

Already normalised for you, so not a reason to retype: a full URL or a `{FRONT_URL}/` / `BACK_URL/`
prefix (the path is kept), a query string or `#fragment` (dropped), an id segment (`/orders/<id>`,
`{cartId}`, `:id` are one parameter).

**Refused — and where it goes instead:**

| You wrote | Refusal kind | Write instead |
|---|---|---|
| a button label, field name or dialog title (`Add to cart`, `Payment method`) | `unstructured` | the route of the page it was on as the anchor; the label goes in `claim` |
| a bare or one-segment namespace (`/api`, `/account`) | `unstructured` | the full route or endpoint you hit |
| an Admin SPA menu path (`Orders > Returns`) | `menu-path` | the REST call the blade made (HAR / Network); the path goes in `claim` |
| a Windows path (`C:/Program Files/Git/cart`) | `local-path` | the route as typed, with `MSYS_NO_PATHCONV=1` or through MCP |

## Observation → anchor

| What you observed | Anchor |
|---|---|
| a storefront page | the route from the address bar |
| a button, control, dialog or message on a page | that page's route; the label in `claim` |
| an Admin SPA blade | the REST call it sent (HAR / Network) |
| storefront GraphQL behaviour | `Query.x` / `Mutation.y` |
| a REST behaviour | `VERB /api/…` |
| a fact established from source code | a fully qualified dotted type name — but see §Open decision |

A behaviour that spans two coordinates (a UI action and the mutation it sends) carries both.

## On a refusal

The refusal prints, per rejected anchor, a `fix:` line; for a missing field, where its value comes
from; and any coordinate your own subject / question / claim already names. Fix the payload, retry
**once** with the same `subject`. Scripted work that writes in batches checks each payload first with
`npm run kb -- capture … --dry-run`, which runs every check and logs and queues nothing. A refused capture is never abandoned: the fact you held is lost with it. Keep the `subject`: a
same-subject retry is the only one `kb:report` pairs with its refusal exactly; a reworded one is
matched only heuristically, by the ask both followed, and still counts as abandoned in the strict
number.

## At the end of a turn

Every `ambiguous` list ends in a `kb_show` pick or a `kb_none`. A miss that nothing was written back
after — or a list left unclosed — is raised once, at the end of the turn, by the `kb-remind` Stop hook
([`../../hooks/kb-remind.mjs`](../../hooks/kb-remind.mjs)): capture what you established, or say in one
line that you did not establish it. `KB_REMIND=0` turns the hook off on a machine.

## Open decision — `method: source`

A dotted type name passes the anchor check, so a fact read from source code can be written today, but
the `kb_capture` description asks for something verified on a live deployment, and `method` is free
text that nothing validates or weighs. Decided 2026-10-06: source facts will be admitted as their own,
labelled kind of evidence — tracked in VCST-6186. Until that ships, **capture only what you observed live**;
a source-only fact goes in your own output, not the base.
