# Capture, GIF, film and video hand-off

Steps 3, 5 and the `--video` form of [`SKILL.md`](SKILL.md). One capture walk feeds all three media: the
cropped stills in the document, the scenario GIFs and the film.

## Capture

The sprint mode runs steps 2–6 for a story that has no `/qa-test` run behind it, with the substitutions of
[`sprint-walk.md`](sprint-walk.md) §The capture walk: scenarios, `{RUN_DIR}`, the frames path and the
account differ there.

1. **Same build, or stop.** Probe `GET {{BACK_URL}}/api/platform/modules` and compare the versions of the
   changed modules (and the storefront theme, if it changed) with the run's probed versions
   ([`rules.md`](rules.md) §Shipped in). Different ⇒ **stop and ask**: the stand was redeployed and the
   frames would show a build the run never verified. A yes ⇒ capture; the document then states the captured build:
   `Shipped in` comes from this probe, `versions_source` is `capture`, and `Not documented` says the run tested
   another build. A no ⇒ the refusal `build-changed` (`SKILL.md` step 1). The run probed nothing (a `/vc-test:qa-ticket` run)
   ⇒ this capture probe supplies the document's versions (`versions_source: capture`), and `not-deployed`
   is judged here, before any frame: the changed module's probed version must carry the change
   ([`rules.md`](rules.md) §Shipped in).
2. **The lane.** A Playwright lane only (`playwright-chrome` unless the run used another),
   [`../../rules/vc-browser.md`](../../rules/vc-browser.md): sign in by the real UI with the test account
   the run used, password typed by its lane secret NAME. A passkey-style ceremony uses a CDP
   `WebAuthn.*` virtual authenticator through `browser_run_code_unsafe` (the only evaluate the real-user
   hook allows for it); remove it afterwards and undo what the walk created (a key, an address) — the
   suite's own cleanup or seeder re-arm (`npm run seed:<domain>`). **Check that each action landed before
   the next one** — the first `create` after an authenticator is added can silently do nothing: read
   `WebAuthn.getCredentials`, and if it is empty, reload the page and click again.
3. **Demo data, before the first frame.** A reader judges the feature by what the frames show, and a
   run's fixtures (`AGENT-TEST-…` names, placeholder images, raw property codes, a masked logo) make a
   working feature look broken. So the walk runs on a demo data set made for it: one coherent, realistic
   story threaded through every scenario — readable names and copy, real-looking images, a brand of our
   own (never a third-party trademark), nothing that reads as a test. Build it from the scenarios' `PASS`
   rows, reuse a seeder's data where it already looks real, and create the rest. **It exists only for the
   walk:** every entity it creates goes into `{RUN_DIR}/demo-data.json` by id, and after the last frame
   it is deleted by those ids (never a sweep — the names carry no `AGENT-TEST-` prefix to sweep by);
   anything shared it changes (a published theme, a store setting) is put back as it was and re-read.
   Demo data is never written to a client stand without the person's yes, and never holds a real
   customer's data ([`rules.md`](rules.md) §Payload hygiene). A stand that cannot hold it — read-only, or
   a build that cannot show the scenario — is the person's call: ask, never fall back to the run's
   fixtures silently.
