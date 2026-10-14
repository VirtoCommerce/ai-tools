// .claude/skills/ticket-context/lib/fetch.mjs — P5 caps (D12, declared once here) and S5 public-page reads.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GapError, gap } from "./gap.mjs";

export const CAPS = Object.freeze({
  attachmentBytes: 25 * 2 ** 20, ticketBytes: 100 * 2 ** 20, frames: 12, frameEverySec: 2, docPages: 20,
  prs: 6, companions: 12, // companions: named companion PR references looked up per run (one hop; github.mjs)
  figmaFrames: 6, // Figma frames exported per ticket (figma.mjs); their bytes count toward ticketBytes
  hotspots: 12, claims: 25, // per PR, kept from the CHANGE agent's output (most important first); the rest is an over-cap gap
  diffBytes: 500 * 1024, prFiles: 300, pageTextBytes: 200 * 1024, linkedIssues: 10, redirects: 3,
  comments: 500, commentPage: 100, // comments read per ticket (oldest first) · page size on the Jira comment endpoint
  pageBytes: 2 * 2 ** 20, // raw bytes read from a public page before it is turned into text
  fetchTimeoutMs: 30_000, downloadTimeoutMs: 120_000, npmTimeoutMs: 300_000, ffmpegTimeoutMs: 120_000,
});

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return "unknown host"; } };
const isTimeout = (e) => e?.name === "TimeoutError" || e?.name === "AbortError";

/** A timeout becomes a GAP (never a hang, never a raw DOMException); anything else is returned unchanged. */
export function timeoutGap(e, label, ms) {
  return isTimeout(e) ? new GapError("unreadable", `timed out after ${Math.round(ms / 1000)} s: ${label}`) : e;
}

/** fetch with AbortSignal.timeout(ms): the signal also bounds reading the body. */
export async function timedFetch(fetchImpl, url, init, ms, label) {
  try { return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(ms) }); } catch (e) { throw timeoutGap(e, label, ms); }
}

/** Read a body as a stream up to `cap` bytes — never res.text() on a body whose size we do not control.
 *  Past the cap: `truncate` keeps the first `cap` bytes, else GAP over-cap. */
export async function readCapped(res, cap, { truncate = false, label = "body", ms = CAPS.fetchTimeoutMs } = {}) {
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of res.body ?? []) {
      const b = Buffer.from(chunk);
      if (total + b.length > cap) {
        if (!truncate) throw new GapError("over-cap", `more than ${cap} bytes: ${label}`);
        chunks.push(b.subarray(0, cap - total));
        total = cap;
        truncated = true;
        break; // leaving the loop cancels the stream
      }
      chunks.push(b);
      total += b.length;
    }
  } catch (e) { throw timeoutGap(e, label, ms); }
  return { buf: Buffer.concat(chunks), truncated };
}

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

// One spelling per host: lower-case, no IPv6 brackets, no trailing dots ("localhost." is localhost).
const normHost = (h) => String(h).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

// IPv4 ranges that are not the public internet. Applied only to a dotted quad: `new URL` has already folded
// decimal / hex / octal / short forms (2130706433, 0x7f.1, 127.1) into one, and a DNS name such as
// 10.example.com is a name, not an address.
function isPrivateIpv4(h) {
  const [a, b, c] = h.split(".").map(Number);
  return a === 0 || a === 10 || a === 127                    // "this" network, RFC1918, loopback
    || (a === 100 && b >= 64 && b <= 127)                    // CGNAT 100.64/10
    || (a === 169 && b === 254)                              // link-local (cloud metadata)
    || (a === 172 && b >= 16 && b <= 31)                     // RFC1918
    || (a === 192 && b === 0 && c === 0)                     // IETF protocol assignments 192.0.0/24
    || (a === 192 && b === 168)                              // RFC1918
    || (a === 198 && (b === 18 || b === 19))                 // benchmarking 198.18/15
    || a >= 224;                                             // multicast 224/4, reserved 240/4, broadcast
}

export function isPublicUrl(url, privateHosts = new Set()) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = normHost(u.hostname);
  if (!h) return false;
  if ([...privateHosts].some((p) => normHost(p) === h)) return false;
  // IPv6 literals are REFUSED outright: loopback (::1), unspecified (::), link-local (fe80::/10), ULA (fc00::/7)
  // and IPv4-mapped (::ffff:*) are all private or tunnelling, and a ticket's public page is never legitimately
  // named by a bare IPv6 address. Refusing the whole class is simpler and safer than enumerating the public part.
  if (h.includes(":")) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h === "localhost.localdomain") return false; // RFC 6761
  if (!h.includes(".") || /\.(local|internal|lan|corp|intranet|home)$/.test(h)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && isPrivateIpv4(h)) return false;
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
    if (!Number.isFinite(size) || size < 0) { gaps.set(it.ref, gap(it.ref, "unreadable", "attachment size unknown")); continue; }
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
    if (!isPublicUrl(current, privateHosts)) throw new GapError("private-host", `not fetched: ${hostOf(current)} is not a public host`);
    let res;
    try {
      res = await timedFetch(fetchImpl, current, { redirect: "manual", headers: { Accept: "text/html,text/plain;q=0.9" } }, caps.fetchTimeoutMs, hostOf(current));
    } catch (e) {
      if (e instanceof GapError) throw e; // the timeout, host-named
      // DNS / TLS / network: name the host only — the error text can echo the full URL, query string included.
      throw new GapError("unreadable", `could not reach ${hostOf(current)}`);
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      try { current = new URL(loc, current).href; } catch { throw new GapError("unreadable", `${hostOf(current)} sent an invalid redirect`); }
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `HTTP ${res.status}`);
    if (res.status === 404 || res.status === 410) throw new GapError("deleted", `HTTP ${res.status}`);
    if (!res.ok) throw new GapError("unreadable", `HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)/.test(type)) throw new GapError("unreadable", `content-type ${type || "unknown"} is not a page`);
    let body;
    try { body = await readCapped(res, caps.pageBytes, { truncate: true, label: hostOf(current), ms: caps.fetchTimeoutMs }); } catch (e) {
      if (e instanceof GapError) throw e;
      throw new GapError("unreadable", `could not read the body from ${hostOf(current)}`);
    }
    const raw = body.buf.toString("utf8");
    const text = /html/.test(type) ? htmlToText(raw) : raw;
    writeFileSync(file, text.slice(0, caps.pageTextBytes));
    return { path: file, truncated: body.truncated || text.length > caps.pageTextBytes };
  }
  throw new GapError("depth-limit", `more than ${caps.redirects} redirects`);
}
