/**
 * scripts/seed-data/configurable-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for the configurable-product test fixtures — pure data, NO side
 * effects, so both the seeder (seed-configurable.mjs) and the drift-guard validator
 * (validate-configurable-data.mjs) import it. The seeder creates these on the platform and
 * writes runtime GUIDs to aliases.<env>.json; test-data/products/configurable-products.csv
 * mirrors the business fields (name/slug/price/…) for @td() resolution and carries NO GUIDs.
 *
 * Section options: Product sections list `{ name, price, … }` (an option PRODUCT is created per entry);
 * Text sections may list predefined `{ text }` presets (no product).
 */
export const SPECS = [
  // ---------- base family (date 20260518, catalog SEED-Configurables) ----------
  { csvId: 'CFG-012', family: 'base', name: 'AGENT-TEST-Config-Bike', code: 'AGENT-TEST-CFG-012', basePrice: 100,
    sections: [
      { key: 'A', name: 'Choose Upgrade', type: 'Product', isRequired: false,
        options: [{ name: 'Basic Seat', price: 15 }, { name: 'Premium Seat', price: 45 }, { name: 'Racing Seat', price: 95 }] },
    ] },
  { csvId: 'CFG-013', family: 'base', name: 'AGENT-TEST-Config-Laptop', code: 'AGENT-TEST-CFG-013', basePrice: 999,
    sections: [
      { key: 'A', name: 'RAM', type: 'Product', isRequired: true,
        options: [{ name: '8GB', price: 0 }, { name: '16GB', price: 100 }, { name: '32GB', price: 250 }] },
      { key: 'B', name: 'Storage', type: 'Product', isRequired: true,
        options: [{ name: '256GB SSD', price: 0 }, { name: '512GB SSD', price: 75 }, { name: '1TB SSD', price: 150 }] },
    ] },
  { csvId: 'CFG-014', family: 'base', name: 'AGENT-TEST-Config-Sale-Bike', code: 'AGENT-TEST-CFG-014', basePrice: 250, salePrice: 200,
    sections: [
      { key: 'A', name: 'Handlebars', type: 'Product', isRequired: false,
        options: [{ name: 'Standard', price: 50, salePrice: 40 }, { name: 'Drop Bar', price: 100, salePrice: 80 }] },
    ] },
  { csvId: 'CFG-015', family: 'base', name: 'AGENT-TEST-Config-OOS-Bike', code: 'AGENT-TEST-CFG-015', basePrice: 120,
    sections: [
      { key: 'A', name: 'Frame Color', type: 'Product', isRequired: true,
        options: [
          { name: 'Red', price: 0, stock: 10 }, { name: 'Blue', price: 0, stock: 5 },
          { name: 'Ltd Black', price: 50, stock: 0 }, // OOS option — the point of CFG-015
          { name: 'Silver', price: 25, stock: 8 },
        ] },
    ] },
  { csvId: 'CFG-016', family: 'base', name: 'AGENT-TEST-Config-Checkout-Bike', code: 'AGENT-TEST-CFG-016', basePrice: 150,
    sections: [
      { key: 'A', name: 'Wheels', type: 'Product', isRequired: true,
        options: [{ name: 'Standard', price: 0 }, { name: 'Sport', price: 50 }] },
    ] },
  { csvId: 'CFG-017', family: 'base', name: 'AGENT-TEST-Ring-Txt-Cfg', code: 'AGENT-TEST-CFG-017', basePrice: 150,
    sections: [
      { key: 'A', name: 'Engraving Text', type: 'Text', isRequired: true, allowCustomText: true, maxLength: 30, options: [] },
    ] },
  { csvId: 'CFG-018', family: 'base', name: 'AGENT-TEST-Config-Custom-Jersey', code: 'AGENT-TEST-CFG-018', basePrice: 50,
    sections: [
      { key: 'A', name: 'Size', type: 'Product', isRequired: true,
        options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Large', price: 5 }] },
    ] },
  { csvId: 'CFG-019', family: 'base', name: 'AGENT-TEST-Config-Gift-Box', code: 'AGENT-TEST-CFG-019', basePrice: 50,
    sections: [
      { key: 'A', name: 'Gift Message', type: 'Text', isRequired: false, allowCustomText: true, maxLength: 100, options: [] },
    ] },
  { csvId: 'CFG-020', family: 'base', name: 'AGENT-TEST-Config-Phone-Case', code: 'AGENT-TEST-CFG-020', basePrice: 30,
    sections: [
      { key: 'A', name: 'Case Style', type: 'Product', isRequired: true,
        options: [{ name: 'Clear', price: 0 }, { name: 'Matte', price: 5 }, { name: 'Gloss', price: 8 }] },
      { key: 'B', name: 'Accessories', type: 'Product', isRequired: false,
        options: [{ name: 'Ring', price: 10 }, { name: 'Stand', price: 12 }] },
      { key: 'C', name: 'Custom Name', type: 'Text', isRequired: false, allowCustomText: true, maxLength: 20, options: [] },
    ] },
  { csvId: 'CFG-021', family: 'base', name: 'AGENT-TEST-Config-Custom-Bike', code: 'AGENT-TEST-CFG-021', basePrice: 500,
    sections: [
      { key: 'A', name: 'Frame', type: 'Product', isRequired: true,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200 }, { name: 'Steel', price: 50 }] },
      { key: 'B', name: 'Wheels', type: 'Product', isRequired: true,
        options: [{ name: 'Standard', price: 0 }, { name: 'Sport', price: 75 }, { name: 'Pro', price: 150 }] },
      { key: 'C', name: 'Seat', type: 'Product', isRequired: false,
        options: [{ name: 'Basic', price: 0 }, { name: 'Comfort', price: 30 }, { name: 'Racing', price: 60 }] },
    ] },
  // VCST-5735 (/compare v2). The compare table keys its configuration rows `config:<label>`, so two
  // sections that SHARE a display label are the only shape that can show one row overwriting the
  // other. Nothing in the corpus had it: all 22 pre-existing specs carry distinct section names, so
  // the collision was unreachable however many configurables a case put side by side. The two
  // sections are deliberately given DIFFERENT option sets and prices — same label, different
  // content — because identical content would make the two rows indistinguishable even when the
  // implementation is correct, and the case could not tell a collapse from a coincidence.
  { csvId: 'CFG-033', family: 'base', name: 'AGENT-TEST-CFG-Dup-Section-Label', code: 'AGENT-TEST-CFG-033', basePrice: 140,
    sections: [
      { key: 'A', name: 'Finish', type: 'Product', isRequired: true,
        options: [{ name: 'Exterior Matte', price: 0 }, { name: 'Exterior Gloss', price: 15 }] },
      { key: 'B', name: 'Finish', type: 'Product', isRequired: false,
        options: [{ name: 'Interior Walnut', price: 25 }, { name: 'Interior Oak', price: 40 }] },
    ] },
  { csvId: 'CFG-FILE', family: 'base', name: 'AGENT-TEST-Config-FileUpload', code: 'AGENT-TEST-CFG-FILE', basePrice: 80,
    // File-attachment fixture — backs CFG-GQL-055b (VCST-5173 configurationSection type:"File").
    sections: [
      { key: 'A', name: 'Design Upload', type: 'File', isRequired: false, options: [] },
    ] },

  // ---------- conditional family (date 20260519, catalog SEED-Configurables-Cascades) ----------
  { csvId: 'CFG-022', family: 'conditional', name: 'AGENT-TEST-Config-Conditional-Bike', code: 'AGENT-TEST-CFG-022', basePrice: 300,
    sections: [
      { key: 'A', name: 'Frame Type', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200 }, { name: 'Steel', price: 50 }] },
      { key: 'B', name: 'Wheel Set', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Standard', price: 25 }, { name: 'Sport', price: 75 }] },
      { key: 'D', name: 'Frame Color', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Black', price: 10 }, { name: 'Red', price: 15 }] },
      { key: 'C', name: 'Tire Type', type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Slick', price: 20 }, { name: 'Knobby', price: 35 }] },
    ] },
  { csvId: 'CFG-023', family: 'conditional', name: 'AGENT-TEST-Wedding-Cake-Cond', code: 'AGENT-TEST-CFG-023', basePrice: 81,
    sections: [
      { key: 'Base', name: 'Base', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Top White Bottom White', price: 0 }, { name: 'Top White Bottom Cream', price: 5 }, { name: 'Top Cream Bottom Cream', price: 10 }] },
      { key: 'Creme', name: 'Creme', type: 'Product', isRequired: false, dependsOn: 'Base',
        options: [{ name: 'Buttercreme Peach and Blue', price: 12 }, { name: 'Buttercreme Vanilla', price: 8 }] },
      { key: 'Message', name: 'Message', type: 'Product', isRequired: false, dependsOn: 'Creme',
        options: [{ name: 'Standard Message Tag', price: 12 }, { name: 'Premium Message Tag', price: 20 }] },
      { key: 'Text', name: 'Custom text required', type: 'Text', isRequired: true, dependsOn: 'Message', allowCustomText: true, maxLength: 100, options: [] },
      { key: 'Image', name: 'Image', type: 'File', isRequired: false, dependsOn: 'Message', options: [] },
    ] },
  { csvId: 'CFG-024', family: 'conditional', name: 'AGENT-TEST-Text-Driven-Cond', code: 'AGENT-TEST-CFG-024', basePrice: 200,
    sections: [
      { key: 'A', name: 'Engraving Line 1', type: 'Text', isRequired: true, dependsOn: null, allowCustomText: true, maxLength: 60, options: [] },
      { key: 'B', name: 'Style Pack', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Classic', price: 30 }, { name: 'Modern', price: 45 }] },
      { key: 'C', name: 'Accessory', type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Bag', price: 20 }, { name: 'Case', price: 25 }] },
    ] },
  { csvId: 'CFG-025', family: 'conditional', name: 'AGENT-TEST-File-Driven-Cond', code: 'AGENT-TEST-CFG-025', basePrice: 180,
    sections: [
      { key: 'A', name: 'Design Upload', type: 'File', isRequired: true, dependsOn: null, options: [] },
      { key: 'B', name: 'Finish Type', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Matte', price: 15 }, { name: 'Gloss', price: 20 }] },
      { key: 'C', name: 'Notes', type: 'Text', isRequired: false, dependsOn: 'B', allowCustomText: true, maxLength: 200, options: [] },
    ] },
  { csvId: 'CFG-026', family: 'conditional', name: 'AGENT-TEST-Req-File-Child', code: 'AGENT-TEST-CFG-026', basePrice: 150,
    sections: [
      { key: 'A', name: 'Service Plan', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Basic', price: 0 }, { name: 'Premium', price: 50 }] },
      { key: 'B', name: 'ID Proof', type: 'File', isRequired: true, dependsOn: 'A', options: [] },
    ] },
  { csvId: 'CFG-027', family: 'conditional', name: 'AGENT-TEST-Two-Req-Siblings', code: 'AGENT-TEST-CFG-027', basePrice: 120,
    sections: [
      { key: 'A', name: 'Bundle Choice', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Bundle A', price: 40 }, { name: 'Bundle B', price: 60 }] },
      { key: 'B', name: 'Size', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 5 }, { name: 'Large', price: 10 }] },
      { key: 'C', name: 'Color', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Black', price: 0 }, { name: 'White', price: 0 }, { name: 'Red', price: 5 }] },
    ] },
  { csvId: 'CFG-028', family: 'conditional', name: 'AGENT-TEST-Deep-4-Level-Chain', code: 'AGENT-TEST-CFG-028', basePrice: 300,
    sections: [
      { key: 'A', name: 'Level A', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Opt1', price: 20 }, { name: 'Opt2', price: 40 }] },
      { key: 'B', name: 'Level B', type: 'Product', isRequired: false, dependsOn: 'A', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'C', name: 'Level C', type: 'Product', isRequired: false, dependsOn: 'B', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'D', name: 'Level D', type: 'Product', isRequired: false, dependsOn: 'C', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'E', name: 'Level E', type: 'Product', isRequired: false, dependsOn: 'D', options: [{ name: 'Opt1', price: 10 }] },
    ] },
  { csvId: 'CFG-029', family: 'conditional', name: 'AGENT-TEST-Req-Child-Opt-Parent', code: 'AGENT-TEST-CFG-029', basePrice: 100,
    sections: [
      { key: 'A', name: 'Add Extras', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Extra A', price: 25 }, { name: 'Extra B', price: 35 }] },
      { key: 'B', name: 'Extra Type', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Standard', price: 0 }, { name: 'Premium', price: 15 }] },
    ] },

  // ---------- default family (date 20260527, catalog SEED-Configurables-Default) ----------
  { csvId: 'CFG-030', family: 'default', name: 'AGENT-TEST-CFG-Default-Flat', code: 'AGENT-TEST-CFG-030', basePrice: 100,
    sections: [
      { key: 'A', name: 'Frame Material', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200, default: true }, { name: 'Steel', price: 50 }] },
    ] },
  { csvId: 'CFG-031', family: 'default', name: 'AGENT-TEST-CFG-Default-Cond', code: 'AGENT-TEST-CFG-031', basePrice: 150,
    sections: [
      { key: 'A', name: 'Base Choice', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Standard', price: 0, default: true }, { name: 'Deluxe', price: 80 }] },
      { key: 'B', name: 'Add-on', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Warranty', price: 25, default: true }, { name: 'Case', price: 15 }] },
    ] },

  // ---------- bike family (date 20260527, shares SEED-Configurables-Default) ----------
  { csvId: 'CFG-032', family: 'bike', name: 'AGENT-TEST-CFG-Bike-Flat', code: 'AGENT-TEST-CFG-032', basePrice: 350,
    sections: [
      { key: 'A', name: 'Select one', type: 'Product', isRequired: false, dependsOn: null,
        options: [
          { name: 'Rear wheel, 26", double-wall rim, motorized', price: 88, quantity: 2 },
          { name: '200CC 250CC 4-Stroke Engine Motor', price: 225, quantity: 1 },
          { name: 'Seat', price: 15, quantity: 1 },
          { name: 'Pedals', price: 14, quantity: 1 },
        ] },
    ] },

  // ---------- checklist family (VCST-6027, shares the unified AGENT-TEST-SEED-Configurables catalog) ----------
  // The "Price and delivery" checklist renders one row per VISIBLE section: Done (green
  // `{name} — {value}`, clamped to 2 lines), Required (red, link per type: Text / File / Product),
  // Optional (yellow, "Review"). CFG-023..033 each cover ONE required type, so no page showed all
  // three red link variants at once, and no label was long enough to overflow 2 lines — the clamp
  // was unfalsifiable (SECOND RULE: equal-on-both-sides data). This spec exists to make both
  // decidable; the contract is CHECKLIST_CONTRACT below, enforced by td:validate:cfg.
  //  - LAY: required root Product with NO default, and EVERY option label long. Option order is NOT
  //    controllable: options carry no display order, and on vcst 2026-10-06 both REST and
  //    productConfiguration returned them in neither spec nor creation order. So "make the long one
  //    first" cannot be guaranteed — making all of them long guarantees whichever option lands
  //    selected on load overflows 2 lines. The two differ, so the Done label changes per selection.
  //  - TXT / PHO: required root Text / File — the other two red link variants.
  //  - FIL: required Product revealed by LAY (does a revealed required Product show its link?). All of
  //    its options are SHORT: a Done FIL row is the unclamped contrast to the clamped LAY row.
  //  - ICE / DEC / MSG / ART: optional Product / Product / Text(presets+custom) / File (yellow rows);
  //    ART's section NAME is the long one (an Optional row clamps on the name alone).
  { csvId: 'CFG-034', family: 'checklist', name: 'AGENT-TEST-CFG-Checklist-All-Types', code: 'AGENT-TEST-CFG-034', basePrice: 60,
    sections: [
      { key: 'LAY', name: 'Layers', type: 'Product', isRequired: true, dependsOn: null,
        options: [
          { name: 'Layers Top Chocolate Ganache with Hazelnut Praline / Bottom Dark Chocolate Sponge with Raspberry Coulis', price: 18 },
          { name: 'Layers Top Vanilla Bean Mousse with Salted Caramel Crunch / Bottom Almond Joconde Sponge with Apricot Glaze', price: 14 },
        ] },
      { key: 'TXT', name: 'Text', type: 'Text', isRequired: true, dependsOn: null, allowCustomText: true, maxLength: 50, options: [] },
      { key: 'PHO', name: 'Photo for the cake topper', type: 'File', isRequired: true, dependsOn: null, options: [] },
      { key: 'FIL', name: 'Filling', type: 'Product', isRequired: true, dependsOn: 'LAY',
        options: [{ name: 'Strawberry Jam', price: 6 }, { name: 'Lemon Curd', price: 8 }] },
      { key: 'ICE', name: 'Icing', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Buttercream', price: 5 }, { name: 'Fondant', price: 9 }] },
      { key: 'DEC', name: 'Decoration', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Fresh Berries', price: 7 }, { name: 'Sugar Flowers', price: 11 }] },
      { key: 'MSG', name: 'Message', type: 'Text', isRequired: false, dependsOn: null, allowCustomText: true, maxLength: 100,
        options: [{ text: 'Happy Birthday!' }, { text: 'Congratulations!' }] },
      { key: 'ART', name: 'AGENT-TEST Additional printed artwork for the box lid and the ribbon card', type: 'File', isRequired: false, dependsOn: null, options: [] },
    ] },
];

/**
 * Non-vacuity contract for CFG-034 (VCST-6027 checklist). Thresholds, not values: the guard fails
 * when the data stops being able to tell a right checklist from a wrong one — e.g. the long label is
 * shortened (clamp no longer observable), a required type disappears (its red link variant cannot be
 * seen), or LAY gains a default (the "no default → which option is picked" question goes away).
 */
export const CHECKLIST_CONTRACT = { csvId: 'CFG-034', longOptionMin: 90, longSectionNameMin: 70, shortOptionMax: 30, minOptions: 2 };

/** Pure: returns a list of contract violations for a spec (empty = discriminating). */
export function checklistContractProblems(spec, c = CHECKLIST_CONTRACT) {
  const out = [];
  if (!spec) return [`${c.csvId}: spec missing`];
  const secs = spec.sections || [];
  const root = (s) => !s.dependsOn;
  for (const t of ['Product', 'Text', 'File']) {
    if (!secs.some((s) => s.type === t && s.isRequired && root(s))) out.push(`no REQUIRED root ${t} section — its red link variant is unobservable`);
    if (!secs.some((s) => s.type === t && !s.isRequired)) out.push(`no OPTIONAL ${t} section — the yellow row is unobservable for ${t}`);
  }
  // Option order is not controllable on the platform, so the long-label property is asserted on EVERY
  // option of the required root Product (order-independent), never on "the first" one.
  const reqProduct = secs.find((s) => s.type === 'Product' && s.isRequired && root(s));
  if (reqProduct) {
    const opts = reqProduct.options || [];
    if (opts.length < c.minOptions) out.push(`${reqProduct.name}: ${opts.length} option(s), needs >= ${c.minOptions}`);
    if (opts.some((o) => o.default)) out.push(`${reqProduct.name}: has a default option — must have none`);
    const short = opts.filter((o) => (o.name || '').length < c.longOptionMin);
    if (short.length) out.push(`${reqProduct.name}: option(s) under ${c.longOptionMin} chars (${short.map((o) => o.name).join(', ')}) — the one selected on load may not overflow 2 lines`);
    if (new Set(opts.map((o) => o.name)).size !== opts.length) out.push(`${reqProduct.name}: duplicate option names — the Done label would not change per selection`);
  }
  const dep = secs.find((s) => s.type === 'Product' && s.isRequired && s.dependsOn && secs.some((p) => p.key === s.dependsOn));
  if (!dep) out.push('no REQUIRED dependent Product section (revealed required row unobservable)');
  else if ((dep.options || []).length < c.minOptions || (dep.options || []).some((o) => (o.name || '').length > c.shortOptionMax)) out.push(`${dep.name}: needs >= ${c.minOptions} options all <= ${c.shortOptionMax} chars — the unclamped Done contrast row`);
  if (!secs.some((s) => (s.name || '').length >= c.longSectionNameMin)) out.push(`no section name >= ${c.longSectionNameMin} chars`);
  const names = secs.map((s) => s.name);
  if (new Set(names).size !== names.length) out.push('duplicate section names — rows would be indistinguishable');
  return out;
}
