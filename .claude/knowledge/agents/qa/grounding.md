# Grounding product claims — VirtoOZ, module docs, the observed-behaviour base

Part of the QA team framework. The always-loaded core is [`shared-instructions.md`](shared-instructions.md); this file holds detail read before you WRITE a claim about how the platform or the storefront behaves (a case, a verdict, a bug report, a knowledge file).

## Product behaviour — ask VirtoOZ, never guess (MANDATORY, every agent, every run)

Applies to any question of how the platform or the storefront is **supposed** to behave. Grounding order:

1. **This repo's knowledge first** — the domain map (`knowledge/domain/<slug>.md`), the oracles (`BL-*`, `ECL-*`), `.claude/ROUTING.md` §Knowledge bases. Free, already triangulated, and often already carrying the verbatim doc quote.
2. **VirtoOZ next** — through the connector, the narrowest topic-scoped tool. Which source answers which question (the release ledger first for *what shipped*), the topic→tool table and the Context7 fallback: [`../../execution/doc-sources.md`](../../execution/doc-sources.md).
3. **The module repo's own docs next** — `README.md` + `docs/` of the `vc-module-*` repo, at the deployed version's tag (§Module repo docs below). Mandatory when VirtoOZ is thin or silent on the module, and for a NEW feature.
4. **Live / source last** — what the environment actually does.

**That order is for what the platform SHOULD do. For what it DOES, `kb_ask` comes before step 3 and before grepping an oracle** — it is the banked result of a live check somebody already ran, on a named deployment, with a trust count (`npm run kb -- ask "<q>"` when the MCP server is not bound yet; it needs no server). **Put the coordinate in the question** — endpoint, GraphQL operation, page path. **A list is not an answer: close each list by its handle (`kb_show`/`kb_none`)** (`CLAUDE.md` *Product context*). **It fires on the coordinates, not on a suspicion:** every page path, GraphQL operation and endpoint the task's input names — suite CSV, ticket, diff — is a question, asked before its first live check, *including while you execute prescribed steps*, which is where most observations are made and where a "do I know this?" trigger never fires ([`../authoring-standard.md`](../authoring-standard.md) §5.1). Exit 1 = nobody wrote it down: find out, then `kb_capture` — anchor = the route or request, never a label; fields and their sources: [`../../execution/kb-capture-contract.md`](../../execution/kb-capture-contract.md). **Contradicts an entry ⇒ `kb_dispute`, matches ⇒ `kb_confirm`** — capturing it again instead gives the base two answers to one question. The base is PUBLIC. Full rule and why: [`CLAUDE.md`](../../../../CLAUDE.md) §Essential Rules → *Product context*.

**Never substitute memory, a plausible inference, or "the code looked like it" for documented behaviour.** A doc claim carried into a report, a case or a verdict is a **verbatim quote with its URL**, or it is not evidence. A PASS, a bug or an assertion built on a guessed product rule is wrong in the one direction nobody re-checks — it reads as confident.

Docs are ONE source: a `BL-*`/`ECL-*` promotion still needs its 3-source bar (docs + live + source), and **live behaviour that contradicts the docs is a FINDING** — live wins for this run, report the divergence, never silently route around it.

**Close the loop.** Anything you had to ask VirtoOZ that this repo should already have known goes back into the right knowledge file per `.claude/ROUTING.md` read-before-you-write rules — and if there is no domain map for what you tested, say so in your report and ask the orchestrator to run `/qa-domain-map <slug>`. Never author a map inline mid-run.

**Which source is authoritative depends on the feature's MATURITY — and a missing doc is itself a result:**

| The feature is… | Authoritative source | When it isn't there |
|---|---|---|
| **Released / existing** | VirtoOZ **+** this repo's domain maps and oracles — provenance `{DOC}` / `{BL}` | **A released feature VirtoOZ does not document, or documents wrongly, is a FINDING** — a doc gap / doc drift, reported with the verbatim quote + URL beside the live observation. Then fall through to source + live for this run. **Never read documentation silence as "no requirement"** |
| **New / unreleased** | the ticket's AC `{SPEC}` + the module's `README.md`/`docs/` `{DOC}` + source + **live on the deployed build** `{OBSERVED}` | there is no VirtoOZ page yet and often no source snapshot — live is the primary ground truth, and the assertion is confirmed live before promotion (§5 below, Dimension 10 / `GRD-*`) |

Doc drift is normal here and is measured, not hypothetical: `knowledge/domain/sales-rep.md` §D1 (the published API reference lists 13 queries + 1 mutation; live introspection returns 21 + 2) and §D10 (the guide claims store scoping the live schema does not enforce). So **a VirtoOZ answer for a released feature is triangulated against live, never substituted for it** — and when they disagree, both go in the report.

