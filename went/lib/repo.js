/* Public reads the composer makes before anyone signs in: who is this
 * handle, does the account post to Bluesky, what does the event record
 * say now, and has this person already recorded it. No tokens needed —
 * all of it is world-readable. fetchFn is injectable for tests.
 */
import { pdsFromDoc } from '../../events/lib/atproto.js';

const BSKY = 'https://public.api.bsky.app/xrpc';
const PLC = 'https://plc.directory';

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) {
    const err = new Error(`${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export const cleanHandle = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();

/* handle or DID → { did, pds, handle }. DNS TXT is the fallback for
 * handles the Bluesky resolver doesn't know. */
export async function identify(handleOrDid, { fetchFn = fetch } = {}) {
  const h = cleanHandle(handleOrDid);
  if (!h) throw new Error('Enter your handle.');
  let did = h.startsWith('did:') ? h : null;
  if (!did) {
    try {
      did = (await getJson(fetchFn,
        `${BSKY}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`)).did;
    } catch { /* try DNS below */ }
  }
  if (!did) {
    try {
      const dns = await getJson(fetchFn,
        `https://dns.google/resolve?name=${encodeURIComponent(`_atproto.${h}`)}&type=TXT`);
      const hit = (dns.Answer || []).map(a => String(a.data || '').replace(/"/g, ''))
        .find(v => v.startsWith('did='));
      if (hit) did = hit.slice(4);
    } catch { /* fall through */ }
  }
  if (!did) throw new Error(`No account found for ${h}. Check the spelling — it looks like name.bsky.social.`);
  const doc = did.startsWith('did:web:')
    ? await getJson(fetchFn, `https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`)
    : await getJson(fetchFn, `${PLC}/${encodeURIComponent(did)}`);
  const pds = pdsFromDoc(doc);
  if (!pds) throw new Error('That account has no data server we can reach.');
  const aka = (doc.alsoKnownAs || []).find(a => String(a).startsWith('at://'));
  return { did, pds, handle: h.startsWith('did:') ? (aka ? aka.slice(5) : h) : h };
}

export async function getRecord(pds, repo, collection, rkey, { fetchFn = fetch } = {}) {
  try {
    return await getJson(fetchFn, `${pds}/xrpc/com.atproto.repo.getRecord`
      + `?repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}`
      + `&rkey=${encodeURIComponent(rkey)}`);
  } catch (e) {
    if (e.status === 400 || e.status === 404) return null;
    throw e;
  }
}

/* Does this account post to Bluesky (or anywhere using Bluesky's post
 * records — Blacksky, Eurosky…)? A profile record is the sign. */
export async function postsToBluesky(pds, did, opts) {
  return Boolean(await getRecord(pds, did, 'app.bsky.actor.profile', 'self', opts));
}

/* Display name and avatar, if Bluesky's public view knows the account. */
export async function profileCard(did, { fetchFn = fetch } = {}) {
  try {
    const p = await getJson(fetchFn, `${BSKY}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    return { displayName: p.displayName || '', avatar: p.avatar || '' };
  } catch {
    return null;
  }
}

/* Recent beads, newest first by key, enough to catch a duplicate. A person
 * new to CultureBlocs has none; a Loom user may have many, so stop early. */
export async function listBeads(pds, did, { fetchFn = fetch, maxPages = 5 } = {}) {
  const out = [];
  let cursor = '';
  for (let i = 0; i < maxPages; i++) {
    let body;
    try {
      body = await getJson(fetchFn, `${pds}/xrpc/com.atproto.repo.listRecords`
        + `?repo=${encodeURIComponent(did)}&collection=com.cultureblocs.bead&limit=100`
        + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    } catch (e) {
      if (e.status === 400 || e.status === 404) return out;
      throw e;
    }
    out.push(...(body.records || []));
    if (!body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  return out;
}
