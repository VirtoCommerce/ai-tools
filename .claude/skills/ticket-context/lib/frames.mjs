// .claude/skills/ticket-context/lib/frames.mjs — D4. ffmpeg is a SOFT dependency: absent ⇒ GAP with the remedy.
// Videos and animated GIFs share one path: a GIF with more than one frame is never read as its first frame.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CAPS } from "./fetch.mjs";

export const FFMPEG_REMEDY = "install ffmpeg (winget install ffmpeg) — elsewhere brew install ffmpeg / apt install ffmpeg";

export function ffmpegAvailable(spawn = spawnSync, timeout = CAPS.ffmpegTimeoutMs) {
  const r = spawn("ffmpeg", ["-version"], { stdio: "ignore", timeout });
  return r.status === 0;
}

export function frameArgs(input, outDir, caps) {
  const sec = caps.frameEverySec;
  const rate = Number.isInteger(sec) ? `1/${sec}` : `${Math.max(1, Math.round(1000 / sec))}/1000`; // a rational ffmpeg parses
  return ["-hide_banner", "-loglevel", "error", "-i", input, "-vf", `fps=${rate}`, "-frames:v", String(caps.frames), join(outDir, "frame-%02d.png")];
}

export function extractFrames(input, outDir, caps, spawn = spawnSync, what = "videos") {
  const timeout = caps.ffmpegTimeoutMs ?? CAPS.ffmpegTimeoutMs;
  if (!ffmpegAvailable(spawn, timeout)) return { gap: { reason: "tool-missing", detail: `${FFMPEG_REMEDY}, to read ${what}` } };
  mkdirSync(outDir, { recursive: true });
  const r = spawn("ffmpeg", frameArgs(input, outDir, caps), { stdio: "ignore", timeout });
  if (r.error?.code === "ETIMEDOUT") return { gap: { reason: "unreadable", detail: `ffmpeg timed out after ${Math.round(timeout / 1000)} s` } };
  const count = r.status === 0 ? readdirSync(outDir).filter((f) => /^frame-\d+\.png$/.test(f)).length : 0;
  if (!count) return { gap: { reason: "unreadable", detail: `ffmpeg produced no frames (exit ${r.status})` } };
  return { dir: outDir, count };
}

/** Frame count and duration of a GIF, from its block structure (no dependency): image descriptors (0x2C) are
 *  counted by walking the blocks, so a 0x2C byte inside image data is never one. Delays come from the Graphic
 *  Control Extensions (1/100 s; 0 is shown as 0.1 s by browsers). null = not a GIF. A truncated file counts
 *  the frames read so far. */
export function gifInfo(buf) {
  if (buf.length < 13 || !/^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return null;
  let i = 13;
  if (buf[10] & 0x80) i += 3 * 2 ** ((buf[10] & 0x07) + 1); // global colour table
  const skipSubBlocks = () => { while (i < buf.length && buf[i] !== 0) i += buf[i] + 1; i++; };
  let frames = 0;
  let cs = 0;
  let delay = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x3b) break; // trailer
    if (b === 0x21) { // extension: label, then sub-blocks
      if (buf[i + 1] === 0xf9 && i + 5 < buf.length) delay = buf[i + 4] | (buf[i + 5] << 8);
      i += 2;
      skipSubBlocks();
    } else if (b === 0x2c) { // image descriptor: 9 bytes, optional local colour table, LZW code size, sub-blocks
      if (i + 10 > buf.length) break;
      const packed = buf[i + 9];
      i += 10;
      if (packed & 0x80) i += 3 * 2 ** ((packed & 0x07) + 1);
      i++;
      skipSubBlocks();
      frames++;
      cs += delay || 10;
      delay = 0;
    } else break; // not a block: stop rather than guess
  }
  return { frames, durationSec: cs / 100 };
}

/** An attachment that is an animated GIF goes through the video path; anything else returns null (an image).
 *  The sampling interval shrinks for a short GIF so that its frames are not collapsed into one, never below
 *  0.1 s and never above the video interval; the frame cap is the video one. */
export function extractGifFrames(input, outDir, caps, spawn = spawnSync) {
  const info = gifInfo(readFileSync(input));
  if (!info || info.frames < 2) return null;
  const every = Math.min(caps.frameEverySec, Math.max(0.1, info.durationSec / caps.frames));
  return extractFrames(input, outDir, { ...caps, frameEverySec: every }, spawn, `an animated GIF (${info.frames} frames) — it is not read as one frame`);
}
