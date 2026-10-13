/* My beads — the decisions, as pure functions. No fetch, no DOM.
 *
 * The rule that matters most: a bead may have been written by Loom, a
 * totem, a scrobbler or "I went", and may carry fields this app neither
 * shows nor understands (refs, geo, media, prev, provenance, fields from a
 * future lexicon). An edit therefore starts from the stored record and
 * changes only what the form changed. Nothing else is rebuilt, reordered
 * or dropped.
 */
import { graphemes, truncate } from '../../went/lib/compose.js';

export const BEAD_NSID = 'com.cultureblocs.bead';
export const STRAND_NSID = 'com.cultureblocs.strand';
export const EVENT_NSID = 'community.lexicon.calendar.event';
export const APP_ID = 'cultureblocs-beads';

export const NOTE_MAX = 3000;
export const TAGS_MAX = 8;
export const TAG_MAX = 64;
export const LINKS_MAX = 8;
export const LINK_TITLE_MAX = 300;
export const IMAGES_MAX = 10;
export const ALT_MAX = 2000;
export const IMAGE_BYTES_MAX = 2_000_000;
export const PLACE_MAX = 300;

/* The lexicon's kinds, in the order a person would reach for them. */
export const KINDS = [
  ['bloc', 'A marked moment'],
  ['visit', 'A visit'],
  ['dwell', 'Time with one thing'],
  ['screening', 'A screening'],
  ['performance', 'A performance or talk'],
  ['watch', 'Watching'],
  ['read', 'Reading'],
  ['listen', 'Listening'],
  ['encounter', 'An encounter'],
  ['note', 'A note'],
];
export const kindLabel = (k) => (KINDS.find(x => x[0] === k) || [k, k || 'Bead'])[1];

export const FORMATS = ['IMAX 70mm', '70mm', '35mm', 'digital', 'streaming', 'broadcast',
  'hardback', 'paperback', 'ebook', 'audiobook', 'vinyl', 'live'];

/* ---------- identifiers ---------- */
export const rkeyOf = (uri) => String(uri || '').split('/').pop();
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/?#]+)\/([a-zA-Z0-9.-]+)\/([A-Za-z0-9._~:-]{1,512})$/.exec(String(uri || '').trim());
  return m ? { authority: m[1], collection: m[2], rkey: m[3] } : null;
}
export const isHttp = (u) => {
  try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
};

/* ---------- time ---------- */
const pad = (n) => String(n).padStart(2, '0');

/* "I went" and other day-only minters store noon UTC: the same calendar
 * day in London and Paris all year. Such a bead has a day, not a time. */
export const isDayOnly = (iso) => /T12:00:00(\.000)?Z$/.test(String(iso || ''));
export const dayInstant = (date) => `${date}T12:00:00.000Z`;

/* An ISO string → { date, time } in the given zone (time '' when day-only). */
export function localParts(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  if (isDayOnly(iso)) return { date: String(iso).slice(0, 10), time: '' };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

/* The zone's offset from UTC, in minutes, at an instant. */
function offsetMins(instant, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour === '24' ? 0 : parts.hour), +parts.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/* The offset of a zone at a wall-clock time there, e.g. '+01:00'. The
 * offset is read at the real instant, not at the wall time taken as UTC,
 * so a time within hours of a clock change gets the right side of it. In
 * the hour a change skips or repeats, the earlier offset wins. */
export function offsetAt(date, time, tz) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const first = offsetMins(new Date(wall), tz);
  let mins = offsetMins(new Date(wall - first * 60000), tz);
  if (mins !== first) {
    const again = offsetMins(new Date(wall - mins * 60000), tz);
    if (again !== mins) mins = Math.max(first, mins);
  }
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/* A date (and optional time) the person typed → createdAt. */
export function createdAtFrom(date, time, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  if (!time) return dayInstant(date);
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return `${date}T${time}:00${offsetAt(date, time, tz)}`;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const longDay = (date) => dayFmt.format(new Date(`${date}T12:00:00Z`));

/* ---------- reading what a bead says ---------- */
export function subjectOf(value) {
  const s = value?.subject;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.uri === 'string') return { kind: 'record', uri: s.uri, cid: s.cid || null };
  if (s.name || s.did) return { kind: 'place', name: s.name || '', did: s.did || null };
  return { kind: 'other' };
}

export const refLabels = (value) => (Array.isArray(value?.refs) ? value.refs : [])
  .map(r => r?.descriptor?.label).filter(Boolean);

/* One bead from listRecords → what the list needs. */
export function toItem(rec, tz) {
  const v = rec?.value || {};
  const { date, time } = localParts(v.createdAt, tz);
  return {
    uri: rec.uri, cid: rec.cid, rkey: rkeyOf(rec.uri), value: v,
    date, time, kind: v.kind || 'bloc',
    note: typeof v.note === 'string' ? v.note : '',
    tags: Array.isArray(v.tags) ? v.tags.filter(t => typeof t === 'string') : [],
    subject: subjectOf(v),
    app: v.provenance?.app || '',
    images: Array.isArray(v.images) ? v.images.length : 0,
    proposal: v.state === 'proposal',
  };
}

/* Newest first; within a day, latest time first; day-only beads after
 * timed ones that day. Ties broken by record key (TIDs sort by time). */
export function sortItems(items) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date)
    || (b.time || '').localeCompare(a.time || '')
    || b.rkey.localeCompare(a.rkey));
}