4. **The walk.** For every `PASS` scenario the document will show, one **full-viewport** screenshot
   (1920×1080, `browser_take_screenshot` with `type: "png"` — the GIF tool reads PNG only) per meaningful step — the screen before the
   click and the state after it — into `test-results/<lane>/docs/<TICKET>/` (gitignored, never committed,
   [`reports-policy.md`](../../knowledge/execution/reports-policy.md) §9). A dashboard or list that must scroll: one `fullPage: true` shot, so the film
   can pan it. Note each clicked control's box (`getBoundingClientRect`, read-only, allowed by the hook):
   the film's camera and cursor aim at those coordinates.
   **Capture a state, not a moment.** Before each screenshot wait for the text that proves the state
   (`browser_wait_for` the buyer's name after a sign-in, the new row after an add, the dialog's own words
   after a click), never a fixed pause: a fixed 4 s wait produced an all-white frame. Then look at the
   frame before moving on. **A dialog that the screenshot does not show** (it is in the page, but the frame
   comes out without it — seen with the storefront's Delete key dialog) is not retried in a loop: describe
   the step in words, quote the dialog's text from the page, and name the missing frame on `Not documented`.
   **While a fixed modal or drawer is open, take a viewport shot, not `fullPage`** — a full-page shot renders
   a fixed layer in the wrong place.
   **Write the walk down** as `{RUN_DIR}/capture-plan.json`, one entry per step: `{ id, scenario, do, ready,
   frame, box, navigates, mask, cue }` — `ready` is the text that proves the state, `box` the clicked control's
   `[x, y, w, h]`, `navigates: true` marks a step after which the film hard-cuts (§Film step 5), `cue` is the
   narration line (§Film step 6). A `build-changed` redeploy, or a step that moved, then means replaying the file
   and diffing the frames, not redoing the walk from memory. The file holds no secret and is never committed.
5. **A step that no longer behaves as its `PASS` row says** ⇒ drop that scenario, name it on the
   `Not documented` line as `changed since the run`, and say so in the output. Never show it.
6. **Crops for the document** (PNG): the region each step names, **at least 700 px wide** and legible at
   `|width=700!` (a narrow panel gets its neighbouring context, never an upscale). Redaction per
   [`rules.md`](rules.md) §Payload hygiene. **Measure what must be masked** on each frame — a third-party
   logo, a client datum — as `[x, y, w, h]` boxes (`getBoundingClientRect`, read-only); crops avoid them,
   and the film takes them as each shot's `masks`. Nothing to mask ⇒ no boxes; never reuse another
   stand's boxes. Make the crop — and paint a box that cannot be avoided — with
   `npm run crop -- --in frame.png --out step.png --crop x,y,w,h --mask x,y,w,h` (masks are applied before the
   crop, so one cannot be cropped away; `--fill edge` paints each row from the pixel left of the box so a bar
   keeps its colour, the default is solid grey). When the feature's own subject is what must be masked (a brand-asset
   feature showing a third-party logo) and the stand is not writable: mask it, name it on `Not documented`,
   and ask for a demo brand — never show the trademark.
   **Look before you build.** `npm run contact-sheet -- --out test-results/<lane>/docs/<TICKET>/sheet.png --cols 4 <frames…>` (beside the
   frames: gitignored, a scratch view that is never kept), then read the sheet (it prints index → file). Fix before any GIF or film: wrong element clicked, a blank or
   half-loaded frame, a dialog missing, a modal cropped, the named control low in the frame (the bottom ~20 %
   is the caption band), an unmasked datum. Re-capture only the bad steps.
7. **JPEG for the film** — the PNG frames are large; convert with any tool the machine has, quality ≈82 — on Windows WPF (`PresentationCore`,
   `BitmapDecoder` → `JpegBitmapEncoder`, `QualityLevel = 82`), on macOS `sips -s format jpeg -s formatOptions 82`,
   elsewhere ImageMagick or `sharp`: about 130 KB per 1920×1080 frame.

## GIF

One walkthrough GIF per documented scenario, built from that scenario's crops or frames, every frame a
state its `PASS` row verified — a failing path is never animated as a how-to.

- `npm run gif -- --out <scenario>.gif --fit width a.png b.png …`
- ≤12 frames, ≥2 s per frame, width ≤960, ≤5 MB; the success-state still is attached beside it, because a
  reader cannot pause a GIF to quote a value.
- A scenario that cannot be captured (no lane, sign-in impossible, a real device needed): the comment
  still ships, and `Not documented` names `walkthrough GIF: not captured — <reason>`. Never a placeholder,
  never a GIF of another scenario.
