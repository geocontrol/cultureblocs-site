/* "My week" decisions as pure functions: the strand record, finding a
 * strand already published for this week, the post text, the scopes. */
import { HASHTAG, POST_MAX, graphemes, truncate } from '../../went/lib/compose.js';

export const STRAND_NSID = 'com.cultureblocs.strand';
export const TITLE_MAX = 300;
export const NARRATIVE_MAX = 10000;

/* One strand per person per directory: it links to the directory page,
 * and that link is how we find it again to update rather than duplicate. */
export function findExistingStrand(strands, weekUrl) {
  for (const r of strands || []) {
    const links = Array.isArray(r?.value?.links) ? r.value.links : [];
    if (links.some(l => l?.uri === weekUrl)) {
      return { uri: r.uri, rkey: String(r.uri).split('/').pop(), value: r.value };
    }
  }
  return null;
}

/* beads: [{ uri, cid, value }] in the person's chosen order (by day). */
export function buildStrand({ beads, title, narrative, weekUrl, dirName, createdAt, now = new Date() }) {
  const ordered = [...beads].sort((a, b) =>
    String(a.value?.createdAt || '').localeCompare(String(b.value?.createdAt || '')));
  const strand = {
    $type: STRAND_NSID,
    createdAt: createdAt || now.toISOString(),
    title: truncate(String(title || '').trim() || 'My week', TITLE_MAX),
    items: ordered.slice(0, 200).map(b => ({
      $type: 'com.cultureblocs.defs#strongRef', uri: b.uri, ...(b.cid ? { cid: b.cid } : {}),
    })),
    links: [{ uri: weekUrl, title: truncate(dirName || 'The programme', 300) }],
  };
  const text = String(narrative || '').trim();
  if (text) strand.narrative = truncate(text, NARRATIVE_MAX);
  return strand;
}

export function defaultWeekPost({ dirName, events, days }) {
  const tail = ` ${HASHTAG}`;
  const body = `My ${dirName || 'week'}: ${events} ${events === 1 ? 'event' : 'events'}`
    + (days > 1 ? ` over ${days} days` : '');
  const room = POST_MAX - graphemes(tail);
  return `${graphemes(body) > room ? truncate(body, room) : body}${tail}`;
}

export const STRAND_SCOPE = `repo:${STRAND_NSID}?action=create&action=update`;
export const strandScopes = ({ post }) => ['atproto', STRAND_SCOPE,
  ...(post ? ['repo:app.bsky.feed.post?action=create', 'blob:image/*'] : [])].join(' ');
export function coversStrand(granted, { post }) {
  const have = new Set(String(granted || '').split(/\s+/));
  if (have.has('transition:generic')) return true;
  return have.has(STRAND_SCOPE) && (!post || have.has('repo:app.bsky.feed.post?action=create'));
}
