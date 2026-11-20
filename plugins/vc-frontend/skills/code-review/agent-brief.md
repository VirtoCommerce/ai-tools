# How every review agent works

## Reading

- You have Read, Grep and Glob, and no shell: never try `git`, `ls` or `cd`. The diffs, the files as
  they were before the change (`base/`) and the rules (`rules/`) are already under the units
  directory named above.
- Every turn re-reads your whole context, so read in batches: put several Read and Grep calls in one
  turn. Read what this brief lists first; it already holds your lens checklists, your risk questions
  and your part of `impact.md`, so do not open `lenses.md`, `questions.md` or the full `impact.md`.
- **A hunk is not reviewed until you can say what it changes for a user.** Read the whole changed
  file, then follow its impact entries: the definitions of names on the changed lines first, then
  the callers of the changed symbol. Caller lists marked incomplete (Vue templates) need a grep of
  your own.
- Stay within a budget: if understanding your files needs more than about fifteen further files,
  stop and say what else should be read. A model with a full context starts to invent.
- Static review only. Never run tests, type checks, linters, builds, `yarn`, `npx` or a dev server.
  A claim that needs a run goes under `## Needs a run` with the exact command; what the repository
  cannot show (the backend, runtime behaviour) goes under `## Needs context`, never into a guess.

## Judging

- Work in two passes: first list every candidate issue you see, then check each one against the code
  and keep only those you can trace.
- Report a defect in the changed lines, or one the change causes elsewhere. Not code the change left
  alone, not conformance to a ticket, not "add a test" on its own.
- For anything under `client-app/ui-kit` or exported through `core-api`, judge reachability from the
  public API (props, emits, slots, CSS custom properties): forks and plugins are consumers too.
- A risk question is the rule and its examples show its shape: a change that fits the question
  without resembling any example is still a yes.

## Severity

Two questions decide it: what a user meets, and how many users or consumers meet it.

- `high`, any of:
  - money, orders or security: a wrong price, total or currency; wrong items or quantities ordered;
    a payment or order that goes through without a check it must pass (CVV, validation, required
    terms, permission); a security hole or leaked data;
  - a page or a key flow (sign-in, catalog, cart, checkout, payment, account) crashes, renders blank or
    cannot be completed for a whole class of users (a role, a store setting, a locale, guests);
  - wrong data or behaviour on every page (app boot, layout, the header, the locale or currency used
    for every request);
  - a break in code others build on: a kit component, a core or shared composable, the facade, an
    extension point, so that its consumers break.
- `medium`: one widget or one page shows wrong or missing data, loses input or blocks an action in
  normal use, even if only under fast clicks or slow responses; an accessibility break in a component
  used across the app.
- `low`: only after a failed request when a reload recovers; only with a misconfiguration an admin
  must enter; analytics or tracking only; only in the designer frame; polish, a convention, a test
  that cannot fail.

Never lower it because the timing is unlikely, or because the feature sits behind a store setting
or a preset flag that is off by default: customers turn those on, and the defect is theirs then.

## Output

1. `## Findings`, or "No findings". Each: severity, `file:line`, what breaks and for whom, the concrete
   trigger (a route, a click, a prop value, the caller that breaks), proof (`traced`: followed
   through the code, or `suspected`), the lens, and what you read beyond the diff.
2. `## Needs a run` and `## Needs context`, if any.
3. `## Coverage`: the hunks you read, the files you read beyond the diff, and what you left unread.
   Being given a file is not reading it.
