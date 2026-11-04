/* The Offers and Needs boards from the Creative Spaces Symposium, as pure
 * functions: what a board post says, how it is tagged, and the check that
 * warns before anything private goes on a public board. No DOM, no network —
 * tested with node --test 'start/creative-newham/test/*.test.mjs'.
 *
 * A board post is an ordinary Bluesky post (app.bsky.feed.post) in the
 * person's own account, carrying the board's hashtag. The boards are the
 * custom feeds in /feeds/feeds.json that collect those hashtags, so a post
 * shows on the board here, in any Bluesky app that follows the feed, and
 * under the hashtag. Posting from any Bluesky app with the hashtag works too.
 */
import { graphemes, hashtagFacets, truncate } from '../../../went/lib/compose.js';

export const POST_NSID = 'app.bsky.feed.post';
export const POST_MAX = 300;
export const EVENT_TAG = 'creative-spaces-symposium-2026';
export const PUBLISHER = 'did:plc:l3726um33xesakwqhjkkpoet';

export const BOARDS = {
  offer: {
    id: 'offer', label: 'Offers', one: 'Offer', hashtag: '#CreativeNewhamOffer', feed: 'cn-offers',
    ask: 'What can you offer?',
    help: 'Space, time, skills, kit or know-how you could share with other people in Newham.',
    placeholder: 'Our studio is free on Monday evenings for rehearsals, up to 15 people. Step-free access.',
  },
  need: {
    id: 'need', label: 'Needs', one: 'Need', hashtag: '#CreativeNewhamNeed', feed: 'cn-needs',
    ask: 'What do you need?',
    help: 'Something that would help your work or your group: a space, a collaborator, advice, equipment.',
    placeholder: 'Looking for a ground-floor space for a weekly youth dance class, around 40 m², near Stratford.',
  },
};

export const CATEGORIES = [
  ['space', 'Space'], ['skills', 'Skills or time'], ['equipment', 'Equipment'],
  ['funding', 'Funding'], ['collaboration', 'Collaboration'], ['volunteers', 'Volunteers'],
  ['advice', 'Advice or mentoring'], ['other', 'Something else'],
];

export const feedUri = (board) => `at://${PUBLISHER}/app.bsky.feed.generator/${BOARDS[board].feed}`;

/* ---------- the privacy check ---------- */

/* Things that look like contact details or a home address. These are
 * warnings, not refusals: a venue's public booking number is fine to post.
 * The person decides; the page makes sure they decide knowingly. */
const CHECKS = [
  { kind: 'email', re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    say: 'an email address' },
  { kind: 'phone', re: /(?:\+44\s?\(?0?\)?|\b0)(?:[\s-]?\d){9,10}\b/g,
    say: 'a phone number' },
  { kind: 'postcode', re: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,
    say: 'a full postcode' },
  { kind: 'address', re: /\b\d{1,4}[a-z]?,?\s+(?:[A-Z][a-z]+\s){1,3}(?:Road|Rd|Street|St|Lane|Ln|Avenue|Ave|Close|Grove|Gardens|Crescent|Way|Drive|Terrace|Place|Court|Mews|Walk)\b/g,
    say: 'a street address' },
  { kind: 'flat', re: /\b(?:flat|apartment|apt)\s*\d+/gi,
    say: 'a flat number' },
];

export function privateBits(text) {
  const s = String(text || '');
  const found = [];
  for (const c of CHECKS) {
    for (const m of s.matchAll(c.re)) found.push({ kind: c.kind, match: m[0].trim(), say: c.say });
  }
  // a postcode inside an address is one finding, not two
  return found.filter((f, i) => !found.some((g, j) => j !== i && g.match.length > f.match.length
    && g.match.includes(f.match)));
}

/* ---------- the post ---------- */

export function cleanLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(u);
    return /\./.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}

/* The visible text: "Offer · Space: <what they wrote> <link> #CreativeNewhamOffer".
 * Whatever they wrote is shortened, never the label, link or hashtag. */
export function boardText({ board, category, text, link }) {
  const b = BOARDS[board];
  if (!b) throw new Error('Choose a board.');
  const cat = CATEGORIES.find(c => c[0] === category)?.[1];
  const head = `${b.one}${cat && category !== 'other' ? ` · ${cat}` : ''}: `;
  const url = cleanLink(link);
  const tail = `${url ? ` ${url}` : ''} ${b.hashtag}`;
  const body = String(text || '').trim().replace(/\s+/g, ' ');
  const room = POST_MAX - graphemes(head) - graphemes(tail);
  return `${head}${truncate(body, Math.max(room, 1))}${tail}`;
}

export const roomLeft = ({ board, category, link }) => {
  const b = BOARDS[board] || BOARDS.offer;
  const cat = CATEGORIES.find(c => c[0] === category)?.[1];
  const head = `${b.one}${cat && category !== 'other' ? ` · ${cat}` : ''}: `;
  const url = cleanLink(link);
  return POST_MAX - graphemes(head) - graphemes(`${url ? ` ${url}` : ''} ${b.hashtag}`);
};

function linkFacets(text) {
  const enc = new TextEncoder();
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s]+/g)) {
    const uri = m[0].replace(/[.,;:!?)\]]+$/, '');
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    out.push({ index: { byteStart, byteEnd: byteStart + enc.encode(uri).length },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
  }
  return out;
}

export function boardPost({ board, category, text, link, now = new Date() }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Write a line about it.');
  if (graphemes(body.replace(/\s+/g, ' ')) > roomLeft({ board, category, link })) {
    throw new Error('That is longer than a post allows. Shorten it a little.');
  }
  const t = boardText({ board, category, text: body, link });
  const facets = [...linkFacets(t), ...hashtagFacets(t)]
    .sort((a, b) => a.index.byteStart - b.index.byteStart);
  return {
    $type: POST_NSID,
    text: t,
    facets,
    langs: ['en'],
    tags: ['cultureblocs', BOARDS[board].hashtag.slice(1).toLowerCase(), EVENT_TAG,
      ...(category && category !== 'other' ? [`cn-${category}`] : [])],
    createdAt: now.toISOString(),
  };
}

/* What the board view shows for one post from app.bsky.feed.getPosts. */
export function cardOf(post) {
  const r = post?.record || {};
  const text = String(r.text || '');
  const m = /^(Offer|Need)(?: · ([^:]+))?: /.exec(text);
  const body = (m ? text.slice(m[0].length) : text)
    .replace(/\s*#CreativeNewham(?:Offer|Need)\b/gi, '').trim();
  return {
    uri: post.uri,
    rkey: String(post.uri || '').split('/').pop(),
    did: post.author?.did,
    handle: post.author?.handle,
    name: post.author?.displayName || post.author?.handle,
    avatar: post.author?.avatar || '',
    category: m?.[2] || '',
    body,
    at: r.createdAt || post.indexedAt,
    replies: post.replyCount || 0,
  };
}
