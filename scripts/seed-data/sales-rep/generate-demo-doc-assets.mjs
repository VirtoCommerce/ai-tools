#!/usr/bin/env node
/**
 * generate-demo-doc-assets.mjs — build the sales-rep DEMO document library's FILES.
 *
 * WHY THIS EXISTS. `test-data/uploads/` holds assets collected for other purposes — logos, a webp,
 * two mp4s, a photo of paper straws. Pointing the demo at them gave documents whose titles, sizes
 * and page counts were right and whose CONTENTS were not: "2026 Industrial Catalog" opened a
 * two-page status summary, "Memphis Distribution Centre" opened the paper straws. A demo document
 * that nobody opens is fine until somebody opens it, in front of the audience.
 *
 * So the bytes are GENERATED from the same spec that declares the documents. The page count is read
 * from `DEMO_DOCUMENTS[].pageCount` rather than restated here — a PDF whose metadata claims 148
 * pages and whose body holds 12 is exactly the mismatch a viewer notices first (GOLDEN RULE:
 * `.claude/rules/test-data.md`).
 *
 * Output: `test-data/uploads/sales-rep-demo/` — committed, so a clone seeds real documents with no
 * generation step. Re-run only when the document set changes:
 *
 *   node scripts/seed-data/sales-rep/generate-demo-doc-assets.mjs [--check]
 *
 * `--check` regenerates in memory and reports any file whose bytes differ from what is committed,
 * without writing — the drift guard's live half.
 *
 * DETERMINISTIC: no clock, no randomness, no environment. The same spec produces byte-identical
 * files on every machine, so `--check` is meaningful and a re-run never shows up as a spurious diff.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_DOCUMENTS, DEMO_UPLOADS_DIR } from './sales-rep-demo-specs.mjs';
import { zipBytes } from './sales-rep-docs-specs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const OUT_DIR = join(ROOT, DEMO_UPLOADS_DIR, 'sales-rep-demo');
const CHECK = process.argv.includes('--check');

// ---- PDF -------------------------------------------------------------------
// A4 at 72dpi. Base-14 Helvetica, so no font file is embedded and the bytes stay small.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;

// The fonts are WinAnsiEncoding and the file is written as latin1, so a character above U+00FF is
// truncated to a control byte and renders as a blank. Map the typographic ones to their WinAnsi slot.
const WIN_ANSI = { '—': 0x97, '–': 0x96, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 };
const esc = (s) => String(s)
  .replace(/[—–‘’“”•…€]/g, (c) => String.fromCharCode(WIN_ANSI[c]))
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** One page = an array of ops. `text` flows from the top; `rect` draws a filled/stroked box. */
function pageStream(ops) {
  let y = PAGE_H - MARGIN;
  let out = '';
  for (const op of ops) {
    if (op.t === 'gap') { y -= op.h; continue; }
    if (op.t === 'rect') {
      const [r, g, b] = op.fill || [0.9, 0.9, 0.9];
      out += `${r} ${g} ${b} rg ${op.x} ${op.y} ${op.w} ${op.h} re f\n`;
      if (op.stroke) out += `0 0 0 RG 0.6 w ${op.x} ${op.y} ${op.w} ${op.h} re S\n`;
      continue;
    }
    if (op.t === 'line') {
      out += `0.75 w 0.6 0.6 0.6 RG ${MARGIN} ${y + 4} m ${PAGE_W - MARGIN} ${y + 4} l S\n`;
      y -= 10;
      continue;
    }
    const size = op.size || 10;
    const font = op.bold ? '/F2' : '/F1';
    const x = op.x ?? MARGIN;
    const ty = op.y ?? y;
    const [r, g, b] = op.color || [0, 0, 0];
    out += `BT ${font} ${size} Tf ${r} ${g} ${b} rg ${x} ${ty} Td (${esc(op.s)}) Tj ET\n`;
    if (op.y === undefined) y -= op.lead || size + 5;
  }
  return out;
}

/** Assemble pages into a valid PDF with a correct xref table. */
function buildPdf(pages, { title, author = 'Virto Industrial Supply' }) {
  const objects = [];
  const push = (s) => { objects.push(s); return objects.length; };

  const fontRegular = push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>');
  const fontBold = push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>');
  const info = push(`<</Title(${esc(title)})/Author(${esc(author)})/Producer(generate-demo-doc-assets.mjs)>>`);

  // The page tree is written AFTER the pages but must be referenced BY them, so its object number
  // is reserved here: current objects + two per page (content stream + page) + itself.
  const pagesObjNo = objects.length + pages.length * 2 + 1;
  const kids = [];
  for (const ops of pages) {
    const stream = pageStream(ops);
    const contentNo = push(`<</Length ${Buffer.byteLength(stream, 'latin1')}>>\nstream\n${stream}endstream`);
    const pageNo = push(`<</Type/Page/Parent ${pagesObjNo} 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]`
      + `/Contents ${contentNo} 0 R/Resources<</Font<</F1 ${fontRegular} 0 R/F2 ${fontBold} 0 R>>>>>>`);
    kids.push(`${pageNo} 0 R`);
  }
  const pagesNo = push(`<</Type/Pages/Kids[${kids.join(' ')}]/Count ${pages.length}>>`);
  if (pagesNo !== pagesObjNo) throw new Error(`page-tree object number drifted (${pagesNo} vs ${pagesObjNo})`);
  const catalogNo = push(`<</Type/Catalog/Pages ${pagesNo} 0 R>>`);

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const startxref = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<</Size ${objects.length + 1}/Root ${catalogNo} 0 R/Info ${info} 0 R>>\n`
    + `startxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(body + xref, 'latin1');
}

