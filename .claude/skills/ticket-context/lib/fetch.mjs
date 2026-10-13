// .claude/skills/ticket-context/lib/fetch.mjs — P5 caps (D12, declared once here) and S5 public-page reads.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GapError, gap } from "./gap.mjs";

export const CAPS = Object.freeze({
  attachmentBytes: 25 * 2 ** 20, ticketBytes: 100 * 2 ** 20, frames: 12, frameEverySec: 2, docPages: 20,
  prs: 6, diffBytes: 500 * 1024, prFiles: 300, pageTextBytes: 200 * 1024, linkedIssues: 10, redirects: 3,
});

// Keys whose value is a location — the same suffix rule as secret-gate.mjs HOST_NAME (M1 copy).
const HOST_KEY = /(?:^|_)(?:URL|HOST|HOSTNAME|DOMAIN|ENDPOINT)$/i;

/** Every host named by a location key in any .env* file: the stands are private, whatever their DNS says. */
export function envHosts(root) {
  const hosts = new Set();
  if (!existsSync(root)) return hosts;
  for (const name of readdirSync(root).filter((n) => /^\.env(\.|$)/.test(n))) {
    let text;
    try { text = readFileSync(join(root, name), "utf8"); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\s#]+)/.exec(line);
      if (!m || !HOST_KEY.test(m[1])) continue;
      try { hosts.add(new URL(/^\w+:\/\//.test(m[2]) ? m[2] : `https://${m[2]}`).hostname.toLowerCase()); } catch { /* not a location */ }
    }
  }
  return hosts;
}

export function isPublicUrl(url, privateHosts = new Set()) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (privateHosts.has(h)) return false;
  if (h === "localhost" || !h.includes(".") || /\.(local|internal|lan|corp|intranet|home)$/.test(h)) return false;
  if (/^(0|10|127)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^(::1|f[cd][0-9a-f]{2}:|fe80:)/.test(h)) return false;
  return true;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);

export function planDownloads(items, caps = CAPS) {
  const toFetch = [];
  const gaps = new Map();
  let total = 0;
  for (const it of items) {
    if (it.gap) continue;
    const size = Number(it.size ?? 0);
    if (size > caps.attachmentBytes) { gaps.set(it.ref, gap(it.ref, "over-cap", `${size} bytes > ${caps.attachmentBytes} per attachment`)); continue; }
    if (total + size > caps.ticketBytes) { gaps.set(it.ref, gap(it.ref, "over-cap", `the ticket's attachments would pass ${caps.ticketBytes} bytes`)); continue; }
    total += size;
    toFetch.push(it);
  }
  return { toFetch, gaps };
}

/** One public page as text. Redirects are followed by hand so every hop is re-checked (S5). */
export async function fetchPublicPage(url, file, { privateHosts = new Set(), fetchImpl = fetch, caps = CAPS } = {}) {
  let current = url;
  for (let hop = 0; hop <= caps.redirects; hop++) {
    if (!isPublicUrl(current, privateHosts)) {
      let host = current;
      try { host = new URL(current).hostname; } catch { /* keep the raw value */ }
      throw new GapError("private-host", `not fetched: ${host} is not a public host`);
    }
    const res = await fetchImpl(current, { redirect: "manual", headers: { Accept: "text/html,text/plain;q=0.9" } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).href; continue; }
    if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `HTTP ${res.status}`);
    if (res.status === 404 || res.status === 410) throw new GapError("deleted", `HTTP ${res.status}`);
    if (!res.ok) throw new GapError("unreadable", `HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)/.test(type)) throw new GapError("unreadable", `content-type ${type || "unknown"} is not a page`);
    const raw = await res.text();
    const text = /html/.test(type) ? htmlToText(raw) : raw;
    writeFileSync(file, text.slice(0, caps.pageTextBytes));
    return { path: file, truncated: text.length > caps.pageTextBytes };
  }
  throw new GapError("depth-limit", `more than ${caps.redirects} redirects`);
}
