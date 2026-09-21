/* The wall's only impure module: read the location, fetch, render, and say
 * plainly when something is wrong.
 *
 * Unlike the embeds, this surface never fails silently. The wall IS the
 * destination, so a blank page reads as a broken site (the rule catalogue/
 * states in its own boot module).
 */
import { blobBase, fetchAllStrands, fetchBeads, fetchStrand, resolveActor } from './lib/atproto.js';
import { renderStrand, renderWall } from './lib/render.js';
import { parse, wallHref } from './lib/route.js';

const statusEl = document.getElementById('status');
const wallEl = document.getElementById('wall');

const say = (html) => { statusEl.innerHTML = html; };
const clearStatus = () => { statusEl.innerHTML = ''; };
const show = (html) => { wallEl.innerHTML = html; };

function terminal(heading, body) {
  show('');
  say(`<h1>${heading}</h1><p>${body}</p>`);
}

function needsAnActor() {
  terminal('The wall',
    'A wall is one person\'s published cultureblocs, newest first. '
    + `Try <a href="${wallHref('cultureblocs.com')}">cultureblocs.com</a>.`);
}

/* A 4xx from the resolver means the handle really is wrong; anything else is
 * a fault on the way there and must not be reported as a typo. */
function failed(actor, err) {
  if (err?.status >= 400 && err.status < 500) {
    terminal('No such handle', `Nothing resolves for <code>${actor}</code>. Check the spelling.`);
  } else {
    terminal('Could not load the wall',
      `${actor}'s records could not be reached just now. Please try again.`);
  }
}

async function main() {
  const { actor, rkey, page } = parse(location.pathname, location.search);
  if (!actor) return needsAnActor();

  say('Loading…');
  let did;
  let pds;
  try {
    ({ did, pds } = await resolveActor(actor));
  } catch (err) {
    return failed(actor, err);
  }

  try {
    if (rkey) {
      const strand = await fetchStrand(pds, did, rkey);
      if (!strand) {
        return terminal('That strand isn't there',
          `It may have been unpublished. <a href="${wallHref(actor)}">See the wall</a>.`);
      }
      const beads = await fetchBeads(pds, strand.value);
      document.title = `${strand.value?.title || 'A strand'} — ${actor}`;
      clearStatus();
      return show(renderStrand({ strand, beads, actor, blobBase: blobBase(pds, did) }));
    }
    const records = await fetchAllStrands(pds, did);
    document.title = `${actor} — the wall`;
    clearStatus();
    return show(renderWall({ actor, records, page }));
  } catch (err) {
    return terminal('Could not load the wall', err?.message || 'Please try again.');
  }
}

main();
