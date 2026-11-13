# Strategy: an account per risk, and a denied-role risk when the change checks access

Status: approved approach (2026-11-13), design for planning. Skill: `vc-test:qa-test-strategy`
(`plugins/vc-test/skills/qa-test-strategy/`), shared by `/qa-test`, `/qa-test-fast` and vc-test.

## Intent

Every risk in a strategy says **which account it is checked as**. When the change checks a role or a
permission, the strategy must also carry a risk checked as **a member without that permission**.

Why: a role-gated surface opened as the wrong account renders its empty state, and an empty state reads as a
PASS (`plugins/vc-test/agents/ui-ux-expert.md:62`). Today the strategy names no account per risk — roles appear
only as a project resource ("missing role") and in F10's org context — so the account is chosen later, by
whoever executes, and the negative role is remembered or not. A second gap this closes:
`plugins/vc-test/commands/qa-ticket.md:118` signs the visual agent in as "the role the approved scenarios sign in
as", a field no scenario has.

## Goals · non-goals · anti-goals

- **Goal:** an account on every risk; a `deny:` risk whenever the diff checks access; enforced by the
  deterministic gate in all three flows.
- **Non-goal:** SBTM mindset personas (Impatient Buyer…) — they stay the exploratory charter's choice.
- **Non-goal:** verifying that the account exists on the stand. The gate checks the form only; a stand without
  the account is a project risk `P-n`, as today.
- **Anti-goal:** growing the prompt. `SKILL.md` is at 18,906 of BUDGET-004's 19,000 chars and is paid on every
  invocation; the change must leave it the same size or smaller. No new table column, no new step.

## Approaches considered

| | Approach | Trade-off | |
|---|---|---|---|
| A | New floor **F13** fired by an access signal + gate clause on the account cell | one more floor and its regexes; the negative role cannot be forgotten | **chosen** |
| B | Account cell + "non-empty" check only, no floor | cheapest; the negative role still depends on the model remembering it — the exact gap | rejected |
| C | Separate persona-derivation step before the register, risks cite persona ids | most complete; a new step and file on every run, against the anti-goal | rejected; its derivation method is reused by link |

## Design

**1. F13 — access is checked** (`lib/floors.mjs`, row in `floors.md`).
Signal, from what was read, positive first: a permission entry in a PR's settings/permissions findings
(`ticket-context-analyst.md:112`); a role or permission guard in the diff (`[Authorize`, `Permissions.`,
`hasPermission`, `checkPermissions`, a `v-if` on a role/permission); a change-map hotspot with zone `access`
(vc-test). Doubt (diff partly unread) fires it, exactly as F10 (`floors.md` §How floors.mjs reads the bundle).
An AC actor ("As a buyer…") is **not** a trigger — nearly every story has one; it is a derivation source.
When fired, its requirement line in the `floors.mjs` output says: a risk with Source `floor:F13` whose account
is `deny:<permission>`; derive the roles by `../qa-design/personas.md` §1. That link is the only place the method
is cited, so it is read only when F13 fires. F13 is independent of F10: both may fire, each with its own risk
(M10's one-floor-per-risk rule holds). F13's risk needs no particular technique.

**2. The account cell** — no new column. The Approach table's `Lane · agent` cell gains a third `·` segment:
`chrome · qa-frontend-expert · ORG_USER`. Values: a test-user KEY, `guest`, `deny:<permission>` (as the KEY
that lacks it, e.g. `deny:order:approve ORG_MEMBER`), or a project risk `P-n` when no account exists. Clause 8
reads only the first segment, so lane counting is unchanged. Header becomes `Lane · agent · account` in
`template.md` and in `lib/rounds.mjs` `APPROACH_HEAD`; the rows `rounds.mjs` generates for prior bugs carry the
`TBD` marker in that segment for the strategy agent to fill.

**3. Gate clause 15** (`lib/check-strategy.mjs`), every strategy:
- 15a: every Approach row has an account segment;
- 15b: F13 fired ⇒ a risk whose Source carries `floor:F13` and whose account starts `deny:`;
- 15c: every `P-n` in an account segment is an item of the `Project risks:` line.
Messages name the row and the fix, so no prose explains them. Whether the denied permission is the right one is
the model-owned half, checked by `strategy-verifier` with the rest of §Gate.

**4. Scenarios (vc-test)** get no field: a scenario cites its `R-n` (clause 13), so its account is that risk's.
`qa-ticket.md:118` is reworded to "the account of the risk the scenario cites", same length.

**5. Prompt text, net ≤ 0.**
- `SKILL.md` step 6: replace the per-floor list ("F2 fired ⇒ a purpose risk, F10 ⇒…, F11 ⇒…") with "each
  fired floor's required row is in the `floors.mjs` output"; §Gate line "clauses … 10–14" → "10–15". F13 is not
  named in `SKILL.md`.
- `floors.md`: title F1–F13, one table row, one clause-15 line. Supporting file, read on demand.
- `template.md`: the header cell and the token list in its comment.

## Left to the builder

- The exact guard regexes and their false-positive tests (temporary unit tests, deleted before commit — repo
  rule NO CODE ⇒ NO UNIT TEST; `scripts/unit/` gains nothing).
- Whether `floors.mjs`'s F2/F10/F11 requirement lines already say enough for the step-6 rewording, or need a
  word each.
- Running `npm run context:check` to confirm `SKILL.md` did not grow, and one dry run of `check-strategy.mjs` on
  an existing strategy file with and without the account segment.