// ---- shared page furniture -------------------------------------------------

const BRAND = 'Virto Industrial Supply';

const coverPage = (title, subtitle, lines = []) => [
  { t: 'rect', x: 0, y: PAGE_H - 170, w: PAGE_W, h: 170, fill: [0.11, 0.24, 0.36] },
  { t: 'text', s: BRAND, size: 13, bold: true, x: MARGIN, y: PAGE_H - 70, color: [1, 1, 1] },
  { t: 'text', s: title, size: 26, bold: true, x: MARGIN, y: PAGE_H - 112, color: [1, 1, 1] },
  { t: 'text', s: subtitle, size: 12, x: MARGIN, y: PAGE_H - 138, color: [0.82, 0.88, 0.93] },
  { t: 'gap', h: 230 },
  ...lines.map((s) => ({ t: 'text', s, size: 11, lead: 18 })),
  { t: 'text', s: 'Commercial in confidence — for the named account only.', size: 9, x: MARGIN, y: 60, color: [0.45, 0.45, 0.45] },
];

const sectionPage = (heading, paragraphs, footer) => [
  { t: 'text', s: BRAND, size: 8.5, bold: true, color: [0.45, 0.45, 0.45] },
  { t: 'line' },
  { t: 'gap', h: 10 },
  { t: 'text', s: heading, size: 15, bold: true, lead: 26 },
  ...paragraphs.flatMap((p) => (typeof p === 'string'
    ? [{ t: 'text', s: p, size: 10, lead: 15 }]
    : [{ t: 'gap', h: 8 }, { t: 'text', s: p.h, size: 11.5, bold: true, lead: 18 },
      ...p.body.map((s) => ({ t: 'text', s, size: 10, lead: 15 }))])),
  { t: 'text', s: footer, size: 8.5, x: MARGIN, y: 48, color: [0.45, 0.45, 0.45] },
];

/** Wrap a long sentence to a page-width line list, so nothing runs off the right margin. */
function wrap(text, perLine = 96) {
  const words = String(text).split(/\s+/);
  const out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine) { out.push(line.trim()); line = w; } else line += ` ${w}`;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// ---- the documents ---------------------------------------------------------

const FASTENER_ROWS = [
  ['VIS-HFB-0500', 'Hex Flange Bolt, Grade 8, Plain', '1/2"-20 x 1"', '25 PK', '48.20'],
  ['VIS-HFB-0625', 'Hex Flange Bolt, Grade 5, Zinc', '5/16"-18 x 1"', '50 PK', '31.75'],
  ['VIS-CAR-0250', 'Carriage Bolt, Grade A, Plain', '1/4"-20 x 1"', '1300 PK', '212.40'],
  ['VIS-CAR-0251', 'Carriage Bolt, Grade 5, Chrome', '1/4"-20 x 1"', '5 PK', '18.90'],
  ['VIS-SST-0250', 'Stainless Carriage Bolt, 18-8', '1/4"-20 x 1"', '50 PK', '64.10'],
  ['VIS-UNA-0625', 'Una Drive Bolt, Grade 5', '5/8"-11 x 1-1/2"', '225 PK', '289.00'],
  ['VIS-FRC-0500', 'Freight Car Bolt, Grade 5', '1/2"-13 x 1"', '300 PK', '176.55'],
  ['VIS-WSH-0375', 'Flat Washer, Zinc Plated', '3/8"', '500 PK', '22.30'],
];

const LUBRICANT_SECTIONS = [
  ['1. Identification', ['Product name: VIS Multi-Purpose Industrial Lubricant, ISO VG 46.',
    'Recommended use: general machine lubrication, bearings, chain drives.',
    'Supplier: Virto Industrial Supply, 400 Industrial Parkway, Memphis TN 38118.',
    'Emergency telephone: +1 901 555 0199 (24 hour).']],
  ['2. Hazard identification', ['GHS classification: not classified as hazardous under GHS criteria.',
    'Precautionary statements: P262 Do not get in eyes, on skin, or on clothing.',
    'P280 Wear protective gloves. P501 Dispose of contents in accordance with local regulation.']],
  ['3. Composition / information on ingredients', ['Severely hydrotreated base oil (CAS 64742-54-7): 85 - 95%.',
    'Zinc dialkyldithiophosphate (CAS 68649-42-3): 1 - 3%.', 'Performance additives: balance.']],
  ['4. First-aid measures', ['Eye contact: flush with water for 15 minutes. Seek medical advice if irritation persists.',
    'Skin contact: wash with soap and water. Remove contaminated clothing.',
    'Ingestion: do not induce vomiting. Seek immediate medical attention.']],
  ['5. Fire-fighting measures', ['Suitable extinguishing media: foam, dry chemical, carbon dioxide.',
    'Unsuitable media: direct water jet. Flash point: 232 °C (COC).']],
  ['6. Accidental release measures', ['Contain the spill. Absorb with inert material. Prevent entry to drains and watercourses.']],
  ['7. Handling and storage', ['Store between 5 °C and 40 °C in a well-ventilated area away from oxidising agents.',
    'Keep containers closed when not in use. Shelf life 60 months from date of manufacture.']],
  ['8. Exposure controls / personal protection', ['Oil mist, mineral: TWA 5 mg/m3 (ACGIH).',
    'Wear nitrile gloves and safety glasses. Use local exhaust ventilation where mist may form.']],
];

