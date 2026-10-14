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
| `deployment` | the stand you observed it on | one token: the stand's name or its `TEST_ENV` / host name — the door maps every alias onto the stand's one name, declared as `KB_STAND` in its `.env.<env>` profile (`scripts/kb/core/stands.mjs`). Prose is refused |
| `method` | how you established it | optional; `observation` (the default) — seen on a live stand — or `source` — read in code, not seen live (§Facts read from source code). Anything else is refused |
| `conditions` | what the stand was running and how it was set up | optional on `capture` / `confirm`, **expected on `dispute`** — §Conditions |
| `defect` / `fixedIn` | the behaviour should NOT happen, and since which build it no longer does | optional on `capture` / `confirm` — §Defects |

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
| a fact established from source code | a fully qualified dotted type name, with `method: source` (§Facts read from source code) |

A behaviour that spans two coordinates (a UI action and the mutation it sends) carries both.

## On a refusal

The refusal prints, per rejected anchor, a `fix:` line; for a missing field, where its value comes
from; and any coordinate your own subject / question / claim already names. Fix the payload, retry
**once** with the same `subject`. Scripted work that writes in batches checks each payload first with
`npm run kb -- capture … --dry-run`, which runs every check and logs and queues nothing. A refused capture is never abandoned: the fact you held is lost with it. Keep the `subject`: a
same-subject retry is the only one `kb:report` pairs with its refusal exactly; a reworded one is
matched only heuristically, by the ask both followed, and still counts as abandoned in the strict
number.

## Conditions

`conditions` is `key=value` pairs (`;`-separated in the CLI, one per item in the MCP list) naming
what the behaviour may depend on: the build (`platform`, `theme`, `module:<Id>`), and any
`setting:<Name>`, `store`, `role` or `state:<what>` that decides it. Only values you read on the
stand — the **deployed** build (`GET /api/platform/modules`, `npm run store:caps -- --settings`;
[`../../templates/agent-dispatch.md`](../../templates/agent-dispatch.md) §Build Verification), never the
git-declared one — and never a credential, a name or an email (the base is public). A malformed pair is
refused, never truncated: a cut value is a wrong condition. Why it exists: two observations of one
behaviour on one stand disagree most often because the build or a setting differed, and until this
field nothing recorded either (VCST-6179; `scripts/kb/core/conditions.mjs`, header).

**The build is read for you** (VCST-6221): every write through either door is stamped with the build of
the stand you named (`build: <pin>`, snapshot in the base under `builds/`), so `conditions` is for what
the machine cannot know — a setting, a store, a role, an entity state. A `kb_dispute` made on a different
build than every confirmation of the entry (over the modules the entry depends on) is recorded as a
**soft** dispute: the door says so, the judge still reviews it, and readers see *contested on another
build* instead of DISPUTED. Same build, or a build that could not be read, is an ordinary dispute
(`scripts/kb/core/gate.mjs`, header).

## Resolved disputes

A dispute flags an entry; only `/kb-judge` closes one, after a live investigation, through a reviewed
PR on the base. The resolution is written ON the contradicting evidence item (`resolved` = one of
`RESOLUTIONS` in [`scripts/kb/core/index-build.mjs`](../../../scripts/kb/core/index-build.mjs),
`resolvedAt`, `resolvedBy`, `resolvedIn`, `resolution`). A resolved dispute stays on the entry and
is printed with its verdict, but it no longer marks the entry DISPUTED. No agent tool writes it.
After a `claim-amended` verdict, confirmations of the OLD wording stay on the entry and stop counting
toward its trust: those made before the verdict, and those made of the old body later -- e.g. on
`main` while the judge's PR was in review. Each confirm / dispute records the hash of the body it was
made against (`bodyHash`: the body this session last opened with `kb_show` or an answering `kb_ask`,
else the body the base holds when it is recorded; push fills it in only for an older client),
and the verdict records the hash of the body it replaced (`amendedFrom`). Trust is then the judge's
investigation -- one per judging session -- plus confirmations of the NEW body
(`attestsCurrentClaim` / `supportOf` in the same file).

