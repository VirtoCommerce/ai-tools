// Video attachments for tracker:comment (--attach-video). A video never embeds inline in a Jira comment
// (it renders as a dead QuickTime/ActiveX plugin object, tracker-ops.md §5c), so it is attached and LINKED,
// and Jira plays it from the attachment. The link replaces the document's `Video:` line (/qa-docs
// template.md `{video_line}`) instead of adding a second one.

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

/** True for a file name a Jira attachment plays as video. */
export const isVideo = (name) => VIDEO_EXT.test(name);

/**
 * The body with its first `Video:` line replaced by the attachment link(s); appended as a labelled line
 * when the body has none. `links` is already in the body's dialect (Markdown or Jira wiki).
 */
export function withVideoLine(body, links, { wiki }) {
  const line = `${links} (attached to this ticket).`;
  if (/^Video:.*$/m.test(body)) return body.replace(/^Video:.*$/m, `Video: ${line}`);
  return `${body.replace(/\s+$/, "")}\n\n${wiki ? "*Video:*" : "**Video:**"} ${line}\n`;
}