const TERMS_CLAUSES = [
  ['1. Application', 'These conditions apply to every quotation, order acknowledgement and contract of sale made by Virto Industrial Supply. Any terms the buyer puts forward are excluded unless accepted in writing by an authorised representative of the seller.'],
  ['2. Prices', 'Prices are those in force on the date of despatch and are exclusive of taxes and duties. Prices quoted in a volume pricing agreement apply for the agreement term and supersede the published list price for the products named in it.'],
  ['3. Payment', 'Payment is due net 30 days from the date of invoice unless the account carries agreed alternative terms. The seller may suspend deliveries on any account exceeding its credit limit or payment terms.'],
  ['4. Delivery', 'Delivery dates are estimates given in good faith. Risk passes on delivery to the buyer or its carrier. Title remains with the seller until the invoice is paid in full.'],
  ['5. Inspection and shortages', 'The buyer shall inspect the goods on delivery. Claims for shortage or damage in transit must be notified within five working days of delivery, quoting the order number.'],
  ['6. Warranty', 'Goods are warranted free from defects in material and workmanship for twelve months from delivery. The seller\'s liability is limited, at its option, to replacement of the goods or credit of the invoice value.'],
  ['7. Returns', 'Goods may be returned only against a return material authorisation. Special-order and cut-to-length items are non-returnable. See the Returns and Warranty Policy for the full process.'],
  ['8. Force majeure', 'Neither party is liable for failure to perform caused by an event beyond its reasonable control, including industrial action, act of government, fire, flood or failure of a utility service.'],
  ['9. Governing law', 'These conditions are governed by the laws of the State of Tennessee, and the parties submit to the exclusive jurisdiction of its courts.'],
];

/** Repeat/derive page bodies until the PDF has EXACTLY the page count the spec declares. */
function padToPageCount(pages, target, makeFiller) {
  if (!target || pages.length >= target) return pages.slice(0, target || pages.length);
  const out = [...pages];
  while (out.length < target) out.push(makeFiller(out.length + 1));
  return out;
}

function catalogPdf(spec) {
  const CATEGORIES = [
    ['Fasteners', 'Bolts, screws, nuts, washers and anchors in carbon steel, stainless and speciality alloys.'],
    ['Abrasives', 'Bonded and coated abrasives, flap discs, cut-off wheels and surface-conditioning products.'],
    ['Power transmission', 'Bearings, chain, sprockets, belts and couplings for industrial drive assemblies.'],
    ['Cutting tools', 'Drills, taps, end mills, inserts and reamers in HSS, cobalt and carbide.'],
    ['Material handling', 'Casters, hand trucks, pallet jacks, strapping and load-securing equipment.'],
    ['Safety and PPE', 'Eye, hand, hearing and fall protection; lockout-tagout and spill control.'],
    ['Electrical', 'Conduit, fittings, wire management, connectors and enclosure hardware.'],
    ['Lubricants and chemicals', 'Industrial oils, greases, cleaners, adhesives and thread-locking compounds.'],
  ];
  const pages = [
    coverPage('2026 Industrial Catalog', 'Full product range — effective 1 January 2026', [
      'This catalog lists the complete Virto Industrial Supply range for the 2026 season,',
      'including the new fastener and abrasives ranges introduced in Q4.',
      '',
      'Prices shown are list prices in US dollars and exclude applicable taxes.',
      'Accounts holding a volume pricing agreement should refer to that agreement',
      'for contracted tier pricing, which supersedes the list prices in this catalog.',
      '',
      'Customer service: +1 901 555 0100   orders@virtoindustrial.example',
    ]),
    sectionPage('Contents', [
      ...CATEGORIES.map((c, i) => `${String(i + 1).padStart(2, '0')}.  ${c[0]}${' '.repeat(Math.max(1, 34 - c[0].length))}page ${3 + i * 18}`),
      '',
      'Index of part numbers                                       page 141',
      'Terms of sale                                               page 147',
    ], 'Page 2'),
  ];
  CATEGORIES.forEach(([name, blurb], i) => {
    pages.push(sectionPage(`${String(i + 1).padStart(2, '0')}. ${name}`, [
      ...wrap(blurb),
      { h: 'Representative lines', body: [
        'Part number      Description                                  Size              Pack      List',
        ...FASTENER_ROWS.map((r) => `${r[0].padEnd(16)} ${r[1].padEnd(44).slice(0, 44)} ${r[2].padEnd(17)} ${r[3].padEnd(9)} ${r[4]}`),
      ] },
      '',
      ...wrap('Stocked at Memphis TN and Reno NV. Next-day delivery on orders placed before 16:00 local time. '
        + 'Bulk and cut-to-length options are available on request; contact your account representative.'),
    ], `${name} — page ${3 + i * 18}`));
  });
  return padToPageCount(pages, spec.pageCount, (n) => sectionPage(
    `${CATEGORIES[(n - 3) % CATEGORIES.length][0]} (continued)`,
    [
      'Part number      Description                                  Size              Pack      List',
      ...FASTENER_ROWS.map((r, i) => {
        const code = `${r[0].slice(0, 8)}-${String((n * 7 + i) % 1000).padStart(3, '0')}`;
        return `${code.padEnd(16)} ${r[1].padEnd(44).slice(0, 44)} ${r[2].padEnd(17)} ${r[3].padEnd(9)} ${r[4]}`;
      }),
      '',
      ...wrap('Continued from the previous page. Part numbers are listed in ascending order within each '
        + 'category. An index of all part numbers appears at the back of this catalog.'),
    ],
    `Page ${n}`,
  ));
}

