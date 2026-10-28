// GENERATED from scripts/lib/verify-design-spec.ts by npm run vc-test:design — do not edit; the TypeScript is canonical
// scripts/lib/verify-design-spec.ts
import {
  SIZED_CONTROL_TOLERANCE_PX
} from "./measure-layout.mjs";
var NAMED_TRANSPARENT = /* @__PURE__ */ new Set(["transparent", "none", "inherit", "currentcolor"]);
function normalizeColor(input) {
  const raw = input.trim().toLowerCase();
  if (!raw || NAMED_TRANSPARENT.has(raw)) return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(raw);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h.slice(0, 3).split("").map((c) => c + c).join("");
    } else {
      h = h.slice(0, 6);
    }
    return `#${h}`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map((p) => {
      if (p.endsWith("%")) {
        const pct = Number.parseFloat(p);
        return Number.isFinite(pct) ? Math.round(pct / 100 * 255) : NaN;
      }
      return Number.parseInt(p, 10);
    });
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    return `#${parts.map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}
function normalizeLength(input) {
  const raw = input.trim().toLowerCase();
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(raw);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (!unit) return n === 0 ? "0px" : null;
  const px = unit === "px" ? n : n * 16;
  return `${Math.round(px * 100) / 100}px`;
}
function normalizeTokenValue(input) {
  return normalizeColor(input) ?? normalizeLength(input) ?? input.trim().toLowerCase().replace(/\s+/g, " ");
}
var ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " "
};
function decodeEntities(s) {
  return s.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
}
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
function truncate(s, max = 120) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1)}\u2026`;
}
function isIconName(s) {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(s) && s.length <= 48;
}
var FROM_HEADERS = ["from", "legacy", "old", "before", "current", "source", "was", "alias"];
var TO_HEADERS = ["to", "lucide", "new", "after", "canonical", "target", "replacement", "becomes"];
var SIZE_HEADERS = ["size", "px", "dimension"];
var PROPERTY_HEADERS = ["property", "\u0441\u0432\u043E\u0439\u0441\u0442\u0432\u043E", "parameter", "\u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440", "attribute", "\u0430\u0442\u0440\u0438\u0431\u0443\u0442"];
var PROD_HEADERS = ["prod", "\u043F\u0440\u043E\u0434", "production", "\u043F\u0440\u043E\u0434\u0430\u043A\u0448\u043D", "live", "current", "\u0441\u0435\u0439\u0447\u0430\u0441", "\u0431\u044B\u043B\u043E"];
var DESIGN_HEADERS = ["design", "\u0434\u0441", "ds", "\u0434\u0438\u0437\u0430\u0439\u043D", "\u043C\u0430\u043A\u0435\u0442", "target", "\u0441\u0442\u0430\u043B\u043E", "figma"];
function wordHeaderIndex(headers, candidates) {
  return headers.findIndex((h) => {
    const words = h.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return candidates.some((c) => h === c || words.includes(c));
  });
}
function pxLiterals(cell) {
  return [...cell.matchAll(/(-?\d+(?:[.,]\d+)?)\s*px\b/gi)].map((m) => Number.parseFloat(m[1].replace(",", ".")));
}
var STROKE_HEADERS = ["stroke", "stroke-width", "weight"];
function headerIndex(headers, candidates) {
  return headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));
}
function scriptBlocks(html) {
  return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}
