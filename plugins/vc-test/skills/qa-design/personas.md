# Personas — who the `vs. USER` task is done as, and how that changes the run

Read by `vc-test:ui-ux-expert` with [`ux-task-walkthrough.md`](ux-task-walkthrough.md). A persona is not a
label on the report: it decides the account, the entry point, the device and **how the agent acts** — what it
knows, what it reads, what it is allowed to do. The same task done as two personas is two tests, and the
difference between their outcomes is often the finding.

**Personas are derived from the ticket, not picked from a list.** A persona is an **archetype** (§2 — how the
person behaves) **plus the segments the feature behaves differently for** (§1 — a loyalty tier, a currency, a
second organization, a missing permission). A fixed list knows nothing about the feature, so it cannot hold
the one customer the change breaks for.

## 0. The project's own personas come first

A client knows its users better than this plugin: a dealer's purchaser, a branch manager, a buyer on a framework
contract. A project keeps them in **its own knowledge store** — `<store>/personas.md`, where `<store>` is
`test.knowledgeStore` in `project-profile.json` (default `qa-knowledge/` at the project root; vc-test's
`lib/knowledge-store.mjs`). The store is the project's: it never reaches the public `kb`, so a client's
personas, segments and account names are safe there. Its shape:

```markdown
## Archetypes
| Persona | Account | Starts at | Device | Acts like | Succeeds when |

## Segments
| Segment | Values | Where it shows in the product | Where a ticket names it |

## Accounts
| Persona | Env | Key |
```

**Archetypes** take the §2 columns; a name that matches a §2 row replaces it, a new name adds one. **Segments** are
the attributes this project's features split users by; the last column holds the AC words and code identifiers a
ticket names them with (`\|` for a literal pipe). **Accounts** map a persona (or archetype · segment) to a test-user
KEY, one row per stand.

The file is kept with `node <plugin>/lib/personas.mjs`: `--show` prints it, `--init` creates it empty, `--add
--section archetypes|segments|accounts --row-file <file>` adds the one row the file holds (`--replace` changes a row
of the same name). **Write the row to a file with the editor tool, under `.vc-fix/vc-test/`, never into a command
line:** its text comes from a ticket, and a quote in it breaks — or injects into — a shell command. It
writes only into the project store, scrubbed of the project's secret values, through `lib/knowledge-store.mjs`.

**Precedence, per item:** the brief › the project file › this plugin's catalog (§2). Read the project file before
§1, and derive with its archetypes and its segment vocabulary. No file, or no store configured ⇒ this plugin's
catalog alone, and the return says so.

**You never write the project file.** A segment or archetype the ticket shows and the file lacks is returned as a
**proposed persona** (§6) with its source; the run's dispatcher shows it to the operator and adds it on a yes.

## 1. Deriving personas from the ticket

Read, in this order, and write down every **segment** — an attribute of the user that changes what the feature
does or shows:

| Source | What it gives | Example |
|---|---|---|
| The ACs and the story | the **actors** ("as a <role> I want…") and the conditions they name ("when the balance is zero") | approver; buyer with zero loyalty balance |
| The diff | **roles and permissions** checked (a new permission, a role guard, `v-if` on a role) and **branches on a user attribute** (tier, currency, org type, store, locale, contract) | `canApproveOrders` ⇒ a member with it and one without |
| The feature's configuration | settings that split users: a mode per organization, a per-store flag, a price list per customer group | `LoyaltyBalanceCalculationMode = Organization` ⇒ two members of one org vs a member of another |
| The project's segment vocabulary (§0) | the attributes this project already knows split its users, matched against the AC words and code identifiers it lists | `contractType` in the diff ⇒ a framework-contract buyer |
| The domain knowledge the run has | known segments of that domain (in this repository: `.claude/knowledge/domain/<slug>.md` actors) | sales rep with no customers |

Then build each persona as **archetype + segments**, for example *B2B buyer · VIP tier*, *Restricted member ·
second organization*, *Mobile shopper · EUR*. Every derived persona names its **source** (the AC number, the diff
line, the setting) — a persona with no source is a guess and is dropped.

Nothing derivable — no actor, no role check, no segment — ⇒ fall back to the archetypes alone, by the change's
risk (§4), and say *"no segments in the ticket"*.

## 2. Archetypes — how the person behaves

Generic to B2B and B2C commerce, so it holds on the platform project and on a client fork alike. An archetype
gives the behaviour; the segments from §1 give the data it carries. The project's own archetypes (§0) replace
a row of the same name and add new ones.