function sdsPdf(spec) {
  const pages = [
    coverPage('Safety Data Sheet', 'VIS Multi-Purpose Industrial Lubricant, ISO VG 46', [
      'Issued: 1 January 2026        Revision 4        Supersedes: revision 3',
      '',
      'Prepared in accordance with the OSHA Hazard Communication Standard,',
      '29 CFR 1910.1200, and the UN Globally Harmonised System (GHS), revision 9.',
      '',
      'This safety data sheet covers the industrial lubricant range supplied in',
      '1 L, 5 L, 20 L and 205 L containers.',
    ]),
  ];
  for (const [h, body] of LUBRICANT_SECTIONS) {
    pages.push(sectionPage(h, body.flatMap((b) => wrap(b)), 'Safety Data Sheet — VIS ISO VG 46'));
  }
  const EXTRA = [
    ['9. Physical and chemical properties', ['Appearance: clear amber liquid. Odour: characteristic mild.',
      'Density at 15 °C: 0.872 g/cm3. Kinematic viscosity at 40 °C: 46 mm2/s. Pour point: -27 °C.']],
    ['10. Stability and reactivity', ['Stable under normal conditions of storage and use.',
      'Incompatible materials: strong oxidising agents. Hazardous decomposition products: none in normal use.']],
    ['11. Toxicological information', ['Acute oral LD50 (rat): > 5000 mg/kg. Acute dermal LD50 (rabbit): > 2000 mg/kg.',
      'Skin irritation: prolonged or repeated contact may cause defatting and dermatitis.']],
    ['12. Ecological information', ['Not readily biodegradable. Do not allow to enter drains, soil or watercourses.']],
    ['13. Disposal considerations', ['Dispose of used product through a licensed waste oil contractor in accordance with local regulation.']],
    ['14. Transport information', ['Not classified as dangerous for transport under DOT, IMDG or IATA.']],
    ['15. Regulatory information', ['All components are listed on the TSCA inventory. SARA 313: no listed components above threshold.']],
    ['16. Other information', ['Revision 4 updates sections 8 and 11 following the 2025 exposure review.',
      'This data sheet is provided without warranty as to its completeness or accuracy.']],
  ];
  for (const [h, body] of EXTRA) pages.push(sectionPage(h, body.flatMap((b) => wrap(b)), 'Safety Data Sheet — VIS ISO VG 46'));
  return padToPageCount(pages, spec.pageCount, (n) => sectionPage('Appendix — exposure and handling notes',
    wrap('Continuation sheet. Workplace exposure assessments, glove breakthrough data and disposal contacts '
      + 'for each supplying region are tabulated on this and the following pages. The controlled master copy '
      + 'is held by the HSE manager at the Memphis distribution centre.'),
    `Safety Data Sheet — page ${n}`));
}

