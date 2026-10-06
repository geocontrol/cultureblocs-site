/* A Bluesky custom feed with no index of our own.
 *
 * Bluesky asks the feed service "which posts, newest first?" and renders
 * whatever post URIs come back. We answer by asking two public services
 * that already watch the whole network:
 *
 *   - Constellation (constellation.microcosm.blue): every post whose link
 *     card points at one of the directory's pages. Precise; it's how
 *     "I went" posts are shared.
 *   - Bluesky's own search (api.bsky.app, no login needed): posts carrying
 *     the directory's hidden tag, posts matching the feed's search phrases,
 *     and posts linking anywhere under the directory on cultureblocs.com.
 *
 * Results are merged, de-duplicated, ordered by the time encoded in each
 * post's record key, and paged with a cursor. Any one source failing just
 * makes the feed thinner; only all of them failing is an error.
 *
 * Pure apart from fetchFn, which is injected, so it's tested offline and
 * runs unchanged in a Vercel edge function or in node.
 */
import { pool, tidTime } from '../../events/lib/went.js';

export const CONSTELLATION = 'https://constellation.microcosm.blue';
export const SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
export const SITE = 'https://www.cultureblocs.com';
const POST = 'app.bsky.feed.post';
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;

async function getJson(fetchFn, url) {
  const r = await fetchFn(url, { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const err = new Error(`${r.status} from ${new URL(url).host}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/* ---------- which feed ---------- */
export const feedUri = (config, feed) => `at://${config.publisher}/app.bsky.feed.generator/${feed.rkey}`;

/* Bluesky sends the feed's at:// URI. Accept the publisher's DID or handle. */
export function findFeed(config, uri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([A-Za-z0-9._~:-]+)$/.exec(String(uri || ''));
  if (!m) return null;
  if (m[1] !== config.publisher && m[1] !== config.publisherHandle) return null;
  return config.feeds.find(f => f.rkey === m[2]) || null;
}

/* ---------- where a feed's posts come from ---------- */
/* The directory's pages, as a link card would carry them. */
export function pageUrls(listing, directory, site = SITE) {
  const urls = [`${site}/events/${directory}/`];
  for (const e of listing?.records || []) {
    if (e.category !== 'umbrella' && e.slug) urls.push(`${site}/events/${directory}/${e.slug}/`);
  }
  return urls;
}

/* Does this post link (card or in-text) somewhere under the directory? */
export function linksToDirectory(record, directory, short) {
  const uris = [record?.embed?.external?.uri, record?.embed?.media?.external?.uri];
  for (const f of record?.facets || []) for (const x of f?.features || []) uris.push(x?.uri);
  return uris.filter(Boolean).some(u => {
    try {
      const { host, pathname } = new URL(u);
      if (host !== 'cultureblocs.com' && host !== 'www.cultureblocs.com') return false;
      return pathname.startsWith(`/events/${directory}/`) || (short && (pathname === `/w/${short}` || pathname.startsWith(`/w/${short}/`)))
        || (pathname === '/went/' && /[?&]dir=/.test(u) && u.includes(`dir=${directory}`));
    } catch {
      return false;
    }
  });
}

const atUri = (did, rkey) => `at://${did}/${POST}/${rkey}`;
const timeOf = (uri, fallback) => tidTime(String(uri).split('/').pop()) || Date.parse(fallback || '') || 0;

/* Every candidate post for a feed: [{ uri, t, author }]. */
export async function gather(feed, { listing, fetchFn = fetch, site = SITE } = {}) {
  const src = feed.sources || {};
  const dir = src.directory;
  const short = listing?.meta?.short;
  const jobs = [];

  // 1. link cards pointing at the directory's pages
  if (dir) {
    for (const page of pageUrls(listing, dir, site)) {
      jobs.push(async () => {
        const body = await getJson(fetchFn, `${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`
          + `?subject=${encodeURIComponent(page)}&source=${encodeURIComponent(`${POST}:embed.external.uri`)}&limit=100`);
        return (body.records || []).filter(r => r?.did && r?.rkey)
          .map(r => ({ uri: atUri(r.did, r.rkey), author: r.did }));
      });
    }
  }
  // 2. search: hidden tags, phrases, and links anywhere under the directory
  const searched = (params, keep = () => true) => async () => {
    const body = await getJson(fetchFn, `${SEARCH}?${new URLSearchParams({ sort: 'latest', limit: '100', ...params })}`);
    return (body.posts || []).filter(p => p?.uri && keep(p))
      .map(p => ({ uri: p.uri, author: p.author?.did, at: p.record?.createdAt || p.indexedAt }));
  };
  for (const tag of src.tags || []) jobs.push(searched({ q: '*', tag }));
  for (const q of src.queries || []) jobs.push(searched({ q }));
  if (dir) jobs.push(searched({ q: '*', domain: 'cultureblocs.com' }, p => linksToDirectory(p.record, dir, short)));

  const results = await pool(jobs, 6, (job) => job());
  const ok = results.filter(r => Array.isArray(r));
  if (!ok.length && jobs.length) throw new Error('every source for this feed is unavailable');

  const seen = new Map();
  for (const item of ok.flat()) {
    if (!seen.has(item.uri)) seen.set(item.uri, { uri: item.uri, author: item.author || item.uri.split('/')[2], t: timeOf(item.uri, item.at) });
  }
  return [...seen.values()];
}

/* ---------- hiding, ordering, paging ---------- */
/* hidden.json: { dids: [...], posts: [...] } — shared with the event pages. */
export function hide(items, hidden) {
  const dids = new Set(hidden?.dids || []);
  const posts = new Set(hidden?.posts || []);
  return items.filter(i => !dids.has(i.author) && !posts.has(i.uri));
}

const order = (a, b) => b.t - a.t || (a.uri < b.uri ? 1 : a.uri > b.uri ? -1 : 0);
const cursorOf = (i) => `${i.t}::${i.uri}`;
function after(cursor) {
  const m = /^(\d+(?:\.\d+)?)::(at:\/\/.+)$/.exec(String(cursor || ''));
  if (!m) return null;
  const pivot = { t: Number(m[1]), uri: m[2] };
  return (i) => order(pivot, i) < 0;     // strictly later in the order
}

export function skeleton(items, { limit = DEFAULT_LIMIT, cursor } = {}) {
  const n = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const sorted = [...items].sort(order);
  const rest = cursor ? sorted.filter(after(cursor) || (() => false)) : sorted;
  const page = rest.slice(0, n);
  const out = { feed: page.map(i => ({ post: i.uri })) };
  if (rest.length > n) out.cursor = cursorOf(page[page.length - 1]);
  return out;
}

/* describeFeedGenerator's answer. */
export const describe = (config) => ({
  did: config.service,
  feeds: config.feeds.map(f => ({ uri: feedUri(config, f) })),
});

/* The DID document Bluesky resolves for did:web:<host>. */
export const didDocument = (config) => ({
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: config.service,
  service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: config.endpoint }],
});
