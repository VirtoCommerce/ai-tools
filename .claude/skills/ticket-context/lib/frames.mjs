// .claude/skills/ticket-context/lib/frames.mjs — D4. ffmpeg is a SOFT dependency: absent ⇒ GAP with the remedy.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function ffmpegAvailable(spawn = spawnSync) {
  const r = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

export function frameArgs(input, outDir, caps) {
  return ["-hide_banner", "-loglevel", "error", "-i", input, "-vf", `fps=1/${caps.frameEverySec}`, "-frames:v", String(caps.frames), join(outDir, "frame-%02d.png")];
}

export function extractFrames(input, outDir, caps, spawn = spawnSync) {
  if (!ffmpegAvailable(spawn)) return { gap: { reason: "tool-missing", detail: "install ffmpeg (winget install ffmpeg · brew install ffmpeg · apt install ffmpeg) to read videos" } };
  mkdirSync(outDir, { recursive: true });
  const r = spawn("ffmpeg", frameArgs(input, outDir, caps), { stdio: "ignore" });
  const count = r.status === 0 ? readdirSync(outDir).filter((f) => /^frame-\d+\.png$/.test(f)).length : 0;
  if (!count) return { gap: { reason: "unreadable", detail: `ffmpeg produced no frames (exit ${r.status})` } };
  return { dir: outDir, count };
}
