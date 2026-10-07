/* The "I went" composer's decisions, as pure functions: which days can be
 * chosen, what the bead looks like, what the Bluesky post says. No fetch,
 * no DOM — everything here is tested in node.
 */
import { TZ, addDays, dayLabel, shape, zonedParts } from '../../events/lib/schedule.js';

export const BEAD_NSID = 'com.cultureblocs.bead';
export const POST_NSID = 'app.bsky.feed.post';
export const EVENT_NSID = 'community.lexicon.calendar.event';
export const APP_ID = 'cultureblocs-went';
export const SITE = 'https://www.cultureblocs.com';
export const NOTE_MAX = 3000;      // bead.note maxGraphemes
export const POST_MAX = 300;       // Bluesky post text limit (graphemes)
export const HASHTAG = '#CultureBlocs';
export const CHIP_DAYS = 7;        // longer than this and the day is a date picker

/* The kind a bead gets by default, from the directory's category. */
const KIND_FOR = {
  fair: 'visit', exhibition: 'visit', commission: 'visit', 'gallery-day': 'visit',
  party: 'visit', talk: 'performance', talks: 'performance', performance: 'performance',
  screening: 'screening',
};
export const kindFor = (category) => KIND_FOR[category] || 'visit';

export const KINDS = [
  ['visit', 'a visit'], ['performance', 'a performance or talk'], ['screening', 'a screening'],
  ['dwell', 'time spent with one thing'], ['bloc', 'just a marked moment'],
];

/* ---------- text ---------- */
const seg = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
export const graphemes = (s) => (seg ? [...seg.segment(String(s))].length : [...String(s)].length);
export function truncate(s, max) {
  const parts = seg ? [...seg.segment(String(s))].map(x => x.segment) : [...String(s)];
  return parts.length <= max ? String(s) : `${parts.slice(0, max - 1).join('').trimEnd()}…`;
}

/* ---------- identifiers ---------- */
/* at://authority/collection/rkey → parts, or null if it isn't one. */
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/?#]+)\/([a-zA-Z0-9.-]+)\/([A-Za-z0-9._~:-]{1,512})$/.exec(String(uri || '').trim());
  return m ? { authority: m[1], collection: m[2], rkey: m[3] } : null;
}

export const validDirectory = (d) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(d || ''));

/* ---------- days ---------- */
/* Which days a person can say they went. Never the future; never before
 * the event began. Short events get chips, long runs a date picker. */
export function dayOptions(record, todayDate, tz = TZ) {
  const sh = shape(record, tz);
  if (!sh) return { status: 'unknown' };
  if (todayDate < sh.start.date) return { status: 'future', opens: sh.start.date };
  const last = sh.endDate < todayDate ? sh.endDate : todayDate;
  const span = { min: sh.start.date, max: last, ended: sh.endDate < todayDate };
  if (sh.days > CHIP_DAYS) return { status: 'ok', mode: 'picker', ...span, initial: last };
  const days = [];
  for (let d = sh.start.date; d <= last; d = addDays(d, 1)) days.push({ date: d, label: dayLabel(d) });
  return { status: 'ok', mode: 'chips', ...span, days, initial: last };
}

export const todayIn = (tz = TZ, now = new Date()) => zonedParts(now.toISOString(), tz).date;
export const todayInLondon = (now = new Date()) => todayIn(TZ, now);

/* A day, not a moment: noon UTC is the same calendar day in London and
 * Paris all year. */
export const dayInstant = (date) => `${date}T12:00:00.000Z`;

