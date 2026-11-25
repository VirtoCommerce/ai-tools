# The capture walk — a story with no frames on disk

Read from [`sprint.md`](sprint.md) §Material; it applies when an approved story needs a walk. Everything in `sprint.md` binds it, and a `§` name here without a file is one of its sections.

## The capture walk

The capture walk is [`media.md`](media.md) §Capture, steps 2–6 (lane, real sign-in, wait for the state,
full-viewport PNG, mask boxes, JPEG for the film), with the substitutions below — a walk has no `/qa-test`
run behind it, so what §Capture takes from a run is taken from here:

| §Capture says | In a walk |
|---|---|
| step 1, the build check | replaced by §Stands |
| a `PASS` row / scenario | the document's *How it works* scenario, or the acceptance criterion, verbatim; a step that does not behave so is `differs` (below), not `Not documented` |
| `{RUN_DIR}` | the story's frames folder (§Records) |
| `{RUN_DIR}/demo-data.json` | the same file name inside that folder: step 3's ledger. The walker deletes every id on it after the last frame and returns the ids it could not delete |
| frames in `docs/<TICKET>/` | `docs/<label>/<ticket>/` (§Records) |
| the account "the run used" | the account of the role the scenario needs on that stand, from the test-account store (`.claude/knowledge/execution/test-accounts.md`), its password typed by its lane NAME `<NAME>_<ENV>` (`.claude/rules/vc-browser.md`) |

Each walk goes to a lane specialist — a storefront story to `qa-frontend-expert` on `playwright-chrome`, a
back-office or API story to `qa-backend-expert` on `playwright-edge`, the third concurrent one to
`qa-testing-expert` on `playwright-firefox` — at most three at once, never two on one lane
(`.claude/rules/agents.md`). **The brief** follows [`agent-dispatch.md`](../../templates/agent-dispatch.md)
(task, scope, lane with its fallback, references, output) and carries its *Observed behaviour* line — except
that the walker returns its `kb` lines instead of banking them (§Product context below). Because the
walker cannot read this file or ask the person, the brief also names: the stand and its lane; the role and
account; the scenarios, verbatim; the frames folder; whether the stand is writable; the coordinates (page
path, GraphQL operation) for `mcp__kb__kb_ask`; the files to read before the first frame — `media.md`
§Capture steps 2–6 and the table above, `rules.md` §Payload hygiene (redact secrets, scrub client data,
mask third-party marks); and the **can't-ask path**: when it cannot sign in, a dialog is missing from the
frame, or the build moved, it stops that story and returns `blocked: <reason>` — it never improvises or
falls back to other data.

The walker returns, per frame: path, the step it shows, the text it waited for, mask boxes; per scenario:
`shown`, `differs: <what was seen>` or `blocked: <reason>`; and per coordinate:
`kb: {coordinate, entry id | none, matched | contradicted | new}` with each entry it opened.

A scenario that **differs** on the stand is not shown: the story goes to *Not included — differs on the
stand*, and the run says what differed. A **blocked** story goes to *Not included — walk blocked*, with its
reason. Neither is a bug report; this mode files nothing.