### Module repo docs — README.md + docs/

Every `vc-module-*` repo (and `vc-platform`, `vc-frontend`) carries its own developer documentation: the
root `README.md` and, where the repo has one, a `docs/` folder. They often state what VirtoOZ does not —
settings and their defaults, the GraphQL/REST surface, limits, per-instance vs shared state — and for a NEW
module they are often the only written description (punchout: `knowledge/domain/punchout.md`; the MFA
wrong-code cap being per platform instance: `knowledge/domain/auth.md` D23).

- **When:** after VirtoOZ, before live/source, for every module the task touches. Mandatory when VirtoOZ is
  thin or silent on that module, and for a NEW feature.
- **How:** GitHub MCP `get_file_contents` (`owner: VirtoCommerce`, the module's repo, `README.md`, then the
  `docs/` listing), or `gh api repos/VirtoCommerce/<repo>/contents/<path>?ref=<tag>`. A vc-fix developer
  reads them straight from its `.fix-workspace/<repo>/` checkout.
- **Which version:** the tag equal to the module `version` the stand reports
  (`GET {{BACK_URL}}/api/platform/modules`), never `dev` — `dev` can describe what is not deployed yet.
  Documented on `dev` but absent from the deployed build is `NOT_DEPLOYED`, never a bug.
- **Provenance:** a README claim is `{DOC}`, quoted verbatim with the file URL at that tag
  (`https://github.com/VirtoCommerce/<repo>/blob/<tag>/README.md`). The split below binds it too: mechanism
  yes, exact UI strings and counts no.
- **It is written next to the code and drifts with it** — the punchout README called OrderRequest "coming
  soon" while the deployed build shipped it (`punchout.md` D1). README vs VirtoOZ, or README vs live,
  disagreeing is a **finding**: both quotes go in the report beside the observation, never pick one
  silently. A released behaviour the README documents and VirtoOZ does not is a VirtoOZ doc gap.
- **Close the loop** as for VirtoOZ: what the README told you that this repo should have known goes into
  the domain map or oracle per `.claude/ROUTING.md`, with the README URL as its source. A **client**
  module's README is client material — it never goes into the public `kb`.

### What VirtoOZ is authoritative FOR — split the CLAIM, not the source

The rule above says docs and live are triangulated. This one says **which half of a doc page to lean on**,
because the two fail at very different rates:

| Claim type | Authoritative source | Tag |
|---|---|---|
| Mechanism, gating, semantics, what-causes-what, required-vs-optional, lifecycle | VirtoOZ | `{DOC}` |
| **Exact UI strings, control types (field vs dropdown vs toggle), layout, counts, ordering** | **live observation only** | `{OBSERVED}` |

**A user guide is prose written for humans about what the product does. It paraphrases labels by design**
— "click **Fixed points**" reads better than the real control, `Earn fixed amount of points per order`. It
is not a UI string table and never tried to be. So a label, a widget type or an on-screen count carried
into a case as `{DOC}` is a paraphrase promoted to a specification.

**A documented rule binds to the SURFACE the doc names, and nowhere else.** Carrying it to a sibling field,
column or blade is extrapolation wearing a citation's clothes — it manufactures a `{DOC}` tag on a claim no
document makes, which is strictly worse than an honest `{HYPOTHESIS}`. The enforceable test, and the
corollary to the verbatim-quote rule above: **if you cannot paste the sentence stating THIS claim about THIS
surface, it is not `{DOC}`.** A quote about a neighbouring surface is not a quote about yours.

**Docs contradicting an existing case, suite or knowledge file is a trigger to OBSERVE — never a licence to
overwrite.** The artifact may be the only source in the room written from the screen. Cheap tell: when the
older artifact is *more specific* than the doc, specificity usually means someone transcribed rather than
paraphrased, and the artifact wins until live says otherwise.

**Why this earns a rule rather than a code review:** it fails silently and INVERTED. A wrong label does not
break the run — it makes a **correct product fail the test**, so the cost lands on whoever triages the
phantom failure, not on whoever authored it. That is the GOLDEN RULE's transcribed-constant failure mode
(`.claude/rules/test-data.md`), reached from a different direction, and it spreads the same way: by the next
author copying neighbouring style.

Measured 2026-09-17 (VCST-5959, suite `075-loyalty` re-author, platform 3.1071.0-pr-3108). A doc-first
rewrite replaced two live-correct reward labels with the guide's shorthand (`'Fixed points'`, which exists
nowhere in the UI), restated a searchable dropdown as a typed field, and transferred the Product-factors
negative-value rejection onto an Order-loyalty reward value — where live showed `-5.00` is accepted, saved
and read back unchanged. All three shipped past a green linter; only `--verify` caught them, and the
pre-rewrite file had two of the three right.
