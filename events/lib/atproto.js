/* Public ATProto reads for event directories. No auth: event records are
 * world-readable. fetchFn is injectable so every path is tested offline.
 *
 * resolveActor, getJson and pdsFromDoc follow wall/lib/atproto.js. The copy
 * is deliberate, for the reason that file records: a shared module would
 * mean changing deployed surfaces at the same time. Extract when all three
 * readers (catalogue, wall, events) are stable.
 */

const BSKY = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

export const EVENT_NSID = 'community.lexicon.calendar.event';
export const PAGE_LIMIT = 100;
export const MAX_PAGES = 20;

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) {
    const detail = typeof r.text === 'function' ? await r.text() : '';
    const err = new Error(`${url} failed: ${r.status} ${detail}`.trim());
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export function pdsFromDoc(doc) {
  const svc = (doc?.service || []).find(s =>
    s?.id?.endsWith('#atproto_pds') || s?.type === 'AtprotoPersonalDataServer');
  const endpoint = svc?.serviceEndpoint || null;
  if (!endpoint) return null;
  try {
    const scheme = new URL(endpoint).protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return null;
  } catch {
    return null;
  }
  return endpoint.replace(/\/+$/, '');
}

export async function resolveActor(actor, { fetchFn = fetch } = {}) {
  let did = actor;
  if (!actor.startsWith('did:')) {
    const r = await getJson(fetchFn,
      `${BSKY}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    did = r?.did;
    if (typeof did !== 'string' || !did) throw new Error(`could not resolve ${actor}`);
  }
  const doc = did.startsWith('did:web:')
    ? await getJson(fetchFn, `https://${did.slice('did:web:'.length)}/.well-known/did.json`)
    : await getJson(fetchFn, `${PLC}/${encodeURIComponent(did)}`);
  const pds = pdsFromDoc(doc);
  if (!pds) throw new Error(`no PDS found for ${did}`);
  return { did, pds };
}

/* Every record in one collection. A repeated cursor or a runaway repo stops
 * the loop: the page then falls back to its bundled listing rather than
 * spinning. */
export async function listCollection(pds, did, collection = EVENT_NSID, { fetchFn = fetch } = {}) {
  const out = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${pds}/xrpc/com.atproto.repo.listRecords`
      + `?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}`
      + `&limit=${PAGE_LIMIT}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const body = await getJson(fetchFn, url);
    out.push(...(body.records || []));
    const next = body.cursor || '';
    if (!next || next === cursor) return out;
    cursor = next;
  }
  throw new Error(`more than ${MAX_PAGES * PAGE_LIMIT} records in ${collection}`);
}
