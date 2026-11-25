// The sprint film's helper, written into the Motion film's `modules/shared.js`.
// One browser window holding real screenshots, a camera that pushes in on each beat, and a caption per beat.
// The label (ticket key and name) and the captions sit on dark plates: the camera pushes the white window under them.
// A scene (scene.js) only lists its beats: { t, frame, px, py, z, chip } — px/py is the point of the screenshot
// (in its own 1920x1080 pixels) the camera aims at, z the zoom (1.5 to 3), chip the caption.
window.W = {
  film(kit, c) {
    const { seg, eo, ei } = kit;
    const S = 0.7, WX = 288, WY = 150, BAR = 36;
    const X = (px) => WX + px * S, Y = (py) => WY + BAR + py * S;
    const imgs = c.beats.map((b, i) => '<img class="' + c.id + '-img" src="' + kit.assets.url(b.frame) + '" alt="" style="position:absolute;left:0;top:0;width:1344px;height:756px;object-fit:cover;opacity:' + (i ? 0 : 1) + '">').join('');
    const chips = c.beats.map((b) => '<div class="words ' + c.id + '-chip" style="left:288px;top:982px;opacity:0"><p class="film-chip">' + kit.esc(b.chip) + '</p></div>').join('');
    kit.stage.append(kit.h('<div class="ground">' +
      '<div class="' + c.id + '-plane" style="position:absolute;inset:0">' +
        '<div style="position:absolute;left:' + WX + 'px;top:' + WY + 'px;width:1344px;height:' + (BAR + 756) + 'px;border-radius:14px;overflow:hidden;background:#FFFFFF;box-shadow:0 30px 80px rgba(0,0,0,.45)">' +
          '<div style="height:' + BAR + 'px;background:#E7E9FF;display:flex;align-items:center;gap:10px;padding-left:18px"><i class="film-dot"></i><i class="film-dot"></i><i class="film-dot"></i></div>' +
          '<div style="position:relative;width:1344px;height:756px;overflow:hidden">' + imgs + '</div></div></div>' +
      '<div class="words ' + c.id + '-label" style="left:288px;top:34px;gap:6px;opacity:0;background:#050A40;padding:14px 28px 16px;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.22)"><p class="film-key">' + kit.esc(c.key) + '</p><p class="film-name">' + kit.esc(c.name) + '</p></div>' +
      chips + '</div>'));
    const q = (s) => Array.from(kit.stage.querySelectorAll('.' + c.id + s));
    const layers = q('-img'), chipEls = q('-chip'), label = q('-label')[0], plane = q('-plane')[0];
    const cam = new kit.Camera(plane);
    const keys = [{ t: 0, cx: 960, cy: 554, z: 1 }];
    let prev = keys[0];
    c.beats.forEach((b) => {
      keys.push({ t: b.t, cx: prev.cx, cy: prev.cy, z: prev.z });
      prev = { t: b.t + 1.2, cx: X(b.px), cy: Y(b.py), z: b.z };
      keys.push(prev);
    });
    cam.set(keys);
    return {
      render(t) {
        cam.apply(t);
        label.style.opacity = eo(seg(t, 0.2, 0.8));
        c.beats.forEach((b, i) => {
          if (i) layers[i].style.opacity = eo(seg(t, b.t, b.t + 0.45));
          const next = c.beats[i + 1] ? c.beats[i + 1].t : c.dur;
          chipEls[i].style.opacity = eo(seg(t, b.t + 0.5, b.t + 0.9)) * (1 - ei(seg(t, next - 0.4, next - 0.05)));
          chipEls[i].style.transform = 'translateY(' + ((1 - eo(seg(t, b.t + 0.5, b.t + 0.9))) * 14).toFixed(1) + 'px)';
        });
      },
    };
  },
};
