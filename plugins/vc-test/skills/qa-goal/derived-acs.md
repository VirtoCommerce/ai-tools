# Deriving the acceptance criteria (step 4), the strategy, and recording results (step 5)

A ticket that reaches `/vc-test:qa-goal` often has no acceptance criteria, or criteria that miss where the change
really lands. The run writes its own — each with a source a person can check at S2, and each able to fail on the
bug it targets.

## What a criterion is

**One observable behaviour, for one kind of user, on one surface** — what someone or something outside the code
can see: a response status and field, a page state, a tool list, a record in the back office.

| Not a criterion | A criterion |
|---|---|
| "The MCP integration works" | "An MCP client signed in as a buyer gets only the tools the buyer's permissions allow in `tools/list`" |
| "Tokens are validated" | "A token issued for another audience is refused by the MCP endpoint with 401" |
| "Refactor of the order service" | "An order created through the storefront carries the member's organisation id in the back office order list" |
| "Check the settings" | "With the store setting off, the storefront shows no 'request a quote' button on a product page" |

No implementation words ("the handler calls…"), no "works", "correctly", "properly". Two behaviours ⇒ two criteria.

## The file for `ac add`

`<dir>/in/ac-<n>.json`, then `node <plugin>/lib/goal.mjs ac add --dir <dir> --file <dir>/in/ac-<n>.json` → `{ id }`
(ids are assigned: `AC-1`, `AC-2`, …). Only these fields:

```json
{ "text": "<the behaviour>", "source": "<see below>", "addedAt": "contract|research|during-test", "addedReason": "<during-test only — omit otherwise>" }
```

**`source` is mandatory** and names where a person can check the criterion:

