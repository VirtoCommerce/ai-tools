#!/usr/bin/env node
/**
 * crop — crop a screenshot to the region a step names and paint over anything that must not be shown
 * (a third-party trademark, a customer datum). Dependency-free. Boxes are [x,y,w,h] in the SOURCE image's
 * pixels; masks are given in source pixels too and are applied BEFORE the crop, so a mask can never be
 * cropped away by accident.
 *
 *   npm run crop -- --in frame.png --out step.png [--crop x,y,w,h] [--mask x,y,w,h]... [--color 208,208,208]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng } from "./make-gif.mjs";
import { encodePng } from "./contact-sheet.mjs";

export function cropMask(img, { crop, masks = [], color = [208, 208, 208] } = {}) {
  const rgb = Uint8Array.from(img.rgb);
  for (const [mx, my, mw, mh] of masks) {
    for (let y = Math.max(0, my); y < Math.min(img.height, my + mh); y++)
      for (let x = Math.max(0, mx); x < Math.min(img.width, mx + mw); x++) { const i = (y * img.width + x) * 3; rgb[i] = color[0]; rgb[i + 1] = color[1]; rgb[i + 2] = color[2]; }
  }
  const [cx, cy, cw, ch] = crop || [0, 0, img.width, img.height];
  if (cx < 0 || cy < 0 || cx + cw > img.width || cy + ch > img.height) throw new Error(`crop ${cx},${cy},${cw},${ch} is outside ${img.width}x${img.height}`);
  const out = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) rgb.subarray(((cy + y) * img.width + cx) * 3, ((cy + y) * img.width + cx + cw) * 3).forEach((v, k) => { out[y * cw * 3 + k] = v; });
  return { width: cw, height: ch, rgb: out };
}

if (process.argv[1]?.endsWith("crop.mjs")) {
  try {
    const a = process.argv.slice(2); let inp, out, crop, color; const masks = [];
    const box = (s) => { const b = s.split(",").map(Number); if (b.length !== 4 || b.some(Number.isNaN)) throw new Error(`bad box ${s}`); return b; };
    for (let i = 0; i < a.length; i++) { if (a[i] === "--in") inp = a[++i]; else if (a[i] === "--out") out = a[++i]; else if (a[i] === "--crop") crop = box(a[++i]); else if (a[i] === "--mask") masks.push(box(a[++i])); else if (a[i] === "--color") color = a[++i].split(",").map(Number); else throw new Error(`unknown arg ${a[i]}`); }
    if (!inp || !out) throw new Error("usage: --in frame.png --out step.png [--crop x,y,w,h] [--mask x,y,w,h]...");
    const r = cropMask(decodePng(readFileSync(inp)), { crop, masks, color });
    writeFileSync(out, encodePng(r.width, r.height, r.rgb));
    console.log(`[crop] ${out} — ${r.width}x${r.height}, ${masks.length} mask(s)`);
  } catch (e) { console.error(`[crop] ${e.message}`); process.exit(1); }
}