/* ---------- the bead ---------- */
export function buildBead({ event, day, note, kind, tags = [], eventUrl, now = new Date() }) {
  const ref = { $type: 'com.cultureblocs.defs#strongRef', uri: event.uri };
  if (event.cid) ref.cid = event.cid;
  const bead = {
    $type: BEAD_NSID,
    kind: kind || 'visit',
    createdAt: dayInstant(day),
    subject: ref,
  };
  const text = String(note || '').trim();
  if (text) bead.note = truncate(text, NOTE_MAX);
  const t = tags.filter(Boolean).slice(0, 8).map(x => truncate(x, 64));
  if (t.length) bead.tags = t;
  if (eventUrl) {
    bead.links = [{ uri: eventUrl, title: truncate(event.value?.name || 'Event', 300) }];
  }
  bead.provenance = { app: APP_ID, mintedAt: now.toISOString(), timeAnchored: false };
  return bead;
}

/* Is there already a bead in this person's repository for this event on
 * this day? Compares by collection + rkey and accepts either the
 * publisher's handle or DID as authority, since both are valid URIs. */
export function findExisting(beads, eventUri, day, authorities = []) {
  const target = parseAtUri(eventUri);
  if (!target) return null;
  const okAuth = new Set([target.authority, ...authorities].filter(Boolean));
  for (const r of beads || []) {
    const s = parseAtUri(r?.value?.subject?.uri);
    if (!s || s.collection !== target.collection || s.rkey !== target.rkey) continue;
    if (!okAuth.has(s.authority)) continue;
    if (String(r.value.createdAt || '').slice(0, 10) !== day) continue;
    return { uri: r.uri, rkey: String(r.uri).split('/').pop(), value: r.value };
  }
  return null;
}

/* ---------- the post ---------- */
/* What the post says until the person edits it. The hashtag is always
 * kept whole at the end; the note gives way to fit. */
export function defaultPostText({ name, note }) {
  const tail = ` ${HASHTAG}`;
  const head = `I went to ${String(name || 'this').trim()}`;
  const body = String(note || '').trim().replace(/\s+/g, ' ');
  const room = POST_MAX - graphemes(tail);
  let text = body ? `${head} — ${body}` : head;
  if (graphemes(text) > room) text = truncate(text, room);
  return `${text}${tail}`;
}

/* Hashtag facets with UTF-8 byte offsets, as Bluesky requires. */
export function hashtagFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  const re = /(^|\s)(#[^\d\s][^\s#]*)/gu;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[2].replace(/[.,;:!?)\]]+$/u, '');
    const start = m.index + m[1].length;
    const byteStart = enc.encode(text.slice(0, start)).length;
    const byteEnd = byteStart + enc.encode(tag).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tag.slice(1) }],
    });
  }
  return facets;
}

export function buildPost({ text, eventUrl, title, description, thumb, tags = [], now = new Date() }) {
  const clean = truncate(String(text || '').trim(), POST_MAX);
  const post = { $type: POST_NSID, text: clean, createdAt: now.toISOString(), langs: ['en'] };
  const facets = hashtagFacets(clean);
  if (facets.length) post.facets = facets;
  const t = ['cultureblocs', ...tags].filter(Boolean)
    .map(x => truncate(String(x).replace(/^#/, ''), 64));
  post.tags = [...new Set(t)].slice(0, 8);
  if (eventUrl) {
    const external = { uri: eventUrl, title: truncate(title || '', 300), description: truncate(description || '', 1000) };
    if (thumb) external.thumb = thumb;
    post.embed = { $type: 'app.bsky.embed.external', external };
  }
  return post;
}

/* Scopes asked for at sign-in: only what this publish needs. */
export const SCOPES = {
  bead: `repo:${BEAD_NSID}?action=create&action=update`,
  post: `repo:${POST_NSID}?action=create`,
  blob: 'blob:image/*',
  generic: 'transition:generic',
};
export function scopesFor({ post }) {
  return ['atproto', SCOPES.bead, ...(post ? [SCOPES.post, SCOPES.blob] : [])].join(' ');
}
/* Does a granted scope string cover what this publish needs? */
export function covers(granted, { post }) {
  const have = new Set(String(granted || '').split(/\s+/));
  if (have.has(SCOPES.generic)) return true;
  const need = [SCOPES.bead, ...(post ? [SCOPES.post] : [])];
  return need.every(s => have.has(s));
}
