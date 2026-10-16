// The human-readable page — ONE shell (../templates/page.html) for every kind, filled from the SAME
// ReportModel as the comment, so the page can state nothing the comment's source does not carry.
// "ref" images = the committed local copy (reports-policy.md §1a: never inline base64 there);
// "embed" = the published Artifact, which must stand alone.
import { readFileSync } from "node:fs";
import { SourceError } from "./model.mjs";
import { resolve, relative, isAbsolute, basename, extname } from "node:path";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CSS_VERDICT = { pass: "PASS", notes: "PASS_WITH_NOTES", fail: "FAIL", blocked: "BLOCKED" };
const MAX_EMBED = 4;
const MAX_EMBED_BYTES = 1_000_000;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

const chip = r => `<span class="chip" data-s="${esc(r)}">${esc(r)}</span>`;
const none = () => `    <p class="none">None.</p>`;
const section = (id, title, inner) =>
  `  <section aria-labelledby="h-${id}">\n    <h2 id="h-${id}">${esc(title)}</h2>\n${inner}\n  </section>`;
const table = (head, rows) => rows.length
  ? `    <div class="table-wrap"><table>\n      <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>\n      <tbody>\n${rows.join("\n")}\n      </tbody></table></div>`
  : none();
const list = items => items.length ? `    <ul class="rows">\n${items.join("\n")}\n    </ul>` : none();

function imgSrc(file, mode, root) {
  if (mode === "ref") return esc(file);
  const abs = resolve(root, file);
  // Compare RESOLVED paths via relative(): a bare string prefix would let `imgs-evil` pass for root `imgs`.
  const rel = relative(resolve(root), abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new SourceError(`cannot embed ${file}: ${abs} is outside the image root ${resolve(root)}`);
  }
  const mime = MIME[extname(abs).toLowerCase()];
  if (!mime) throw new SourceError(`cannot embed ${file}: not an image`);
  const buf = readFileSync(abs);
  if (buf.length > MAX_EMBED_BYTES) throw new SourceError(`cannot embed ${file}: ${buf.length} bytes > ${MAX_EMBED_BYTES}`);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function renderPage(shell, m, { images = "ref" } = {}) {
  // More shots than MAX_EMBED degrades, never refuses: the first MAX_EMBED are embedded, the rest are
  // referenced by file name (the existing "ref" mode, per image), and the page says so.
  const spill = images === "embed" ? Math.max(0, m.shots.length - MAX_EMBED) : 0;
  const head = m.ticket || m.runLabel;
  const parts = [`  <header class="band">
    <div class="eyebrow"><span>${esc(head)}</span><span>${esc(m.env)}</span><span>${esc(m.date)}</span></div>
    <div class="verdict-row"><span class="verdict">${esc(m.verdictLabel)}</span><span class="title">${esc(m.title)}</span></div>
${m.lede ? `    <p class="lede">${esc(m.lede)}</p>\n` : ""}    <div class="meta"><span>Build <b>${esc(m.build || "—")}</b></span><span>Passed <b>${m.counts.passed}/${m.counts.total}</b></span><span>Bugs <b>${m.bugs.length}</b></span></div>
  </header>`];

  if (m.kind === "fix") {
    parts.push(section("ba", "Before and after the fix", table(["Check", "Before fix", "After fix"],
      m.beforeAfter.map(p => `        <tr><td>${esc(p.check)}</td><td class="ba-before">${esc(p.before)}</td><td class="ba-after">${esc(p.after)}</td></tr>`))));
  }
  if (m.rows.length) {
    parts.push(section("rows", m.failures ? "Suites" : "Conditions", table(["ID", "Name", "Result", "Evidence"],
      m.rows.map(r => `        <tr><td class="id">${esc(r.id)}</td><td>${esc(r.text)}</td><td>${chip(r.result)}</td><td class="mono">${esc(r.evidence)}</td></tr>`))));
  }
  if (m.failures) {
    parts.push(section("fail", "Failed and blocked", list(m.failures.map(f =>
      `      <li>${chip(f.result)}<span class="mono muted">${esc(f.suite)} · ${esc(f.id)}</span><span class="grow">${esc(f.title)}</span></li>`))));
  }
  parts.push(section("bugs", "Bugs filed", list(m.bugs.map(b =>
    `      <li><span class="chip" data-sev="${esc(String(b.severity).toLowerCase())}">${esc(b.severity || "—")}</span><span class="grow">${esc(b.key)}</span><span class="muted">${esc(b.relation)}</span></li>`))));
  if (m.kind === "test") {
    parts.push(section("nf", "Not filed (below the severity floor)", list(m.notFiled.map(b =>
      `      <li><span class="chip" data-sev="low">${esc(b.severity)}</span><span class="grow">${esc(b.title)}</span><span class="mono muted">${esc(b.path)}</span></li>`))));
  }
  if (m.issues.length) parts.push(section("issues", "Regressions and side effects", list(m.issues.map(i =>
    `      <li><span class="grow">${esc(i.what)}</span>${i.severity ? `<span class="chip" data-sev="${esc(String(i.severity).toLowerCase())}">${esc(i.severity)}</span>` : ""}<span class="mono muted">${esc(i.ticket)}</span></li>`))));
  if (m.notTested.length) {
    parts.push(section("nt", "Not tested, and why", list(m.notTested.map(n =>
      `      <li><span class="grow">${esc(n.item)}</span><span class="muted">${esc(n.reason)}</span></li>`))));
  }
  if (m.shots.length) {
    const note = spill ? `    <p class="muted">The first ${MAX_EMBED} screenshots are embedded; the remaining ${spill} are referenced by file name and live in the evidence folder.</p>\n` : "";
    parts.push(section("shots", "Evidence", `${note}    <div class="shots">\n${m.shots.map((s, i) =>
      `      <figure><img src="${imgSrc(s, i < MAX_EMBED ? images : "ref", m.imageRoot)}" alt="${esc(basename(s))}"><figcaption>${esc(basename(s))}</figcaption></figure>`).join("\n")}\n    </div>`));
  }
  // The oracle line was dropped from the tracker comment: BL-* ids are internal and a reader
  // there cannot decode them. The page is where they have room and context, so it carries them —
  // relocated, never deleted. Caller-supplied context keeps its order after the derived rows.
  const ctx = [
    ...(m.lines?.BL ? [{ label: "Business rules", value: m.lines.BL }] : []),
    ...m.context,
  ];
  if (ctx.length) {
    parts.push(section("ctx", "Context used", `    <dl class="context">\n${ctx.map(c =>
      `      <dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join("\n")}\n    </dl>`));
  }
  parts.push(`  <footer class="foot muted">Evidence folder <code>${esc(m.evidence)}</code></footer>`);

  // ONE pass with a function replacer: a substituted value is never re-scanned as a slot,
  // and a `$&` in any value is never read as a replacement pattern.
  const vals = { TITLE: esc(`${head} ${m.verdictLabel}`), TONE: CSS_VERDICT[m.tone], BODY: parts.join("\n\n") };
  return shell.replace(/\{\{(TITLE|TONE|BODY)\}\}/g, (_, k) => vals[k]);
}
