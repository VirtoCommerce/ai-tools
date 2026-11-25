// One story scene, written into the film as `modules/scene-<id>.js`. Frames are assets named f<ticket>-<n>.jpg
// (1920x1080 JPEG, quality 82, the masks already filled in). 8 s per scene, one beat every 2.5 s.
// x/y/w/h: the area to frame, in the screenshot's own pixels — measure it on the frame, never guess it.
kit.scene('s6861', {
  init(kit) {
    this.f = W.film(kit, { id: 's6861', key: 'VCST-6861', name: 'Subscriptions · Product page', dur: 8, beats: [
      { t: 0.4, frame: 'f6861-1.jpg', x: 1396, y: 498, w: 246, h: 106, cap: 'Buy once, or Subscribe & Save' },
      { t: 3.0, frame: 'f6861-2.jpg', x: 1388, y: 550, w: 246, h: 272, cap: 'Pick how often: 2 weeks to 3 months' },
      { t: 5.4, frame: 'f6861-3.jpg', x: 1388, y: 498, w: 246, h: 40, cap: 'It joins the cart as a subscription' },
    ] });
  },
  render(t) { this.f.render(t); },
});
