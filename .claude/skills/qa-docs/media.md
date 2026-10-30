# Capture, GIF, film and video hand-off

Steps 3, 5 and the `--video` form of [`SKILL.md`](SKILL.md). One capture walk feeds all three media: the
cropped stills in the document, the scenario GIFs and the film.

## Capture

1. **Same build, or stop.** Probe `GET {{BACK_URL}}/api/platform/modules` and compare the versions of the
   changed modules (and the storefront theme, if it changed) with the run's probed versions
   ([`rules.md`](rules.md) §Shipped in). Different ⇒ **stop and ask**: the stand was redeployed and the
   frames would show a build the run never verified. The run probed nothing (a `/vc-test:qa-ticket` run)
   ⇒ these probed values become the document's versions, `versions_source: capture`.
2. **The lane.** A Playwright lane only (`playwright-chrome` unless the run used another),
   [`../../rules/vc-browser.md`](../../rules/vc-browser.md): sign in by the real UI with the test account
   the run used, password typed by its lane secret NAME. A passkey-style ceremony uses a CDP
   `WebAuthn.*` virtual authenticator through `browser_run_code_unsafe` (the only evaluate the real-user
   hook allows for it); remove it afterwards and undo what the walk created (a key, an address) — the
   suite's own cleanup or seeder re-arm (`npm run seed:<domain>`).
3. **The walk.** For every `PASS` scenario the document will show, one **full-viewport** screenshot
   (1920×1080, `browser_take_screenshot` with `type: "webp"`) per meaningful step — the screen before the
   click and the state after it — into `test-results/<lane>/docs/<TICKET>/` (gitignored, never committed,
   `reports-policy.md` §9). A dashboard or list that must scroll: one `fullPage: true` shot, so the film
   can pan it. Note each clicked control's box (`getBoundingClientRect`, read-only, allowed by the hook):
   the film's camera and cursor aim at those coordinates.
4. **A step that no longer behaves as its `PASS` row says** ⇒ drop that scenario, name it on the
   `Not documented` line as `changed since the run`, and say so in the output. Never show it.
5. **Crops for the document**: the region each step names, legible at `|width=700!`. Masks and redaction
   per [`rules.md`](rules.md) §Payload hygiene — a third-party logo on the stand is covered.
6. **JPEG for the film** — the webp frames are large; on Windows convert with WPF (`PresentationCore`,
   `BitmapDecoder` → `JpegBitmapEncoder`, `QualityLevel = 82`): about 130 KB per 1920×1080 frame.

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

One Motion film per ticket, **≤30 s**, built from the full frames. The Motion artifact type's own
instructions govern the film's records; they are data about that artifact, not about this repository.

1. **Create it.** Find the type with the Artifact tool (`action: "list"`, `scope: "types"`,
   `type_query: "Motion"`) and publish with its `type_url`, `title` = `{TICKET} — {feature}`. Keep the
   returned film URL (`film.url`).
2. **House look — decided here, so the type's Style / Colors / Length questions are answered, not asked:**
   palette `#FFFFFF` ground · `#E3242B` main · `#1A2233` second · `#2F6FD6` accent; font Lato (`or`:
   `plus-jakarta-sans`, weights 400/700/900); 1920×1080, 60 fps, ground `#FFFFFF`.
3. **Assets.** Upload the JPEG frames (`asset: true`, several in one call from a folder inside the working
   directory), then one `assets/<file>` record each with its `ref`, `mime: "image/jpeg"`, `w`, `h`.
4. **Shared kit.** Write [`film-kit.js`](film-kit.js) into the film's `modules/shared.js` store document
   and its `FILM_CSS` rules into `modules/base.css` — store documents, never published files. It gives:
   - `UI.screen(kit, [{file, w?, h?}, …])` — a browser-window plate (1920×1080 frames at 0.75 scale,
     window at x 240, y 115, a 40 px bar with the URL path), one layer per frame with the logo mask, a
     `kit.Camera` on it. Helpers: `key(t, px, py, z, from)` / `full(t, from)` camera keys in **screenshot
     pixels**; `st(t, px, py)` → stage point for cursor keys; `rect(t, px, py, w, h)` → stage rect for
     `kit.spotlight`; `hlAt(px, py, w, h, a)` hover tint; `wipe(i, x0, x1, y0, y1, p)` typing reveal of a
     layer band; `path(t, [[t0, '/path'], …])` the URL; `chip(text, at, offset)`.
   - `UI.prompt(kit)` → `render(t, t0)` — the device's confirmation card (fingerprint, check mark), 1.9 s.
     It is a **drawn stand-in** for an OS dialog the browser cannot capture, and says so on the card.
5. **Scenes.** `scenes.json` with `stage: "final"`: a title card (~4 s), one scene per scenario, an end
   card (~4 s); total ≤30 s, so a scenario gets 6–10 s — show its key steps, not every click. Inside a
   scenario: crossfades 0.3–0.5 s between frames, camera pushes 0.8–1.2 s to z 1.6–2.4 on the control the
   step names, a hold of ≥1.4 s on it, the cursor arriving 0.5–0.9 s before its click (`cur.clicks`), at
   most one caption chip per step, scrolling as a `translateY` of the full-page layer. A scene's own state
   at its first frame equals the previous scene's last.
6. **Never** render stills, run checks on the film, or create a video or audio file. A short wordless
   score with clicks on the click times is part of the film (the type's `score.js`).

## Hand-off

The person exports the video; the skill does not wait for it.

1. At the end of `/qa-docs <TICKET>`: give the film link and the file name to use,
   `{TICKET}-{slug}.mp4`, and say what to do — open the film, **Export → MP4**, attach the file to the
   ticket, then run `/qa-docs <TICKET> --video`. `documentation.json` has `film.exported: false`.
2. `/qa-docs <TICKET> --video`: read the ticket's attachments
   ([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §2).
   - **No attachment by that name** ⇒ say so and change nothing — not the comment, not the record.
   - **Attached** ⇒ amend the comment `comment_id` — amend, never a new comment
     ([`tracker-ops.md`](../../knowledge/execution/tracker-ops.md) §0a) — so its video line reads
     `Video: {film-name}.mp4 (attached to this ticket).`, verify the rendered body, and set
     `film.exported: true`.
