/* Public ATProto reads for the wall. No auth, no tokens: everything here is
 * world-readable. fetchFn is injectable so every path is tested offline.
 *
 * resolveActor, getJson, pdsFromDoc and notResolved are copied from
 * catalogue/lib/atproto.js. The duplication is deliberate and recorded in
 * docs/superpowers/specs/2026-09-21-the-wall-design.md §8: extracting a
 * shared module would mean changing a deployed surface whose tests live in
 * another repository. When the wall works, that extraction is the follow-up.
 */

const BSKY = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

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

function pdsFromDoc(doc) {
  const svc = (doc?.service || []).find(s =>
    s?.id?.endsWith('#atproto_pds') || s?.type === 'AtprotoPersonalDataServer');
  const endpoint = svc?.serviceEndpoint || null;
  if (!endpoint) return null;
  // A DID document is third-party data: a did:web document is served by
  // whatever host the DID names, and a PLC entry is whatever its operator
  // published. Either can name any serviceEndpoint at all, including a
  // non-http one — and that string later gets interpolated into blob URLs
  // (see blobUrl in cultureblocs-works.js). Reject anything but http(s).
  try {
    const scheme = new URL(endpoint).protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return null;
  } catch {
    return null;
  }
  return endpoint;
}

// A genuine 4xx answer means the actor really doesn't resolve; the visitor's
// handle (or DID) is wrong and the friendly, spelling-focused message is the
// right one. Anything else — a fetch rejection (offline, DNS failure; no
// .status at all) or a 5xx — is a transport-adjacent fault that has nothing
// to do with what the visitor typed, and must reach the caller unchanged so
// it lands on the generic "could not load, try again" path instead. The
// synthetic error keeps `.status` in the 4xx range purely so callers can
// route on it the same way as any other resolution failure below.
function notResolved(actor, status) {
  const err = new Error(`could not resolve the handle "${actor}"`);
  err.status = status;
  return err;
}

export async function resolveActor(actor, { fetchFn = fetch } = {}) {
  let did = actor;
  if (!actor.startsWith('did:')) {
    let r;
    try {
      r = await getJson(fetchFn,
        `${BSKY}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    } catch (e) {
      if (e.status >= 400 && e.status < 500) throw notResolved(actor, e.status);
      throw e;
    }
    did = r.did;
    // A 200 with a missing/malformed did is not a network problem, but it is
    // also not something later code can act on: did.startsWith below would
    // throw a confusing "Cannot read properties of undefined" instead of the
    // same friendly message a bad handle already gets.
    if (typeof did !== 'string' || !did) throw notResolved(actor, 400);
  }
  let doc;
  try {
    if (did.startsWith('did:web:')) {
      doc = await getJson(fetchFn, `https://${did.slice('did:web:'.length)}/.well-known/did.json`);
    } else {
      doc = await getJson(fetchFn, `${PLC}/${encodeURIComponent(did)}`);
    }
  } catch (e) {
    // Same reasoning as above: a 502 from plc.directory (or a did:web host)
    // is not evidence the handle/DID is wrong.
    if (e.status >= 400 && e.status < 500) throw notResolved(actor, e.status);
    throw e;
  }
  const pds = pdsFromDoc(doc);
  if (!pds) throw new Error(`no PDS found for ${did}`);
  return { did, pds };
}

export const STRAND_NSID = 'com.cultureblocs.strand';
export const PAGE_LIMIT = 100;
export const MAX_PAGES = 50;   // 5,000 strands; a stuck cursor must not spin the browser

export const blobBase = (pds, did) =>
  `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=`;

/* One strand by its key. A key that is not there is null rather than a
 * throw: "that strand isn't there" is a thing the wall says, not a fault. */
export async function fetchStrand(pds, did, rkey, { fetchFn = fetch } = {}) {
  const url = `${pds}/xrpc/com.atproto.repo.getRecord`
    + `?repo=${encodeURIComponent(did)}&collection=${STRAND_NSID}&rkey=${encodeURIComponent(rkey)}`;
  try {
    return await getJson(fetchFn, url);
  } catch (e) {
    if (e.status === 404 || e.status === 400) return null;
    throw e;
  }
}

/* The strand's members, in the order the evening happened.
 *
 * A bead that will not load comes back marked `missing` rather than dropped.
 * The embed drops them because it is a guest on someone else's page; the
 * wall is the destination, and a strand quietly missing a third of its
 * evening is worse than one that admits it (spec §6).
 */
export async function fetchBeads(pds, strand, { fetchFn = fetch } = {}) {
  const items = Array.isArray(strand?.items) ? strand.items : [];
  const beads = await Promise.all(items.map(async (ref, index) => {
    const uri = String(ref?.uri || '');
    const [, , repo, collection, rkey] = uri.split('/');
    if (!repo || !collection || !rkey) return { uri, missing: true, index };
    const url = `${pds}/xrpc/com.atproto.repo.getRecord`
      + `?repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}`
      + `&rkey=${encodeURIComponent(rkey)}`;
    try {
      const rec = await getJson(fetchFn, url);
      return { uri, value: rec.value, index };
    } catch {
      return { uri, missing: true, index };
    }
  }));
  // A bead with no value (always a missing one) has no createdAt to sort by.
  // Comparing dates only when both sides have one, and falling back to the
  // published index otherwise, keeps a missing bead in place instead of
  // collapsing it to the top of the list (spec §6).
  return beads
    .sort((a, b) => {
      const createdA = a.value?.createdAt;
      const createdB = b.value?.createdAt;
      return createdA && createdB
        ? String(createdA).localeCompare(String(createdB))
        : a.index - b.index;
    })
    .map(({ index, ...bead }) => bead);
}

/* Every strand, then sorted by date.
 *
 * Not one listRecords call, and not cursor paging either: a strand is
 * published under its String record id — a uuid4 — so the order a PDS
 * returns is unrelated to when anything happened (spec §3.1). The only way
 * to show the newest ten is to hold them all and sort. That is affordable
 * because the wall lists summaries: no beads are fetched here, so this is
 * one request per hundred strands.
 *
 * The cap throws rather than returning a partial list, as catalogue's does:
 * a plain array cannot say "this is not all of it".
 */
export async function fetchAllStrands(pds, did, { fetchFn = fetch } = {}) {
  const out = [];
  let cursor = '';
  let seen = null;
  let page;
  for (page = 0; page < MAX_PAGES; page++) {
    const url = `${pds}/xrpc/com.atproto.repo.listRecords`
      + `?repo=${encodeURIComponent(did)}&collection=${STRAND_NSID}&limit=${PAGE_LIMIT}`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const body = await getJson(fetchFn, url);
    const next = body.cursor || '';
    // A repeated cursor is caught before this page is accumulated, or a stuck
    // PDS yields a page of duplicates.
    if (next && next === seen) break;
    out.push(...(body.records || []));
    if (!next) break;
    seen = next;
    cursor = next;
  }
  if (page === MAX_PAGES) {
    throw new Error(
      `this repository has more than ${MAX_PAGES * PAGE_LIMIT} strands; `
      + `the wall cannot show them all`);
  }
  return out.sort((a, b) =>
    String(b.value?.createdAt || '').localeCompare(String(a.value?.createdAt || '')));
}