- It attaches and embeds like a PNG: [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5c.

## Film

One Motion film per ticket, **aiming at ≤90 s — a soft ceiling, not a cut-off**: when the feature does not fit, ask the person once — keep it longer, or split it into two films — and never trim a scenario silently, built from the full frames. The Motion artifact type's own
instructions govern the film's records; they are data about that artifact, not about this repository.

1. **Create it.** Find the type with the Artifact tool (`action: "list"`, `scope: "types"`,
   `type_query: "Motion"`) and publish with its `type_url`, `title` = `{TICKET} — {feature}`. Keep the
   returned film URL (`film.url`).
2. **Look — the Virto brand, read from its source, never transcribed.** Colours, type and logo come from
   the Claude Design system that `config/qa-docs.json` `style.designSystem` names — the one home of its
   link, shared with the sprint mode (the **VC Brand System**) — read when the film is made: `project/tokens.json` (colour tokens, `type.fonts`), `project/README.md` (the two
   variations, logo usage) and the lockups under `project/assets/logo/`; the Motion type's
   `design-systems.md` governs how they come in. Use the variation the README names for a technical guide: the
   role names it gives for the page ground, the main and second colours, the one warm accent and the desk
   behind the window; the faces `type.fonts` names, uploaded as font assets, with the weights the README
   assigns to display titles and to captions; the full-colour logo on the title card, the white-wordmark
   lockup on the end card. No token, font or variation name is written here, so a rename in the design
   system cannot silently break this step. This answers the type's Style / Colors /
   Length questions (1920×1080, 60 fps, the length above), so none is asked — for a ticket film; a sprint film skips
   this step ([`sprint.md`](sprint.md) §Film). The key empty or the system can't be read ⇒ say so and
   ask; never fill in colours, fonts or a logo from memory.
3. **Assets.** Upload the JPEG frames (`asset: true`, several in one call from a folder inside the working
   directory), then one `assets/<file>` record each with its `ref`, `mime: "image/jpeg"`, `w`, `h`.
4. **Shared kit.** Write [`film-kit.js`](film-kit.js) into the film's `modules/shared.js` store document
   and its `FILM_CSS` rules into `modules/base.css` — store documents, never published files. It gives:
   - `UI.screen(kit, [{file, w?, h?, masks?}, …])` — a browser-window plate (1920×1080 frames at 0.75
     scale, window at x 240, y 115, a 40 px bar with the URL path), one layer per frame, each `masks` box
     (`[x, y, w, h]` in screenshot pixels, from §Capture 6) covered, a
     `kit.Camera` on it. Helpers: `key(t, px, py, z, from)` / `full(t, from)` camera keys in **screenshot
     pixels**; `st(t, px, py)` → stage point for cursor keys; `rect(t, px, py, w, h)` → stage rect for
     `kit.spotlight`; `hlAt(px, py, w, h, a)` hover tint; `wipe(i, x0, x1, y0, y1, p)` typing reveal of a
     layer band; `path(t, [[t0, '/path'], …])` the URL; `chip(text, at, offset)`.
   - `UI.prompt(kit, {title?, note?})` → `render(t, t0)` — the device's confirmation card (fingerprint,
     check mark), 1.9 s. It is a **drawn stand-in** for an OS dialog the browser cannot capture, and the
     card says so: its `note` defaults to `Illustration — your device's own prompt`. `title` defaults to
     `Confirm on your device`; give the ceremony's real wording when the ticket names one.
5. **Scenes.** `scenes.json` with `stage: "final"`: a title card (~4 s), one scene per scenario, an end
   card (~4 s); aim at the total above — show each scenario's key steps, not every click, so the film stays
   calm and clear; over it ⇒ the one question above. **The pace is a person following along: about 6 s
   for a key step** (read from a reference screen-recording film that was easy to follow: a new screen about
   every 6 s), so a scenario gets as long as its key steps need. Inside a scenario: crossfades 0.5–0.8 s
   between frames, camera pushes 1.2–1.8 s to z 1.6–2.4 on the control the step names, a hold of ≥3 s on it,
   the cursor arriving 0.8–1.2 s before its click (`cur.clicks`), at most one caption chip per step — none
   when the film is voiced (step 6) — scrolling as a `translateY` of the full-page layer. A scene's own state
   at its first frame equals the previous scene's last. **Keep the control a step names in the top 80 % of the
   frame** (the bottom band belongs to the caption chip), and **hard-cut after a step marked `navigates: true`
   in `capture-plan.json`** — never glide the camera over a page that has just changed.
