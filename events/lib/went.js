/* Who went: the beads, in anyone's repository, that point at an event.
 *
 * There is no CultureBlocs index. Constellation (constellation.microcosm.blue,
 * a public backlink index of the whole ATProto network) answers "which
 * records link to this event?"; each bead is then read from its author's own
 * repository, so what shows here is always what the author currently says —
 * edit or delete a bead and this page follows.
 *
 * fetchFn is injectable; every path is tested offline.
 */
import { pdsFromDoc } from './atproto.js';

export const CONSTELLATION = 'https://constellation.microcosm.blue';
export const BEAD_SOURCE = 'com.cultureblocs.bead:subject.uri';
const PLC = 'https://plc.directory';
const BSKY = 'https://public.api.bsky.app/xrpc';
const MAX_PAGES = 5;          // 500 beads per event is plenty for a page

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) {
    const err = new Error(`${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/* Run tasks with at most `n` in flight — a week page asks about thirty
 * events, and politeness to a free public service matters. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/* ---------- the hide list ---------- */
/* { beads: [at-uri…], dids: [did…] } — published at /events/hidden.json.
 * Hiding only stops this site showing something; the record is untouched. */
export function hider(list) {
  const beads = new Set(list?.beads || []);
  const dids = new Set(list?.dids || []);
  return (did, uri) => dids.has(did) || beads.has(uri);
}

/* ---------- backlinks ---------- */
/* Every bead pointing at one event: [{ did, rkey, uri }]. */
export async function beadLinks(eventUri, { fetchFn = fetch } = {}) {
  const out = [];
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await getJson(fetchFn, `${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`
      + `?subject=${encodeURIComponent(eventUri)}&source=${encodeURIComponent(BEAD_SOURCE)}&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    for (const r of body.records || []) {
      if (!r?.did || !r?.rkey) continue;
      out.push({ did: r.did, rkey: r.rkey, uri: `at://${r.did}/${r.collection || 'com.cultureblocs.bead'}/${r.rkey}` });
    }
    if (!body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  return out;
}

/* People, not records: one person who went on two days is one who went. */
export const peopleIn = (links, hidden = () => false) =>
  new Set(links.filter(l => !hidden(l.did, l.uri)).map(l => l.did)).size;

/* ---------- reading beads where they live ---------- */
const TID = '234567abcdefghijklmnopqrstuvwxyz';
/* A TID record key carries its creation time (microseconds). Keys that
 * aren't TIDs (beads published from the String use uuids) give null. */
export function tidTime(rkey) {
  if (!/^[234567a-z]{13}$/.test(String(rkey))) return null;
  let n = 0n;
  for (const c of rkey) n = n * 32n + BigInt(TID.indexOf(c));
  const ms = Number(n >> 10n) / 1000;
  return ms > Date.UTC(2023, 0, 1) && ms < Date.UTC(2100, 0, 1) ? ms : null;
}

export function makeReader({ fetchFn = fetch } = {}) {
  const pdsFor = new Map();
  const resolvePds = (did) => {
    if (!pdsFor.has(did)) {
      pdsFor.set(did, (async () => {
        const doc = did.startsWith('did:web:')
          ? await getJson(fetchFn, `https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`)
          : await getJson(fetchFn, `${PLC}/${encodeURIComponent(did)}`);
        const pds = pdsFromDoc(doc);
        if (!pds) throw new Error(`no PDS for ${did}`);
        const aka = (doc.alsoKnownAs || []).find(a => String(a).startsWith('at://'));
        return { pds, handle: aka ? aka.slice(5) : null };
      })());
    }
    return pdsFor.get(did);
  };

  /* One bead, or null if it has gone (deleted since Constellation saw it). */
  async function bead(link) {
    const { pds, handle } = await resolvePds(link.did);
    try {
      const rec = await getJson(fetchFn, `${pds}/xrpc/com.atproto.repo.getRecord`
        + `?repo=${encodeURIComponent(link.did)}&collection=com.cultureblocs.bead&rkey=${encodeURIComponent(link.rkey)}`);
      return { ...link, handle, value: rec.value };
    } catch (e) {
      if (e.status === 400 || e.status === 404) return null;
      throw e;
    }
  }

  /* Display names and avatars, 25 at a time, where Bluesky knows the person. */
  async function profiles(dids) {
    const out = new Map();
    const unique = [...new Set(dids)];
    for (let i = 0; i < unique.length; i += 25) {
      const q = unique.slice(i, i + 25).map(d => `actors=${encodeURIComponent(d)}`).join('&');
      try {
        const body = await getJson(fetchFn, `${BSKY}/app.bsky.actor.getProfiles?${q}`);
        for (const p of body.profiles || []) {
          out.set(p.did, { handle: p.handle, displayName: p.displayName || '', avatar: p.avatar || '' });
        }
      } catch { /* names fall back to handles from the DID document */ }
    }
    return out;
  }

  return { bead, profiles, resolvePds };
}

/* Beads for one or more events, read and joined to people, newest day
 * first. `links` may span events; `eventOf(uri)` names the event a bead
 * points at. Beads that no longer point at the event (edited away) or are
 * hidden are dropped; a bead that won't load is skipped, not fatal. */
export async function readBeads(links, { reader, hidden = () => false, limit = Infinity, eventUris } = {}) {
  const visible = links.filter(l => !hidden(l.did, l.uri));
  // Newest first by key time where we can, so a limit reads the recent ones.
  visible.sort((a, b) => (tidTime(b.rkey) || 0) - (tidTime(a.rkey) || 0));
  const chosen = visible.slice(0, limit);
  const read = await pool(chosen, 6, (l) => reader.bead(l));
  const beads = read.filter(b => b && !b.error && b.value)
    .filter(b => !eventUris || eventUris.has(String(b.value?.subject?.uri || '')));
  const people = await reader.profiles(beads.map(b => b.did));
  return beads
    .map(b => ({ ...b, profile: people.get(b.did) || null }))
    .sort((a, b) => String(b.value.createdAt || '').localeCompare(String(a.value.createdAt || ''))
      || (tidTime(b.rkey) || 0) - (tidTime(a.rkey) || 0));
}
