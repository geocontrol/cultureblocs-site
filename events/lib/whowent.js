/* HTML for who went. Pure: strings in, strings out, everything escaped —
 * these are other people's words, arriving from their own repositories. */
import { esc } from './render.js';
import { dayLabel } from './schedule.js';

export const countLabel = (n) => (n > 0 ? `${n} went` : '');

const initials = (s) => String(s || '?').replace(/^@/, '').slice(0, 1).toUpperCase();

function clip(text, max) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/* One bead as a line in a list. `event` is { name, href } when the list
 * spans events (the week's timeline); omitted on an event's own page. */
export function beadItem(b, { event = null, noteMax = 280 } = {}) {
  const handle = b.profile?.handle || b.handle || b.did;
  const name = b.profile?.displayName || handle;
  const day = String(b.value?.createdAt || '').slice(0, 10);
  const note = clip(b.value?.note, noteMax);
  const avatar = /^https:\/\//.test(b.profile?.avatar || '')
    ? `<img class="who-av" src="${esc(b.profile.avatar)}" alt="" loading="lazy">`
    : `<span class="who-av who-av-none" aria-hidden="true">${esc(initials(name))}</span>`;
  const profileUrl = `https://bsky.app/profile/${encodeURIComponent(b.did)}`;
  const recordUrl = `https://pdsls.dev/at/${encodeURIComponent(b.did)}/com.cultureblocs.bead/${encodeURIComponent(b.rkey)}`;
  return `<li class="who-bead">
  ${avatar}
  <div class="who-body">
    <p class="who-line"><a class="who-name" href="${esc(profileUrl)}" rel="noopener">${esc(name)}</a>${
      name !== handle ? ` <span class="who-handle">@${esc(handle)}</span>` : ''}
      <span class="who-day">${/^\d{4}-\d{2}-\d{2}$/.test(day) ? esc(dayLabel(day)) : ''}</span></p>
    ${event ? `<p class="who-event">went to <a href="${esc(event.href)}">${esc(event.name)}</a></p>` : ''}
    ${note ? `<p class="who-note">${esc(note)}</p>` : ''}
    <p class="who-rec"><a href="${esc(recordUrl)}" rel="noopener">the bead →</a></p>
  </div>
</li>`;
}

export function beadList(beads, opts) {
  return `<ul class="who-list">${beads.map(b => beadItem(b, opts?.(b) || {})).join('\n')}</ul>`;
}
