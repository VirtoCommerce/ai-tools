// The renderedBody check of tracker:comment (tracker-ops.md §5c): did each embedded image actually render?
// A wiki `!name.png|width=700!` renders as `<img src=".../attachment/content/<id>">`; `!name.png|thumbnail!`
// renders as `<img src=".../attachment/thumbnail/<id>" data-attachment-name="name.png">`. Both are a rendered
// image. Measured 2026-11-02 on VCST-6232 comment 112573: two thumbnails, zero error spans — and the first cut
// of this check, which counted `attachment/content/` only, reported "0 of 2 images rendered".

const IMG = /<img\b[^>]*>/gi;
const ATTACHMENT_SRC = /\bsrc="[^"]*\/attachment\/(content|thumbnail)\/(\d+)/i;
const NAME_ATTR = /\bdata-attachment-name="([^"]*)"/i;

const unescapeHtml = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The rendered attachment images in `html`, and per expected file name whether it rendered.
 * `rendered` is true when an attachment <img> names the file, null when it does not but an unnamed one exists —
 * the `content` form puts only the attachment id in the HTML (measured 2026-09-17), so there the count and the
 * absence of a literal `!name!` are the signals — and false when no <img> can be this file.
 */
export function renderedMedia(html, names) {
  const imgs = [];
  for (const [tag] of html.matchAll(IMG)) {
    const src = tag.match(ATTACHMENT_SRC);
    if (!src) continue;
    const name = tag.match(NAME_ATTR);
    imgs.push({ form: src[1].toLowerCase(), id: src[2], name: name ? unescapeHtml(name[1]) : null });
  }
  const named = new Set(imgs.filter((i) => i.name !== null).map((i) => i.name));
  const unnamed = imgs.some((i) => i.name === null);
  const errors = (html.match(/<span class="error">/g) ?? []).length;
  // A legacy QuickTime/ActiveX plugin object — what .mp4/.webm degrade to. Not a player.
  const plugins = (html.match(/<div class="embeddedObject">/g) ?? []).length;
  const perFile = names.map((n) => ({
    name: n,
    rendered: named.has(n) ? true : unnamed ? null : false,
    literalLeft: html.includes(`!${n}|`) || html.includes(`!${n}!`),
  }));
  return { imgs: imgs.length, errors, plugins, perFile };
}

/** Whether the render failed: an error span, a surviving literal, a named image missing, or fewer images than files. */
export const renderFailed = (v, expected) =>
  v.errors > 0 || v.imgs < expected || v.perFile.some((f) => f.literalLeft || f.rendered === false);
