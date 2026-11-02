// Local stand-in for a Google results page, shaped like the live markup verified in Chrome:
// #rso > div > ... > a(href) > h3  +  [data-sncf] snippet, optional "Oct 7, 2025 — " date prefix.
const http = require('http');
const SITES = ['zeta','alpha','mango','delta','jackbellis','omega','bravo','kilo','tango'];
function result(page, i) {
  const n = page * 9 + i;
  const site = SITES[(i + page * 3) % SITES.length];
  const host = (i % 4 === 0 ? 'www.' : '') + site + (page ? page : '') + '.com';
  const dated = i % 3 === 0;
  const dates = ['Oct 7, 2025', '3 days ago', 'Mar 14, 2023'];
  const snip = (dated ? dates[(i + page) % 3] + ' — ' : '') + `Snippet text for result ${n} about the topic.`;
  const href = i === 5 ? `https://www.google.com/url?q=${encodeURIComponent('https://wrapped' + page + '.org/path/' + n)}&sa=U` : `https://${host}/p/${n}?x=1`;
  return `<div class="MjjYud"><div class="A6K0A"><div class="tF2Cxc"><div class="yuRUbf"><div class="b8lM7"><span class="V9tjod"><a href="${href}"><h3>Result ${n} ${site} ${i === 4 ? 'jack bellis profile' : 'title'}</h3><cite>${host}</cite></a></span></div></div>
  <div data-sncf="1"><div style="-webkit-line-clamp:2">${snip}</div></div><div><a href="https://${host}/sitelink">Sitelink</a></div></div></div></div>`;
}
function page(start, empty) {
  const p = start / 10;
  const count = (empty || p >= 4) ? 0 : 9;
  const items = Array.from({ length: count }, (_, i) => result(p, i)).join('\n');
  return `<!doctype html><html><head><title>q - Google Search</title></head><body>
  <input name="q" value="jack bellis">
  <div id="search"><div id="rso">${items}
  <div class="paa"><a href="https://www.google.com/search?q=related">People also ask</a></div></div></div></body></html>`;
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost:8765');
  if (u.pathname !== '/search') { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page(parseInt(u.searchParams.get('start') || '0', 10), u.searchParams.has('empty')));
}).listen(8765, () => console.log('fixture on 8765'));