| Persona | Account | Starts at | Device | Acts like | Succeeds when |
|---|---|---|---|---|---|
| **First-time guest** | none (signed out) | the home page or a search | desktop | knows no domain term, reads labels literally, finds things only through visible navigation and search | the task is possible without an account where the store allows it, or the store says plainly that it needs one |
| **Returning customer** | the store's customer role | the account menu or a past-order email link | desktop | expects saved addresses, payment and history to be reused; repeats tasks (reorder, track, return) | nothing it already gave is asked for again |
| **B2B buyer** | an organization member | the quick-order / list / search path a buyer uses daily | desktop, keyboard-heavy | works in bulk (SKU paste, quantities, lists, PO number), counts steps, tabs between fields | the task takes no more steps than the intended path, without the mouse where a field flow allows it |
| **Approver / org admin** | the organization's admin or approver | the notification or the company area | desktop | manages members and limits, approves or rejects what buyers submit | the pending item is findable, the decision is one clear action, the buyer's side reflects it |
| **Restricted member** | a member **without** the permission the task needs | where the permitted persona starts | desktop | tries the same task | it is told clearly that it cannot, and why — the control is hidden or disabled with a reason, never a dead end, an error page or data it must not see |
| **Acting on behalf** | a sales rep or support agent working for a customer | the customer list or impersonation entry | desktop | does the task for someone else | it always knows whose account, cart and prices it is acting in, and returns to its own |
| **Mobile shopper** | the task's own actor | the same place as the task's actor | the `playwright-mobile` lane (`isMobile`, `hasTouch`) when the brief gives it, else the narrowest sweep width on its own lane — then say `touch not emulated` | taps, never hovers; one thumb; reads what fits on the screen | nothing it needs is hover-only, off-screen or under a sticky element |
| **Keyboard / screen-reader user** | the task's own actor | the same place | desktop, keyboard only | Tab / Shift+Tab / Enter / Space / Esc / arrows; chooses the next step from accessible names in the snapshot alone | the task completes without a pointer, guided by names and announcements, never by position or colour |
| **Other-locale shopper** | the task's own actor, in a non-default language and currency the stand offers | the same place | desktop | reads the translated labels, enters local formats (address, date, number) | labels are translated and fit, prices and dates are formatted for the locale, local input is accepted |

**The accessibility overlap.** The keyboard / screen-reader persona asks *can this person finish the task?* —
usability. The a11y axis asks *does each control meet its criterion?* — conformance. Both run; a task this
persona cannot finish is a `vs. USER` FAIL even when every control passes axe.

## 3. The account for a persona

The brief names a test-user **KEY** for each persona (`<KEY>_LOGIN` / `<KEY>_PASSWORD`, signed in as the agent's
§2 Signing in says); else the project file's §0 Accounts table for this stand. Neither ⇒ choose from the `<KEY>_LOGIN` entries in the stand's `.env.<env>` the one
whose name carries **both the archetype's role and the persona's segments** (a VIP-tier buyer ⇒ a key naming
loyalty VIP, not just any user); none fits, or two do ⇒ ask the dispatcher. Then **check the segment live**
before the task — the tier, balance, currency or organization the account actually has on this stand — because a
key name is a claim, not a fact. **Never sign in as a different persona to make the task possible** — a
restricted member signed in as an admin tests nothing, and a role-gated task signed in as anyone else meets an
empty state that reads as a pass. No account for a persona, or its segment is not what the persona needs ⇒ that
row is `NOT RUN — no <persona> account on <env>` and the report names the account to add (vc-init:
`/project-init --add-user`). A locale the stand does not offer ⇒ `NOT RUN — locale not on the stand`.

## 4. Which personas run — pairs first

**On a FAST path** (`/qa-test-fast`, `/qa-test` FAST, `/vc-test:qa-ticket` without `--full`) run **the task's own
actor only**: one task, one persona, and the pairs and contrast below are listed as `NOT RUN — FAST path` so the
report shows what a FULL run would add. Everything below is the FULL path (or a brief that asks for it).

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

First where the personas came from — `project personas: <store>/personas.md` or `project personas: none (plugin
catalog)`. Then the derived personas — one line each: `<archetype> · <segments> — source: <AC n | diff file:line |
setting> — account <KEY> (segment checked live: yes/no)`. Then **proposed personas**, if any — a segment or
archetype the ticket showed and the project file lacks, each with its source, its section and the exact table
row for `personas.mjs --add` — for the operator to accept; never written by you. Each task row then carries its persona, and the task
table ends with the matrix — one line per task:
`<task>: <persona> completed (n steps) · <persona> FAIL at step k · <persona> NOT RUN (<reason>)`.