function volumePdf(spec) {
  const TIERS = [
    ['Fasteners — carbon steel', '0 - 4,999', 'list', '5,000 - 24,999', '12% off', '25,000+', '18% off'],
    ['Fasteners — stainless', '0 - 2,499', 'list', '2,500 - 9,999', '10% off', '10,000+', '15% off'],
    ['Abrasives', '0 - 999', 'list', '1,000 - 4,999', '9% off', '5,000+', '14% off'],
    ['Lubricants and chemicals', '0 - 499 L', 'list', '500 - 1,999 L', '11% off', '2,000 L+', '17% off'],
    ['Safety and PPE', '0 - 999', 'list', '1,000 - 4,999', '8% off', '5,000+', '12% off'],
  ];
  const pages = [
    coverPage('Volume Pricing Agreement', 'Northwind Traders — agreement NT-2026-0114', [
      'Between:   Virto Industrial Supply ("the Supplier")',
      '           400 Industrial Parkway, Memphis TN 38118',
      '',
      'And:       Northwind Traders ("the Customer")',
      '           1201 Third Avenue, Suite 2200, Seattle WA 98101',
      '',
      'Term:      1 January 2026 to 31 December 2026',
      'Review:    Quarterly, against committed annual volume',
      'Account manager: Alla Volkova',
    ]),
    sectionPage('1. Tier structure', [
      'Tier breaks apply per category, measured on units despatched in the agreement year.',
      '',
      'Category                          Tier 1              Tier 2                 Tier 3',
      ...TIERS.map((t) => `${t[0].padEnd(33)} ${`${t[1]} (${t[2]})`.padEnd(19)} ${`${t[3]} (${t[4]})`.padEnd(22)} ${t[5]} (${t[6]})`),
      '',
      ...wrap('Discounts are applied to the list price in force at the date of despatch. Where a product is '
        + 'also covered by a promotional price, the customer receives the lower of the two.'),
    ], 'Agreement NT-2026-0114 — page 2'),
    sectionPage('2. Annual commitment', [
      ...wrap('The Customer commits to a minimum annual spend of USD 480,000 across the categories listed in '
        + 'section 1. Achievement is measured on invoiced value net of returns and credits.'),
      '',
      ...wrap('Where the commitment is not met by the end of the agreement year, the Supplier may re-rate the '
        + 'year at the tier actually achieved and invoice the difference, or carry the shortfall into a renewed '
        + 'agreement at its discretion.'),
    ], 'Agreement NT-2026-0114 — page 3'),
  ];
  const CLAUSES = [
    ['3. Ordering and delivery', 'Orders are placed against this agreement by quoting the agreement number. Standard delivery terms and lead times apply. Stock is held at Memphis TN for next-day delivery to the Customer\'s Seattle and Tacoma sites.'],
    ['4. Price protection', 'List prices covered by this agreement will not increase during the first two quarters. Thereafter the Supplier may pass through documented raw-material increases with 30 days written notice.'],
    ['5. Reporting', 'The Supplier will provide a quarterly statement of volume by category, tier achieved and the projected year-end position, within ten working days of each quarter end.'],
    ['6. Confidentiality', 'The pricing in this agreement is commercially confidential to the parties and may not be disclosed to any third party without prior written consent.'],
    ['7. Termination', 'Either party may terminate on 90 days written notice. Orders accepted before the termination date will be fulfilled at the agreed tier price.'],
    ['8. Entire agreement', 'This agreement, together with the Supplier\'s Terms and Conditions of Sale, forms the entire agreement between the parties in respect of its subject matter.'],
  ];
  CLAUSES.forEach(([h, body], i) => pages.push(sectionPage(h, wrap(body), `Agreement NT-2026-0114 — page ${4 + i}`)));
  return padToPageCount(pages, spec.pageCount, (n) => sectionPage('Signature page', [
    'Signed for and on behalf of Virto Industrial Supply:', '', '', '_______________________________', 'Name:', 'Title:', 'Date:',
    '', '', 'Signed for and on behalf of Northwind Traders:', '', '', '_______________________________', 'Name:', 'Title:', 'Date:',
  ], `Agreement NT-2026-0114 — page ${n}`));
}

function termsPdf(spec) {
  const pages = [coverPage('Terms and Conditions of Sale', 'Effective 1 January 2026', [
    'These conditions govern all sales made by Virto Industrial Supply.',
    'They are referenced by every quotation, order acknowledgement and invoice.',
    '',
    'Questions about these conditions should be directed to the legal department,',
    'legal@virtoindustrial.example, or to your account representative.',
  ])];
  TERMS_CLAUSES.forEach(([h, body], i) => {
    pages.push(sectionPage(h, wrap(body), `Terms and Conditions of Sale — page ${2 + i}`));
  });
  return padToPageCount(pages, spec.pageCount, (n) => sectionPage('Appendix', wrap(
    'Continuation of the standard commercial terms. The controlled version of this document is published at '
    + 'virtoindustrial.example/terms and supersedes any printed copy.'), `Page ${n}`));
}

