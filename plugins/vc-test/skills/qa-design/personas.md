# Personas — who the `vs. USER` task is done as, and how that changes the run

Read by `vc-test:ui-ux-expert` with [`ux-task-walkthrough.md`](ux-task-walkthrough.md). A persona is not a
label on the report: it decides the account, the entry point, the device and **how the agent acts** — what it
knows, what it reads, what it is allowed to do. The same task done as two personas is two tests, and the
difference between their outcomes is often the finding.

**Personas are derived from the ticket, not picked from a list.** A persona is an **archetype** (§2 — how the
person behaves) **plus the segments the feature behaves differently for** (§1 — a loyalty tier, a currency, a
second organization, a missing permission). A fixed list knows nothing about the feature, so it cannot hold
the one customer the change breaks for.

## 1. Deriving personas from the ticket

Read, in this order, and write down every **segment** — an attribute of the user that changes what the feature
does or shows:

| Source | What it gives | Example |
|---|---|---|
| The ACs and the story | the **actors** ("as a <role> I want…") and the conditions they name ("when the balance is zero") | approver; buyer with zero loyalty balance |
| The diff | **roles and permissions** checked (a new permission, a role guard, `v-if` on a role) and **branches on a user attribute** (tier, currency, org type, store, locale, contract) | `canApproveOrders` ⇒ a member with it and one without |
| The feature's configuration | settings that split users: a mode per organization, a per-store flag, a price list per customer group | `LoyaltyBalanceCalculationMode = Organization` ⇒ two members of one org vs a member of another |
| The domain knowledge the run has | known segments of that domain (in this repository: `.claude/knowledge/domain/<slug>.md` actors) | sales rep with no customers |

Then build each persona as **archetype + segments**, for example *B2B buyer · VIP tier*, *Restricted member ·
second organization*, *Mobile shopper · EUR*. Every derived persona names its **source** (the AC number, the diff
line, the setting) — a persona with no source is a guess and is dropped.

Nothing derivable — no actor, no role check, no segment — ⇒ fall back to the archetypes alone, by the change's
risk (§4), and say *"no segments in the ticket"*.

## 2. Archetypes — how the person behaves

Generic to B2B and B2C commerce, so it holds on the platform project and on a client fork alike. An archetype
gives the behaviour; the segments from §1 give the data it carries. A brief may name the project's own
archetypes; they take the same columns.

| Persona | Account | Starts at | Device | Acts like | Succeeds when |
|---|---|---|---|---|---|
| **First-time guest** | none (signed out) | the home page or a search | desktop | knows no domain term, reads labels literally, finds things only through visible navigation and search | the task is possible without an account where the store allows it, or the store says plainly that it needs one |
| **Returning customer** | the store's customer role | the account menu or a past-order email link | desktop | expects saved addresses, payment and history to be reused; repeats tasks (reorder, track, return) | nothing it already gave is asked for again |
| **B2B buyer** | an organization member | the quick-order / list / search path a buyer uses daily | desktop, keyboard-heavy | works in bulk (SKU paste, quantities, lists, PO number), counts steps, tabs between fields | the task takes no more steps than the intended path, without the mouse where a field flow allows it |
| **Approver / org admin** | the organization's admin or approver | the notification or the company area | desktop | manages members and limits, approves or rejects what buyers submit | the pending item is findable, the decision is one clear action, the buyer's side reflects it |
| **Restricted member** | a member **without** the permission the task needs | where the permitted persona starts | desktop | tries the same task | it is told clearly that it cannot, and why — the control is hidden or disabled with a reason, never a dead end, an error page or data it must not see |
| **Acting on behalf** | a sales rep or support agent working for a customer | the customer list or impersonation entry | desktop | does the task for someone else | it always knows whose account, cart and prices it is acting in, and returns to its own |
| **Mobile shopper** | the task's own actor | the same place as the task's actor | the narrowest sweep width, touch only | taps, never hovers; one thumb; reads what fits on the screen | nothing it needs is hover-only, off-screen or under a sticky element |
| **Keyboard / screen-reader user** | the task's own actor | the same place | desktop, keyboard only | Tab / Shift+Tab / Enter / Space / Esc / arrows; chooses the next step from accessible names in the snapshot alone | the task completes without a pointer, guided by names and announcements, never by position or colour |
| **Other-locale shopper** | the task's own actor, in a non-default language and currency the stand offers | the same place | desktop | reads the translated labels, enters local formats (address, date, number) | labels are translated and fit, prices and dates are formatted for the locale, local input is accepted |

