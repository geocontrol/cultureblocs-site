/* GET /xrpc/app.bsky.feed.describeFeedGenerator (rewritten here in
 * vercel.json): which feeds this service answers for. */
import { describe } from '../../feeds/lib/feed.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const origin = new URL(req.url).origin;
  let cfg = null;
  try {
    const r = await fetch(`${origin}/feeds/feeds.json`);
    if (r.ok) cfg = await r.json();
  } catch { /* below */ }
  const body = cfg ? describe(cfg) : { error: 'InternalServerError', message: 'feed configuration unavailable' };
  return new Response(JSON.stringify(body), {
    status: cfg ? 200 : 500,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
}