export function groupByDay(items) {
  const out = [];
  for (const it of sortItems(items)) {
    const last = out[out.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else out.push({ date: it.date, items: [it] });
  }
  return out;
}

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Search across what a person would remember: the note, tags, kind, the
 * place, the event's name (resolved separately and passed in), ref labels. */
export function matches(item, query, { kind = '', subjectName = '' } = {}) {
  if (kind && item.kind !== kind) return false;
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([item.note, item.tags.join(' '), item.kind, kindLabel(item.kind),
    item.subject?.name, subjectName, ...refLabels(item.value), item.date].join(' '));
  return words.every(w => hay.includes(w));
}

export function kindCounts(items) {
  const m = new Map();
  for (const it of items) m.set(it.kind, (m.get(it.kind) || 0) + 1);
  return m;
}

/* ---------- the form ---------- */
const lf = (s) => String(s ?? '').replace(/\r\n?/g, '\n');

/* Tags as typed: a stored tag still present in the text is kept exactly
 * as stored (even with a comma or # in it); anything else typed is new. */
export function tagsFrom(text, stored = []) {
  let rest = String(text || '');
  const kept = [];
  for (const t of (Array.isArray(stored) ? stored : [])) {
    if (typeof t !== 'string' || !t) continue;
    const at = findSegment(rest, t);
    if (at < 0) continue;
    kept.push(t);
    rest = `${rest.slice(0, at)},${rest.slice(at + t.length)}`;
  }
  const fresh = parseTags(rest).filter(t => !kept.includes(t));
  return [...kept, ...fresh];
}
function findSegment(text, t) {
  let i = text.indexOf(t);
  while (i >= 0) {
    const before = text.slice(0, i).replace(/[ \t]+$/, '');
    const after = text.slice(i + t.length).replace(/^[ \t]+/, '');
    if ((!before || /[,\n]$/.test(before)) && (!after || /^[,\n]/.test(after))) return i;
    i = text.indexOf(t, i + 1);
  }
  return -1;
}

export function parseTags(text) {
  const out = [];
  for (const raw of String(text || '').split(/[,\n]/)) {
    const t = raw.trim().replace(/^#/, '');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/* What the form shows for a bead (or a blank one). */
export function formFrom(value, tz) {
  const v = value || {};
  const { date, time } = v.createdAt ? localParts(v.createdAt, tz) : { date: '', time: '' };
  return {
    kind: v.kind || 'bloc',
    date, time,
    note: typeof v.note === 'string' ? lf(v.note) : '',
    tags: (Array.isArray(v.tags) ? v.tags.filter(t => typeof t === 'string') : []).join(', '),
    links: (Array.isArray(v.links) ? v.links : []).map(l => ({ uri: String(l?.uri || '').trim(), title: String(l?.title || '').trim() })),
    format: v.presentation?.format || '',
    subject: v.subject ? 'keep' : 'none',
    place: v.subject && !v.subject.uri ? (v.subject.name || '') : '',
    eventUri: '',
    eventCid: '',
    removeGeo: false,
    images: (Array.isArray(v.images) ? v.images : []).map((im, i) => ({ keep: i, alt: String(im?.alt || '').trim() })),
  };
}

/* Problems that would make the PDS refuse the record, or make it wrong. */
export function validate(form, { tz, original = null } = {}) {
  const errs = [];
  if (!createdAtFrom(form.date, form.time, tz || 'UTC')) errs.push(['date', 'Choose the day it happened.']);
  if (graphemes(form.note || '') > NOTE_MAX) errs.push(['note', `The note is over ${NOTE_MAX} characters.`]);
  const tags = tagsFrom(form.tags, original?.tags);
  if (tags.length > TAGS_MAX) errs.push(['tags', `At most ${TAGS_MAX} tags.`]);
  if (tags.some(t => graphemes(t) > TAG_MAX)) errs.push(['tags', `Each tag can be at most ${TAG_MAX} characters.`]);
  const links = (form.links || []).filter(l => l.uri.trim() || l.title.trim());
  if (links.length > LINKS_MAX) errs.push(['links', `At most ${LINKS_MAX} links.`]);
  // A link already on the bead may be any URI (another app wrote it);
  // one added or changed here must be a web address.
  const had = new Set((Array.isArray(original?.links) ? original.links : []).map(l => String(l?.uri || '').trim()));
  if (links.some(l => !had.has(l.uri.trim()) && !isHttp(l.uri.trim()))) errs.push(['links', 'Each link needs a full web address, starting https://']);
  if (form.subject === 'place' && !form.place.trim()) errs.push(['subject', 'Name the place, or choose “Nothing”.']);
  if (form.subject === 'place' && graphemes(form.place) > PLACE_MAX) errs.push(['subject', 'That place name is too long.']);
  if (form.subject === 'event' && !parseAtUri(form.eventUri)) errs.push(['subject', 'Pick an event, or choose “Nothing”.']);
  const imgs = (form.images || []).length + (form.newImages || []).length;
  if (imgs > IMAGES_MAX) errs.push(['images', `At most ${IMAGES_MAX} pictures.`]);
  if ([...(form.images || []), ...(form.newImages || [])].some(i => graphemes(i.alt || '') > ALT_MAX)) {
    errs.push(['images', 'A description is too long.']);
  }
  return errs;
}

/* ---------- refs anchored in the note ---------- */
const utf8 = new TextEncoder();
const unutf8 = new TextDecoder();
const byteLen = (s) => utf8.encode(s).length;

/* When the note changes, a ref's byte range may no longer point at the
 * words it was anchored to. Find the same words in the new note: if they
 * appear exactly once, move the anchor there; otherwise drop the anchor
 * and keep the ref (it still says what the bead is about). Returns the new
 * refs and how many anchors were moved or dropped. */
export function reanchor(refs, oldNote, newNote) {
  if (!Array.isArray(refs)) return { refs, moved: 0, dropped: 0 };
  if (oldNote === newNote) return { refs, moved: 0, dropped: 0 };
  const oldBytes = utf8.encode(oldNote || '');
  let moved = 0, dropped = 0;
  const out = refs.map(r => {
    const ix = r?.index;
    if (!ix || typeof ix.byteStart !== 'number' || typeof ix.byteEnd !== 'number') return r;
    const text = unutf8.decode(oldBytes.slice(ix.byteStart, ix.byteEnd));
    const first = text ? newNote.indexOf(text) : -1;
    const again = first >= 0 ? newNote.indexOf(text, first + 1) : -1;
    const { index, ...rest } = r;
    if (!text || first < 0 || again >= 0) { dropped += 1; return rest; }
    const byteStart = byteLen(newNote.slice(0, first));
    const next = { byteStart, byteEnd: byteStart + byteLen(text) };
    if (next.byteStart !== ix.byteStart) moved += 1;
    return { ...rest, index: { ...ix, ...next } };
  });
  return { refs: out, moved, dropped };
}

/* ---------- writing ---------- */
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* The edited record: the stored value with only the form's changes laid
 * over it. `uploaded` are imageRefs for pictures added in this edit.
 * Returns { record, changed, notes } — notes are things the person should
 * hear about (an anchor that moved, a location removed). */
export function applyEdit(original, form, { tz, uploaded = [], before = formFrom(original, tz) } = {}) {
  const rec = structuredClone(original || {});
  const notes = [];

  if (form.kind !== before.kind) rec.kind = form.kind;

  if (form.date !== before.date || form.time !== before.time) {
    rec.createdAt = createdAtFrom(form.date, form.time, tz);
  }

  if (lf(form.note) !== lf(before.note)) {
    const note = form.note.trim() ? truncate(lf(form.note), NOTE_MAX) : '';
    if (note) rec.note = note; else delete rec.note;
    const r = reanchor(rec.refs, typeof original?.note === 'string' ? original.note : '', note);
    if (r.dropped || r.moved) {
      rec.refs = r.refs;
      if (r.dropped) notes.push(`${r.dropped} highlighted ${r.dropped === 1 ? 'phrase' : 'phrases'} in the note no longer match, so ${r.dropped === 1 ? 'its link to the text was' : 'their links to the text were'} removed. What the bead is about is kept.`);
    }
  }

  const stored = Array.isArray(original?.tags) ? original.tags : [];
  if (form.tags !== before.tags) {
    const tags = tagsFrom(form.tags, stored).slice(0, TAGS_MAX).map(t => truncate(t, TAG_MAX));
    if (sameJson(tags, stored)) { /* only spacing changed */ } else if (tags.length) rec.tags = tags; else delete rec.tags;
  }

  const links = (form.links || []).map(l => ({ uri: l.uri.trim(), title: l.title.trim() }))
    .filter(l => l.uri);
  if (!sameJson(links, before.links.filter(l => l.uri))) {
    const old = new Map((original?.links || []).map(l => [l.uri, l]));
    const out = links.slice(0, LINKS_MAX).map(l => {
      const kept = old.get(l.uri) || {};
      const next = { ...kept, uri: l.uri };
      if (l.title) next.title = truncate(l.title, LINK_TITLE_MAX); else delete next.title;
      return next;
    });
    if (out.length) rec.links = out; else delete rec.links;
  }

  if (form.format !== before.format) {
    const p = { ...(rec.presentation || {}) };
    if (form.format) p.format = form.format; else delete p.format;
    if (Object.keys(p).length) rec.presentation = p; else delete rec.presentation;
  }

  if (form.subject === 'none' && before.subject !== 'none') delete rec.subject;
  if (form.subject === 'place' && (before.subject !== 'keep' || form.place !== before.place || original?.subject?.uri)) {
    const keep = original?.subject && !original.subject.uri ? original.subject : {};
    rec.subject = { ...keep, $type: 'com.cultureblocs.defs#placeRef', name: truncate(form.place.trim(), PLACE_MAX) };
  }
  if (form.subject === 'event') {
    const ref = { $type: 'com.cultureblocs.defs#strongRef', uri: form.eventUri };
    if (form.eventCid) ref.cid = form.eventCid;
    rec.subject = ref;
  }

  if (form.removeGeo && (rec.geo || rec.subject?.geo)) {
    delete rec.geo;
    if (rec.subject?.geo) { rec.subject = { ...rec.subject }; delete rec.subject.geo; }
    notes.push('The location was removed.');
  }

  const oldImages = Array.isArray(original?.images) ? original.images : [];
  const keptImages = (form.images || []).map(i => {
    const im = oldImages[i.keep];
    if (!im) return null;
    if (i.alt.trim() === String(im.alt || '').trim()) return im;
    const next = { ...im };
    if (i.alt.trim()) next.alt = truncate(i.alt.trim(), ALT_MAX); else delete next.alt;
    return next;
  }).filter(Boolean);
  const images = [...keptImages, ...uploaded].slice(0, IMAGES_MAX);
  if (!sameJson(images, oldImages)) {
    if (images.length) rec.images = images; else delete rec.images;
  }

  return { record: rec, changed: !sameJson(rec, original || {}), notes };
}

/* A new bead from the form. */
export function newBead(form, { tz, uploaded = [], now = new Date() } = {}) {
  const base = { $type: BEAD_NSID, kind: form.kind || 'bloc', createdAt: createdAtFrom(form.date, form.time, tz) };
  const blank = formFrom({ kind: base.kind, createdAt: base.createdAt }, tz);
  const { record } = applyEdit(base, { ...form, kind: base.kind, date: blank.date, time: blank.time },
    { tz, uploaded, before: { ...blank, subject: 'none' } });
  record.provenance = { app: APP_ID, mintedAt: now.toISOString() };
  if (form.time) record.provenance.timeAnchored = true;
  return record;
}

/* ---------- strands a bead belongs to ---------- */
export function strandsHolding(strands, beadUri, did) {
  const rk = rkeyOf(beadUri);
  return (strands || []).filter(s => (s?.value?.items || []).some(i => {
    const p = parseAtUri(i?.uri);
    return p && p.collection === BEAD_NSID && p.rkey === rk && (!did || p.authority === did || !p.authority.startsWith('did:'));
  }));
}

/* ---------- export ---------- */
export function exportJson(items, { did, handle, now = new Date() } = {}) {
  return JSON.stringify({
    exported: now.toISOString(), did, handle, collection: BEAD_NSID, count: items.length,
    records: items.map(i => ({ uri: i.uri, cid: i.cid, value: i.value })),
  }, null, 2);
}

/* ---------- images ---------- */
/* Longest side for an upload; JPEG quality steps down until it fits. */
export const IMAGE_EDGE = 2000;
export function fitWithin(w, h, edge = IMAGE_EDGE) {
  const s = Math.min(1, edge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/* Where to fetch a blob for display. */
export const blobUrl = (pds, did, cid) =>
  `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
export const cidOf = (img) => img?.image?.ref?.$link || img?.image?.cid || null;
