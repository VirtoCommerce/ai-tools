/**
 * Response mutants for the detection trial (REQ-01, `docs/bug-detection-requirements.md`).
 *
 * A mutant is a deterministic edit of a GraphQL response body that models one class of bug a
 * customer has actually reported. The trial replays a suite with each mutant switched on: a suite
 * that still passes has no case able to see that class of bug, however many cases it has.
 *
 * Pure functions only — `mutant-preload.mjs` applies them to live responses, the unit test to
 * literals. Every operator returns `{ body, applied }`; `applied: false` means the response had
 * no shape the mutant can act on, which the trial reports as "not exercised", never as "caught".
 */

/** Walk every plain object in a parsed JSON value, depth-first. */
function* objects(node) {
  if (Array.isArray(node)) {
    for (const v of node) yield* objects(v);
  } else if (node && typeof node === "object") {
    yield node;
    for (const v of Object.values(node)) yield* objects(v);
  }
}

/** A connection-shaped object: an `items` array next to a numeric `totalCount`. */
function isPage(o) {
  return Array.isArray(o.items) && typeof o.totalCount === "number";
}

const FLAG_KEYS = new Set(["isAvailable", "isInStock", "isBuyable", "isActive", "inStock"]);

/**
 * Each mutant edits `data` in place and reports whether it changed anything.
 * `archetype` uses the fault-archetype vocabulary of the requirements doc §2.
 */
export const MUTANTS = [
  {
    id: "TRUNCATE_PAGE",
    archetype: "BOUNDARY",
    models: "a page returns fewer items than the page size while totalCount stays large (the catalog paging escape)",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (isPage(o) && o.items.length >= 2) {
          o.items = o.items.slice(0, 1);
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "EMPTY_PAGE",
    archetype: "SILENT",
    models: "every item on a page is dropped while totalCount still reports matches",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (isPage(o) && o.items.length >= 1 && o.totalCount > 0) {
          o.items = [];
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "COUNT_DRIFT",
    archetype: "PARITY",
    models: "totalCount disagrees with the items actually returned",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (isPage(o)) {
          o.totalCount += 7;
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "DUPLICATE_ITEM",
    archetype: "REPLAY",
    models: "the same entity appears twice in one list (duplicate line, overlapping pages)",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (Array.isArray(o.items) && o.items.length >= 2) {
          o.items[1] = structuredClone(o.items[0]);
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "SORT_REVERSED",
    archetype: "SILENT",
    models: "the sort argument is silently ignored",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (Array.isArray(o.items) && o.items.length >= 2) {
          o.items.reverse();
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "MONEY_ZERO",
    archetype: "MONEY",
    models: "a price or total loses its value",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (typeof o.amount === "number" && o.amount !== 0) {
          o.amount = 0;
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "CURRENCY_SWAP",
    archetype: "PARITY",
    models: "an amount is reported in a currency other than the one requested",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (o.currency && typeof o.currency === "object" && typeof o.currency.code === "string") {
          o.currency.code = o.currency.code === "USD" ? "EUR" : "USD";
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "FLAG_FLIP",
    archetype: "STALE",
    models: "availability or activity flags report the opposite state",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        for (const k of Object.keys(o)) {
          if (FLAG_KEYS.has(k) && typeof o[k] === "boolean") {
            o[k] = !o[k];
            hit = true;
          }
        }
      }
      return hit;
    },
  },
  {
    id: "QUANTITY_PLUS_ONE",
    archetype: "REPLAY",
    models: "an action is applied twice, so a quantity is one too high",
    apply(data) {
      let hit = false;
      for (const o of objects(data)) {
        if (typeof o.quantity === "number") {
          o.quantity += 1;
          hit = true;
        }
      }
      return hit;
    },
  },
  {
    id: "SILENT_ERROR",
    archetype: "SILENT",
    models: "HTTP 200 carries a non-empty errors[] next to the data",
    // Operates on the whole body, not on `data`: see applyMutant.
    body: true,
    apply(body) {
      if (!body || typeof body !== "object" || body.data == null) return false;
      body.errors = [...(Array.isArray(body.errors) ? body.errors : []), { message: "MUTANT: resolver failed" }];
      return true;
    },
  },
];

const BY_ID = new Map(MUTANTS.map((m) => [m.id, m]));

export function mutantIds() {
  return MUTANTS.map((m) => m.id);
}

/**
 * Apply one mutant to a parsed GraphQL response body. Never mutates the input.
 * @returns {{ body: unknown, applied: boolean }}
 */
export function applyMutant(id, body) {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`unknown mutant "${id}" — known: ${mutantIds().join(", ")}`);
  const copy = structuredClone(body);
  if (m.body) return { body: copy, applied: m.apply(copy) };
  if (!copy || typeof copy !== "object" || copy.data == null) return { body: copy, applied: false };
  return { body: copy, applied: m.apply(copy.data) };
}

/** The mutants that WOULD change this response — used by the probe pass to skip dead runs. */
export function applicableMutants(body) {
  return mutantIds().filter((id) => applyMutant(id, body).applied);
}
