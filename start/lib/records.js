/* Pure pieces of the Start journey: reading an invite, suggesting handles,
 * and turning form values into records. No DOM, no network — tested with
 * node --test 'start/test/*.test.mjs'.
 *
 * Records follow the lexicons in /lexicons (com.cultureblocs.*) and the
 * shared community.lexicon.* types for events and locations, so anything
 * else on the network that reads a calendar event or an address reads ours.
 */

export const NSID = {
  profile: 'com.cultureblocs.creative.profile',
  work: 'com.cultureblocs.creative.work',
  place: 'com.cultureblocs.place.profile',
  // Deprecated since 6 Nov 2026: read so an old venue fills the form, never written.
  venue: 'com.cultureblocs.venue.profile',
  event: 'community.lexicon.calendar.event',
  bead: 'com.cultureblocs.bead',
};

export const PATHS = ['person', 'venue', 'event', 'note'];

/* ---------- invites ---------- */

/* An invite is a short JSON object in the link's ?i= parameter,
 * base64url-encoded: { n: name, p: suggested path, m: message, f: from }.
 * It personalises the journey; it is not a secret and grants nothing. */
const b64urlEncode = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlDecode = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

const clip = (v, n) => String(v || '').trim().slice(0, n);

export function encodeInvite({ name, path, message, from } = {}) {
  const o = {};
  if (clip(name, 80)) o.n = clip(name, 80);
  if (PATHS.includes(path)) o.p = path;
  if (clip(message, 500)) o.m = clip(message, 500);
  if (clip(from, 80)) o.f = clip(from, 80);
  return b64urlEncode(JSON.stringify(o));
}

export function decodeInvite(param) {
  if (!param) return null;
  try {
    const o = JSON.parse(b64urlDecode(String(param)));
    if (!o || typeof o !== 'object') return null;
    return {
      name: clip(o.n, 80),
      path: PATHS.includes(o.p) ? o.p : '',
      message: clip(o.m, 500),
      from: clip(o.f, 80),
    };
  } catch {
    return null;
  }
}

/* ---------- handles ---------- */

/* A handle segment: lowercase letters, digits and hyphens, no leading or
 * trailing hyphen, at most 63 characters. Accents are folded first so
 * "Zoë Ångström" becomes "zoe-angstrom". */
export function slug(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '');
}

/* A bare domain from whatever was typed: "https://www.ivyhouse.london/about"
 * → "ivyhouse.london". Empty if it doesn't look like a domain. */
export function domainOf(text) {
  let s = String(text || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s) ? s : '';
}

export const NETWORKS = [
  { id: 'bluesky', name: 'Bluesky', suffix: 'bsky.social', signup: 'https://bsky.app',
    about: 'The largest network. Run by Bluesky Social PBC.' },
  { id: 'blacksky', name: 'Blacksky', suffix: 'blacksky.app', signup: 'https://blacksky.community',
    about: 'Community-run, built around Black users and creators. Check their page for current sign-up requirements.' },
  { id: 'eurosky', name: 'Eurosky', suffix: 'eurosky.social', signup: 'https://eurosky.social',
    about: 'Hosted in Europe, under European law.' },
];

/* Handle suggestions for someone who doesn't have an account yet.
 * kind: 'person' | 'venue' | 'org'. An organisation with a website is
 * pointed at its domain first — the handle is then its own name, not a
 * subdomain of somebody else's. */
export function suggestHandles({ name, domain, kind = 'person' } = {}) {
  const base = slug(name);
  const dom = domainOf(domain);
  const out = [];
  if (dom) {
    out.push({ handle: dom, network: null,
      why: kind === 'person'
        ? 'Your own domain. You sign up with a network handle first, then switch to this.'
        : 'Your website domain. People can check it is really you, and it stays yours if you change network.' });
  }
  if (base) {
    for (const n of NETWORKS) out.push({ handle: `${base}.${n.suffix}`, network: n.id, why: `On ${n.name}.` });
  }
  return out;
}

/* ---------- records ---------- */

const str = (v, n) => {
  const s = String(v ?? '').trim();
  return n ? s.slice(0, n) : s;
};
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/))
  .map(x => String(x).trim()).filter(Boolean);

/* Drop empty strings, empty arrays, empty objects, null and undefined,
 * recursively, so records carry only what was filled in. */
export function clean(v) {
  if (Array.isArray(v)) {
    const a = v.map(clean).filter(x => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === 'object' && !(v instanceof Blob)) {
    if (v.$type === 'blob' || v.ref) return v; // blob refs pass through untouched
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (c !== undefined) o[k] = c;
    }
    return Object.keys(o).length ? o : undefined;
  }
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'number' && !Number.isFinite(v)) return undefined;
  return v;
}

