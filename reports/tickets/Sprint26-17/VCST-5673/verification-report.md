# VCST-5673 — Fix Verification

**Ticket:** VCST-5673 · Bug · Medium · `[vc-shell] Vendor Portal: AI panel cannot be closed by keyboard once it has focus`
**Fix (two halves, two repos):** vc-shell PR [#292](https://github.com/VirtoCommerce/vc-shell/pull/292) (`46098e500`) + PR [#305](https://github.com/VirtoCommerce/vc-shell/pull/305) (`9aea3dee3`), both in v2.5.0 · **VirtoCommerce/virto-oz#17**, closed `COMPLETED` 2026-08-20
**Verdict: VERIFIED** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform
Admin SPA). Filed against 2.4.0; fixed in **2.5.0**. Verified against `main @ 324cd9b09` and the deployed
build **22260** (console banner `v2.5.0 · 2026-08-19T10:23:58Z · 2964ccbe3`).

## Why this was not an ordinary verify-fix

The reported symptom is **structural, not a listener bug**: a keystroke is delivered to the document owning
the focused element, the panel is a **cross-origin iframe**, and a cross-origin parent cannot observe those
events by any means. So it needed a **relay**, and the work split across two repos:

| Half | Repo | What |
|---|---|---|
| 1 | **vc-shell** | Accept a `CLOSE_PANEL` message (#292), and accept it **only from the registered sender** (#305) |
| 2 | **virto-oz** (the chat app) | Forward its own `Escape` / `Ctrl+I` as `window.parent.postMessage({type:"CLOSE_PANEL"}, <shell origin>)` |

On 2026-08-12 the fix author asked QA explicitly **not** to retest before half 2 shipped — *"rather than
retesting against the shell build and finding it unchanged"*. That was correct then. It no longer applied:
**virto-oz#17 closed `COMPLETED` on 2026-08-20**, the deployed build is 2026-08-24, and the panel is a
*separately deployed* app whose half does not depend on the vendor-portal build date at all. This run was
therefore on time rather than premature.

**A premise the author corrected, worth carrying:** the ticket says *"the iframe capturing focus is correct
for a11y"*, implying the shell focuses it. It does not — there is no `focus()` call anywhere in the ai-agent
plugin. The **chat autofocuses its own input** on load, and that is what moves focus out of the host's reach.

## RED → GREEN (unit) — the two shell halves isolate cleanly

Scope `core/plugins/ai-agent`, from `framework/`:

| Phase | Source | Result |
|---|---|---|
| **GREEN** | `main @ 324cd9b09` | **61 passed (61)**, 3 consecutive runs |
| **RED-a** | `message-transport.ts` @ parent of **#305** | **2 failed / 59 passed** |
| **RED-b** | `message-transport.ts` @ parent of **#292** | **2 failed / 59 passed** |

The failing sets differ, and each is exactly its own half:

- **RED-a — the negative path (#305's guard):** *ignores CLOSE_PANEL from a window that is not the registered
  chatbot iframe* · *rejects forwarded messages from another window at the same origin*
- **RED-b — the positive path (#292's capability):** *closes the panel when an allowed origin asks it to* ·
  *accepts forwarded messages from its parent window*

Logically consistent: with `CLOSE_PANEL` absent altogether (RED-b) the negative tests pass **trivially**,
because nothing is honoured from any sender. #292 added the capability, #305 added the guard, both
independently pinned.

**#305 was a real security fix, not plumbing.** The transport validated `event.origin` but never
`event.source`, so *any* window at an allowed origin could close the panel. The sender must now be the
registered iframe's `contentWindow` (or `window.parent` when embedded) — which also means the chat app's
message has to come from its **top-level** window; a nested frame is rejected.

## Deploy gate

Both commits are ancestors of **v2.5.0**, neither of v2.4.0. `vc-shell-vendors22260.js` carries
`CLOSE_PANEL` ×1, `NAVIGATE_TO_APP` ×1, `allowedOrigins` ×6, `vc-ai-agent-panel` ×3; the `-framework` facade
chunk has 0 of each, as expected. The VirtoOz iframe origin is **not** in the bundle — it comes from runtime
config, so the `allowedOrigins` set cannot be read statically.

## Live verification — the STR, executed

| Check | Result |
|---|---|
| 1 — `Escape` from inside the panel closes it, blade survives | **PASS** |
| 2 — `Ctrl+I` from inside the panel toggles it closed | **PASS** |
| 3 — host-side `Escape` still works (regression) | **PASS** |
| 4 — documented `Shift+Tab` route out | **PASS** |
| 5 — console during the keystrokes | clean (corroboration) |

**Check 1.** `Ctrl+I` opened the panel and focus genuinely crossed the origin boundary — the host's
`activeElement` was the **`iframe` element itself**, and *within* the iframe document the
`textbox "Chat message input"` was active. That is precisely the state the bug describes. `Escape` closed the
panel **immediately**, and `.vc-ai-agent-panel` was **removed from the DOM** rather than hidden (the selector
hard-errors: *"does not match any elements"*). The **blade behind survived** — `region "Products"` kept the
same ref, the grid re-expanded to full width, `1–20 of 466` pagination intact. Satisfies VCST-5530 SC-23/24.
**Reproduced a second time** on a fresh panel instance, so not a one-off.

**Check 2.** Reopened, re-confirmed `iframe [active]` with the inner input active, pressed `Ctrl+I` → panel
closed, blade intact.

**Check 3.** Deliberately clicked a **neutral non-input** target (the `1–20 of 466` pagination label) rather
than the blade's search box, so `Escape` could not be swallowed by an input and confound the result — good
discipline, worth recording. Iframe confirmed to have lost `[active]` while the panel was still open;
`Escape` closed it, blade survived.

**Check 4.** Real `Shift+Tab` presses walked backwards from the auto-focused chat input through the
suggestion buttons and `Chat history` to `New chat` (the chat's first focusable element), then **one further
`Shift+Tab` left the iframe** and landed on the panel header's Close control — `button "Close" [active]`,
computed accessible name exactly **`Close`**. It is not merely reachable but **actionable**: `Enter` on it
closed the panel, blade intact.

**Check 5.** Across the whole run: **0 errors, 2 warnings**, and **not one console entry was emitted by any
`Ctrl+I`, `Escape` or `Shift+Tab`** — all messages were page-load lines. Closes were immediate, with no
polling or timeout smell.

## Why this proves half 2 is live, not just half 1

A cross-origin parent **physically cannot** observe keystrokes delivered to the iframe's document. Yet the
panel closed on `Escape` *and* on `Ctrl+I` while the host's `activeElement` was that iframe. The only
mechanism that can produce that outcome is the chat app's `CLOSE_PANEL` `postMessage` reaching the shell.
So the deployed virto-oz app **is** forwarding, and #305's `event.source` validation **is** accepting it —
i.e. the message arrives from the chat's top-level window, as #305 requires. Nothing was rejected as an
unexpected sender.

## Notes — informational, no outstanding gap in the fix

**1. The `Shift+Tab` workaround is now a discoverability aid, not the only escape.** The author asked for it
to be recorded on the ticket as the interim keyboard answer. It works — but the Close button's tooltip
**already ships an `Esc` key badge**, so the UI itself advertises Escape. Worth saying that when recording
the workaround, rather than presenting `Shift+Tab` as the route of last resort.

**2. A load-time warning, not a defect.** `[@vc-shell/framework#ai-agent-context] Cannot set context data:
no blade id available` fires at page load, **before** the panel is ever opened, and the panel then worked
correctly every time. Low signal; noted because it appeared in several runs today.

**3. The previously-reported environment 500s are resolved as stale console history — not live failures.**
Surfacing the full console showed a block of 500s (`security/seller/users/search`, `.../create`,
`seller/offers`, `message/unreadcount`, `conversation/search`, `validatepasswordresettoken`), SignalR `401`s
and a `signIn failed: SessionExpiredError` — **all timestamped 12:34–12:36Z, predating this run's 14:52Z
navigation**. They are leftover history from an earlier session in the same browser profile. This settles a
question that recurred across several tickets today: that "known env noise" list was never a stable property
of vcmp-dev, and console-derived findings on this lane must be timestamp-checked against the run window
before being attributed. The one genuinely in-window error was a `WebSocket closed with status code: 1006`
on `pushNotificationHub` at 14:56:18 — the known SignalR noise, unrelated to the AI panel and coincidental
in timing only.

## Coverage limits

- **`Cmd+I` was not tested** — this is a Windows host, so only the `Ctrl` variant was exercised. The ticket's
  Expected names `Ctrl/Cmd+I`; the macOS chord is unverified.
- **Screen-reader announcement output was not verified** — no NVDA/JAWS/VoiceOver in the toolkit; the
  accessible-name claim for the Close button rests on the computed name from the accessibility tree.
- The `allowedOrigins` set could not be read statically (runtime config), so the *specific* origin the shell
  accepts was not confirmed from the artifact — only that the mechanism works end to end.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123
regression suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the
framework's own vitest suites, live keyboard interaction with focus-ownership inspection, and bundle marker
checks.

**Data changes: none.** No entity created, edited or deleted; **no chat message sent** — the chat input
autofocuses on open but was never typed into and never submitted (`Send message` stayed disabled throughout).
Interactions were limited to opening a blade, clicking a pagination label, keyboard navigation, and
activating the panel's own Close button.
