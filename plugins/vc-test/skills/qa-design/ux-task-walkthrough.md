# UX task walkthrough — test as a real user, judge by whether the task gets done

Read by `vc-test:ui-ux-expert` for the **`vs. USER`** axis: a storefront page or flow the ticket changes
([`visual-axis.md`](visual-axis.md) §2), or a `/vc-test:qa-design` run on a page or flow. It replaces a heuristic
checklist walked over a page: a heuristic names *why* something is hard, but only a task shows *that* it is.

**The bar is the user's, not the build's.** A page can pass every invariant, match its design and still leave a
buyer unable to reorder. This axis asks one question per task — *could this person do it, and what did it cost
them?* — and answers it from what was on the screen, never from the DOM, the spec or the source.

## 1. The task and the person

- **Tasks (1–3).** From the brief. Else from the ticket's ACs ("as a <role> I want <goal>" → one task each). Else
  the page's primary job — what a user comes to that route to do (a PDP: choose a variant and add it to the cart;
  a cart: change a quantity and reach checkout). Write each as the user would say it: *"reorder what I bought last
  month"*, never *"click #reorder-btn"*.
- **Persona.** The actor the task belongs to: guest shopper, signed-in customer, B2B organization buyer, its
  approver or admin, a sales rep. Sign in as that persona's **account role** (the agent's §2 Signing in). A
  role-gated task signed in as anyone else meets an empty state that **reads as a pass** — no role in the brief
  for such a task ⇒ ask the dispatcher, never guess.
- **Where the user starts.** Where a real user would: the home page, a search, the account menu, the link an
  email or notification gives them. A deep URL only when a user would really have it (a bookmark, a shared
  link) — say which.

## 2. Doing it as the user would

1. **Read the screen before every action** — the accessibility snapshot is what the user can perceive. Choose
   the next action from what is visible and labelled, the way the persona would read it.
2. **Use only what a user has.** Click, type, scroll, hover, keyboard — the REAL-USER rule. No URL edits to skip
   a step, no selector knowledge to find a control the screen does not show, no reload to escape a stuck state
   (a user's reload is recorded as a step and as a finding).
3. **When stuck, try what a user tries** — back, the search box, the menu, a help link — **at most three
   attempts**, then stop: that is a **dead end**, the task is **not completed**, and the step where it happened
   is the finding.
4. **Make one realistic mistake per form** — leave a required field empty or type a wrong format — then recover.
   Inputs are unique `random-data` values with the `AGENT-TEST-` prefix (`<plugin>/knowledge/test-data.md`), never a literal.
5. **Writes respect the stand.** A task that creates or changes data (places an order, submits a quote, invites
   a member) runs to the end only on a stand the project declares writable (`test.environments`; vc-test's
   `lib/capabilities.mjs`). On a read-only stand stop before the committing action and record the task
   `NOT RUN — read-only stand` for that last step; everything before it still counts.
6. **Twice:** at desktop width, then at the narrowest width of the viewport sweep
   ([`layout-defects.md`](layout-defects.md) §Viewport sweep procedure). Keyboard-only completion belongs to the
   a11y axis (`BL-A11Y-001`) — do not repeat it here.

## 3. What to observe at every step

Each is something the screen shows or does not show — observable, never a matter of taste.

| Check | Friction when | Heuristic |
|---|---|---|
| **Feedback** | an action changes nothing visible and announces nothing (no loader, no toast, no `aria-live`), or the result is shown somewhere the user is not looking | #1 status |
| **Next step is findable** | the control for the next step is not on screen, or not labelled as what it does | #6 recognition |
| **Words match the user's** | a label uses an internal term, or the same action has two names across the steps | #2, #4 |
| **Error recovery** | the message does not name the field, does not say how to fix it, or the entered values are lost | #9 (WCAG 3.3.1 / 3.3.3) |
| **Safe destructive actions** | delete, remove, clear or cancel acts with no confirmation and no undo | #3, #5 |
| **No recall burden** | the user must remember something from an earlier step that is no longer shown (a price, a selected option) | #6 |
| **Path length** | steps taken exceed the intended path (the ACs, the design flow, or the shortest one found) by more than one | #7 |
| **Dead end** | a page offers no way forward and no obvious way back | #3 |

## 4. Severity — by what happened to the task

| Severity | The task… | Verdict word | Effect |
|---|---|---|---|
| **4** | could not be completed: dead end, a blocking error, data lost | `FAIL` | an ordinary finding, triaged like a `BL-UI` FAIL — a user who cannot finish is a defect, whatever the invariants say |
| **3** | was completed only through a workaround, or after an error with poor recovery | `ADVISORY` | reported with its real severity, never blocking |
| **2** | was completed with hesitation: an extra step, an unclear label, missing feedback | `ADVISORY` | reported |
| **1** | was completed; the issue is cosmetic | — | a line in the report, no row |

One level up on a revenue-critical step (cart, checkout, payment, add-to-cart, registration), as in
[`ux-heuristic-evaluation.md`](ux-heuristic-evaluation.md) §Severity rubric. Precedence is unchanged: an
invariant FAIL on the same step outranks a UX finding, and the axis never rescues one.

## 5. What you return

One row per task, then one row per finding:

```
| Task | Persona | Completed | Steps (taken / intended) | Verdict |
| reorder last month's PO | B2B buyer | no — dead end at step 4 | 4 / 3 | FAIL |

| Task | Step | What the user saw (quoted from the screen) | What they needed | Heuristic | Severity | Verdict |
| reorder … | 4 | "Reorder" button disabled, no reason shown | why, and what to do | #9 | 4 | FAIL |
```

**Evidence.** Quote the on-screen text in every finding. A screenshot for a `FAIL` (`<plugin>/knowledge/reports.md`
§5); for an `ADVISORY`, only when the finding is visual. Never a finding without the step it happened at.

## 6. What this axis cannot conclude

It is one careful user, not a population. **Comprehension at a glance, where people look first, and what they
expect before they act** need real participants — think-aloud, five-second and first-click tests
([`ux-heuristic-evaluation.md`](ux-heuristic-evaluation.md) §For a human session). When a finding turns on one of
those, return it as `NOT RUN — needs a human session` with the question to ask, never as a PASS.
