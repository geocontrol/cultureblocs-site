/* The wall's URLs, read and written in one place.
 *
 * A strand's URL is the first permanent, human-facing address this project
 * has had: it goes in posts, and it will outlive this code. So parsing and
 * building live together and are tested as a round trip — a link the wall
 * builds must be a link the wall can read.
 *
 * The canonical form is a path, /wall/<handle>/<rkey>. The query form,
 * /wall/?actor=…&strand=…, parses too: catalogue/ taught people that shape,
 * and an embed may point that way.
 */
export const WALL_BASE = '/wall/';

/* A page number that is absent, zero, negative or nonsense is page one. A
 * mangled ?page= should show the wall, not an error. */
function pageFrom(q) {
  const raw = (q.get('page') || '').trim();
  if (!/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  return n >= 1 ? n : 1;
}

export function parse(pathname = '', search = '') {
  const q = new URLSearchParams(search || '');
  const page = pageFrom(q);
  const path = String(pathname || '');
  const rest = path.startsWith(WALL_BASE) ? path.slice(WALL_BASE.length) : '';
  const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) {
    return {
      actor: (q.get('actor') || '').trim() || null,
      rkey: (q.get('strand') || '').trim() || null,
      page,
    };
  }
  const [actor, rkey] = parts;
  return { actor: actor || null, rkey: rkey || null, page };
}

export const wallHref = (actor, page = 1) =>
  `${WALL_BASE}${encodeURIComponent(actor)}/${page > 1 ? `?page=${page}` : ''}`;

export const strandHref = (actor, rkey) =>
  `${WALL_BASE}${encodeURIComponent(actor)}/${encodeURIComponent(rkey)}`;
