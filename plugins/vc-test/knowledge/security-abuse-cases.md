<!-- copy of .claude/skills/qa-test-design/security-abuse-cases.md — keep in step; the repository copy is canonical here -->
# Security Abuse Cases (SEC) — the trust-boundary walk

> Technique token `SEC` (`test-design-techniques.md` §0). Runs **after FLOW** (§1a), on the links FLOW
> named. Read when a feature's chain carries an identifier, a money-bearing value, free text, or an
> anonymous / token-bearing entry point — the trigger below decides, not a feeling that the feature
> "looks security-ish".

## Why a technique, and not a checklist section

Security checks existed before this file — a generic list (`qa-checklist` this repository's `domain-checklists.md` §28),
the authorization blocks of this repository's `graphql-checklist.md`, two input rows in `test-design-techniques.md` §2,
and the attacker heuristics of exploratory testing (this repository's `qa-sbtm/adversarial-heuristics.md` row **A**,
this repository's `qa-sbtm/modern-web-attack-surface.md` §1). None of them is *derived from the ticket*: a generic list
names no endpoint, no identifier and no actor of THIS feature, so nobody authors a case from it, and
the probes that would have found the defect live only in a session nobody ran.

A security defect also has the shape no positive-path design can reach: **it passes every happy-path
case by construction.** "Org A's buyer sees org A's order" tests nothing; only the refusal, issued at
the server with the attacker's own identity, discriminates. SEC is the procedure that makes those
refusals concrete per feature, and the rule that turns each one into a case.

## The trigger — derived from the FLOW chain

SEC is **REQUIRED** when any link of the chain (§1a) has at least one of:

| # | The link… | Example |
|---|---|---|
| T1 | selects an object by an identifier the client sends (URL, GraphQL variable, body) | `orderId`, `organizationId`, `memberId`, `cartId`, `quoteId` |
| T2 | carries a value the server should own or recompute — money, points, stock, status, owner | price, discount, quantity, currency, `customerId`, `storeId`, `roleIds` |
| T3 | persists free text that a **different** actor or surface later renders | address, comment, invite message, org name, product review, import file |
| T4 | is reachable anonymously, or through a token-bearing link | sign-in, registration, password reset, invite acceptance, payment return URL |
| T5 | is gated by a role or permission | anything Part 0r of the Test Model already covers |

None of T1–T5 holds ⇒ write one line in the model: `SEC: N/A — <which T fails and why>`. That line is
reviewable; silence is not.

## Derivation procedure

1. **Take FLOW's `sequenceDiagram`** (or draw one: SEC needs the layers). Mark every arrow where data
   crosses from a party the server must not trust — browser → API, anonymous → authenticated, one org
   → another, storefront → back office, email link → page, import file → platform.
2. **List each crossing as a row**: the operation's coordinate (endpoint, GraphQL operation name, page
   path), the legitimate actor, the identifiers it carries (T1), the server-owned values in it (T2), the
   free text it persists and *where that text is rendered later* (T3). Take argument names from
   (in this repository: `.claude/knowledge/api/graphql-schema.md`) or the module source — never from memory.
3. **Pick the probes each crossing NEEDS** — the four-question test in *When a case is necessary*
   below. A probe that fails it is simply not listed; there is no N/A bookkeeping per cell.
4. **Write one scenario per needed probe**, with the attacker identity, the tampered request, and the
   oracle triple (below).
5. **Priority** from `risk-prioritization-framework.md`: a SEC row on money, PII or the org boundary is P0/P1.

## When a case is necessary — the four questions

SEC is not a sweep of every operation with every probe. A probe on a crossing produces a case **only
when all four answers are yes**:

1. **Does the probe apply?** Its *Applies on* condition (table below) holds on this crossing — there is
   an identifier for `SEC-OBJ`, free text rendered elsewhere for `SEC-INJECT`, and so on.
2. **Did this ticket create or change the crossing?** A new operation, a new argument, a new
   identifier, a changed permission or a new rendering surface. An untouched operation is regression's
   business, not this ticket's — unless the diff changed the code that guards it.
3. **Is it not covered already?** No existing case runs this probe on this operation
   (this repository's `npm run tc:scope`, or search the suites' `References` for the probe id and the operation name).
   An existing case that covers it is cited in the model, not duplicated.
4. **Would a wrong answer cost something real?** Money, points or stock; another user's or org's data;
   PII; an account or role the caller should not get. A response that reveals a field which is public
   anyway costs nothing — no case.

All four yes ⇒ the case is **mandatory** (*Coverage rule*). Any no ⇒ no case, and the model says which
question failed for the crossing in one line, so a reviewer can disagree with it.

## The eight probes — a closed set

Each probe maps to one defect archetype (`vc-bug-catalog.md` §Defect archetypes), so
the model's archetype column says which shape the case hunts.

| Probe | Applies on | What the case does | Archetype |
|---|---|---|---|
| `SEC-IDENT` | every crossing that needs a signed-in user | Call the operation with **no token, an expired one, and one issued before sign-out / password change / lockout** | `SESSION` |
| `SEC-AUTHZ` | T5 | The role refusal set — **owned by Test Model §Part 0r** (four rules, `Not allowed` line, refusal at the server with that role's own token). SEC only checks the cell is filled; it adds no second copy | `SCOPE` |
| `SEC-OBJ` | T1 | Replace **every** identifier in the request, one at a time, with one the caller does not own: another user in the same org, another org, another store | `SCOPE` |
| `SEC-TAMPER` | T2 | Replay the request with a server-owned value changed: lower price, negative or fractional quantity, another currency, someone else's `customerId`, a role above the caller's, a status skip, an external `returnUrl` | `TAMPER` |
| `SEC-INJECT` | T3 | Persist a marker payload (script, HTML, CSV formula, query syntax) and **observe it on the surface where it is rendered later** — not on the form that accepted it (§1a rule: a link is crossed only by an observation on its far side) | `INJECT` |
| `SEC-EXPOSE` | every crossing that returns data | Read what the response, the error and the related objects carry beyond what the caller is entitled to; check that a refusal message does not reveal whether the object or account exists | `EXPOSE` |
| `SEC-REPEAT` | one-shot effects: coupon, invite, reset link, redemption, payment return | Use it twice, and fire it N times at once | `REPLAY` / `RACE` |
| `SEC-NAV` | T4, multi-step flows | Deep-link to a step that needs a prior step; open a token link after it was used, revoked or expired; follow a redirect parameter to an external host | `TAMPER` / `SESSION` |

**How to send the tampered request** — DevTools replay with a modified payload, header manipulation,
disabled-control and hidden-field bypass: this repository's `qa-sbtm/modern-web-attack-surface.md` §1.1–§1.4 (cite, do not
restate). In a runner case: `[GQL-OP]` with the attacker's token, per
(in this repository: `.claude/knowledge/api/graphql-test-cases-runner.md`).

**What these probes are not.** No load, no brute force, no attempt to degrade a stand: `SEC-REPEAT`'s
"N at once" is the small concurrent burst `RACE` already uses, and rate limiting is checked by a few
requests reading the response, never by flooding. Probes run on non-prod stands only.

## The oracle triple

A SEC case passes only when all three hold:

1. **Refused** — the operation is rejected *explicitly*: HTTP 401/403, or for GraphQL an `errors[]`
   entry with HTTP 200 (this repository's `graphql-checklist.md` §Authorization). A hidden or disabled control is not a
   refusal (§Part 0r rule 2); a `200` that quietly does nothing is `SILENT`, not a pass.
2. **Nothing persisted** — read the object back through a **privileged, independent path** (Admin API
   as admin) and assert it is unchanged. The attacker's own view cannot prove this.
3. **Nothing disclosed** — the response body, the error text and any nested object contain no field of
   the foreign object, and the refusal for "exists, not yours" reads the same as for "does not exist".

`SEC-INJECT`'s triple: the payload is **stored and rendered as text** on every rendering surface, no
script runs (watch the console for the marker), and an exported file does not evaluate it.

**Where the expectation comes from.** A `BL-*` rule or the ticket's AC, when one states it
(`{BL-…}` / `{SPEC}`). Where the product documents nothing about who may do what — ask VirtoOZ and
`kb_ask` first (this repository's `CLAUDE.md` §Product context) — the refusal is still the expectation: write it
`{SPEC}`, name the probe in `References`, and report the missing rule as a finding. **Never write the
observed behaviour as the expectation** (`qa-test-model` this repository's `test-model.md` rule 3): a SEC case that
matches a leaking build certifies the leak.

## Coverage rule — where a check is needed, a case is written

- **A probe that passes the four questions becomes an authored case.** Not a checklist item, not a
  note in a report, not "negative testing we can add later". The way out is a "no" to one of the four
  questions, stated per crossing — "no time" is not one of them.
- **A probe that fails them gets no case.** SEC exists to put cases where a security defect would
  matter, not to multiply refusals on every operation.
- **A case for a probe the build currently fails is still written**: it keeps the refusal as its
  expectation, names the bug, and stays `Draft` until the fix lands (this repository's `test-model.md` rule 3).
- **One probe, one case, one crossing.** `SEC-OBJ` on three identifiers is three cases — a single case
  swapping all three passes as soon as any one check refuses, and hides the two that do not.
- **FAST / strategy runs** turn the needed probes into checklist rows for the run (no cases are written
  in the run, D2); the cases are authored at this repository's `/qa-test-lifecycle`. The probe is closed only when its
  case exists.
- **Each case carries** `Technique:SEC` and `Archetype:<token>` in `References`, plus the probe id
  (`SEC-OBJ`, …), so the corpus can be asked which probes a feature has never had.

## Test data

The attacker and the victim are **two real fixtures** — two orgs, two users in one org, two stores —
resolved through `@td()`; a probe with only one identity cannot ask its question (`test-data.md`
§SECOND RULE: values on both sides of a distinction must differ). A missing second identity is
`FIXTURE-GAP` → this repository's `/qa-generate-data`, never an invented alias. Injection markers come from `random-data`
with the `AGENT-TEST-` prefix, so teardown removes them and the console marker is unique per run.

## Worked example — inviting a member to an organization

Chain (FLOW): maintainer opens `/company/members` → sends `inviteUser` → invite e-mail → invitee opens
the link → registers → becomes a member with the granted roles.

`InputInviteUserType` carries `storeId`, `organizationId`, `emails`, `message`, `roleIds`
(this repository's `graphql-schema.md`). The permission gate (`xapi:my_organization:user:invite`) is product-verified in
this repository's `test-model.md` §Part 0r. Suppose the ticket **adds the `message` field and the `roleIds` argument**;
the rest of the invite flow already exists. Crossings: **C1** `inviteUser` (browser → xAPI), **C2** invite
link → registration page.

| Crossing · probe | Q1 applies | Q2 changed | Q3 uncovered | Q4 costs | Case |
|---|---|---|---|---|---|
| C1 · `SEC-TAMPER` — `roleIds` with a role the inviter does not hold | yes | yes — new argument | yes | yes — privilege gain | **#1** (expectation `{HYPOTHESIS}` until VirtoOZ / source says what is allowed) |
| C1 · `SEC-INJECT` — marker payload in `message`, observed in the e-mail and the invite list | yes | yes — new field | yes | yes — script in another user's view | **#2** |
| C1 · `SEC-OBJ` — `organizationId` of another org | yes | no — argument unchanged | — | — | none: regression; cite the existing case if there is one, else note a regression gap |
| C1 · `SEC-AUTHZ` — member without the invite permission | yes | no — gate unchanged | — | — | none: §Part 0r already owns it |
| C1 · `SEC-EXPOSE` — `message` echoed back to the inviter | yes | yes | yes | no — the inviter wrote it | none |
| C2 · `SEC-REPEAT`, `SEC-NAV` — link reuse, expiry | yes | no — token handling unchanged | — | — | none |

Two cases, both of which matter, instead of a dozen re-checks of code this ticket did not touch. Had the
ticket introduced the invite flow itself, Q2 would be yes for every crossing, and C1 `SEC-OBJ`, C2
`SEC-REPEAT` and C2 `SEC-NAV` would become cases too.