**The accessibility overlap.** The keyboard / screen-reader persona asks *can this person finish the task?* —
usability. The a11y axis asks *does each control meet its criterion?* — conformance. Both run; a task this
persona cannot finish is a `vs. USER` FAIL even when every control passes axe.

## 3. The account for a persona

The brief names a test-user **KEY** for each persona (`<KEY>_LOGIN` / `<KEY>_PASSWORD`, signed in as the agent's
§2 Signing in says). No key named ⇒ choose from the `<KEY>_LOGIN` entries in the stand's `.env.<env>` the one
whose name carries **both the archetype's role and the persona's segments** (a VIP-tier buyer ⇒ a key naming
loyalty VIP, not just any user); none fits, or two do ⇒ ask the dispatcher. Then **check the segment live**
before the task — the tier, balance, currency or organization the account actually has on this stand — because a
key name is a claim, not a fact. **Never sign in as a different persona to make the task possible** — a
restricted member signed in as an admin tests nothing, and a role-gated task signed in as anyone else meets an
empty state that reads as a pass. No account for a persona, or its segment is not what the persona needs ⇒ that
row is `NOT RUN — no <persona> account on <env>` and the report names the account to add (vc-init:
`/project-init --add-user`). A locale the stand does not offer ⇒ `NOT RUN — locale not on the stand`.

## 4. Which personas run — pairs first

1. **Pairs from §1.** A segment the feature treats differently is tested as a **pair that must diverge**: VIP vs
   zero balance, with vs without the permission, own vs another organization, default vs another currency. Equal
   behaviour on both sides of a distinction under test proves nothing — the same rule as for test data
   (`<plugin>/knowledge/test-data.md` §SECOND RULE).
2. **The task's own actor** always runs, as the side of a pair the ACs describe.
3. **A contrast archetype** only when §1 found no pair, chosen by what the change puts most at risk:

| The change… | Contrast persona |
|---|---|
| gates the task by role or permission | Restricted member |
| touches an entry, discovery or sign-up page | First-time guest |
| changes layout, a sticky element or a hover interaction | Mobile shopper |
| adds or changes an interactive control (dialog, menu, picker, stepper) | Keyboard / screen-reader user |
| changes copy, labels, formats or a translated string | Other-locale shopper |
| acts on someone else's data (impersonation, sales-rep views) | Acting on behalf |
| touches a buyer → approver handoff | the other side of the handoff |

Two rows apply ⇒ take the first. **Cap: three personas per task, six task runs in all** — pairs from the ACs
before pairs from the diff, before a contrast archetype; anything left out is listed as not run, with the reason.

## 5. What only a second persona can show

Compare the runs of one task across its personas. These are findings no single run produces:

- **A persona the ACs permit cannot finish** → `FAIL`.
- **A pair that must diverge behaves the same** (the VIP and the zero-balance buyer see the same thing) → `FAIL`
  when an AC states the difference, `AMBIGUOUS` when only the diff implies it.
- **A restricted persona reaches data or an action it must not** → `FAIL`, reported as an access-control
  finding, never as friction.
- **A restricted persona hits a dead end, an error page or a silently missing control** instead of a clear
  denial → `ADVISORY`, severity 3.
- **One persona needs markedly more steps** for the same outcome (mobile, keyboard, other locale) → `ADVISORY`,
  severity 2, with both counts.
- **The acting-on-behalf persona loses track of whose context it is in** → `FAIL` when it changes another
  customer's data, `ADVISORY` otherwise.

## 6. In the return

First the derived personas — one line each: `<archetype> · <segments> — source: <AC n | diff file:line |
setting> — account <KEY> (segment checked live: yes/no)`. Each task row then carries its persona, and the task
table ends with the matrix — one line per task:
`<task>: <persona> completed (n steps) · <persona> FAIL at step k · <persona> NOT RUN (<reason>)`.
