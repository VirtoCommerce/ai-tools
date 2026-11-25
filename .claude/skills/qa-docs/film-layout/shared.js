// The sprint film's helper, written into the Motion film's `modules/shared.js`.
// One still browser window holding real screenshots. Each beat dims the screen except one framed area and says
// in one place what it shows: a ring around the area, one caption under the window. Nothing moves but the fades,
// so there is one place to look. The ticket key and name are plain text on the ground, no plate.
// A scene (scene.js) only lists its beats: { t, frame, x, y, w, h, cap } — x/y/w/h is the framed area in the
// screenshot's own 1920x1080 pixels, cap the caption (one short line).
window.W = {
  film(kit, c) {
    const { seg, eo, ei } = kit;
    const S = 0.7, WX = 288, WY = 150, BAR = 36, PAD = 8;
    const imgs = c.beats.map((b, i) => '<img class="' + c.id + '-img" src="' + kit.assets.url(b.frame) + '" alt="" style="position:absolute;left:0;top:0;width:1344px;height:756px;object-fit:cover;opacity:' + (i ? 0 : 1) + '">').join('');
    const hls = c.beats.map((b) => '<div class="film-hl ' + c.id + '-hl" style="left:' + ((b.x - PAD) * S).toFixed(1) + 'px;top:' + ((b.y - PAD) * S).toFixed(1) + 'px;width:' + ((b.w + 2 * PAD) * S).toFixed(1) + 'px;height:' + ((b.h + 2 * PAD) * S).toFixed(1) + 'px"></div>').join('');
    const caps = c.beats.map((b) => '<div class="words ' + c.id + '-cap" style="left:' + WX + 'px;top:986px;opacity:0"><p class="film-cap"><span class="film-sq"></span>' + kit.esc(b.cap) + '</p></div>').join('');
    kit.stage.append(kit.h('<div class="ground">' +
      '<div class="words ' + c.id + '-label" style="left:' + WX + 'px;top:34px;gap:6px;opacity:0"><p class="film-key">' + kit.esc(c.key) + '</p><p class="film-name">' + kit.esc(c.name) + '</p></div>' +
      '<div style="position:absolute;left:' + WX + 'px;top:' + WY + 'px;width:1344px;height:' + (BAR + 756) + 'px;border-radius:14px;overflow:hidden;background:#FFFFFF;box-shadow:0 30px 80px rgba(0,0,0,.45)">' +
        '<div style="height:' + BAR + 'px;background:#E7E9FF;display:flex;align-items:center;gap:10px;padding-left:18px"><i class="film-dot"></i><i class="film-dot"></i><i class="film-dot"></i></div>' +
        '<div style="position:relative;width:1344px;height:756px;overflow:hidden">' + imgs + hls + '</div></div>' +
      caps + '</div>'));
    const q = (s) => Array.from(kit.stage.querySelectorAll('.' + c.id + s));
    const layers = q('-img'), rings = q('-hl'), capEls = q('-cap'), label = q('-label')[0];
    return {
      render(t) {
        label.style.opacity = eo(seg(t, 0.1, 0.6));
        c.beats.forEach((b, i) => {
          if (i) layers[i].style.opacity = eo(seg(t, b.t, b.t + 0.4));
          const next = c.beats[i + 1] ? c.beats[i + 1].t : c.dur + 1;
          const on = eo(seg(t, b.t + 0.5, b.t + 1.0)) * (1 - ei(seg(t, next - 0.35, next - 0.05)));
          rings[i].style.opacity = on;
          capEls[i].style.opacity = on;
          capEls[i].style.transform = 'translateY(' + ((1 - on) * 12).toFixed(1) + 'px)';
        });
      },
    };
  },
};
