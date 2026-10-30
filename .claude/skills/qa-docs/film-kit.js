// qa-docs film kit — written into a Motion film's modules/shared.js store document (append the
// FILM_CSS rules to the film's modules/base.css). Never published as a file: a film owns no files.
// Source: the VCST-6121 "Sign in with a passkey" film, 2026-10-30. See media.md §Film.
// Shots: {file, w?, h?, masks?: [[x, y, w, h], …]} — mask boxes in screenshot pixels, measured per stand.

// eslint-disable-next-line no-unused-vars
const FILM_CSS = ".desk { position:absolute; inset:0; background:color-mix(in srgb, var(--ground) 94%, var(--second)) }\n.scr-win { position:absolute; border-radius:16px; overflow:hidden; background:var(--ground); box-shadow:0 30px 80px rgba(0,0,0,.16), 0 0 0 1px color-mix(in srgb, var(--second) 12%, transparent) }\n.scr-bar { height:40px; display:flex; align-items:center; gap:9px; padding:0 18px; background:color-mix(in srgb, var(--ground) 92%, var(--second)) }\n.scr-bar i { width:12px; height:12px; border-radius:50%; background:color-mix(in srgb, var(--ground) 72%, var(--second)) }\n.scr-url { margin-left:18px; width:520px; height:26px; border-radius:13px; background:var(--ground); font-size:15px; line-height:26px; padding:0 14px; color:color-mix(in srgb, var(--second) 65%, var(--ground)); white-space:nowrap }\n.scr-view { position:relative; overflow:hidden }\n.scr-layer { position:absolute; left:0; top:0; overflow:hidden } .scr-layer img { display:block }\n.scr-mask { position:absolute; border-radius:50%; background:var(--ground) }\n.scr-hl { position:absolute; border-radius:8px; background:color-mix(in srgb, var(--second) 8%, transparent); opacity:0 }\n.scr-kick { left:240px; top:30px }\n.pr-dim { position:absolute; inset:0; background:color-mix(in srgb, var(--second) 45%, transparent) }\n.pr-card { position:absolute; left:660px; top:260px; width:600px; height:500px; border-radius:28px; background:var(--ground); box-shadow:0 30px 90px rgba(0,0,0,.25); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px }\n.pr-title { margin:0; font-size:32px; font-weight:700; text-align:center; width:500px } .pr-note { margin:0; font-size:24px; color:color-mix(in srgb, var(--second) 60%, var(--ground)) }\n.pr-fill { fill:var(--main) } .pr-arc { fill:none; stroke:var(--accent); stroke-width:9; stroke-linecap:round; stroke-dasharray:1 1 } .pr-ok { fill:none; stroke:var(--ground); stroke-width:14; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:1 1 }";

window.UI = window.UI || {};

// A browser window holding real screenshots (1920x1080 at 0.75), with a camera, layers and a pointer helper.
UI.SHOT = { x: 240, y: 155, s: 0.75, bar: 40 };
UI.screen = function (kit, shots) {
  const S = UI.SHOT, W = 1920 * S.s, H = 1080 * S.s;
  const layers = shots.map(function (f, i) {
    const w = (f.w || 1920) * S.s, h = (f.h || 1080) * S.s;
    return '<div class="scr-layer scr-l' + i + '" style="width:' + w + 'px;height:' + h + 'px;opacity:0">' +
      '<img src="' + kit.assets.url(f.file) + '" style="width:' + w + 'px;height:' + h + 'px" alt="">' +
      (f.masks || []).map(function (m) {
        return '<div class="scr-mask" style="border-radius:6px;left:' + m[0] * S.s + 'px;top:' + m[1] * S.s + 'px;width:' + m[2] * S.s + 'px;height:' + m[3] * S.s + 'px"></div>';
      }).join('') + '</div>';
  }).join('');
  const root = kit.h('<div class="scr-cam" style="position:absolute;inset:0"><div class="desk"></div>' +
    '<div class="scr-win" style="left:' + S.x + 'px;top:' + (S.y - S.bar) + 'px;width:' + W + 'px">' +
    '<div class="scr-bar"><i></i><i></i><i></i><span class="scr-url"></span></div>' +
    '<div class="scr-view" style="height:' + H + 'px">' + layers + '<div class="scr-hl"></div></div></div></div>');
  kit.stage.append(root);
  const cam = new kit.Camera(root);
  const L = shots.map(function (_, i) { return root.querySelector('.scr-l' + i).style; });
  const hl = root.querySelector('.scr-hl').style;
  const url = root.querySelector('.scr-url');
  const win = root.querySelector('.scr-win').style;
  function pt(px, py) { return [S.x + px * S.s, S.y + py * S.s]; }
  return {
    root: root, cam: cam, L: L, hl: hl, url: url, win: win, pt: pt,
    key(t, px, py, z, from) { const p = pt(px, py); const k = { t: t, cx: p[0], cy: p[1], z: z }; if (from != null) k.from = from; return k; },
    full(t, from) { const k = { t: t, cx: 960, cy: 540, z: 1 }; if (from != null) k.from = from; return k; },
    st(t, px, py) { const c = cam.at(t), p = pt(px, py); return [(p[0] - c.cx) * c.z + 960, (p[1] - c.cy) * c.z + 540]; },
    rect(t, px, py, w, h) { const c = cam.at(t), p = pt(px, py); return { x: (p[0] - c.cx) * c.z + 960, y: (p[1] - c.cy) * c.z + 540, w: w * S.s * c.z, h: h * S.s * c.z }; },
    hlAt(px, py, w, h, a) { hl.left = px * S.s + 'px'; hl.top = py * S.s + 'px'; hl.width = w * S.s + 'px'; hl.height = h * S.s + 'px'; hl.opacity = a; },
    wipe(i, x0, x1, y0, y1, p) { const w = shots[i].w || 1920, h = shots[i].h || 1080; L[i].opacity = p > 0 ? 1 : 0; L[i].clipPath = 'inset(' + y0 * S.s + 'px ' + (w - lerpX(x0, x1, p)) * S.s + 'px ' + (h - y1) * S.s + 'px 0px)'; },
    path(t, list) { let s = list[0][1]; list.forEach(function (e) { if (t >= e[0]) s = e[1]; }); if (url.textContent !== s) url.textContent = s; },
    chip(text, at, off) { const n = kit.chip(text, { x: at[0] + off[0], y: at[1] + off[1], anchor: at, style: 'font-family:var(--sans, system-ui, sans-serif)' }); if (!n.isConnected) kit.stage.append(n); return n; },
  };
  function lerpX(a, b, p) { return a + (b - a) * p; }
};

