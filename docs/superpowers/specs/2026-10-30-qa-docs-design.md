# `/qa-docs` — one documentation skill, one document per tested ticket

Status: design, awaiting approval · 2026-10-30

## Intent and why

Documentation is written today only through `/ba-analyze docs …` and one agent, `ba-doc-writer`.
`/qa-test` has no writer of its own: its 5-docs and 5-status steps call `/ba-analyze docs ticket|release`.
The result, measured on 2026-10-30:

- `ba-doc-writer` does seven jobs (flow-improvement specs, customer / admin / developer / sales guides,
  release notes, ticket docs) in 35.6K characters against the 19K prompt budget (baseline, may only shrink).
- The rules live in four places that restate each other: `.claude/knowledge/ba/virto-doc-style.md`
  (36K; audiences §1, skeletons §3–§6, release notes §9, ticket docs §10), `reports-policy.md` §5.2a
  (walkthrough GIF), `.claude/skills/qa-test/reporting.md` 5-docs (refusals restated from §10.4), and
  `tracker-ops.md` §5c/§5d (posting).
- A feature is split by audience into up to four guides plus a release-note fragment — one ticket,
  five files nobody reads together.
- Nothing produces a video, although the passkey film (VCST-6121, 2026-10-30) showed that a Motion film
  built from real stand screenshots is the clearest way to present a feature.

The user's decisions (2026-10-30):

1. Documentation is its own skill, separate from BA analysis.
2. It is run mostly by **QA right after testing a ticket**.
3. **One unified document, no audiences**: *What's new*, *How to set it up*, *How it works* (the
   presentation of the feature).
4. **Templates live beside the skill**, in its folder.
5. The report policy **does not restate the skill**; whatever is no longer needed is **deleted**.
6. Delivery stays as today: **one Jira comment** on the ticket.
7. The skill **makes a Motion film**; a **person exports the MP4** from the film's page and attaches it
   to the ticket. Jira plays short attached videos, so the film is **at most 30 s**.

## Goals

1. `/qa-docs <TICKET>` produces one document for a tested ticket from its run folder and posts it as one
   Jira comment, after one confirmation. `/qa-test` 5-docs calls it instead of `/ba-analyze docs ticket`.
2. The document has three sections and a fixed footer (template below).
3. **Documentation is written only for a tested ticket** (user, 2026-10-30): the gate is the ticket's
   tracker status **Tested**, read live from the tracker. Any other status is refused with `not-tested`. This replaces today's §10.4 rule that a non-PASS verdict scopes the guide instead of
   refusing it. Inside a tested ticket, every instruction still maps to a `PASS` row of the run's
   `testing-checklist.md`.
4. Media: real screenshots inline (cropped to the step), one walkthrough GIF per scenario, and one Motion
   film (≤30 s) per ticket built from the same captures.
5. All rules for documentation live in the skill's folder and nowhere else; other files cite it.

## Non-goals

- System, flow or API analysis, user stories, UX improvement specs — `/ba-analyze` keeps them.
- Audience-specific guides (customer / admin / developer), the sales one-pager, and the §9.1
  layer → audience mapping — removed.
- Claude creating a video file, or rendering stills of the film unasked (both forbidden by the Motion
  artifact type; the person exports).
- The `vc-fix` plugin (`plugins/vc-fix/skills/qa-report/SKILL.md` mentions `/ba-analyze docs`) — not
  changed here; the mention is reported as a follow-up for the plugin's own release.
- Re-writing existing guides under `reports/ba/` — they stay as they are.

## Anti-goals (a failure even if it technically works)

- A step, setting or claim in the document with no `PASS` row (or, for *What's new* versions, no
  `build.deployed` value) behind it.
- The same rule stated in the skill and in the report policy, the style guide or `qa-test/reporting.md`.
- Client data, secrets or a third-party trademark (for example a store logo) in the comment, a
  screenshot, the GIF or the film.
- A drawn element in the film (an OS fingerprint prompt the browser cannot capture) presented as a real
  screen: it is labelled as the device's prompt.
- A second comment on the ticket for the same run (the documentation comment is the run's one sanctioned
  second comment, `tracker-ops.md` §0 rule 4; a later change amends it).

## The document

Template file: `.claude/skills/qa-docs/template.md`. Shape:

```markdown
## Documentation — {TICKET}: {feature in the reader's words}

### What's new
2–4 sentences: what changed and what someone can now do that they could not before.
Shipped in: {component@version, from summary.json build.deployed only; UNKNOWN is allowed}.
{⚠ Breaking: … — only from the release ledger's ⚠ BREAKING row or a cited contract change in the diff}

### How to set it up
What must be switched on and where: store settings, roles and permissions, modules, and — when the
feature is configured through it — the REST/GraphQL operation. Each item names where it is in the UI.
"Nothing to set up" is a valid section.

### How it works
One numbered scenario per user-visible flow, UI-literal, a cropped screenshot per meaningful step and
the scenario's walkthrough GIF.
Video: {film-name}.mp4 (attached to this ticket).

Not documented: {each condition left out — UNCOVERED, a PASS WITH NOTES note, or "changed since the run" — or "None"}
Verified on {env} · run {run id} · verdict {verbatim verdict}
```