| `source` | When |
|---|---|
| `ticket` | the ticket's own AC field or description states it |
| `material:<ref>` | an attachment, a linked page or ticket, a design — `<ref>` as the bundle names it |
| `pr:<repo>#<n>` | a PR's body, diff or tests implies it (the bundle's PR claims, hidden behaviour) |
| `doc:<page>` | a documentation page states it (VirtoOZ, `/virtocommerce/vc-docs`, the module's `README.md`/`docs/`) |
| `observed` | only what the stand itself showed, for a behaviour no other source states — the weakest; say so at S2 |

A criterion no source supports is a question for the person at S2, not a criterion.

**`addedAt`** — `contract` for a criterion the ticket already stated; `research` for one derived during step 3;
`during-test` for one found while testing (§Found while testing), which also needs `addedReason`.

## Discrimination — a criterion must be able to fail

Prefer the criterion whose **wrong implementation produces a different observation**. Ask: *if this were built
wrong in the obvious way, would what I observe change?* If the right and the wrong build look the same, the check
proves nothing and the judge will reject its PASS.

- A page that renders either way, a `200` with no payload check, a default value equal to the changed one, an empty
  list where "nothing allowed" and "nothing exists" look alike — not discriminating. Choose data where the two
  differ: two items that must be told apart are seeded or found **different**; a changed default is checked
  against a value the old default did not have.
- Say in the strategy's `oracle` what observation decides it, concretely: "`tools/list` holds `X` and not `Y`",
  not "the list is correct".

## Permission and access — two controls, always

A criterion about who may or may not do something needs **both**:

- a **positive control** — the principal that is allowed succeeds (a persona with the permission, its token, its
  observed success);
- a **negative control** — the principal that is denied is refused (a second persona **without** the permission,
  or a token for another audience or tenant — never just "no token", which only tests that authentication exists).

Each control names its own account in the strategy. One of the two missing ⇒ the judge rejects the PASS even when
the other is convincing. The trust-boundary probes to choose from are `<plugin>/knowledge/security-abuse-cases.md`
§The eight probes (technique token `SEC`).

## The strategy

`<dir>/in/strategy.json` is a JSON **array** of risks; `strategy set` replaces the whole strategy, so this file is
the working copy you edit and send again:

```json
[
  { "id": "R-1", "risk": "<what goes wrong, for whom>", "priority": "Critical|High|Medium|Low",
    "acs": ["AC-1", "AC-2"], "technique": "<token>", "oracle": "<the observation that decides>",
    "account": "<persona or login key, or anonymous>" }
]
```

- `id` — you assign `R-1`, `R-2`, … and keep them stable across edits.
- `priority` — likelihood × impact on the matrix of `<plugin>/knowledge/risk-prioritization-framework.md` §1.
- `technique` — exactly one token of `<plugin>/knowledge/test-design-techniques.md` §0 (`FLOW`, `EP`, `BVA`, `DT`,
  `ST`, `PW`, `CT`, `EG`, `SEC`); `SEC` for any token, permission, audience or tenant boundary.
- `oracle` — the concrete observation, as in §Discrimination.
- `account` — who the check runs as: an OAuth persona of the recipe (`buyer-a`), a login key of the env
  (`ADMIN_LOGIN`), or `anonymous`. A risk with a positive and a negative control names both (`buyer-a; deny: no-perm`).
- **Every criterion is covered by at least one risk** — `goal.mjs check --before strategy` fails otherwise — and a
  risk names only criteria that exist.

## Found while testing

A finding that opens a new branch becomes a criterion with `addedAt: during-test` and an `addedReason` naming what
opened it ("F-2 showed the token is accepted by a second endpoint"). Without the reason the judge rejects it.

- **Inside the approved scope** — it tests the goal and a risk S2 already approved (same surface, same accounts,
  no new data): add it, put its id into that risk's `acs`, `strategy set` again, test it.
- **Outside the approved scope** — a new surface, a new account, data the S2 table did not announce, a host not
  approved at S1, or a component the goal does not name: add it, add or extend a risk, `check --before strategy`,
  and **ask S2 again** for it before it is tested (`checkpoint --stop S2 --decision approved|edited|rejected`).
  Rejected ⇒ it becomes GAP, reason "outside the approved scope — not approved at S2".

## Changing a criterion at S2

`goal.mjs` has no delete, and `ac set` cannot change `text` or `source`. So a criterion is never removed or edited
in place — it is closed with a recorded reason, and a dropped or replaced criterion **stays in its risk's `acs`**, so
the strategy gate still passes. Both are listed in the verdict under "Not tested, and why".

- **Reworded** (the person changes what AC-n says, or its source) —
  1. `ac add` the new text: `{ "text": "<new>", "source": "<its source>", "addedAt": "<AC-n's own addedAt: contract or research>", "addedReason": "reworded at S2 from AC-<n>" }` → `AC-<m>`;
  2. `ac set --id AC-<n>` with `{ "status": "GAP", "gapReason": "replaced by AC-<m> at S2 (<who>)" }`;
  3. add `AC-<m>` to the same risk's `acs` in `<dir>/in/strategy.json`, keep `AC-<n>` there, `strategy set`.
- **Dropped** (the person removes AC-n) — `ac set --id AC-<n>` with
  `{ "status": "GAP", "gapReason": "dropped at S2 by <who>: <the person's reason>" }`; it stays in its risk.
- **Added** — `ac add` as in §The file for `ac add`, and into a risk.

Then `check --before strategy`, and S2 is asked again on the new tables (`checkpoint --stop S2 --decision edited`
for the round that changed them). The judge accepts these GAPs because the person's decision is recorded in them.

## Before the first data write

`ledger.mjs append` needs `config.js` in the project root (exit 3 without it), and `teardown.mjs` needs
`config.js` and `scripts/lib/seed-common.mjs` there — a client project often has neither. So before the run
creates or changes the first entity, even on a stand `capabilities.json` calls writable:

```
node <plugin>/lib/ledger.mjs types && test -f config.js && test -f scripts/lib/seed-common.mjs
```

(`ledger.mjs types` exits before its own `config.js` check, so the two `test -f` carry that half.) Exit 0 ⇒ go on.
Anything else ⇒ **the stand is read-only for this run**: say so once ("the ledger or teardown cannot run here —
`<which file is missing>`"), and every write that would have been needed takes the read-only stop
([`goal-contract.md`](goal-contract.md) §The stop list, 2). Never create data that the ledger cannot record or the
teardown cannot remove.

## Recording (step 5)

**A result** — `<dir>/in/ac-<n>-result.json`, then `goal.mjs ac set --dir <dir> --id <AC-n> --file …`. Only
`status`, `evidence`, `gapReason`, `findings` can be set, and each **replaces** what is there — send the whole list:

```json
{ "status": "PASS|FAIL|PARTIAL|GAP",
  "evidence": [ { "path": "evidence/<file>", "note": "<what it shows, for which account>" } ],
  "gapReason": "<GAP only — omit the field otherwise>",
  "findings": ["F-1"] }
```

- An evidence `path` is relative to `<dir>` and lies inside it (`evidence/…`); a path outside the run folder fails
  the verdict gate. Every entry needs a `note`; it says what the file shows and for whom — never a value of a
  secret. An entry with no file: `{ "cmd": "<the command, no secret>", "digest": "<what it returned, short>",
  "note": "…" }` — it cannot carry a discriminating or control claim on its own.
- `PASS` and `FAIL` and `PARTIAL` need evidence; a permission criterion's PASS needs both controls in it. `PARTIAL`
  says in a note which part passed.
- `GAP` needs a `gapReason` the journal or a file supports: not deployed; no data and a read-only stand; a lane
  unavailable; a stop that fired; a confidential OAuth client (out of scope); a read the host-governed project does
  not allow; outside the approved scope and not approved; reworded or dropped at S2 (§Changing a criterion at S2). "Out of time" with budget left, or "not applicable"
  without why, is not a reason.

**A finding** — `<dir>/in/f-<n>.json`, then `goal.mjs finding add --dir <dir> --file …` → `{ id }`:

```json
{ "severity": "Critical|High|Medium|Low", "title": "<one line: what is wrong, where>", "ac": "AC-<n>",
  "inScope": true, "evidence": [ { "path": "evidence/<run 1>", "note": "…" }, { "path": "evidence/<run 2>", "note": "…" } ],
  "reproduced": 2, "docCheck": "<the source that says it should not happen: doc page, AC id, PR, oracle>" }
```

`id` is assigned, never given. `finding set --id <F-n>` changes fields later (send the whole `evidence[]`).

**Priority (step 6), in-scope findings only** — severity says how bad, priority says **when it must be fixed**:
P0/P1 now (the verdict is FAIL), P2/P3 later (PASS WITH NOTES). Either way a Medium-or-worse one is proposed as a
bug at S3, with its priority. Propose it from
`<plugin>/knowledge/risk-prioritization-framework.md` §2 (Priority and the Severity-Priority Interaction: blast
radius, workaround, revenue or security at risk) — a Critical with a narrow blast radius and a workaround can be P1;
a High that blocks every user is P0. `finding set` `{ "priority": "P0|P1|P2|P3", "priorityReason": "<the grounds,
one line>" }`. Then ask the person **once**, one AskUserQuestion: per finding its id, title, severity, the proposed
priority and its reason; they confirm or change each. Record what they chose — `finding set` with the person's
`priority` and `"priorityBy": "<who>"`, the reason kept or replaced by theirs. Never set `priorityBy` without that
answer: `check --before verdict` fails an in-scope finding without both fields.
`reproduced` counts independent runs that showed it, each with its own evidence entry. `kbRef` is added at the
write-back ([`research-loop.md`](research-loop.md) §Write-back).
