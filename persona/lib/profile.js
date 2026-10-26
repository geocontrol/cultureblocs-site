/* The persona form <-> com.cultureblocs.creative.profile record.
 *
 * Pure functions, no DOM, so they're tested with node --test. The form shows
 * only a few fields; anything else already in the record (links after the
 * first, external ids, a place's DID or geo, fields written by CreativeID
 * Studio or a later lexicon) is carried over untouched. createdAt is set once
 * and never changed, as the lexicon says. */

export const NSID = 'com.cultureblocs.creative.profile';
export const RKEY = 'self';
export const NAME_MAX = 300;
export const BIO_MAX = 2000;
export const DISCIPLINES_MAX = 8;
export const DISCIPLINE_MAX = 64;
export const PLACE_MAX = 300;

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
export const graphemes = (s) => (seg ? [...seg.segment(String(s))].length : [...String(s)].length);
const clean = (s) => String(s ?? '').trim();

/* "sculpture, sound design" -> ['sculpture', 'sound design'], no blanks or repeats. */
export function parseDisciplines(text) {
  const out = [];
  for (const part of String(text ?? '').split(/[,\n]/)) {
    const d = clean(part);
    if (d && !out.some((x) => x.toLowerCase() === d.toLowerCase())) out.push(d);
  }
  return out;
}

/* A web address the person typed, made absolute; '' if it isn't one. */
export function normaliseUrl(text) {
  let t = clean(text);
  if (!t) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export function formFrom(record) {
  const r = record || {};
  return {
    name: r.name || '',
    bio: r.bio || '',
    disciplines: (r.disciplines || []).join(', '),
    based: r.based?.name || '',
    website: r.links?.[0]?.uri || '',
  };
}

/* Problems with the form, as { field, message }; empty when it can be published. */
export function validate(form) {
  const errs = [];
  const name = clean(form.name);
  if (!name) errs.push({ field: 'name', message: 'Add the name you work under.' });
  else if (graphemes(name) > NAME_MAX) errs.push({ field: 'name', message: `The name can be at most ${NAME_MAX} characters.` });
  if (graphemes(clean(form.bio)) > BIO_MAX) errs.push({ field: 'bio', message: `About can be at most ${BIO_MAX} characters.` });
  const ds = parseDisciplines(form.disciplines);
  if (ds.length > DISCIPLINES_MAX) errs.push({ field: 'disciplines', message: `Up to ${DISCIPLINES_MAX} disciplines.` });
  else if (ds.some((d) => graphemes(d) > DISCIPLINE_MAX)) errs.push({ field: 'disciplines', message: `Each discipline can be at most ${DISCIPLINE_MAX} characters.` });
  if (graphemes(clean(form.based)) > PLACE_MAX) errs.push({ field: 'based', message: `The place can be at most ${PLACE_MAX} characters.` });
  if (clean(form.website) && !normaliseUrl(form.website)) errs.push({ field: 'website', message: 'That doesn’t look like a web address.' });
  return errs;
}

/* The record to publish: the form laid over whatever was there before. */
export function toRecord(form, existing, now = new Date().toISOString()) {
  const prev = existing && typeof existing === 'object' ? existing : {};
  const rec = { ...prev, $type: NSID, name: clean(form.name), createdAt: prev.createdAt || now };

  const bio = clean(form.bio);
  if (bio) rec.bio = bio; else delete rec.bio;

  const ds = parseDisciplines(form.disciplines);
  if (ds.length) rec.disciplines = ds; else delete rec.disciplines;

  const place = clean(form.based);
  const based = { ...(prev.based || {}) };
  if (place) based.name = place; else delete based.name;
  if (Object.keys(based).length) rec.based = based; else delete rec.based;

  const url = normaliseUrl(form.website);
  const rest = (prev.links || []).slice(1);
  const first = prev.links?.[0];
  const links = url ? [first && first.uri === url ? first : { uri: url }, ...rest] : rest;
  if (links.length) rec.links = links; else delete rec.links;

  return rec;
}

/* True when publishing would change nothing. */
export function unchanged(form, existing) {
  if (!existing) return false;
  return JSON.stringify(toRecord(form, existing, existing.createdAt)) === JSON.stringify({ ...existing, $type: NSID });
}
