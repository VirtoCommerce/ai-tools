// Anchor normalization: the pure part of the identity rule, in a module of its own.
//
// It lives here rather than in capture.mjs because both the door and the cross-plane lookup need
// it, and having the lookup import it from the door made a cycle -- capture -> coordinates ->
// capture -- whose only symptom was a constant read before it was initialized. A rule this
// load-bearing should not be reachable only through the module that happens to use it most.

const VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

// One endpoint appeared in the demand rows as four different strings:
//   /connect/token   BACK_URL/connect/token   {BACK_URL}/connect/token   http://host:8090/connect/token
// Normalizing is what makes them one coordinate. Kept deliberately small: each rule below removes
// a way of writing the SAME location, and none of them changes which location is meant.
export function normalizeAnchor(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  let verb = null;
  const m = /^([A-Za-z]+)\s+(.+)$/.exec(s);
  if (m && VERBS.has(m[1].toUpperCase())) {
    verb = m[1].toUpperCase();
    s = m[2].trim();
  }

  s = s.replace(/^https?:\/\/[^/]+/i, '');            // an absolute URL and its path are one place
  s = s.replace(/^\{[A-Za-z_][A-Za-z0-9_]*\}(?=\/)/, ''); // {BACK_URL}/...
  s = s.replace(/^[A-Z][A-Z0-9_]*(?=\/)/, '');            // BACK_URL/...   (never a lowercase segment)
  s = s.replace(/[?#].*$/, '');                           // a query string is not part of the coordinate

  if (s.startsWith('/')) {
    s = s
      .split('/')
      .map((seg) => (/^[<{:]|[>}]$/.test(seg) ? '{}' : seg))  // <id>, {cartId}, :id are one parameter
      .join('/');
    if (s.length > 1) s = s.replace(/\/+$/, '');
  }

  s = s.toLowerCase();
  return verb ? `${verb} ${s}` : s;
}

// WHAT KIND OF PLACE AN ANCHOR NAMES. Used by the gate, which reports it over the whole corpus, and
// by the door, which says it to the writer while the page is still open -- the placement that
// matters, because the writer is the only party who knows what they actually saw.

// A menu path is honest about where somebody stood and nothing can ever raise it: no contract diff
// notices that a blade moved, and the release that renames it will not touch the entry.
export const LOOKS_LIKE_A_MENU_PATH = /(^|\s)(Admin SPA|Storefront|Platform)\s*:|\s>\s/;

/**
 * The family an anchor belongs to, or null when it has none.
 *
 * Case-insensitive, because it is applied both to the raw string a writer typed and to the
 * normalized key the index stores, and normalizeAnchor lowercases. The first version was not, so
 * `Mutations` matched nothing on the derived side and the one coordinate the check existed to catch
 * was reported as an unprojected surface instead.
 *
 * Two route segments and not one: every REST route in this base begins `/api`, so a namespace that
 * coarse would say only that the base has a REST plane. `/api/platform` against `/company` is the
 * distinction that carries information.
 */
export function namespaceOf(raw) {
  const s = String(raw ?? '');
  const verb = s.match(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i);
  const path = verb ? verb[1] : (s.startsWith('/') ? s : null);
  if (path) return `/${path.split('/').filter(Boolean).slice(0, 2).join('/')}`.toLowerCase();
  const dotted = s.match(/^([A-Za-z][A-Za-z0-9]*)[.]/);
  return dotted ? dotted[1].toLowerCase() : null;
}

/**
 * A path on one machine, which is never a coordinate anyone can look up.
 *
 * Not hypothetical and not rare. Under Git Bash, MSYS rewrites an argument that begins with "/"
 * into a Windows path before the tool is started -- `--anchor "/{category}/{product-slug}"` arrives
 * as `C:/Program Files/Git/{category}/{product-slug}`. Run 07 wrote an entry that way and left the
 * corpus failing its own gate; the correction was then mangled identically, by someone who had just
 * read the failure and knew the cause. Knowing about this trap does not help you avoid it, which is
 * the argument for refusing at the door rather than describing it in help text.
 *
 * The rule stays narrow on purpose: the UI half of this corpus anchors on labels and selectors
 * (`Add to cart`, `label.vc-radio-button__container`) that no coordinate grammar would admit, so
 * this names one specific defect instead of prescribing a shape.
 */
export const LOOKS_LIKE_A_LOCAL_PATH = /^[A-Za-z]:[/]|Program Files/;

// What to do about it, said once so the gate and the door cannot word it differently.
export const MSYS_REMEDY = 'Under Git Bash a leading "/" is rewritten before the tool sees it. '
  + 'Prefix the command with MSYS_NO_PATHCONV=1, or use the "VERB /route" form, which is not rewritten.';