export function linksFrom(text) {
  return list(text).map(u => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
    .filter(u => { try { return Boolean(new URL(u)); } catch { return false; } })
    .slice(0, 8)
    .map(uri => ({ uri }));
}

const num = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/* Coordinates: lat/lng numbers in range, or nothing. */
export function coords(lat, lng) {
  const a = num(lat), b = num(lng);
  if (a === undefined || b === undefined) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(b * 1e6) / 1e6 };
}

/* com.cultureblocs.creative.profile at rkey self. `based` is where the
 * person is based; a town is enough, and we publish it at city precision
 * with its coordinates rounded to match. */
export function profileRecord(f, { createdAt, now }) {
  const based = coords(f.basedLat, f.basedLng);
  return clean({
    $type: NSID.profile,
    name: str(f.name, 300),
    bio: str(f.bio, 3000),
    disciplines: list(f.disciplines).slice(0, 8),
    based: str(f.based) ? {
      name: str(f.based, 300),
      ...(based ? { geo: { lat: Math.round(based.lat * 10) / 10,
        lng: Math.round(based.lng * 10) / 10, precision: 'city' } } : {}),
    } : undefined,
    links: linksFrom(f.links),
    createdAt: createdAt || now,
  });
}

/* com.cultureblocs.creative.work, one per piece. */
export function workRecord(f, { now, image } = {}) {
  return clean({
    $type: NSID.work,
    title: str(f.title, 500),
    completionDate: str(f.completionDate, 64),
    description: str(f.description, 3000),
    referenceUrl: linksFrom(f.referenceUrl)[0]?.uri,
    tags: list(f.tags).slice(0, 8),
    images: image ? [image] : undefined,
    createdAt: now,
  });
}

/* The address in the shared community.lexicon.location.address shape.
 * country is required there: an ISO 3166 code, GB by default. */
export function addressObject(f, name) {
  const a = clean({
    $type: 'community.lexicon.location.address',
    name: str(name),
    street: str(f.street),
    locality: str(f.locality),
    region: str(f.region),
    postalCode: str(f.postalCode),
    country: str(f.country || 'GB').toUpperCase().slice(0, 2),
  });
  return (a.street || a.locality || a.postalCode) ? a : null;
}

/* community.lexicon.location.geo carries coordinates as strings. */
export function geoObject(c, name) {
  if (!c) return null;
  return clean({ $type: 'community.lexicon.location.geo',
    latitude: String(c.lat), longitude: String(c.lng), name: str(name) });
}

export const oneLineAddress = (f) =>
  [f.street, f.locality, f.region, f.postalCode].map(x => str(x)).filter(Boolean).join(', ');

/* The venue page publishes one of two records, by what the form says it is.
 *
 *   A venue or gallery (a space the public can visit or book)
 *     → com.cultureblocs.place.profile at rkey self, with its full address
 *       in the shared community.lexicon.location.address shape. With no
 *       address, the map position is published instead, as a geo location.
 *   An organisation without a public space
 *     → its own CreativeID (com.cultureblocs.creative.profile at self),
 *       with the town as the area it is based in. Never an address.
 *
 * place.profile replaced venue.profile on 6 Nov 2026. An old venue record
 * is only read, to fill the form; publishing writes the new record. */
export const placeKind = (v = {}) => {
  const types = Array.isArray(v.spaceTypes) ? v.spaceTypes : [];
  const tags = Array.isArray(v.tags) ? v.tags : [];
  if (types.includes('gallery') || tags.includes('gallery')) return 'gallery';
  if (tags.includes('organisation')) return 'org';
  return 'venue';
};

/* What fills the form: the place if there is one, else an old venue. */
export const placeSource = (existing = {}) => existing.place?.value || existing.venue?.value || {};

/* Coordinates already published for a place or an old venue, for the form. */
export function placeCoords(v = {}) {
  if (v.place?.geo) return { lat: v.place.geo.lat, lng: v.place.geo.lng };
  if (v.location?.$type === 'community.lexicon.location.geo') return { lat: v.location.latitude, lng: v.location.longitude };
  return {};
}

export function placeRecord(f, { previous, createdAt, now }) {
  const prev = previous && previous.$type === NSID.place ? previous : {};
  const name = str(f.name, 300);
  const main = f.kind === 'gallery' ? 'gallery' : 'venue';
  // keep kinds added elsewhere (studio, shop…), with this form's kind first
  const others = (Array.isArray(prev.spaceTypes) ? prev.spaceTypes : []).filter(t => t !== 'venue' && t !== 'gallery');
  const location = addressObject(f, name) || geoObject(coords(f.lat, f.lng), name) || undefined;
  const cap = num(f.capacity);
  return clean({
    ...prev,
    $type: NSID.place,
    name,
    spaceTypes: [main, ...others].slice(0, 8),
    description: str(f.description, 2000),
    location,
    capacity: cap > 0 ? Math.round(cap) : undefined,
    accessibility: str(f.accessibility, 1000),
    links: linksFrom(f.links),
    tags: list(f.tags).slice(0, 8),
    createdAt: prev.createdAt || createdAt || now,
  });
}

