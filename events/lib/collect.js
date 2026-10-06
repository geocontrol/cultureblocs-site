/* Gather everything the report and the week view need for one directory,
 * from the site's own files and the open network. Each part that can fail
 * independently comes back null rather than sinking the rest. */
import { beadLinks, hider, makeReader, pool, readBeads } from './went.js';
import { CONSTELLATION } from './went.js';

const SITE = 'https://www.cultureblocs.com';

async function siteJson(path, fetchFn) {
  try {
    const r = await fetchFn(path, { cache: 'no-cache' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/* Strands people have published for this directory: they link to its page. */
export async function countStrands(dir, { fetchFn = fetch, hidden = () => false } = {}) {
  const page = `${SITE}/events/${dir}/`;
  const body = await (await fetchFn(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`
    + `?subject=${encodeURIComponent(page)}&source=${encodeURIComponent('com.cultureblocs.strand:links[].uri')}&limit=100`)).json();
  const recs = (body.records || []).filter(r => !hidden(r.did, `at://${r.did}/com.cultureblocs.strand/${r.rkey}`));
  return { count: recs.length, records: recs };
}

/* Posts in this directory's Bluesky feed, via our own feed service. */
export async function countFeedPosts(dir, { fetchFn = fetch } = {}) {
  const cfg = await siteJson('/feeds/feeds.json', fetchFn);
  const feed = cfg?.feeds?.find(f => f.sources?.directory === dir);
  if (!feed) return null;
  const uri = `at://${cfg.publisher}/app.bsky.feed.generator/${feed.rkey}`;
  let n = 0, cursor = '';
  for (let i = 0; i < 5; i++) {
    const r = await fetchFn(`/xrpc/app.bsky.feed.getFeedSkeleton?feed=${encodeURIComponent(uri)}&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    if (!r.ok) return n || null;
    const body = await r.json();
    n += (body.feed || []).length;
    if (!body.cursor) break;
    cursor = body.cursor;
  }
  return { count: n, feedUri: uri, rkey: feed.rkey, publisher: cfg.publisherHandle || cfg.publisher };
}

export async function collect(dir, { fetchFn = fetch } = {}) {
  const [listing, hiddenList] = await Promise.all([
    siteJson(`/events/${dir}/events.json`, fetchFn),
    siteJson('/events/hidden.json', fetchFn),
  ]);
  if (!listing) throw new Error('the listing could not be loaded');
  const hidden = hider(hiddenList);
  const events = listing.records.filter(e => e.category !== 'umbrella');
  const linkSets = await pool(events, 5, (e) => beadLinks(e.atUri, { fetchFn }));
  const seen = new Set();
  const links = linkSets.filter(Array.isArray).flat().filter(l => !seen.has(l.uri) && seen.add(l.uri));
  const beads = await readBeads(links, {
    reader: makeReader({ fetchFn }), hidden, eventUris: new Set(events.map(e => e.atUri)),
  });
  const [strands, posts] = await Promise.all([
    countStrands(dir, { fetchFn, hidden }).catch(() => null),
    countFeedPosts(dir, { fetchFn }).catch(() => null),
  ]);
  return { listing, beads, strands, posts, partial: linkSets.some(x => !Array.isArray(x)) };
}