function sitePlanPdf(spec) {
  // Vector, not a photograph: a real site plan a viewer can read, drawn with PDF primitives.
  const plan = [
    { t: 'text', s: BRAND, size: 8.5, bold: true, color: [0.45, 0.45, 0.45] },
    { t: 'line' },
    { t: 'gap', h: 6 },
    { t: 'text', s: 'Memphis Distribution Centre — site plan', size: 16, bold: true, lead: 22 },
    { t: 'text', s: '400 Industrial Parkway, Memphis TN 38118   ·   412,000 sq ft   ·   28 dock doors', size: 10, lead: 24 },
    // building envelope
    { t: 'rect', x: MARGIN, y: 330, w: PAGE_W - MARGIN * 2, h: 330, fill: [0.94, 0.95, 0.96], stroke: true },
    // zones
    { t: 'rect', x: MARGIN + 14, y: 470, w: 180, h: 170, fill: [0.78, 0.85, 0.90], stroke: true },
    { t: 'rect', x: MARGIN + 208, y: 470, w: 180, h: 170, fill: [0.82, 0.88, 0.81], stroke: true },
    { t: 'rect', x: MARGIN + 14, y: 350, w: 374, h: 105, fill: [0.92, 0.88, 0.78], stroke: true },
    { t: 'rect', x: PAGE_W - MARGIN - 88, y: 350, w: 74, h: 290, fill: [0.88, 0.82, 0.84], stroke: true },
    { t: 'text', s: 'Bulk racking — A1-A24', size: 9.5, bold: true, x: MARGIN + 26, y: 622 },
    { t: 'text', s: '18,400 pallet positions', size: 8.5, x: MARGIN + 26, y: 606 },
    { t: 'text', s: 'Pick faces — B1-B16', size: 9.5, bold: true, x: MARGIN + 220, y: 622 },
    { t: 'text', s: 'Fasteners, abrasives, PPE', size: 8.5, x: MARGIN + 220, y: 606 },
    { t: 'text', s: 'Despatch staging and consolidation', size: 9.5, bold: true, x: MARGIN + 26, y: 432 },
    { t: 'text', s: 'Dock doors 1-28 along the south elevation', size: 8.5, x: MARGIN + 26, y: 416 },
    { t: 'text', s: 'Hazmat', size: 9, bold: true, x: PAGE_W - MARGIN - 76, y: 622 },
    { t: 'text', s: 'store', size: 9, bold: true, x: PAGE_W - MARGIN - 76, y: 608 },
    { t: 'gap', h: 500 },
    { t: 'text', s: 'Operating hours: 06:00 - 22:00 Monday to Friday, 07:00 - 14:00 Saturday.', size: 10, lead: 15 },
    { t: 'text', s: 'Carrier check-in at gatehouse; PPE required beyond the despatch office.', size: 10, lead: 15 },
    { t: 'text', s: 'Site contact: +1 901 555 0177   ·   memphis.dc@virtoindustrial.example', size: 10, lead: 15 },
  ];
  const detail = sectionPage('Facility overview', [
    { h: 'Coverage', body: wrap('The Memphis distribution centre serves the south-east region and is the primary '
      + 'stocking location for fasteners, abrasives and lubricants. Next-day delivery is available to customers '
      + 'within a 400 mile radius for orders placed before 16:00 local time.') },
    { h: 'Capability', body: [
      'Pallet positions                      18,400',
      'Dock doors                            28 (24 dock-level, 4 drive-in)',
      'Cross-dock lanes                      6',
      'Hazmat storage                        licensed, 2,400 sq ft, sprinklered',
      'Cut-to-length and kitting             yes, 2 cells',
    ] },
    { h: 'Certification', body: wrap('ISO 9001:2015 certified. Annual HSE audit completed October 2025 with no '
      + 'major findings. Fire system inspected quarterly under NFPA 25.') },
  ], 'Memphis Distribution Centre');
  return padToPageCount([plan, detail], spec.pageCount || 2, (n) => detail);
}

// ---- OOXML -----------------------------------------------------------------

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A real multi-paragraph .docx with headings — same container as docxBytes, richer body. */
function richDocx(title, blocks) {
  const para = (text, { bold = false, size = 22, space = 120 } = {}) =>
    `<w:p><w:pPr><w:spacing w:after="${space}"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}`
    + `<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  const body = [
    para(title, { bold: true, size: 36, space: 240 }),
    ...blocks.flatMap((b) => (typeof b === 'string'
      ? [para(b)]
      : [para(b.h, { bold: true, size: 26, space: 80 }), ...b.body.map((t) => para(t))])),
  ].join('');
  return zipBytes([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>` },
  ]);
}

