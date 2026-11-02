/* TableSearch — scrape.
   Reads Google's organic results out of a document (the live page, or a results
   page fetched with fetch() and parsed with DOMParser) and returns one plain
   record per result. Reads only; never writes to the page.

   This is the ONLY file that knows what Google's markup looks like. When Google
   changes its page and results stop appearing, this is the file to fix.

   It deliberately avoids Google's obfuscated class names (MjjYud, yuRUbf, …),
   which change often. It anchors on structure that has stayed put:
     · each organic result has exactly one  <a> that contains an <h3>  (the title link)
     · the snippet text sits in an element carrying a  data-sncf  attribute
     · a dated result starts its snippet with "Oct 7, 2025 — " or "3 days ago — " */
var TSScrape = (() => {
  'use strict';

  const TITLE_LINK = '#rso a:has(h3), #search a:has(h3)';

  // "Oct 7, 2025 — …"  "7 Oct 2025 — …"  "3 days ago — …"
  const DATE_PREFIX = new RegExp(
    '^(' +
      '[A-Z][a-z]{2,8}\\.? \\d{1,2}, \\d{4}' +
      '|\\d{1,2} [A-Z][a-z]{2,8}\\.? \\d{4}' +
      '|\\d+ (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?) ago' +
    ')\\s*[—–-]\\s*'
  );

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const isGoogleHost = (h) => /(^|\.)google\.[a-z.]+$/i.test(h);

  // innerText respects what is visible, but only works on a rendered (live) node.
  function textOf(node) {
    const live = node.ownerDocument === document && typeof node.innerText === 'string';
    return clean(live ? node.innerText : node.textContent);
  }

  // Absolute URL of a result link; unwraps Google's /url?q=… redirect if present.
  function resolve(href, base) {
    try {
      const u = new URL(href, base);
      if (isGoogleHost(u.hostname) && u.pathname === '/url') {
        const target = u.searchParams.get('q') || u.searchParams.get('url');
        if (target) return new URL(target);
      }
      return u;
    } catch {
      return null;
    }
  }

  // Walk up from the title link to the box that holds just this one result.
  function boxOf(link) {
    let box = link;
    while (
      box.parentElement &&
      box.parentElement.id !== 'rso' &&
      box.parentElement.querySelectorAll('a:has(h3)').length === 1
    ) box = box.parentElement;
    return box;
  }

  function snippetOf(box) {
    const nodes = [...box.querySelectorAll('[data-sncf]')];
    // keep only outermost matches so nested wrappers don't repeat the text
    const outer = nodes.filter((n) => !nodes.some((m) => m !== n && m.contains(n)));
    return clean(outer.map(textOf).filter(Boolean).join(' '));
  }

  // doc: a Document · base: the URL the document came from (to resolve relative links)
  function extract(doc, base) {
    const out = [];
    for (const link of doc.querySelectorAll(TITLE_LINK)) {
      const url = resolve(link.getAttribute('href') || '', base);
      if (!url || !/^https?:$/.test(url.protocol) || isGoogleHost(url.hostname)) continue;

      const h3 = link.querySelector('h3');
      const title = clean(h3 && h3.textContent);
      if (!title) continue;

      const box = boxOf(link);
      let snippet = snippetOf(box);
      let date = '';
      const m = DATE_PREFIX.exec(snippet);
      if (m) {
        date = m[1];
        snippet = snippet.slice(m[0].length);
      }

      out.push({
        url: url.href,
        title,
        snippet,
        date,
        domain: url.hostname.replace(/^www\./, ''),
        el: doc === document ? box : null // lets "Show" scroll the live page to it
      });
    }
    return out;
  }

  return { extract };
})();