/* An organisation without a public space: its CreativeID, laid over any
 * profile the account already holds so fields from other tools survive. */
export function orgProfileRecord(f, { previous, now }) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const label = [str(f.locality), str(f.region)].filter(Boolean).join(', ').slice(0, 200);
  const country = str(f.country || 'GB').toUpperCase().slice(0, 2);
  const same = (prev.basedIn || []).find(a => a && a.label === label);
  return clean({
    ...prev,
    $type: NSID.profile,
    name: str(f.name, 300),
    bio: str(f.description, 2000),
    basedIn: label ? [same || { label, country }] : prev.basedIn,
    links: linksFrom(f.links).length ? linksFrom(f.links) : prev.links,
    createdAt: prev.createdAt || now,
  });
}

/* Publishing an organisation's CreativeID into an account that already
 * holds someone else's would replace theirs. Same name: it is an update. */
export function orgWouldReplace(existingProfile, name) {
  const had = existingProfile?.value?.name;
  return Boolean(had && str(had).toLowerCase() !== str(name).toLowerCase());
}

/* The page's record for whatever kind the form is set to. */
export function venuePageRecord(f, existing = {}, now) {
  return f.kind === 'org'
    ? orgProfileRecord(f, { previous: existing.profile?.value, now })
    : placeRecord(f, { previous: existing.place?.value, createdAt: existing.place?.value?.createdAt, now });
}

/* A datetime-local value ("2026-11-14T19:30") read in the person's own
 * time zone, written as an ISO string with its offset. */
export function localToIso(value, offsetMinutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!m) return '';
  const off = -offsetMinutes; // Date#getTimezoneOffset is minutes *behind* UTC
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${hh}:${mm}`;
}

const MODES = { inperson: 'inperson', virtual: 'virtual', hybrid: 'hybrid' };

/* community.lexicon.calendar.event — the shared event type, so calendar
 * apps on the network pick it up. Locations: the address, the coordinates,
 * and for online events the link. */
export function eventRecord(f, { now, startsAt, endsAt }) {
  const mode = MODES[f.mode] || 'inperson';
  const name = str(f.venueName || f.name);
  const locations = [];
  if (mode !== 'virtual') {
    const a = addressObject(f, str(f.venueName));
    if (a) locations.push(a);
    const g = geoObject(coords(f.lat, f.lng), name);
    if (g) locations.push(g);
  }
  const links = linksFrom(f.links);
  if (mode !== 'inperson' && links[0]) {
    locations.push({ $type: 'community.lexicon.calendar.event#uri', uri: links[0].uri, name: 'Join online' });
  }
  return clean({
    $type: NSID.event,
    name: str(f.name, 300),
    description: str(f.description, 3000),
    startsAt,
    endsAt,
    mode: `community.lexicon.calendar.event#${mode}`,
    status: 'community.lexicon.calendar.event#scheduled',
    locations,
    uris: links,
    createdAt: now,
  });
}

export const BEAD_KINDS = [
  { kind: 'watch', label: 'Watched', example: 'Saw the new Spielberg at the Rio. Better on a big screen.' },
  { kind: 'visit', label: 'Visited', example: 'Went to the Hockney show at Tate. Room four was the best.' },
  { kind: 'performance', label: 'Saw live', example: 'Caught the late set at Cafe Oto.' },
  { kind: 'listen', label: 'Listened', example: 'First full listen of the new record on the train.' },
  { kind: 'read', label: 'Read', example: 'Finished Orbital on holiday.' },
  { kind: 'note', label: 'Something else', example: 'A thought about something I saw.' },
];

/* com.cultureblocs.bead — the smallest record: one cultural moment. */
export function beadRecord(f, { now }) {
  const kind = BEAD_KINDS.some(k => k.kind === f.kind) ? f.kind : 'note';
  return clean({
    $type: NSID.bead,
    kind,
    note: str(f.note, 3000),
    tags: list(f.tags).slice(0, 8),
    links: linksFrom(f.link).slice(0, 1),
    createdAt: f.when ? new Date(f.when + 'T12:00:00').toISOString() : now,
  });
}

/* at://did/collection/rkey → its parts. */
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(uri || ''));
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}
