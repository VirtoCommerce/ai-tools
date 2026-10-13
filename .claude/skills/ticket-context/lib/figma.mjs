// .claude/skills/ticket-context/lib/figma.mjs — a Figma link's frame as a PNG, read by prepare when the env names
// FIGMA_TOKEN (design-sources.md). One credential, never retried with another (S7); the token goes to
// api.figma.com only, and the image is downloaded from a Figma image host without it, under the attachment cap.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPS, isPublicUrl, readCapped, timedFetch } from "./fetch.mjs";
import { GapError, asGap, gap } from "./gap.mjs";

const API = "https://api.figma.com";
const KEY = /^[A-Za-z0-9]{6,64}$/;
// The hosts the images API answers with: Figma's own, or its S3 bucket. Anything else is never fetched.
const IMAGE_HOST = /^(?:[a-z0-9-]+\.)*figma\.com$|^figma-alpha-api\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;

/** The token, read through process.env after the layered loader (prepare ran it); blank is none. */
export function figmaToken(env = process.env) {
  const t = String(env.FIGMA_TOKEN ?? "").trim();
  return t || null;
}

/** fileKey (a branch's key when the link names one) and node-id (`1-2` and `1%3A2` both become `1:2`). */
export function parseFigmaUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !/(^|\.)figma\.com$/.test(u.hostname)) return null;
  const m = /^\/(?:file|design|proto|board)\/([^/]+)(?:\/branch\/([^/]+))?/.exec(u.pathname);
  const fileKey = m?.[2] ?? m?.[1];
  if (!fileKey || !KEY.test(fileKey)) return null;
  const node = (u.searchParams.get("node-id") ?? "").replace(/-/g, ":");
  return { fileKey, nodeId: /^\d+:\d+$/.test(node) ? node : null };
}

const isImageUrl = (s) => { try { const u = new URL(s); return u.protocol === "https:" && IMAGE_HOST.test(u.hostname) && isPublicUrl(s); } catch { return false; } };
const hostOf = (s) => { try { return new URL(s).hostname; } catch { return "an invalid URL"; } };

async function call(fetchImpl, url, init, ms, label) {
  try { return await timedFetch(fetchImpl, url, { ...init, redirect: "error" }, ms, label); } catch (e) {
    if (e instanceof GapError) throw e; // the timeout
    throw new GapError("unreadable", `could not reach ${hostOf(url)}`); // never the URL: it can carry a signature
  }
}

/** Bytes `maxBytes` at most (the caller's share of CAPS.ticketBytes). Returns { file, bytes }. */
export async function exportFigmaFrame({ url, token, file, fetchImpl = fetch, caps = CAPS, maxBytes = caps.attachmentBytes }) {
  const ref = parseFigmaUrl(url);
  if (!ref) throw new GapError("unreadable", "not a Figma file link with a file key");
  if (!ref.nodeId) throw new GapError("not-found", "no node-id in the Figma link — ask for a link to the frame, or a PNG export");
  const api = `${API}/v1/images/${ref.fileKey}?ids=${encodeURIComponent(ref.nodeId)}&format=png&scale=1`;
  if (new URL(api).origin !== API) throw new GapError("private-host", "not sent: the request is not for api.figma.com");
  const res = await call(fetchImpl, api, { headers: { "X-Figma-Token": token, Accept: "application/json" } }, caps.fetchTimeoutMs, "Figma images API");
  if (res.status === 401 || res.status === 403) throw new GapError("access-denied", `Figma ${res.status} — check FIGMA_TOKEN (never retried with another credential)`);
  if (res.status === 404) throw new GapError("deleted", "Figma 404 — the file or node is gone, or the token cannot see it");
  if (res.status === 429) throw new GapError("unreadable", "Figma rate limit reached — wait and run again with --fresh");
  if (!res.ok) throw new GapError("unreadable", `Figma ${res.status} on the images API`);
  let j;
  try { j = JSON.parse((await readCapped(res, 1024 * 1024, { label: "Figma images API", ms: caps.fetchTimeoutMs })).buf.toString("utf8")); } catch (e) {
    if (e instanceof GapError) throw e;
    throw new GapError("unreadable", "the Figma images API did not answer with JSON");
  }
  if (j?.err) throw new GapError("unreadable", `Figma could not render the node: ${String(j.err).slice(0, 120)}`);
  const img = j?.images?.[ref.nodeId];
  if (typeof img !== "string" || !img) throw new GapError("not-found", `Figma rendered no image for node ${ref.nodeId}`);
  if (!isImageUrl(img)) throw new GapError("private-host", `not fetched: ${hostOf(img)} is not a Figma image host`);
  const pic = await call(fetchImpl, img, { headers: { Accept: "image/png" } }, caps.downloadTimeoutMs, "Figma image"); // no token here
  if (!pic.ok) throw new GapError("unreadable", `Figma image download ${pic.status}`);
  const type = pic.headers.get("content-type") ?? "";
  if (type && !/^image\//.test(type)) throw new GapError("unreadable", `the Figma image is ${type}, not an image`);
  let buf;
  try { buf = (await readCapped(pic, maxBytes, { label: "Figma image", ms: caps.downloadTimeoutMs })).buf; } catch (e) {
    if (e instanceof GapError) throw e; // over-cap or the timeout
    throw new GapError("unreadable", `could not reach ${hostOf(img)}`); // a stream error can echo the signed URL
  }
  writeFileSync(file, buf);
  return { file, bytes: buf.length };
}

/** Step 0b for every Figma link when FIGMA_TOKEN is set. A link the images API cannot take (no file key, no
 *  node-id, /make/, /slides/, community, an instance id) stays a connector item, as without a token. At most
 *  CAPS.figmaFrames are exported; the rest get an over-cap gap each and ONE gap naming them all. Every PNG's bytes
 *  count against `budget` (what CAPS.ticketBytes leaves after the attachments). Returns { gaps, bytes }. */
export async function exportFigmaItems(items, { token, runDir, budget, fetchImpl = fetch, caps = CAPS }) {
  const gaps = [];
  const over = [];
  let left = budget;
  let done = 0;
  for (const it of items) {
    if (!parseFigmaUrl(it.url)?.nodeId) { it.needs_connector = true; continue; }
    if (done >= caps.figmaFrames) { over.push(it); continue; }
    if (left <= 0) { it.gap = gap(it.ref, "over-cap", `the ticket's attachments and Figma frames would pass ${caps.ticketBytes} bytes`); continue; }
    done++;
    try {
      const r = await exportFigmaFrame({ url: it.url, token, file: join(runDir, `figma-${done}.png`), fetchImpl, caps, maxBytes: Math.min(caps.attachmentBytes, left) });
      it.local_path = r.file;
      left -= r.bytes;
    } catch (e) { it.gap = asGap(it.ref, e); }
  }
  for (const it of over) it.gap = gap(it.ref, "over-cap", `past the cap of ${caps.figmaFrames} Figma frames — see gap "figma"`);
  if (over.length) gaps.push(gap("figma", "over-cap", `more than ${caps.figmaFrames} Figma frames; not exported: ${over.map((i) => i.ref).join(", ")}`));
  return { gaps, bytes: budget - left };
}
