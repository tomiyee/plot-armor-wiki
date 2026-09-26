/*
 * PlotArmor chapter-capture bookmarklet (wanderinginn.com / WordPress).
 *
 * Install: create a browser bookmark whose URL is this whole file's code
 * starting at `javascript:` (minify to one line if your browser requires it).
 * Click it on a chapter page; the capture JSON is copied to the clipboard.
 * Then either save it to a file or run:
 *   npx tsx scripts/ingest/export-context.ts --serial wandering-inn --clipboard
 */
javascript:(async()=>{
  const body = document.querySelector('.entry-content');
  const title = document.querySelector('h1.entry-title, .entry-title')?.innerText.trim();
  if (!body) return alert('PlotArmor: chapter body not found');
  const clone = body.cloneNode(true);
  clone.querySelectorAll('script,style,.sharedaddy,.jp-relatedposts,nav,.wp-block-buttons')
       .forEach(n => n.remove());
  /* innerText on a detached node ignores layout, so attach it off-screen. */
  clone.style.cssText = 'position:absolute;left:-99999px;white-space:pre-wrap';
  document.body.appendChild(clone);
  const text = clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
  clone.remove();
  const payload = {
    v: 1,
    source: location.hostname,
    url: location.href,
    title,
    publishedAt: document.querySelector('time[datetime]')?.getAttribute('datetime') ?? null,
    wordCount: text.split(/\s+/).length,
    text,
  };
  await navigator.clipboard.writeText(JSON.stringify(payload));
  alert(`PlotArmor: copied "${title}" (${payload.wordCount} words)`);
})();