/** A real .xlsx: one sheet, header row + data rows, inline strings (no sharedStrings part needed). */
function richXlsx(sheetName, rows) {
  const colRef = (i) => {
    let s = '';
    let n = i;
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return s;
  };
  const sheetRows = rows.map((cells, r) => {
    const tds = cells.map((v, c) => {
      const ref = `${colRef(c)}${r + 1}`;
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${tds}</row>`;
  }).join('');
  return zipBytes([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<sheetData>${sheetRows}</sheetData></worksheet>` },
  ]);
}

function priceListXlsx() {
  const CATEGORIES = [
    ['Fasteners', 'VIS-HFB', 'Hex Flange Bolt, Grade 8, Plain Finish', 25, 48.20],
    ['Fasteners', 'VIS-CAR', 'Carriage Bolt, Grade 5, Zinc Plated', 100, 61.40],
    ['Fasteners', 'VIS-SST', 'Stainless Carriage Bolt, 18-8', 50, 64.10],
    ['Abrasives', 'VIS-FLD', 'Flap Disc, Zirconia, 4-1/2 in, 60 grit', 10, 38.90],
    ['Abrasives', 'VIS-COW', 'Cut-Off Wheel, Type 1, 4-1/2 in', 25, 27.55],
    ['Power transmission', 'VIS-BRG', 'Deep Groove Ball Bearing, 6204-2RS', 10, 72.00],
    ['Power transmission', 'VIS-CHN', 'Roller Chain, ANSI 50, 10 ft box', 1, 96.30],
    ['Cutting tools', 'VIS-DRL', 'Jobber Drill Set, HSS, 29 pc', 1, 142.75],
    ['Cutting tools', 'VIS-EML', 'End Mill, Carbide, 4 flute, 1/2 in', 5, 188.20],
    ['Material handling', 'VIS-CAS', 'Swivel Caster, 5 in, polyurethane', 4, 54.80],
    ['Safety and PPE', 'VIS-GLV', 'Cut-Resistant Glove, ANSI A4, L', 12, 46.20],
    ['Safety and PPE', 'VIS-GOG', 'Safety Goggle, indirect vent, anti-fog', 10, 39.50],
    ['Electrical', 'VIS-CND', 'EMT Conduit, 3/4 in, 10 ft', 10, 58.40],
    ['Lubricants and chemicals', 'VIS-LUB', 'Multi-Purpose Lubricant ISO VG 46, 20 L', 1, 118.90],
    ['Lubricants and chemicals', 'VIS-TLK', 'Threadlocker, medium strength, 50 ml', 6, 84.60],
  ];
  const rows = [
    ['Virto Industrial Supply — Q4 2026 List Price File'],
    ['Effective 1 October 2026. Prices in USD, exclusive of tax. Supersedes Q3 2026.'],
    [],
    ['Category', 'Part number', 'Description', 'Pack qty', 'List price', 'Tier 2 (-12%)', 'Tier 3 (-18%)'],
  ];
  CATEGORIES.forEach(([cat, prefix, desc, pack, price], i) => {
    for (let v = 1; v <= 3; v += 1) {
      const p = Math.round((price * (1 + v * 0.14)) * 100) / 100;
      rows.push([
        cat,
        `${prefix}-${String(i * 3 + v).padStart(4, '0')}`,
        `${desc} — variant ${v}`,
        pack * v,
        p,
        Math.round(p * 0.88 * 100) / 100,
        Math.round(p * 0.82 * 100) / 100,
      ]);
    }
  });
  rows.push([]);
  rows.push(['Tier 2 applies from 5,000 units per category per year; tier 3 from 25,000 units.']);
  rows.push(['Accounts holding a volume pricing agreement are invoiced at the agreement rate.']);
  return richXlsx('Q4 2026 price list', rows);
}

function creditDocx() {
  return richDocx('Credit Application Form', [
    'Virto Industrial Supply — application for a net 30 trade account.',
    'Complete every section and return to credit@virtoindustrial.example. Incomplete applications cannot be assessed.',
    { h: 'Section 1 — Applicant', body: [
      'Registered business name: ______________________________________________',
      'Trading name (if different): ____________________________________________',
      'Registered address: ____________________________________________________',
      'Delivery address (if different): _________________________________________',
      'Federal tax ID (EIN): ______________________   Years trading: ____________',
      'Legal form:   [ ] Corporation   [ ] LLC   [ ] Partnership   [ ] Sole proprietor',
    ] },
    { h: 'Section 2 — Credit requested', body: [
      'Credit limit requested (USD): ________________   Estimated monthly spend: ________________',
      'Primary product categories: _____________________________________________',
      'Purchase order required on every order?   [ ] Yes   [ ] No',
    ] },
    { h: 'Section 3 — Trade references', body: [
      'Reference 1 — company, contact, telephone, email, account opened:',
      '_______________________________________________________________________',
      'Reference 2 — company, contact, telephone, email, account opened:',
      '_______________________________________________________________________',
      'Bank — name, branch, account officer, telephone:',
      '_______________________________________________________________________',
    ] },
    { h: 'Section 4 — Accounts payable contact', body: [
      'Name: _______________________  Title: _______________________',
      'Telephone: __________________  Email: _______________________',
      'Invoice delivery:   [ ] Email   [ ] EDI   [ ] Portal',
    ] },
    { h: 'Section 5 — Declaration', body: [
      'I certify that the information given is true and complete, and I authorise Virto Industrial Supply',
      'to obtain credit reports and contact the references named above.',
      'I confirm that I have read and accept the Terms and Conditions of Sale, including the retention of',
      'title provision at clause 4 and the payment terms at clause 3.',
      '',
      'Signed: ____________________________   Name: ____________________________',
      'Title: _____________________________   Date: _____________________________',
    ] },
    { h: 'For office use only', body: [
      'Received: __________  Assessed by: __________  Limit approved (USD): __________',
      'Terms: __________  Account number: __________  Notified: __________',
    ] },
  ]);
}

const RETURNS_INTRO = 'Virto Industrial Supply — effective 1 January 2026. This policy sits alongside clauses 6 and 7 of the Terms and Conditions of Sale.';
const RETURNS_SECTIONS = [
    { h: '1. Return material authorisation', body: [
      'No return is accepted without a return material authorisation (RMA) number. Request one from your account',
      'representative or at returns@virtoindustrial.example, quoting the invoice number, part number and quantity.',
      'An RMA is valid for 30 days from issue. Mark the number clearly on the outside of every carton.',
    ] },
    { h: '2. What can be returned', body: [
      'Unused stock items in original, unopened packaging, within 60 days of the invoice date.',
      'Items supplied in error or damaged in transit, notified within five working days of delivery.',
      'Warranty claims under clause 6, at any point in the twelve month warranty period.',
    ] },
    { h: '3. What cannot be returned', body: [
      'Special-order items sourced specifically for the customer.',
      'Cut-to-length product, kitted assemblies and any item modified after delivery.',
      'Hazardous materials, including lubricants and chemicals, once the seal is broken.',
      'Items returned without an RMA number, which are held for 14 days and then disposed of.',
    ] },
    { h: '4. Restocking', body: [
      'Stock returns accepted for credit are subject to a 15% restocking charge, waived where the return arises',
      'from a supplier error or a warranty failure. Credit is issued at the price invoiced, net of the charge,',
      'within ten working days of the goods being received and inspected.',
    ] },
    { h: '5. Warranty claims', body: [
      'Goods are warranted free from defects in material and workmanship for twelve months from delivery.',
      'Submit the invoice number, the part number, the date the defect appeared and a description of the',
      'application. The supplier may request the goods for inspection before determining the claim.',
      'Remedy is limited, at the supplier\'s option, to replacement of the goods or credit of the invoice value.',
      'The warranty does not cover fair wear and tear, misapplication, or use outside published specifications.',
    ] },
    { h: '6. Transport and risk', body: [
      'Return transport is arranged by the customer unless the return arises from a supplier error, in which',
      'case the supplier arranges collection. Risk in returned goods passes to the supplier on receipt at the',
      'Memphis distribution centre.',
    ] },
    { h: '7. Escalation', body: [
      'A claim not resolved within 15 working days may be escalated to the customer service manager at',
      'escalations@virtoindustrial.example, quoting the RMA number.',
    ] },
];

/** Cover + the seven sections over three pages, padded to the declared page count. */
function returnsPdf(spec) {
  const pages = [coverPage('Returns and Warranty Policy', 'Effective 1 January 2026', [
    ...wrap(RETURNS_INTRO, 80),
    '',
    'Request a return material authorisation from your account representative',
    'or at returns@virtoindustrial.example.',
  ])];
  const groups = [RETURNS_SECTIONS.slice(0, 3), RETURNS_SECTIONS.slice(3, 5), RETURNS_SECTIONS.slice(5)];
  groups.forEach((g, i) => pages.push(sectionPage(i === 0 ? 'Returns' : i === 1 ? 'Credit and warranty' : 'Logistics and escalation', g,
    `Returns and Warranty Policy — page ${2 + i}`)));
  return padToPageCount(pages, spec.pageCount, (n) => sectionPage('Notes', wrap(
    'The controlled version of this policy is published at virtoindustrial.example/returns and supersedes any printed copy.'), `Page ${n}`));
}

// ---- drive -----------------------------------------------------------------

const BUILDERS = {
  'DDOC-CATALOG': (spec) => buildPdf(catalogPdf(spec), { title: spec.name }),
  'DDOC-SDS': (spec) => buildPdf(sdsPdf(spec), { title: spec.name }),
  'DDOC-VOLUME': (spec) => buildPdf(volumePdf(spec), { title: spec.name }),
  'DDOC-TERMS': (spec) => buildPdf(termsPdf(spec), { title: spec.name }),
  'DDOC-WAREHOUSE': (spec) => buildPdf(sitePlanPdf(spec), { title: spec.name }),
  'DDOC-PRICE-Q4': () => priceListXlsx(),
  'DDOC-CREDIT': () => creditDocx(),
  'DDOC-RETURNS': (spec) => buildPdf(returnsPdf(spec), { title: spec.name }),
};

function main() {
  if (!CHECK && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  let drift = 0;
  let written = 0;
  console.log(`sales-rep demo document assets → ${DEMO_UPLOADS_DIR}/sales-rep-demo/${CHECK ? '  [--check, no writes]' : ''}\n`);
  for (const spec of DEMO_DOCUMENTS) {
    const build = BUILDERS[spec.key];
    if (!build) { console.log(`  ⚠ ${spec.key}: no builder — falls back to the seeder's generated bytes`); continue; }
    const bytes = build(spec);
    const out = join(OUT_DIR, spec.fileName);
    const pageNote = spec.pageCount ? `, ${spec.pageCount} page(s) as declared` : '';
    if (CHECK) {
      const same = existsSync(out) && Buffer.compare(readFileSync(out), bytes) === 0;
      if (!same) { drift += 1; console.log(`  ✗ ${spec.fileName} — committed bytes differ from the spec (re-run without --check)`); }
      else console.log(`  ✓ ${spec.fileName} (${bytes.length} bytes${pageNote})`);
      continue;
    }
    writeFileSync(out, bytes);
    written += 1;
    console.log(`  ✓ ${spec.fileName} (${bytes.length} bytes${pageNote}) — ${spec.name}`);
  }
  if (CHECK && drift) {
    console.error(`\n${drift} asset(s) drifted from the spec. Re-run without --check and commit.`);
    process.exit(1);
  }
  console.log(CHECK ? '\nAll committed assets match the spec.' : `\n${written} asset(s) written. Commit them, then re-seed the documents.`);
}

main();