*What's new* replaces today's per-ticket release-note fragment (§9.2): its fields come from the same
places (`build.deployed`, the ledger, the diff), so a separate fragment file is no longer written.

## How the skill runs

`/qa-docs <TICKET>` in the main session (no subagent: it needs a browser lane, the Artifact tool and the
tracker together).

1. **Read the run.** `npm run --silent run:dir -- --ticket <TICKET>` → `summary.json`,
   `testing-checklist.md`, the ticket. Refuse with a reason, writing nothing:
   `not-tested` (the ticket's tracker status is not Tested),
   `not-deployed` (the change is not live on the env), `not-user-visible` (no `PASS` row a person can
   act on). `layer-unresolved` is dropped: with no audiences the layer selects nothing.
2. **Ground the mechanism.** Settings and behaviour the document states come from the checklist's `PASS`
   rows; their documented mechanism from `.claude/knowledge/execution/doc-sources.md` (VirtoOZ connector,
   module README at the deployed tag). A doc claim is quoted with its URL.
3. **Capture.** On a Playwright lane (`.claude/rules/vc-browser.md`), walk each `PASS` scenario with a
   test account and take one full-viewport screenshot per step (1920×1080). Crops of these go inline;
   `npm run gif` builds the scenario GIF from them; the same full frames feed the film. Evidence
   paths and retention as `reports-policy.md` §9 (never committed).
4. **Write the document** from the template; save it as `reports/ba/<Domain>/<ticket>-<slug>-guide.md`
   (the folder convention already used by `reports/ba/Auth/`).
5. **Make the film.** Create a Motion artifact (the type is found with the Artifact tool's types listing)
   and build it from the full frames: a browser-window plate, eased camera pushes to each step's control,
   an honest cursor with clicks, cross-fades between screens, a few caption chips, title and end cards,
   ≤30 s. The window / camera / cursor / prompt helper written for the VCST-6121 film is kept as
   `.claude/skills/qa-docs/film-kit.js` and pasted into the film's `shared.js`. A third-party logo is
   masked; a drawn stand-in is labelled. The house look (palette, typeface) is fixed in the skill, so the
   type's Style / Colors / Length questions are answered from it, not asked.
6. **Post.** Show the comment, ask once, post through `tracker-ops.md` §5a/§5c/§5d, verify the rendered
   body (screenshots and GIFs present, `reports-policy.md` §5.0).
7. **Hand the video to a person.** Give the film's link and the file name to use; the person opens it,
   presses Export → MP4 and attaches the file to the ticket. When they confirm, the comment is amended so
   its *Video* line names the attachment (amend, never a new comment).
8. **Record** `{RUN_DIR}/documentation.json`: `published`, `files`, `film` (artifact URL,
   `exported` true/false), `comment_id`, `comment_posted`, `refusal`.

## What moves, what is deleted

| Today | After |
|---|---|
| `/ba-analyze docs [audience]`, `docs ticket`, `docs release <TICKET>` | removed from `/ba-analyze` (description, argument hint, usage, steps) |
| `/ba-analyze docs release --sprint/--version` (the aggregate) | `/qa-docs release --sprint <S> \| --version <V>`: collects the *What's new* sections of the window's ticket documents into `reports/ba/release-notes/release-<label>.md` |
| `ba-doc-writer` §2–§7 (four audiences, release and ticket documentation) | deleted; the agent keeps §1 (flow-improvement specs) for `/ba-analyze` and drops under the prompt budget |
| `virto-doc-style.md` §1, §3–§6, §9.1, §10.1–§10.2 | deleted |
| `virto-doc-style.md` §2 house conventions, §7 cross-cutting rules, §9.4 payload hygiene, §9.5 truth guardrail, §10.4 refusals and scoping | move into the skill folder; the file is deleted and its citations re-pointed |
| `reports-policy.md` §5.2a, the ticket-doc and release-note rows of §1 and §2 | one line each pointing at the skill (the size cap for the comment is set in the skill) |
| `qa-test/reporting.md` 5-docs, 5-report.0 release fields, 5-status §Release note pointer | 5-docs calls `/qa-docs`; the release-note fields are resolved inside the skill; the pointer is removed |
| `qa-test-summary.schema.json` `documentation` | replaced by `{RUN_DIR}/documentation.json` (step 8); the block is dropped once nothing reads it |
| `summary.json` `release` block and `/qa-test` 5-report.0 | **kept, slimmed**: audience and layer routing removed; versions, `breaking` and the fragment line stay, because `plugins/vc-fix/skills/qa-report/lib/model.mjs` prints the result comment's mandatory `Release note` line from it at 5-report.2 — before `/qa-docs` runs. *What's new* reads the same block |
| `.claude/rules/reports.md`, `.claude/rules/agents.md`, `ROUTING.md`, `knowledge/agents/README.md`, BA shared-instructions (the four audiences) | re-pointed at `/qa-docs` |

## Constraints

- `SKILL.md` ≤19,000 characters (BUDGET-004); detail goes into supporting files in the skill folder.
- Gates that must stay green: `context:check`, `docs:index:check`, `knowledge:index:check`,
  `qa-test:doclint`, and the rest of the `offline` job in `.github/workflows/gates.yml`.
- NO CODE ⇒ NO UNIT TEST: the skill is prompts and a template; `film-kit.js` runs inside the artifact,
  not in this repo, and gets no test.
- Tracker writes and the Jira comment are confirmed by the person first; the browser is a Playwright lane
  only; passwords are typed by their lane secret name.
- The Motion type's own instructions apply to the film (they are data about the artifact, not about this
  repo): no video file from Claude, no stills unasked, a film's type files are never written.

## Which runs it accepts (user's answer, 2026-10-30)

- **`/qa-test` FULL** — 5-docs calls `/qa-docs`. Input: `summary.json` + `testing-checklist.md`.
- **`/qa-test` FAST path** — 5-docs no longer runs there (today it does); when a FAST ticket needs documentation, QA runs `/qa-docs <TICKET>` by hand. Same input.
- **`/vc-test:qa-ticket`** — input: its `verdict.json` + `testing-checklist.md` (it writes no
  `summary.json` and records no probed versions). Its verdict step ends with a pointer to run
  `/qa-docs <TICKET>`, not a hard call, because the plugin is installed where this repo's skill may not
  be; that one-line change ships with vc-test's next release.
- `/qa-test-fast` is not wired (no docs step there).
- **Where the record goes:** `/qa-docs` writes its own `{RUN_DIR}/documentation.json` for both inputs
  (step 8's fields), so it never edits another skill's verdict file. The `documentation` block is removed
  from `qa-test-summary.schema.json` once no consumer reads it.
- **Versions for a run that probed none** (the vc-test case): *Shipped in* uses the `/api/platform/modules`
  probe taken before the capture walk, and the footer says the versions were read at capture time.

## Rules settled after the builder check

- **Shipped in** takes probed versions only: `build.deployed`, or the run's flat `build.*` versions when
  the run recorded them as probed (VCST-6121 shape). A declared version (`build.relevant_modules`, a PR
  branch) is never used; nothing probed ⇒ `UNKNOWN`. `not-deployed` is judged from the same probed
  values.
- **The release aggregate** (`/qa-docs release`) takes the window's ticket documents (all of them are
  for tested tickets, by goal 3) whose *Shipped in* is resolved; every other ticket in the window goes to its
  mandatory *Not included* list with the reason. The §9.3 structure (breaking changes first, *Not
  included*, the ledger cross-check line) and the §9.5 truth guardrail move into the skill folder.
- **The capture walk** (step 3) runs only on the build the run tested: the skill first compares
  `/api/platform/modules` with the run's probed versions, and a changed build stops it with a question.
  On the same build, a scenario that no longer behaves as its `PASS` row says goes to *Not documented*
  ("changed since the run") instead of being shown. The footer carries the capture date beside the run id.
- **The video hand-off does not block.** The first post's *Video* line says the film is being exported
  and names the file to expect; the skill ends with `film.exported: false`. `/qa-docs <TICKET> --video`
  later checks that the attachment exists on the ticket and amends the same comment (found by the id
  stored in the `documentation` block).
- **The film's helper is a store module.** A Motion film owns no files, so `film-kit.js` is written into
  the film's `modules/shared.js` document, not published as a file.
- **Plugin files that point at `/ba-analyze docs`** (`plugins/vc-fix/skills/qa-report/SKILL.md`,
  `plugins/vc-test/skills/qa-design/visual-axis.md`) are left for each plugin's own release and listed
  as follow-ups in the PR.

## Calls made by the designer (check these)

- The name `/qa-docs` (QA runs it; matches the `qa-*` command family).
- The release aggregate is kept, as a `release` mode of the new skill.
- No subagent; the skill runs in the main session.
- `ba-doc-writer` survives, trimmed to flow-improvement specs, rather than being deleted.
- `layer-unresolved` is dropped as a refusal.
- The comment is posted first and amended with the video line once the person has attached the MP4.
- One film per ticket, not one per scenario.

## Left to the builder

The split of files inside `.claude/skills/qa-docs/`, exact wording, the comment's line cap, and the order
of the migration commits.