function jsField(body, key) {
  const m = new RegExp(`\\b${key}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(body);
  return m ? m[1].replace(/\\(.)/g, "$1") : null;
}
function glyphToken(raw) {
  if (isIconName(raw)) return { name: raw, custom: false };
  const m = /^([a-z][a-z0-9-]*)\s*\(([^)]*)\)$/.exec(raw);
  if (m && isIconName(m[1]) && /\bcustom\b/.test(m[2])) return { name: m[1], custom: true };
  return null;
}
var DIVERGENCE_MARKERS = [
  "not yet implemented in code",
  "not implemented in code",
  "code pending",
  "pending in code",
  "applied in figma but not",
  "the frontend has to catch up"
];
var MAX_DIVERGENCES = 20;
function extractDesignSpec(html, opts) {
  const spec = {
    path: opts.path,
    cards: [],
    tokens: [],
    icons: [],
    geometry: [],
    strokeScales: [],
    arrowFamily: [],
    divergences: [],
    changes: [],
    unresolved: []
  };
  if (typeof html !== "string" || html.trim() === "") {
    spec.unresolved.push({
      kind: "document",
      fragment: "",
      reason: "artboard is empty or not text \u2014 nothing to extract"
    });
    return spec;
  }
  for (const m of html.matchAll(/<!--\s*@dsCard\b([\s\S]*?)-->/g)) {
    const attrs = m[1] ?? "";
    const group = /group\s*=\s*"([^"]*)"/.exec(attrs)?.[1];
    const name = /name\s*=\s*"([^"]*)"/.exec(attrs)?.[1];
    if (group || name) spec.cards.push({ group, name });
    else
      spec.unresolved.push({
        kind: "card",
        fragment: truncate(m[0]),
        reason: "@dsCard marker declares neither group nor name"
      });
  }
  const styleSources = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) styleSources.push(m[1]);
  for (const m of html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) styleSources.push(m[1]);
  const seenToken = /* @__PURE__ */ new Set();
  for (const src of styleSources) {
    for (const m of src.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+)/g)) {
      const name = m[1];
      const value = m[2].trim();
      if (seenToken.has(name)) continue;
      seenToken.add(name);
      if (/var\(/i.test(value)) {
        spec.unresolved.push({
          kind: "token",
          fragment: truncate(`${name}: ${value}`),
          reason: "value is a var() indirection \u2014 no literal to compare against"
        });
        continue;
      }
      spec.tokens.push({ name, value, normalized: normalizeTokenValue(value) });
    }
  }
  for (const tableMatch of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = tableMatch[1];
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (r) => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => stripTags(c[1]))
    );
    if (rows.length < 2) {
      spec.unresolved.push({
        kind: "icon",
        fragment: truncate(stripTags(table)),
        reason: "table has fewer than two rows \u2014 no header + data pair to read"
      });
      continue;
    }
    const headers = rows[0].map((h) => h.toLowerCase());
    const propIdx = wordHeaderIndex(headers, PROPERTY_HEADERS);
    const prodIdx = wordHeaderIndex(headers, PROD_HEADERS);
    const designIdx = wordHeaderIndex(headers, DESIGN_HEADERS);
    const dataRows = rows.slice(1).filter((r) => r.some((c) => c));
    const allIconPairs = dataRows.length > 0 && dataRows.every(
      (r) => isIconName((r[prodIdx] ?? "").toLowerCase()) && isIconName((r[designIdx] ?? "").toLowerCase())
    );
    if (propIdx >= 0 && prodIdx >= 0 && designIdx >= 0 && (/* @__PURE__ */ new Set([propIdx, prodIdx, designIdx])).size === 3 && !allIconPairs) {
      for (const row of dataRows) {
        const property = row[propIdx] ?? "";
        const prod = row[prodIdx] ?? "";
        const design = row[designIdx] ?? "";
        if (!property) continue;
        const want = pxLiterals(design);
        if (want.length !== 1) {
          spec.unresolved.push({
            kind: "property",
            fragment: truncate(`${property}: ${design}`),
            reason: want.length === 0 ? "change row declares no px value \u2014 a prose requirement; verify it through a checklist case" : `change row declares ${want.length} px values \u2014 which one is measurable is a judgment; verify it through a checklist case`
          });
          continue;
        }
        const had = pxLiterals(prod);
        const change = { property, prod, design, designPx: want[0] };
        if (had.length === 1) change.prodPx = had[0];
        spec.changes.push(change);
      }
      continue;
    }
    const fromIdx = headerIndex(headers, FROM_HEADERS);
    const toIdx = headerIndex(headers, TO_HEADERS);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
      const sizeIdx2 = headerIndex(headers, SIZE_HEADERS);
      const candidate = [];
      let ok = sizeIdx2 > 0;
      if (ok) {
        for (const row of rows.slice(1)) {
          const name = (row[0] ?? "").toLowerCase();
          const px = Number.parseFloat((row[sizeIdx2] ?? "").replace(/[^\d.]/g, ""));
          if (!name || !Number.isFinite(px)) {
            ok = false;
            break;
          }
          candidate.push({ name, px });
        }
      }
      if (ok && candidate.length > 0) {
        spec.geometry.push(...candidate);
      } else {
        spec.unresolved.push({
          kind: "icon",
          fragment: truncate(rows[0].join(" | ")),
          reason: "unrecognized table header \u2014 expected a from\u2192to column pair (icon map) or a name+size pair (scale)"
        });
      }
      continue;
    }
    const sizeIdx = headerIndex(headers, SIZE_HEADERS);
    const strokeIdx = headerIndex(headers, STROKE_HEADERS);
    for (const row of rows.slice(1)) {
      const from = (row[fromIdx] ?? "").toLowerCase().replace(/^`|`$/g, "").trim();
      const to = (row[toIdx] ?? "").toLowerCase().replace(/^`|`$/g, "").trim();
      if (!from || !to) continue;
      if (!isIconName(from) || !isIconName(to)) {
        spec.unresolved.push({
          kind: "icon",
          fragment: truncate(`${from} \u2192 ${to}`),
          reason: "row does not read as an icon-name pair (prose or multi-token cell)"
        });
        continue;
      }
      const entry = { from, to };
      if (sizeIdx >= 0) {
        const px = Number.parseFloat((row[sizeIdx] ?? "").replace(/[^\d.]/g, ""));
        if (Number.isFinite(px)) entry.sizePx = px;
      }
      if (strokeIdx >= 0) {
        const sw = Number.parseFloat((row[strokeIdx] ?? "").replace(/[^\d.]/g, ""));
        if (Number.isFinite(sw)) entry.strokeWidth = sw;
      }
      spec.icons.push(entry);
    }
  }
  const text = stripTags(
    html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
  );
  const known = new Set(spec.icons.map((i) => `${i.from}>${i.to}`));
  const addPair = (rawFrom, rawTo) => {
    const from = rawFrom.toLowerCase();
    const to = rawTo.toLowerCase();
    if (!isIconName(from) || !isIconName(to)) return;
    if (known.has(`${from}>${to}`)) return;
    known.add(`${from}>${to}`);
    spec.icons.push({ from, to });
  };
  for (const m of html.matchAll(
    /<code[^>]*>([\s\S]*?)<\/code>\s*(?:→|-&gt;|->|=&gt;|=>)\s*<code[^>]*>([\s\S]*?)<\/code>/gi
  )) {
    addPair(stripTags(m[1]).trim(), stripTags(m[2]).trim());
  }
  for (const m of text.matchAll(/([A-Za-z0-9][\w-]{1,47})\s*(?:→|->|=>)\s*([A-Za-z0-9][\w-]{1,47})/g)) {
    const from = m[1].toLowerCase();
    const to = m[2].toLowerCase();
    if (!from.includes("-") && !to.includes("-")) continue;
    addPair(from, to);
  }
  for (const block of scriptBlocks(html)) {
    if (!/MIGRATION_LOG/.test(block)) continue;
    for (const obj of block.matchAll(/\{[^{}]*\}/g)) {
      const body = obj[0];
      const vc = jsField(body, "vc");
      const lucide = jsField(body, "lucide");
      if (vc == null || lucide == null) continue;
      const from = vc.toLowerCase().trim();
      const target = glyphToken(lucide.toLowerCase().trim());
      if (!isIconName(from) || target === null) {
        spec.unresolved.push({
          kind: "icon",
          fragment: truncate(`${vc} -> ${lucide}`),
          reason: !isIconName(from) ? "migration-log source cell is not a bare glyph name (carries a clarifier or prose)" : "migration-log target cell is not a bare glyph name (carries a clarifier or prose)"
        });
        continue;
      }
      const entry = { from, to: target.name };
      if (target.custom) entry.custom = true;
      const surface = jsField(body, "pages");
      if (surface) entry.surface = surface.trim();
      spec.icons.push(entry);
    }
  }
  for (const block of scriptBlocks(html)) {
    const flats = /* @__PURE__ */ new Map();
    for (const m of block.matchAll(/\b([A-Z0-9_]*FLAT)\s*=\s*([\d.]+)/g)) {
      flats.set(m[1], Number.parseFloat(m[2]));
    }
    for (const m of block.matchAll(/\b([A-Z0-9_]*STOPS)\s*=\s*(\[\s*\[[\s\S]*?\]\s*\])/g)) {
      const name = m[1];
      const family = /(?:^|_)A_?STOPS$|ARROW/.test(name) ? "arrow" : "base";
      const stops = [];
      for (const pair of m[2].matchAll(/\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g)) {
        stops.push([Number.parseFloat(pair[1]), Number.parseFloat(pair[2])]);
      }
      const flat = flats.get(family === "arrow" ? "A_FLAT" : "FLAT") ?? flats.get(`${name.replace(/STOPS$/, "")}FLAT`);
      if (stops.length === 0 || flat == null || !Number.isFinite(flat)) {
        spec.unresolved.push({
          kind: "geometry",
          fragment: truncate(`${name} = ${m[2]}`),
          reason: stops.length === 0 ? "stroke ladder declares no [size, weight] pairs" : "stroke ladder has no matching flat-ceiling constant \u2014 without it every size above the last bucket would be an extrapolation"
        });
        continue;
      }
      stops.sort((a, b) => a[0] - b[0]);
      spec.strokeScales.push({ family, stops, flat });
    }
  }
  for (const sec of html.matchAll(/<section[^>]*>([\s\S]*?)<\/section>/gi)) {
    const body = sec[1];
    if (!/svg\.lucide-/.test(body)) continue;
    if (!/arrow family/i.test(stripTags(body))) continue;
    for (const c of body.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/gi)) {
      const tok = stripTags(c[1]).trim().toLowerCase();
      if (/^[a-z][a-z0-9-]*\*?$/.test(tok) && tok.length <= 48 && !spec.arrowFamily.includes(tok)) {
        spec.arrowFamily.push(tok);
      }
    }
  }
  if (spec.strokeScales.some((s) => s.family === "arrow") && spec.arrowFamily.length === 0) {
    spec.unresolved.push({
      kind: "geometry",
      fragment: "arrow-family glyph list",
      reason: "artboard declares an arrow stroke ladder but no readable glyph list for it \u2014 assigning a glyph to a ladder would be a guess"
    });
  }
  const proseAll = stripTags(
    html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
  );
  const proseLower = proseAll.toLowerCase();
  for (const marker of DIVERGENCE_MARKERS) {
    let at = proseLower.indexOf(marker);
    while (at !== -1 && spec.divergences.length < MAX_DIVERGENCES) {
      spec.divergences.push({
        marker,
        fragment: truncate(proseAll.slice(Math.max(0, at - 140), at + marker.length + 60), 220)
      });
      at = proseLower.indexOf(marker, at + marker.length);
    }
  }
  return spec;
}
function designTokenAuditSnippet(spec) {
  const names = JSON.stringify(spec.tokens.map((t) => [t.name, t.normalized]));
  return `(() => {
  const spec = ${names};
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const items = spec.map(([name, expected]) => {
    const live = (cs.getPropertyValue(name) || '').trim();
    return { name: name, expected: expected, live: live };
  });
  return { evaluated: items.length, items: items };
})()`;
}
function iconParityAuditSnippet(spec, selector = ".vc-icon, [class*='vc-icon'], svg[data-icon]", opts = {}) {
  const needle = (opts.surface ?? "").trim().toLowerCase();
  const inScope = spec.icons.filter(
    (i) => !needle || !i.surface || i.surface.toLowerCase().includes(needle)
  );
  const merged = /* @__PURE__ */ new Map();
  for (const i of inScope) {
    const cur = merged.get(i.from);
    if (!cur) {
      merged.set(i.from, {
        tos: [i.to],
        sizePx: i.sizePx ?? null,
        strokeWidth: i.strokeWidth ?? null,
        custom: i.custom === true
      });
      continue;
    }
    if (!cur.tos.includes(i.to)) cur.tos.push(i.to);
    if (cur.sizePx !== (i.sizePx ?? null)) cur.sizePx = null;
    if (cur.strokeWidth !== (i.strokeWidth ?? null)) cur.strokeWidth = null;
    if (i.custom === true) cur.custom = true;
  }
  const map = JSON.stringify(
    [...merged.entries()].map(([from, v]) => [from, v.tos, v.sizePx, v.strokeWidth, v.custom])
  );
  const legacy = JSON.stringify(
    [...merged.entries()].filter(([from, v]) => !v.tos.includes(from)).map(([from, v]) => [from, v.tos])
  );
  return `(() => {
  const spec = ${map};
  const legacyPairs = ${legacy};
  const expected = new Map(spec.map(r => [r[0], { to: r[1][0], tos: r[1], sizePx: r[2], strokeWidth: r[3], custom: r[4] }]));
  const retired = new Map(legacyPairs);
  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  const items = nodes.map(el => {
    const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
    const requested = (el.getAttribute('data-icon') || el.getAttribute('data-name')
      || (svg && (svg.getAttribute('data-icon') || svg.getAttribute('data-name'))) || '').toLowerCase();
    // Glyph identity is frequently carried ONLY by the icon-set class the renderer stamps
    // (svg class="lucide lucide-shopping-cart"). Reading data-* alone leaves the rendered name
    // empty on such an implementation, every lookup misses, and the axis reports advisory-clean
    // verifying nothing at all.
    const cls = (svg && svg.getAttribute('class')) || '';
    const fromClass = (/(?:^|\\s)lucide-([a-z0-9-]+)/.exec(cls) || [])[1] || '';
    const rendered = (
      (svg && (svg.getAttribute('data-lucide') || svg.getAttribute('data-glyph')
        || svg.getAttribute('data-icon-name'))) || fromClass || ''
    ).toLowerCase();
    const rect = el.getBoundingClientRect();
    const cs = svg ? getComputedStyle(svg) : null;
    // A glyph with no drawable geometry is blank on screen even though the element exists.
    const drawable = svg ? svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').length : 0;
    return {
      requested: requested,
      rendered: rendered,
      hasSvg: !!svg,
      drawable: drawable,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      strokeWidth: cs ? parseFloat(cs.strokeWidth) || null : null,
      spec: requested && expected.has(requested) ? expected.get(requested) : null,
      // Reverse check, usable when the call-site name is not exposed: did a retired glyph paint?
      legacy: (!requested || !expected.has(requested)) && rendered && retired.has(rendered)
        ? { from: rendered, tos: retired.get(rendered) }
        : null
    };
  });
  return { evaluated: items.length, specCount: spec.length, items: items };
})()`;
}
function componentGeometryAuditSnippet(spec, selector) {
  const geo = JSON.stringify(spec.geometry.map((g) => [g.name, g.px, g.ratio ?? null]));
  return `(() => {
  const spec = ${geo};
  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  const items = nodes.map(el => {
    const rect = el.getBoundingClientRect();
    // Match a declared size by the element's own size token when it exposes one, else by
    // nearest declared px \u2014 reported, never silently assumed correct.
    const declared = (el.getAttribute('data-size') || '').toLowerCase();
    const match = spec.find(s => s[0] === declared) || null;
    return {
      tag: el.tagName.toLowerCase(),
      declared: declared,
      expectedPx: match ? match[1] : null,
      expectedRatio: match ? match[2] : null,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100
    };
  });
  return { evaluated: items.length, specCount: spec.length, items: items };
})()`;
}
function propertyAuditSnippet(targets) {
  return `(() => {
  const targets = ${JSON.stringify(targets)};
  const items = targets.map(t => {
    const el = document.querySelector(t.selector);
    if (!el) return { property: t.property, selector: t.selector, metric: t.metric, live: null };
    let live;
    if (t.metric === 'width' || t.metric === 'height') {
      const r = el.getBoundingClientRect();
      live = t.metric === 'width' ? r.width : r.height;
    } else {
      const cs = getComputedStyle(el);
      const prop = t.metric === 'border-radius' ? 'border-top-left-radius' : t.metric;
      live = Number.parseFloat(cs.getPropertyValue(prop));
    }
    return {
      property: t.property,
      selector: t.selector,
      metric: t.metric,
      live: Number.isFinite(live) ? Math.round(live * 100) / 100 : null
    };
  });
  return { evaluated: items.length, items: items };
})()`;
}
function rollUp(axis, items, opts = {}) {
  const counts = { CONFIRMED: 0, DRIFT: 0, MISSING: 0, UNSPEC: 0, KNOWN_DIVERGENCE: 0, SKIPPED: 0 };
  for (const i of items) counts[i.verdict]++;
  const failing = items.filter((i) => i.verdict === "DRIFT" || i.verdict === "MISSING");
  const unresolved = opts.unresolved ?? 0;
  if (items.length === 0) {
    return {
      axis,
      verdict: "SKIPPED",
      severity: "WARN",
      message: `No ${axis} expectations to check${unresolved ? ` (${unresolved} unresolved spec entr${unresolved === 1 ? "y" : "ies"})` : ""} \u2014 axis not exercised, not passed`,
      evidence: { counts, unresolved }
    };
  }
  if (failing.length === 0) {
    const extra = counts.UNSPEC ? `, ${counts.UNSPEC} not covered by spec` : "";
    const known = counts.KNOWN_DIVERGENCE ? `, ${counts.KNOWN_DIVERGENCE} known design/code divergence(s)` : "";
    return {
      axis,
      verdict: "CONFIRMED",
      severity: unresolved > 0 || counts.KNOWN_DIVERGENCE > 0 ? "WARN" : "PASS",
      message: `${counts.CONFIRMED}/${items.length} match the design spec${extra}${known}${unresolved ? `; ${unresolved} spec entr${unresolved === 1 ? "y" : "ies"} unresolved` : ""}`,
      evidence: { counts, unresolved, items }
    };
  }
  const first = failing[0];
  return {
    axis,
    verdict: first.verdict,
    severity: "FAIL",
    message: `${failing.length} design-spec deviation(s) (${counts.DRIFT} drift, ${counts.MISSING} missing); first: ${first.subject} \u2014 ${first.detail}`,
    evidence: { counts, unresolved, violations: failing, items }
  };
}
function classifyDesignToken(result, opts = {}) {
  const items = result.items.map((t) => {
    if (!t.live) {
      return {
        subject: t.name,
        verdict: "MISSING",
        detail: `declared ${t.expected}, not defined on the live page`
      };
    }
    const live = normalizeTokenValue(t.live);
    if (live === t.expected) {
      return { subject: t.name, verdict: "CONFIRMED", detail: live };
    }
    return {
      subject: t.name,
      verdict: "DRIFT",
      detail: `spec ${t.expected}, live ${live}`
    };
  });
  return rollUp("DESIGN-TOKEN", items, opts);
}
function classifyIconParity(result, opts = {}) {
  const divergences = opts.divergences ?? [];
  const threshold = opts.solidThresholdPx ?? 16;
  const items = result.items.map((i) => {
    const subject = i.requested || i.legacy?.from || i.rendered || "(unnamed icon)";
    if (!i.spec && i.legacy) {
      const target = i.legacy.tos.map((t) => `"${t}"`).join(" | ");
      return {
        subject,
        verdict: "DRIFT",
        detail: `retired glyph "${i.legacy.from}" still rendering; the spec replaces it with ${target}`
      };
    }
    if (!i.spec) {
      return {
        subject,
        verdict: "UNSPEC",
        detail: "rendered icon is not covered by the design spec"
      };
    }
    if (!i.hasSvg || i.drawable === 0) {
      return {
        subject,
        verdict: "MISSING",
        detail: `expected glyph "${i.spec.to}" but nothing drawable rendered`
      };
    }
    const allowed = i.spec.tos && i.spec.tos.length ? i.spec.tos : [i.spec.to];
    if (i.rendered && !allowed.includes(i.rendered)) {
      const expectedText = allowed.map((t) => `"${t}"`).join(" | ");
      const custom = i.spec.custom ? " (spec flags the glyph as custom-authored)" : "";
      if (divergences.length > 0 && Math.max(i.width, i.height) < threshold) {
        return {
          subject,
          verdict: "KNOWN_DIVERGENCE",
          detail: `rendered "${i.rendered}" vs spec ${expectedText} at ${i.width}\xD7${i.height}px \u2014 below the ${threshold}px threshold governed by a rule the spec declares unshipped ("${divergences[0].marker}")`
        };
      }
      return {
        subject,
        verdict: "DRIFT",
        detail: `spec glyph ${expectedText}, rendered "${i.rendered}"${custom}`
      };
    }
    if (i.spec.sizePx != null) {
      const worst = Math.max(Math.abs(i.width - i.spec.sizePx), Math.abs(i.height - i.spec.sizePx));
      if (worst > SIZED_CONTROL_TOLERANCE_PX) {
        return {
          subject,
          verdict: "DRIFT",
          detail: `spec ${i.spec.sizePx}px, rendered ${i.width}\xD7${i.height}px`
        };
      }
    }
    if (i.spec.strokeWidth != null && i.strokeWidth != null && i.strokeWidth !== i.spec.strokeWidth) {
      return {
        subject,
        verdict: "DRIFT",
        detail: `spec stroke ${i.spec.strokeWidth}, rendered ${i.strokeWidth}`
      };
    }
    const detail = i.rendered || (allowed.length > 1 ? `drawable glyph rendered; spec allows ${allowed.map((t) => `"${t}"`).join(" | ")} here (no rendered-name attribute to disambiguate)` : i.spec.to);
    return { subject, verdict: "CONFIRMED", detail };
  });
  return rollUp("DESIGN-ICON", items, opts);
}
function classifyComponentGeometry(result, opts = {}) {
  const items = result.items.map((g) => {
    const subject = `${g.tag}${g.declared ? `[data-size=${g.declared}]` : ""}`;
    if (g.expectedPx == null) {
      return {
        subject,
        verdict: "UNSPEC",
        detail: "no declared size token matches this control"
      };
    }
    if (g.width === 0 || g.height === 0) {
      return {
        subject,
        verdict: "MISSING",
        detail: `declared ${g.expectedPx}px but the control has zero area`
      };
    }
    const worst = Math.max(Math.abs(g.width - g.expectedPx), Math.abs(g.height - g.expectedPx));
    if (worst > SIZED_CONTROL_TOLERANCE_PX) {
      return {
        subject,
        verdict: "DRIFT",
        detail: `spec ${g.expectedPx}px, rendered ${g.width}\xD7${g.height}px`
      };
    }
    if (g.expectedRatio != null) {
      const ratio = g.width / g.height;
      if (Math.abs(ratio - g.expectedRatio) > 0.02) {
        return {
          subject,
          verdict: "DRIFT",
          detail: `spec ratio ${g.expectedRatio}, rendered ${Math.round(ratio * 100) / 100}`
        };
      }
    }
    return { subject, verdict: "CONFIRMED", detail: `${g.width}\xD7${g.height}px` };
  });
  return rollUp("DESIGN-GEOMETRY", items, opts);
}
function classifyPropertyChanges(result, spec, opts = {}) {
  const measured = new Set(result.items.map((i) => i.property));
  const items = result.items.map((m) => {
    const subject = `${m.property} (${m.metric} of ${m.selector})`;
    const change = spec.changes.find((c) => c.property === m.property);
    if (!change) {
      return { subject, verdict: "UNSPEC", detail: "not a declared change row" };
    }
    if (m.live == null) {
      return {
        subject,
        verdict: "MISSING",
        detail: `design ${change.designPx}px, but the selector matched nothing measurable`
      };
    }
    if (Math.abs(m.live - change.designPx) <= SIZED_CONTROL_TOLERANCE_PX) {
      return { subject, verdict: "CONFIRMED", detail: `${m.live}px` };
    }
    const stillProd = change.prodPx != null && Math.abs(m.live - change.prodPx) <= SIZED_CONTROL_TOLERANCE_PX;
    return {
      subject,
      verdict: "DRIFT",
      detail: `design ${change.designPx}px, rendered ${m.live}px${stillProd ? " \u2014 still the prod value, redesign not applied" : ""}`
    };
  });
  const unmeasured = spec.changes.filter((c) => !measured.has(c.property));
  for (const c of unmeasured) {
    items.push({ subject: c.property, verdict: "SKIPPED", detail: `design ${c.designPx}px \u2014 not measured` });
  }
  return rollUp("DESIGN-PROPERTY", items, { unresolved: (opts.unresolved ?? 0) + unmeasured.length });
}
function expectedStroke(renderedPx, scale) {
  for (const [max, weight] of scale.stops) if (renderedPx <= max) return weight;
  return scale.flat;
}
function matchesGlyphPattern(name, patterns) {
  return patterns.some((p) => p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p);
}
function iconStrokeAuditSnippet(spec, selector = "svg[data-lucide-icon], svg[class*='lucide-'], .vc-icon svg") {
  void spec;
  return `(() => {
  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
  const items = nodes.map(svg => {
    const cs = getComputedStyle(svg);
    const cls = svg.getAttribute('class') || '';
    const m = /(?:^|\\s)lucide-([a-z0-9-]+)/.exec(cls);
    const name = (svg.getAttribute('data-lucide') || svg.getAttribute('data-icon')
      || (m && m[1]) || '').toLowerCase();
    const rect = svg.getBoundingClientRect();
    const sw = parseFloat(cs.strokeWidth);
    return {
      name: name,
      width: Math.round(rect.width * 100) / 100,
      strokeWidth: Number.isFinite(sw) ? sw : null,
      vectorEffect: cs.vectorEffect || '',
      fill: cs.fill || ''
    };
  });
  return {
    evaluated: items.length,
    rootPin: getComputedStyle(document.documentElement)
      .getPropertyValue('--lucide-stroke-width').trim(),
    items: items
  };
})()`;
}
var STROKE_TOLERANCE_PX = 0.01;
var NO_FILL = /* @__PURE__ */ new Set(["none", "rgba(0, 0, 0, 0)", "transparent"]);
function classifyIconStroke(result, spec, opts = {}) {
  const base = spec.strokeScales.find((s) => s.family === "base");
  const arrow = spec.strokeScales.find((s) => s.family === "arrow");
  const threshold = opts.solidThresholdPx ?? 16;
  const hasDivergence = spec.divergences.length > 0;
  const items = [];
  if (result.rootPin) {
    items.push({
      subject: "--lucide-stroke-width on :root",
      verdict: "DRIFT",
      detail: `global pin "${result.rootPin}" flattens every stepped bucket at once \u2014 the artboard restricts this pin to per-instance optical corrections`
    });
  }
  for (const it of result.items) {
    const subject = it.name || "(unnamed glyph)";
    if (it.vectorEffect !== "non-scaling-stroke") {
      items.push({
        subject,
        verdict: "DRIFT",
        detail: `vector-effect is "${it.vectorEffect || "(unset)"}", not non-scaling-stroke \u2014 stroke-width is in viewBox units, so no bucket can be evaluated`
      });
      continue;
    }
    if (it.fill && !NO_FILL.has(it.fill.trim().toLowerCase())) {
      items.push({
        subject,
        verdict: "DRIFT",
        detail: `fill is "${it.fill}" on an outline glyph \u2014 it beats fill="none" and floods the contour`
      });
      continue;
    }
    if (spec.arrowFamily.length === 0) {
      items.push({
        subject,
        verdict: "UNSPEC",
        detail: "artboard declares no arrow-family glyph list \u2014 cannot say which ladder applies"
      });
      continue;
    }
    const isArrow = matchesGlyphPattern(subject, spec.arrowFamily);
    const scale = isArrow ? arrow : base;
    if (!scale) {
      items.push({
        subject,
        verdict: "UNSPEC",
        detail: `no ${isArrow ? "arrow" : "base"} stroke ladder in the spec`
      });
      continue;
    }
    if (it.strokeWidth == null) {
      items.push({ subject, verdict: "MISSING", detail: "no computed stroke-width to read" });
      continue;
    }
    const want = expectedStroke(it.width, scale);
    if (Math.abs(it.strokeWidth - want) <= STROKE_TOLERANCE_PX) {
      items.push({
        subject,
        verdict: "CONFIRMED",
        detail: `${it.width}px \u2192 ${it.strokeWidth} (${isArrow ? "arrow" : "base"} ladder)`
      });
      continue;
    }
    if (hasDivergence && !isArrow && it.width < threshold) {
      items.push({
        subject,
        verdict: "KNOWN_DIVERGENCE",
        detail: `${it.width}px renders outline at ${it.strokeWidth} \u2014 below the ${threshold}px solid threshold the spec declares unshipped ("${spec.divergences[0].marker}")`
      });
      continue;
    }
    items.push({
      subject,
      verdict: "DRIFT",
      detail: `${it.width}px should render ${want} on the ${isArrow ? "arrow" : "base"} ladder, rendered ${it.strokeWidth}`
    });
  }
  return rollUp("DESIGN-STROKE", items, opts);
}
function designAxisSkipped(reason, axes = ["DESIGN-TOKEN", "DESIGN-GEOMETRY", "DESIGN-ICON", "DESIGN-STROKE", "DESIGN-PROPERTY"]) {
  return axes.map((axis) => ({
    axis,
    verdict: "SKIPPED",
    severity: "WARN",
    message: `${axis} not verified \u2014 ${reason}`,
    evidence: { reason }
  }));
}
function summarizeDesignFindings(findings) {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, P0: 0 };
  for (const f of findings) counts[f.severity]++;
  const severity = counts.P0 > 0 ? "P0" : counts.FAIL > 0 ? "FAIL" : counts.WARN > 0 ? "WARN" : "PASS";
  const allSkipped = findings.length > 0 && findings.every((f) => f.verdict === "SKIPPED");
  const divergent = findings.filter((f) => f.verdict === "KNOWN_DIVERGENCE").length;
  const verdict = allSkipped ? "SKIPPED" : findings.find((f) => f.verdict === "DRIFT" || f.verdict === "MISSING")?.verdict ?? (divergent > 0 ? "KNOWN_DIVERGENCE" : "CONFIRMED");
  return {
    severity,
    verdict,
    counts,
    line: allSkipped ? `Design axis SKIPPED \u2014 ${findings[0]?.message ?? "no authorized design source"}` : `Design axis ${verdict} (${counts.FAIL + counts.P0} failing, ${counts.WARN} advisory, ${counts.PASS} clean${divergent ? `, ${divergent} known divergence` : ""})`
  };
}
export {
  classifyComponentGeometry,
  classifyDesignToken,
  classifyIconParity,
  classifyIconStroke,
  classifyPropertyChanges,
  componentGeometryAuditSnippet,
  designAxisSkipped,
  designTokenAuditSnippet,
  expectedStroke,
  extractDesignSpec,
  iconParityAuditSnippet,
  iconStrokeAuditSnippet,
  matchesGlyphPattern,
  normalizeColor,
  normalizeLength,
  normalizeTokenValue,
  propertyAuditSnippet,
  summarizeDesignFindings
};