// The device's own confirmation prompt (drawn: the OS dialog cannot be captured).
UI.prompt = function (kit, opts) {
  const o = opts || {};
  const title = kit.esc(o.title || 'Confirm on your device');
  const note = kit.esc(o.note || 'Illustration — your device’s own prompt');
  const { seg, eo, ei, eob } = kit;
  const arcs = [24, 44, 64, 84].map(function (r) {
    const a0 = -200 * Math.PI / 180, a1 = 20 * Math.PI / 180;
    return '<path class="pr-arc" pathLength="1" d="M' + (r * Math.cos(a0)).toFixed(1) + ' ' + (r * Math.sin(a0)).toFixed(1) + ' A' + r + ' ' + r + ' 0 1 1 ' + (r * Math.cos(a1)).toFixed(1) + ' ' + (r * Math.sin(a1)).toFixed(1) + '"/>';
  }).join('');
  const root = kit.h('<div style="position:absolute;inset:0;opacity:0"><div class="pr-dim"></div>' +
    '<div class="pr-card"><svg width="200" height="200" viewBox="-110 -110 220 220"><circle class="pr-fill" r="104"/><g class="pr-print">' + arcs + '</g>' +
    '<path class="pr-ok" pathLength="1" d="M-44 2 L-12 34 L48 -30"/></svg>' +
    '<p class="pr-title">' + title + '</p><p class="pr-note">' + note + '</p></div></div>');
  kit.stage.append(root);
  const dim = root.querySelector('.pr-dim').style, card = root.querySelector('.pr-card').style;
  const fill = root.querySelector('.pr-fill').style, print = root.querySelector('.pr-print').style, ok = root.querySelector('.pr-ok').style;
  const as = [].slice.call(root.querySelectorAll('.pr-arc')).map(function (e) { return e.style; });
  return {
    render(t, t0) {
      const u = t - t0;
      root.style.opacity = u < 0 || u > 2 ? 0 : 1;
      const out = ei(seg(u, 1.6, 1.9));
      dim.opacity = eo(seg(u, 0, 0.3)) * (1 - out);
      const k = eob(seg(u, 0, 0.4), 1.5);
      card.opacity = Math.min(1, k * 1.5) * (1 - out);
      card.transform = 'translateY(' + ((1 - k) * 30 + out * 20) + 'px) scale(' + (0.94 + 0.06 * k) + ')';
      as.forEach(function (s, i) { s.strokeDashoffset = 1 - eo(seg(u, 0.4 + i * 0.12, 0.9 + i * 0.12)); });
      fill.transform = 'scale(' + eob(seg(u, 1.0, 1.3), 1.6) + ')';
      print.opacity = 1 - eo(seg(u, 1.0, 1.15));
      ok.strokeDashoffset = 1 - eo(seg(u, 1.15, 1.45));
    },
  };
};
