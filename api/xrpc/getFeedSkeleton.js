/* GET /xrpc/app.bsky.feed.getFeedSkeleton?feed=<at-uri>&limit=&cursor=
 * (rewritten here in vercel.json). Bluesky calls this when someone opens
 * one of our feeds; we answer with post URIs only — Bluesky does the rest.
 *
 * Config, the directory listing and the hide list are the site's own
 * static files, fetched from this deployment so there's one source of
 * truth. The merged candidate list is memoised per feed for a minute, and
 * responses are CDN-cacheable for the same, to be gentle on the public
 * services behind it.
 */
import { describe, findFeed, gather, hide, skeleton } from '../../feeds/lib/feed.js';

export const config = { runtime: 'edge' };

const TTL = 60_000;
const memo = new Map();   // feed rkey -> { at, items }

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra },
});
const xrpcError = (status, error, message) => json({ error, message }, status);

async function siteJson(origin, path, fallback) {
  try {
    const r = await fetch(`${origin}${path}`, { headers: { accept: 'application/json' } });
    return r.ok ? await r.json() : fallback;
  } catch {
    return fallback;
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  const cfg = await siteJson(origin, '/feeds/feeds.json', null);
  if (!cfg) return xrpcError(500, 'InternalServerError', 'feed configuration unavailable');

  const feed = findFeed(cfg, url.searchParams.get('feed'));
  if (!feed) return xrpcError(400, 'UnknownFeed', `not a feed served here; see ${JSON.stringify(describe(cfg).feeds)}`);

  let entry = memo.get(feed.rkey);
  if (!entry || Date.now() - entry.at > TTL) {
    const dir = feed.sources?.directory;
    const [listing, hidden] = await Promise.all([
      dir ? siteJson(origin, `/events/${dir}/events.json`, null) : null,
      siteJson(origin, '/events/hidden.json', {}),
    ]);
    try {
      entry = { at: Date.now(), items: hide(await gather(feed, { listing }), hidden) };
      memo.set(feed.rkey, entry);
    } catch (e) {
      if (!entry) return xrpcError(502, 'UpstreamFailure', e.message);
      // serve the last good list rather than nothing
    }
  }

  return json(skeleton(entry.items, {
    limit: url.searchParams.get('limit'),
    cursor: url.searchParams.get('cursor'),
  }), 200, { 'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300' });
}
