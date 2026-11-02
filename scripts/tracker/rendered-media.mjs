// The renderedBody check of tracker:comment (tracker-ops.md §5c): did each embedded image actually render?
// A wiki `!name.png|width=700!` renders as `<img src=".../attachment/content/<id>">`; `!name.png|thumbnail!`
// renders as `<img src=".../attachment/thumbnail/<id>" data-attachment-name="name.png">`. Both are a rendered
// image. Measured 2026-11-02 on VCST-6232 comment 112573: two thumbnails, zero error spans — and the first cut
// of this check, which counted `attachment/content/` only, reported "0 of 2 images rendered".
// A thumbnail rendered, but it is not the house form — legibility is judged at `|width=700!`
// (reports-policy.md §5.0, §5.1a) — so the caller warns about it instead of failing the render.

const IMG = /<img\b[^>]*>/gi;
const ATTACHMENT_SRC = /\bsrc="[^"]*\/attachment\/(content|thumbnail)\/(\d+)/i;
const NAME_ATTR = /\bdata-attachment-name="([^"]*)"/i;

const unescapeHtml = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The rendered attachment images in `html`, and per expected file name whether it rendered.
 * An image is counted once per attachment id, so one image embedded twice cannot stand in for a missing one.
 * `rendered` is true when an attachment <img> names the file, null when it does not but an unnamed one exists —
 * the `content` form puts only the attachment id in the HTML (measured 2026-09-17), so there the count and the
 * absence of a literal `!name!` are the signals — and false when no <img> can be this file.
 * `unaccounted` is how many files neither a named nor an unnamed image can cover: when one body mixes both forms,
 * a missing file reads null, and only this count catches it.
 */
export function renderedMedia(html, names) {
  const byId = new Map();
  for (const [tag] of html.matchAll(IMG)) {
    const src = tag.match(ATTACHMENT_SRC);
    if (!src || byId.has(src[2])) continue;
    const name = tag.match(NAME_ATTR);
    byId.set(src[2], { form: src[1].toLowerCase(), id: src[2], name: name ? unescapeHtml(name[1]) : null });
  }
  const imgs = [...byId.values()];
  const named = new Set(imgs.filter((i) => i.name !== null).map((i) => i.name));
  const unnamed = imgs.filter((i) => i.name === null).length;
  const errors = (html.match(/<span class="error">/g) ?? []).length;
  // A legacy QuickTime/ActiveX plugin object — what .mp4/.webm degrade to. Not a player.
  const plugins = (html.match(/<div class="embeddedObject">/g) ?? []).length;
  const perFile = [...new Set(names)].map((n) => ({
    name: n,
    rendered: named.has(n) ? true : unnamed ? null : false,
    literalLeft: html.includes(`!${n}|`) || html.includes(`!${n}!`),
  }));
  const unaccounted = Math.max(0, perFile.filter((f) => f.rendered !== true).length - unnamed);
  const thumbnails = imgs.filter((i) => i.form === "thumbnail").map((i) => i.name ?? `attachment ${i.id}`);
  return { imgs: imgs.length, errors, plugins, perFile, unaccounted, thumbnails };
}

/** Whether the render failed: an error span, a surviving literal, a file no image accounts for, or fewer images than files. */
export const renderFailed = (v) =>
  v.errors > 0 || v.imgs < v.perFile.length || v.unaccounted > 0 || v.perFile.some((f) => f.literalLeft || f.rendered === false);