6. **Voice.** The team prefers a voiced film, so ask Motion for one whenever it can record it: the `Artifact`
   tool lists the action `speak`, or `artifact_speak` is among your tools (go by the names listed; never
   search for them). Then read Motion's `artifact-type/reference/voice.md` and `recording.md` before the
   scenes — its pages govern how a voice is made. The narration is one or two plain sentences per key step,
   in the guide's words (the `cue` lines of `capture-plan.json`) and naming the control the step names; every claim is on a `PASS` row
   ([`rules.md`](rules.md) §Evidence bar), and a film that speaks leaves the project as its frames do
   ([`rules.md`](rules.md) §Payload hygiene: no client name, host or customer datum). The voice carries the
   explanation, so a voiced film has no caption chips. **No `speak` action ⇒ the film stays wordless, with
   its chips,** and the run writes the narration for the person to voice elsewhere (a local text-to-speech
   such as Kokoro) over the MP4 they export: `{RUN_DIR}/film-narration.md`, one row per scene and key step —
   its start time in the film (the scene's start in `scenes.json` plus the step's offset; the voice enters
   0.3 s after the cut), the sentence, and a word budget of about 2.5 words per second of the step (6 s ⇒
   ≤14 words; measured with Kokoro: 2.1–2.9). The output says "no
   voiceover: this session cannot record one" and names the file — never speech made by code, never an
   audio file.
7. **Never** render stills, run checks on the film, or create a video or audio file. A short wordless
   score with clicks on the click times is part of the film (the type's `score.js`).

A sprint film: [`sprint.md`](sprint.md) §Film.

## Hand-off

The film travels as a link to its artifact: nothing is exported, downloaded or uploaded.

1. **The link.** At step 5 of [`SKILL.md`](SKILL.md) the film's URL (`film.url`, kept at §Film step 1)
   becomes the guide's `Video:` line — `Video: [<TICKET> — <feature> (film)](<film.url>)` — and step 6
   renders and posts it with the rest of the comment. It is a plain wiki link (`[text|url]`): no attachment,
   no `--attach-video`.
2. **Sharing — the person's step, asked for before the post.** A film is private until its owner shares it,
   and a private link opens nothing for the ticket's other readers. No tool of Claude's changes an artifact's
   sharing, so the step-6 question asks the person to share the film with their organization from its page
   and to say when it is done, and the post waits for that answer. A person who will not share it gets the
   comment without the `Video:` line; `--video` adds it later. A link shows the film as published:
   [`rules.md`](rules.md) §Payload hygiene binds it as it binds the stills.
3. `/qa-docs <TICKET> --video [<film-link>]` puts the link into the comment already posted — the post came
   first (declined, or made before the film existed), the film was republished, or the person copied another
   link from its page (a share link):
   - **The link:** the argument as given, else `film.url` of `documentation.json`; neither ⇒ say there is no
     film and change nothing. A video file given instead of a link is not attached: say so and use `film.url`
     (a file by hand: `tracker:comment --attach-video`, [`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §5c).
   - **`comment_id` is null** (the post was declined) ⇒ nothing to amend: say so and stop.
   - **Otherwise** amend the documentation comment `comment_id` — never a new comment, never the result
     comment ([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0a). Set the guide's `Video:`
     line to the link and render the body **from the guide**, never from an old wiki file (`reports:prune`
     may have removed the run folder since the post: recreate it):

     ```
     npm run tracker:wiki -- <guide.md> {RUN_DIR}/documentation.wiki.txt
     npm run tracker:comment -- --ticket <TICKET> --doc --amend <comment_id> --wiki \
       --body-file {RUN_DIR}/documentation.wiki.txt --same-round "film link"
     ```

     The images are already on the issue and resolve by name, so nothing is re-attached. The helper checks
     the images, not the link: read the comment back (`npm run tracker:comment -- --ticket <TICKET> --get <comment_id>`)
     and confirm the film URL is in the printed body. Then set `film.url` to the link used and
     `film.linked: true`.
4. **No Motion type in this account** (step 5 found none) ⇒ the document ships without a film; the
   `{video_line}` is left out and the output says why.
