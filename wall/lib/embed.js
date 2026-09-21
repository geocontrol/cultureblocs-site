/* The pieces the wall shares with the embed, copied rather than imported:
 * text -> block markup (paragraphs, bullets, tracklists), and a published
 * image -> what a renderer needs.
 *
 * Copied verbatim from the canonical <cultureblocs-strands> embed in
 * cultureblocs-string/web/cultureblocs-strands.js. The wall deliberately
 * does not import the embed (design §2: its own modules), but a narrative
 * must read the same in both places, so this is a copy pinned by tests
 * rather than a reimplementation. If the canonical formatter changes,
 * change this with it.
 */

export const esc = s => (s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const BULLET = /^\s*[*-]\s+/;
const TIMED = /^\d{2}:\d{2}\s/;

/* Plain text -> block markup, for a bead's `note` and a strand's `narrative`.
 *
 * Both are plain lexicon strings: there is no markup to parse and no facet for
 * structure, so a blank line is a paragraph break and a `* ` or `- ` line is a
 * bullet. The text itself is never rewritten — refs anchor into it by UTF-8
 * byte range — so this only ever chooses the elements the text is poured into.
 *
 * A block of mostly `HH:MM ` lines stays a tracklist (scrobbler notes rely on
 * it). A block with no bullets is emitted whole, so its single newlines are
 * still the renderer's to show via `white-space: pre-line`. */
export function blocksHtml(text){
  if(!text) return '';
  return text.split('\n\n').map(bk=>{
    const lines = bk.split('\n').filter(Boolean);
    if(!lines.length) return '';
    const timed = lines.filter(l=>TIMED.test(l)).length;
    if(lines.length>1 && timed >= lines.length*0.7){
      return `<ul class="tracks">${lines.map(l=>{
        const m=l.match(/^(\d{2}:\d{2})\s+(.*)$/);
        return `<li>${m?`<span class="tt">${esc(m[1])}</span>${esc(m[2])}`:esc(l)}</li>`;
      }).join('')}</ul>`;
    }
    if(!lines.some(l=>BULLET.test(l))) return `<p>${esc(bk)}</p>`;
    // Consecutive lines of a kind travel together: a lead-in line stays a
    // paragraph, the bullets under it become one list, prose after it another.
    const runs = [];
    for(const line of lines){
      const bullet = BULLET.test(line);
      const last = runs[runs.length-1];
      if(last && last.bullet === bullet) last.lines.push(line);
      else runs.push({bullet, lines:[line]});
    }
    return runs.map(run=>run.bullet
      ? `<ul class="bullets">${run.lines.map(l=>`<li>${esc(l.replace(BULLET,''))}</li>`).join('')}</ul>`
      : `<p>${esc(run.lines.join('\n'))}</p>`).join('');
  }).join('');
}

/* A strand's narrative, as blocks. The container is a `div`, not a `p`: the
 * blocks are themselves `p` and `ul` elements, which a `p` cannot contain. */
export const narrativeHtml = strand =>
  (strand?.narrative ? `<div class="narrative">${blocksHtml(strand.narrative)}</div>` : '');

/* A bead's published images. `images` is the current field; `photos` was the
 * name before the imageRef change and is still read, because this element
 * takes an `actor` attribute and renders any repository on the network. */
export function beadImages(item){
  const v = item || {};
  if (Array.isArray(v.images) && v.images.length) return v.images;
  if (Array.isArray(v.photos)) return v.photos;
  return [];
}

/* One images[] entry -> what the renderer needs. `entry.image ?? entry`
 * reads both an imageRef and a legacy bare blob. */
export function imageModel(entry){
  if (!entry || typeof entry !== 'object') return null;
  const blob = entry.image || entry;
  const cid = blob?.ref?.$link || blob?.cid || null;
  if (!cid) return null;
  const ar = entry.aspectRatio;
  const w = Number.isInteger(ar?.width) && ar.width > 0 ? ar.width : null;
  const h = Number.isInteger(ar?.height) && ar.height > 0 ? ar.height : null;
  return {
    cid,
    alt: typeof entry.alt === 'string' ? entry.alt : '',
    width: w && h ? w : null,
    height: w && h ? h : null,
  };
}
