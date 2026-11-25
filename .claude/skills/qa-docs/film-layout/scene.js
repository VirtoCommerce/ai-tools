// One story scene, written into the film as `modules/scene-<id>.js`. Frames are assets named f<ticket>-<n>.jpg
// (1920x1080 JPEG, quality 82, the masks already filled in). 8 s per scene, one beat every 2.5 s.
kit.scene('s6861', {
  init(kit) {
    this.f = W.film(kit, { id: 's6861', key: 'VCST-6861', name: 'Subscriptions · Product page', dur: 8, beats: [
      { t: 0.4, frame: 'f6861-1.jpg', px: 1400, py: 570, z: 2.8, chip: 'Buy once, or Subscribe & Save' },
      { t: 3.0, frame: 'f6861-2.jpg', px: 1400, py: 650, z: 3.0, chip: 'Pick how often: 2 weeks to 3 months' },
      { t: 5.4, frame: 'f6861-3.jpg', px: 1400, py: 560, z: 2.6, chip: 'It joins the cart as a subscription' },
    ] });
  },
  render(t) { this.f.render(t); },
});
