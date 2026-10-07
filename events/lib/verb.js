/* What a directory calls being there. Pure.
 *
 * Art weeks say "I went"; a film festival says "I saw". A listing can set
 * meta.verb to change the words everywhere the site speaks for the visitor —
 * the button, the composer, the default post, the counts:
 *
 *   "verb": { "button": "I saw", "past": "saw", "ing": "seen" }
 *
 * Anything missing falls back to the "went" wording, so existing listings
 * need no change.
 */
export const WENT = { button: 'I went', past: 'went', to: true };

const clean = (s, max) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);

export function verbOf(listingOrMeta) {
  const v = (listingOrMeta?.meta || listingOrMeta)?.verb;
  if (!v || typeof v !== 'object') return WENT;
  const button = clean(v.button, 24);
  const past = clean(v.past, 24);
  if (!button || !past) return WENT;
  return { button, past, to: v.to === true };
}

/* "I went to Frieze" / "I saw Fjord" */
export const said = (verb, name) =>
  `${verb.button}${verb.to ? ' to' : ''} ${String(name || 'this').trim()}`;
/* "You went to Frieze." / "You saw Fjord." */
export const youSaid = (verb, name) =>
  `You ${verb.past}${verb.to ? ' to' : ''} ${String(name || 'this').trim()}`;
/* "3 went" / "3 saw" */
export const countWord = (verb, n) => (n > 0 ? `${n} ${verb.past}` : '');
