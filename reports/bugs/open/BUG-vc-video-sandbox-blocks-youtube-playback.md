# BUG: `vc-video` secure-default iframe sandbox prevents YouTube playback — player never initializes — [High]

**Env:** hosted vc-shell Storybook (`vc-shell-storybook.govirto.com`, built from `main`) · `@vc-shell/framework` 2.2.0 and 2.3.0 (both shipped) · Chromium 1232 (Playwright) · Windows 11
**Source:** [vc-shell#255](https://github.com/VirtoCommerce/vc-shell/pull/255) — "Secure the default `vc-video` iframe sandbox" · found while testing VCST-5412 (BH-03)
**Category (per VCST-5412 §10):** **Defect** — worked before the PR, broken now. *Not* "expected hardening": the PR explicitly documents that mainstream embeds keep working.

## Summary

PR #255 narrowed the `vc-video` iframe `sandbox` default from
`allow-scripts allow-same-origin allow-presentation allow-popups` to
`allow-scripts allow-presentation`. Dropping `allow-same-origin` makes YouTube's embed bootstrap
throw before it can build the player, so the iframe renders as an empty black box. The video never
plays. Every YouTube asset loads successfully (HTTP 200) — the failure is purely the sandbox.

**Confidence:** **CONFIRMED** — reproduced on two independent surfaces with two different video IDs
(Storybook component + the live Vendor Portal), plus a sandbox-varying falsification control.

## Steps to reproduce

**A — Storybook (component in isolation):**
1. Open `https://vc-shell-storybook.govirto.com/iframe.html?id=data-display-vcvideo--default&viewMode=story`
   (the story's source is a real embed: `https://www.youtube.com/embed/PeXX-V-dwpA`).
2. Observe the video area and the browser console.

**B — live Vendor Portal (real user path):** on `https://vcmp-dev.govirto.com/apps/vendor-portal/`,
open a Product → **Videos** → **Add video** → paste a YouTube URL → **Preview**. oEmbed metadata
resolves (title + thumbnail render) and `GET /embed/aqz-KE-bpKQ?feature=oembed` returns **200**, but the
preview area stays a **black box** and the iframe's accessibility tree is empty. YouTube self-reports the
failure via `error_204`: `msg=writeEmbed is not defined&type=UnhandledWindowReferenceError`.

## Expected vs actual

**Expected** (VCST-5412 BH-03, and PR #255's own `vc-video.docs.md`):
> "The iframe `sandbox` defaults to `allow-scripts allow-presentation` — the minimum that **keeps
> mainstream embeds (YouTube, Vimeo) working** while denying the framed page access to the parent origin."

**Actual:** no player is created. Inside the `youtube.com/embed` frame:
`hasPlayer: false`, `hasVideoEl: false`, `document.body.innerText === ""`.

Console / page errors:
```
Failed to read the 'caches' property from 'Window': Cache storage is disabled
  because the context is sandboxed and lacks the 'allow-same-origin' flag.
writeEmbed is not defined
Uncaught undefined
```
YouTube's init script dies on the blocked `caches` access, so `writeEmbed` is never defined and the
player is never mounted. All 5 YouTube requests returned **200** (`/embed/…`, `www-player.css`,
`ytembeds.base…js`, `player_embed…base.js`) — assets are fine; only the sandbox blocks it.

![new sandbox blank vs old sandbox playing](../tickets/Sprint26-15/VCST-5412/screenshots/BUG-vc-video-sandbox-blocks-youtube.png)

## Falsification control — the sandbox is the cause

Same embed URL, same neutral host page, only the `sandbox` attribute varied:

| `sandbox` | Player renders? |
|---|---|
| **`allow-scripts allow-presentation`** ← new default from PR #255 | **NO ✗** (`innerHtmlLen` 142 KB, no `<video>`) |
| `allow-scripts allow-same-origin allow-presentation allow-popups` ← old default | **YES ✓** (435 KB, `<video>` present) |
| `allow-scripts allow-presentation allow-same-origin` | **YES ✓** |
| no `sandbox` attribute | **YES ✓** |

Only the new default fails, and re-adding `allow-same-origin` alone restores playback.

## Root cause

`framework/ui/components/atoms/vc-video/vc-video.vue` — the computed sandbox base:

```ts
const sandbox = computed(() => {
  const base = ["allow-scripts", "allow-presentation"];
  // + additionalSandbox tokens, deduped
```

## Why CI did not catch it

`framework/ui/components/atoms/vc-video/vc-video.test.ts` (added by the same PR) asserts only the
**attribute string**, never playback:

```ts
expect(sandbox).toContain("allow-scripts");
expect(sandbox).not.toContain("allow-same-origin");
```

So the suite passes while the component is broken — and it would now **fail** if someone naively
re-added `allow-same-origin`. The test locks in the regression.

## Note for the fix — not a simple revert

PR #255's security reasoning is correct: `allow-scripts` + `allow-same-origin` together let the framed
page remove its own sandbox and reach the parent origin. So "just put `allow-same-origin` back" trades
a working player for a real sandbox escape on untrusted `source` URLs. Options for the owning team:

1. Relax the sandbox only for a known-provider allowlist (youtube/vimeo host match), strict otherwise.
2. Keep the strict default but **correct the docs** — stop claiming YouTube/Vimeo work by default, and
   document `additionalSandbox="allow-same-origin"` as required for them, with the escape-risk caveat.
3. Drop `sandbox` for trusted first-party hosts and rely on `allow` + CSP `frame-src` instead.

Whichever is chosen, `vc-video.docs.md` and `vc-video.test.ts` need to change with it.

## Impact

Any consuming app embedding video via `vc-video` — the shipped `@vc-shell/framework` 2.2.0 and 2.3.0.
Silent: no user-facing error, just a black box.
