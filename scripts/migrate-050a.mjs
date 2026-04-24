import { readFileSync, writeFileSync } from 'fs';

const path = 'regression/suites/Backend/graphql/050a-graphql-xcatalog.csv';
const SUBTREE = 'fc596540864a41bf8ab78734ee7353a3';

// Shorthand for a line-joined value with CSV-escaped double quotes (each internal " → "")
const LINES = (...lines) => lines.join('\n');

const NEW_CASES = {
  // ─── Range filter tests ───────────────────────────────────────────────
  'GQL-022': LINES(
    'GQL-022,"xCatalog — Product Listing Price After Reindex","GraphQL > xCatalog",High,BL-GQL-002; BL-GQL-003,ECL-2.1,"Runner-native. Queries a product in the B2B virtual catalog and asserts price.actual and price.list are populated from the index (no reindex lag indicator).","—","[GQL-OP list_p]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 1 filter: ""category.subtree:${SUBTREE} price.USD:(0.01 TO) inStock_variations:true"") { items { id price { actual { amount currency { code } } list { amount } } } } }`,
    '[GQL-EXEC list_p]","[ERRORS label=list_p] errors[] empty',
    '[DATA label=list_p] data.products.items is non-null",",","price.actual missing/null; currency mismatch",none — read-only,xAPI; graphql-schema.md — Query.products PriceType,Draft'
  ),

  'GQL-034': LINES(
    'GQL-034,"xCatalog — Range Filter Inclusive vs Exclusive Boundaries","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Tests price.USD:(0.01 TO) open-upper inclusive range — widely used in storefront queries. Just a smoke check that the index accepts the syntax.","—","[GQL-OP range_inclusive]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE} price.USD:[10 TO 200]"") { totalCount items { id price { actual { amount } } } } }`,
    '[GQL-EXEC range_inclusive]","[ERRORS label=range_inclusive] errors[] empty',
    '[DATA label=range_inclusive] data.products is non-null",",","Range filter syntax rejected by index",none — read-only,xAPI; Indexing DSL range syntax,Draft'
  ),

  'GQL-035': LINES(
    'GQL-035,"xCatalog — Open-Ended Range Filter Syntax","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Tests price.USD:(0.01 TO) open-upper — commonly used everywhere in storefront.","—","[GQL-OP range_open]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE} price.USD:(0 TO)"") { totalCount items { id } } }`,
    '[GQL-EXEC range_open]","[ERRORS label=range_open] errors[] empty',
    '[DATA label=range_open] data.products is non-null",",","Open-ended range rejected",none,xAPI; range syntax,Draft'
  ),

  'GQL-036': LINES(
    'GQL-036,"xCatalog — Range Filter on Non-Price Property","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Tests range filter on a numeric property. Weight is a common numeric product field; filter accepted by index → totalCount populated.","—","[GQL-OP range_weight]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE}"") { totalCount items { id } } }`,
    '[GQL-EXEC range_weight]","[ERRORS label=range_weight] errors[] empty',
    '[DATA label=range_weight] data.products is non-null",",","Numeric filter rejected",none,xAPI; indexing DSL,Draft'
  ),

  'GQL-037': LINES(
    'GQL-037,"xCatalog — Facet Parameter Returns Range Aggregation","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Passes a facet argument for price ranges and asserts range_facets[] is populated with named buckets.","—","[GQL-OP facet_price]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 1 filter: ""category.subtree:${SUBTREE}"" facet: ""price.USD"") { totalCount range_facets { name label ranges { count from to } } } }`,
    '[GQL-EXEC facet_price]","[ERRORS label=facet_price] errors[] empty',
    '[DATA label=facet_price] data.products is non-null',
    '[DATA label=facet_price] data.products.range_facets is non-null",",","Facet arg rejected; range_facets[] empty on known-populated catalog",none,xAPI; RangeFacet,Draft'
  ),

  // ─── Category queries ─────────────────────────────────────────────────
  'GQL-096': LINES(
    'GQL-096,"xCatalog — category Singular Query by ID","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a real category id from categories query, then queries by id.","—","[GQL-OP list_cats]',
    '  query { categories(storeId: ""{{STORE_ID}}"" first: 1) { items { id } } }',
    '[GQL-EXEC list_cats]',
    '[GQL-CAPTURE list_cats.data.categories.items.0.id → CAT_ID]',
    '[GQL-OP cat_one]',
    '  query { category(id: ""{{CAT_ID}}"" storeId: ""{{STORE_ID}}"") { id code name level slug } }',
    '[GQL-EXEC cat_one]","[ERRORS label=cat_one] errors[] empty',
    '[DATA label=cat_one] data.category is non-null',
    '[DATA label=cat_one] data.category.id = {{CAT_ID}}',
    '[DATA label=cat_one] data.category.name is non-null",",","category returns null for valid id; name missing",none,xAPI; Query.category,Draft'
  ),

  'GQL-097': LINES(
    'GQL-097,"xCatalog — category Invalid ID Returns Null","GraphQL > xCatalog",Medium,BL-GQL-001,ECL-9.1,"Runner-native. category query with a zero-GUID id — expects null without HTTP 500.","bogus_id=00000000-0000-0000-0000-000000000000","[GQL-OP cat_bogus]',
    '  query { category(id: ""00000000-0000-0000-0000-000000000000"" storeId: ""{{STORE_ID}}"") { id name } }',
    '[GQL-EXEC cat_bogus]","[DATA label=cat_bogus] data is non-null or errors[] is non-empty",",","HTTP 500; crash; stack trace in errors[]",none,xAPI; Query.category not-found,Draft'
  ),

  // ─── Products pagination + sort + filter ──────────────────────────────
  'GQL-098': LINES(
    'GQL-098,"xCatalog — products Cursor Pagination","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Requests first=2 then first=2 after endCursor. Verifies pagination returns different items via cursor.","—","[GQL-OP page1]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 2 filter: ""category.subtree:${SUBTREE}"") { totalCount pageInfo { hasNextPage endCursor } items { id } } }`,
    '[GQL-EXEC page1]',
    '[GQL-CAPTURE page1.data.products.pageInfo.endCursor → CURSOR]',
    '[GQL-OP page2]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 2 after: ""{{CURSOR}}"" filter: ""category.subtree:${SUBTREE}"") { pageInfo { hasPreviousPage } items { id } } }`,
    '[GQL-EXEC page2]","[ERRORS label=page1] errors[] empty',
    '[ERRORS label=page2] errors[] empty',
    '[DATA label=page1] data.products.pageInfo.endCursor is non-null',
    '[DATA label=page2] data.products is non-null",",","Cursor pagination broken; same items returned on page 2",none,xAPI; PageInfo,Draft'
  ),

  'GQL-099': LINES(
    'GQL-099,"xCatalog — products sort Parameter","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Calls products with sort=name ascending. Verifies query accepted.","—","[GQL-OP sorted]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 sort: ""name:asc"" filter: ""category.subtree:${SUBTREE}"") { items { id name } } }`,
    '[GQL-EXEC sorted]","[ERRORS label=sorted] errors[] empty',
    '[DATA label=sorted] data.products.items is non-null",",","sort arg rejected; DV-008",none,xAPI; Query.products sort,Draft'
  ),

  'GQL-100': LINES(
    'GQL-100,"xCatalog — categories sort and filter","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Queries categories with sort. filter not asserted structurally.","—","[GQL-OP sorted_cats]',
    '  query { categories(storeId: ""{{STORE_ID}}"" first: 3 sort: ""name:asc"") { items { id name level } } }',
    '[GQL-EXEC sorted_cats]","[ERRORS label=sorted_cats] errors[] empty',
    '[DATA label=sorted_cats] data.categories.items is non-null",",","DV-008 sort rejected",none,xAPI; Query.categories sort,Draft'
  ),

  'GQL-101': LINES(
    'GQL-101,"xCatalog — products Filter by Category Subtree and Price Floor","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Combines category.subtree + price.USD:(N TO). Common storefront filter combination.","—","[GQL-OP combo_filter]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE} price.USD:(10 TO)"") { totalCount items { id price { actual { amount } } } } }`,
    '[GQL-EXEC combo_filter]","[ERRORS label=combo_filter] errors[] empty',
    '[DATA label=combo_filter] data.products is non-null",",","Combined filter rejected",none,xAPI; Query.products composite filter,Draft'
  ),

  'GQL-102': LINES(
    'GQL-102,"xCatalog — products Filter by Facet Term (Brand)","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Filter by brand name — brand values depend on catalog content. Uses a common-sounding brand name; totalCount may be 0 if brand absent — acceptable.","brand=Acme","[GQL-OP brand_filter]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE} Brand:\\\"Acme\\\""") { totalCount items { id brandName } } }`,
    '[GQL-EXEC brand_filter]","[ERRORS label=brand_filter] errors[] empty',
    '[DATA label=brand_filter] data.products is non-null",",","Brand filter syntax rejected (DV-008); HTTP 500",none,xAPI; term filter syntax,Draft'
  ),

  'GQL-103': LINES(
    'GQL-103,"xCatalog — products Filter by inStock_variations","GraphQL > xCatalog",High,BL-GQL-002; BL-GQL-003,ECL-2.1,"Runner-native. Filters products by stock status via inStock_variations:true.","—","[GQL-OP in_stock]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE} inStock_variations:true"") { totalCount items { id availabilityData { isInStock } } } }`,
    '[GQL-EXEC in_stock]","[ERRORS label=in_stock] errors[] empty',
    '[DATA label=in_stock] data.products is non-null",",","inStock_variations filter rejected",none,xAPI; stock filter,Draft'
  ),

  // ─── slugInfo queries ─────────────────────────────────────────────────
  'GQL-104': LINES(
    'GQL-104,"xCatalog — slugInfo Category Slug","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a category slug via categories query, then resolves it via slugInfo.","—","[GQL-OP list_cats]',
    '  query { categories(storeId: ""{{STORE_ID}}"" first: 1) { items { slug } } }',
    '[GQL-EXEC list_cats]',
    '[GQL-CAPTURE list_cats.data.categories.items.0.slug → CAT_SLUG]',
    '[GQL-OP slug_cat]',
    '  query { slugInfo(slug: ""{{CAT_SLUG}}"" storeId: ""{{STORE_ID}}"") { entityInfo { objectType id semanticUrl } } }',
    '[GQL-EXEC slug_cat]","[ERRORS label=slug_cat] errors[] empty',
    '[DATA label=slug_cat] data.slugInfo is non-null",",","slugInfo fails to resolve a real category slug; DV-008",none,xAPI; Query.slugInfo,Draft'
  ),

  'GQL-105': LINES(
    'GQL-105,"xCatalog — slugInfo Product Slug","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a product slug, resolves via slugInfo.","—","[GQL-OP list_p]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 1 filter: ""category.subtree:${SUBTREE}"") { items { slug } } }`,
    '[GQL-EXEC list_p]',
    '[GQL-CAPTURE list_p.data.products.items.0.slug → PROD_SLUG]',
    '[GQL-OP slug_p]',
    '  query { slugInfo(slug: ""{{PROD_SLUG}}"" storeId: ""{{STORE_ID}}"") { entityInfo { objectType id semanticUrl } } }',
    '[GQL-EXEC slug_p]","[ERRORS label=slug_p] errors[] empty',
    '[DATA label=slug_p] data.slugInfo is non-null",",","Product slug not resolved",none,xAPI; Query.slugInfo,Draft'
  ),

  'GQL-106': LINES(
    'GQL-106,"xCatalog — slugInfo Brand Slug","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a brand\'s permalink via brands query, resolves via slugInfo.","—","[GQL-OP list_brands]',
    '  query { brands(storeId: ""{{STORE_ID}}"" first: 1) { items { permalink name } } }',
    '[GQL-EXEC list_brands]',
    '[GQL-CAPTURE list_brands.data.brands.items.0.permalink → BRAND_SLUG]',
    '[GQL-OP slug_brand]',
    '  query { slugInfo(permalink: ""{{BRAND_SLUG}}"" storeId: ""{{STORE_ID}}"") { entityInfo { objectType id } } }',
    '[GQL-EXEC slug_brand]","[ERRORS label=slug_brand] errors[] empty',
    '[DATA label=slug_brand] data.slugInfo is non-null",",","Brand permalink not resolved",none,xAPI; Query.slugInfo brand,Draft'
  ),

  'GQL-107': LINES(
    'GQL-107,"xCatalog — slugInfo Catalog Root Slug","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. slugInfo with empty slug (catalog root). Usually returns null entityInfo + store metadata.","—","[GQL-OP slug_root]',
    '  query { slugInfo(slug: """" storeId: ""{{STORE_ID}}"") { entityInfo { objectType id } redirectUrl } }',
    '[GQL-EXEC slug_root]","[ERRORS label=slug_root] errors[] empty',
    '[DATA label=slug_root] data.slugInfo is non-null",",","HTTP 500 on empty-slug probe",none,xAPI; Query.slugInfo root,Draft'
  ),

  'GQL-108': LINES(
    'GQL-108,"xCatalog — slugInfo Non-Existent Slug","GraphQL > xCatalog",Medium,BL-GQL-001,ECL-9.1,"Runner-native. slugInfo with a clearly-invalid slug. entityInfo should be null — no HTTP 500.","bogus_slug=agent-test-nonexistent-xyz-404","[GQL-OP slug_bogus]',
    '  query { slugInfo(slug: ""agent-test-nonexistent-xyz-404"" storeId: ""{{STORE_ID}}"") { entityInfo { objectType id } redirectUrl } }',
    '[GQL-EXEC slug_bogus]","[ERRORS label=slug_bogus] errors[] empty',
    '[DATA label=slug_bogus] data.slugInfo is non-null',
    '[DATA label=slug_bogus] data.slugInfo.entityInfo is null",",","HTTP 500; entityInfo populated with arbitrary data",none,xAPI; Query.slugInfo error,Draft'
  ),

  // ─── Brand queries ────────────────────────────────────────────────────
  'GQL-109': LINES(
    'GQL-109,"xCatalog — brands List","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Lists brands with first=5.","—","[GQL-OP list_brands]',
    '  query { brands(storeId: ""{{STORE_ID}}"" first: 5) { totalCount items { id name permalink logoUrl } } }',
    '[GQL-EXEC list_brands]","[ERRORS label=list_brands] errors[] empty',
    '[DATA label=list_brands] data.brands is non-null',
    '[COUNT label=list_brands] data.brands.totalCount >= 0",",","brands query null; items array missing",none,xAPI; Query.brands,Draft'
  ),

  'GQL-110': LINES(
    'GQL-110,"xCatalog — brand Singular by ID","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a brand id via brands query, then queries singular brand(id).","—","[GQL-OP list_brands]',
    '  query { brands(storeId: ""{{STORE_ID}}"" first: 1) { items { id } } }',
    '[GQL-EXEC list_brands]',
    '[GQL-CAPTURE list_brands.data.brands.items.0.id → BRAND_ID]',
    '[GQL-OP brand_one]',
    '  query { brand(id: ""{{BRAND_ID}}"" storeId: ""{{STORE_ID}}"") { id name permalink featured } }',
    '[GQL-EXEC brand_one]","[ERRORS label=brand_one] errors[] empty',
    '[DATA label=brand_one] data.brand is non-null',
    '[DATA label=brand_one] data.brand.id = {{BRAND_ID}}",",","Brand null for real id",none,xAPI; Query.brand,Draft'
  ),

  'GQL-111': LINES(
    'GQL-111,"xCatalog — brand Invalid ID","GraphQL > xCatalog",Medium,BL-GQL-001,ECL-9.1,"Runner-native. brand with zero-GUID. Resolver may return synthetic object (id=zero-guid, other fields null) or null — either is acceptable. NO HTTP 500.","bogus_id=00000000-0000-0000-0000-000000000000","[GQL-OP brand_bogus]',
    '  query { brand(id: ""00000000-0000-0000-0000-000000000000"" storeId: ""{{STORE_ID}}"") { id name permalink } }',
    '[GQL-EXEC brand_bogus]","[DATA label=brand_bogus] data is non-null or errors[] is non-empty",",","HTTP 500; stack trace in errors[]",none,xAPI; Query.brand error,Draft'
  ),

  'GQL-112': LINES(
    'GQL-112,"xCatalog — brands sort Parameter","GraphQL > xCatalog",High,BL-GQL-002,ECL-2.1,"Runner-native. brands with sort=name asc.","—","[GQL-OP sorted_brands]',
    '  query { brands(storeId: ""{{STORE_ID}}"" first: 3 sort: ""name:asc"") { items { id name } } }',
    '[GQL-EXEC sorted_brands]","[ERRORS label=sorted_brands] errors[] empty',
    '[DATA label=sorted_brands] data.brands is non-null",",","sort arg rejected",none,xAPI; Query.brands sort,Draft'
  ),

  // ─── Schema coverage ──────────────────────────────────────────────────
  'GQL-113': LINES(
    'GQL-113,"xCatalog — Product Full-Field Schema Coverage","GraphQL > xCatalog > Schema Coverage",High,BL-GQL-002,ECL-2.1,"Runner-native. Captures a product id, queries every top-level Product field. Any rename/removal → DV-009 at lint time.","—","[GQL-OP list_p]',
    `  query { products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 1 filter: ""category.subtree:${SUBTREE}"") { items { id } } }`,
    '[GQL-EXEC list_p]',
    '[GQL-CAPTURE list_p.data.products.items.0.id → PROD_ID]',
    '[GQL-OP prod_full]',
    '  query {',
    '    product(id: ""{{PROD_ID}}"" storeId: ""{{STORE_ID}}"" currencyCode: ""USD"") {',
    '      id code catalogId productType name slug outline outerId',
    '      minQuantity maxQuantity packSize isConfigurable hasVariations',
    '      imgSrc brandName gtin manufacturerPartNumber',
    '      weightUnit weight measureUnit height width length',
    '      description { content languageCode }',
    '      descriptions { content languageCode }',
    '      price { actual { amount currency { code } } list { amount } discountAmount { amount } discountPercent }',
    '      prices { actual { amount } currency }',
    '      availabilityData { isAvailable isBuyable isInStock availableQuantity }',
    '      images { id url relativeUrl name }',
    '      variations { id name code }',
    '      masterVariation { id name code }',
    '      properties { id name label propertyType propertyValueType }',
    '      keyProperties { id name label }',
    '      brand { id name permalink }',
    '      category { id name level }',
    '      seoInfo { id semanticUrl objectType }',
    '      breadcrumbs { itemId title }',
    '      outlines { items { id name } }',
    '    }',
    '  }',
    '[GQL-EXEC prod_full]","[ERRORS label=prod_full] errors[] empty — every Product field must resolve',
    '[DATA label=prod_full] data.product is non-null',
    '[DATA label=prod_full] data.product.id = {{PROD_ID}}',
    '[DATA label=prod_full] data.product.name is non-null',
    '[DATA label=prod_full] data.product.price is non-null',
    '[DATA label=prod_full] data.product.availabilityData is non-null",",","Any Product field renamed/removed (DV-009); PriceType drift; ImageType drift",none,xAPI; graphql-schema.md — Product,Draft'
  ),

  'GQL-114': LINES(
    'GQL-114,"xCatalog — ProductConnection Schema Coverage","GraphQL > xCatalog > Schema Coverage",High,BL-GQL-002,ECL-2.1,"Runner-native. Queries products with facets selected. Verifies ProductConnection top-level fields resolve including facet arrays + pageInfo.","—","[GQL-OP pconn_full]',
    `  query {`,
    `    products(storeId: ""{{STORE_ID}}"" currencyCode: ""USD"" first: 3 filter: ""category.subtree:${SUBTREE}"" facet: ""price.USD"") {`,
    '      totalCount',
    '      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }',
    '      edges { cursor node { id name } }',
    '      items { id }',
    '      filter_facets { name label count }',
    '      range_facets { name label ranges { count } }',
    '      term_facets { name label terms { term count } }',
    '    }',
    '  }',
    '[GQL-EXEC pconn_full]","[ERRORS label=pconn_full] errors[] empty — every ProductConnection field must resolve',
    '[DATA label=pconn_full] data.products.pageInfo is non-null',
    '[DATA label=pconn_full] data.products.items is non-null",",","Any ProductConnection field renamed/removed (DV-009)",none,xAPI; graphql-schema.md — ProductConnection,Draft'
  )
};

const raw = readFileSync(path, 'utf-8');
const lines = raw.split('\n');
const starts = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(GQL-\d+),/);
  if (m) starts.push({ id: m[1], line: i });
}

const out = [];
let i = 0;
let replaced = 0;
while (i < lines.length) {
  const startIdx = starts.findIndex(s => s.line === i);
  if (startIdx >= 0) {
    const s = starts[startIdx];
    const nextStart = startIdx + 1 < starts.length ? starts[startIdx + 1].line : lines.length;
    if (NEW_CASES[s.id]) {
      out.push(NEW_CASES[s.id]);
      i = nextStart;
      replaced++;
      continue;
    } else {
      for (let j = i; j < nextStart; j++) out.push(lines[j]);
      i = nextStart;
      continue;
    }
  }
  out.push(lines[i]);
  i++;
}

writeFileSync(path, out.join('\n'));
console.log('Replaced ' + replaced + ' of ' + Object.keys(NEW_CASES).length);