## At the end of a turn

Every `ambiguous` list ends in a `kb_show` pick or a `kb_none`. A miss that nothing was written back
after — or a list left unclosed — is raised once, at the end of the turn, by the `kb-remind` Stop hook
([`../../hooks/kb-remind.mjs`](../../hooks/kb-remind.mjs)): capture what you established, or say in one
line that you did not establish it. `KB_REMIND=0` turns the hook off on a machine.

## Facts read from source code

A fact you established by **reading code** — how a type is overridden, which handler a setting reaches,
what a validator rejects — is captured with `method: source` (VCST-6186). It is its own kind of evidence:

- **`deployment` is the code version you read**, `<repo or module>@<version or commit>`
  (`vc-platform@3.1078.0`, `VirtoCommerce.XCart@3.1041.0`, `vc-module-order@a1b2c3d`), never a stand: a
  source fact holds for a version, not for a deployment. Read the version from the tag or commit you
  actually checked out.
- **Readers are told.** `kb_ask` / `kb_show` print the item as *from source, not observed live*; an entry
  whose whole support is source is labelled so and never reaches *corroborated*, however many agents read
  the same code.
- **A live check upgrades it.** The first `kb_confirm` with `method: observation` on a live stand makes it
  an ordinary observed entry. A live `kb_dispute` is a finding — the code you read and the deployment
  disagree (often a version drift) — and is always a hard dispute: a source item has no build to compare.
- **Anchor** a source fact at the coordinate the behaviour is reached through (the endpoint, the GraphQL
  operation, the page) when there is one; a fully qualified dotted type name is accepted when there is
  not.

Observed it live as well? Then it is an observation: capture with the default method and say in the
claim what the code showed.

## Defects

The base records what the platform DOES. A behaviour that should not happen is still captured — how a
bug shows itself is what whoever fixes or tests it needs — but it carries a **defect marker**
(VCST-6317), or the next agent reads the bug as the expectation and writes a case that locks it in.

- **Check before you mark.** Behaviour that looks wrong is checked against the docs (VirtoOZ, `/vc-docs`)
  and the `BL-*` oracles first. They say it should not happen → mark it. They say nothing, or you only
  feel it is wrong → do not mark it; say what looked odd in the claim. An unexpected value that the docs
  explain (a setting, a by-design rule) is not a defect.
- **The values.** `defect`: a bug ticket (`VCST-1234`) or `suspected` (no ticket yet). `fixedIn`, once it
  is fixed: the first build without it, `<module>@<version>`, `platform@<version>` or `theme@<version>`.
  Anything else is refused.
- **Where it goes.** At capture, with the fact. On an existing entry, with `kb_confirm` (`--defect` in the
  CLI): you saw the behaviour, and it should not happen — a ticket filed later re-marks it the same way,
  `fixedIn` alone completes the marker it carries, and `defect: none` withdraws a marker that proved
  wrong. The claim never changes. A dispute carries no marker.
- **The judge.** A dispute that saw a marked defect fixed on a later build is `defect-fixed`
  (`/kb-judge`, `investigation.md` §4): the claim stays, the marker gains its `fixedIn`.
- **What readers see.** `kb_ask` / `kb_show` print `KNOWN DEFECT VCST-1234: observed behaviour, NOT
  expected; do not assert it` beside the trust label; with your stand named, a `fixedIn` is compared with
  your build. **An entry marked as a defect is never the source of an expected result** — the expectation
  comes from the docs or an oracle; the entry only shows that the bug reproduces
  ([`cases-that-catch-bugs.md`](cases-that-catch-bugs.md) §2).

The marker rides on the evidence item, not the entry's frontmatter, and the entry's marker is derived
from it — so a client older than VCST-6317 reads and pushes marked entries unchanged
(`scripts/kb/core/defect.mjs`, header).
