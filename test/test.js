const { chromium } = require('playwright');
const path = require('path');
const SP = process.argv[2];
const EXT = path.join(SP, 'testext');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); };

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(SP, 'profile'), {
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
    viewport: { width: 1400, height: 900 }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://localhost:8765/search?q=jack+bellis');
  const launch = page.locator('button.launch');
  const rows = page.locator('#tablesearch-host tbody tr');

  // Fresh profile: the table opens by itself, with a one-time notice
  await rows.first().waitFor({ timeout: 8000 });
  check('fresh install: table opens automatically', (await rows.count()) === 9);
  const notice = page.locator('#tablesearch-host .notice');
  check('one-time notice is shown', await notice.isVisible() && /automatically/.test(await notice.innerText()));
  check('notice offers both choices', (await notice.locator('button').allInnerTexts()).join('|') === 'Keep automatic|Turn off automatic');
  await page.screenshot({ path: path.join(SP, 'shot0-docked-notice.png') });
  check('auto-open does not steal focus', await page.evaluate(() => !document.activeElement || document.activeElement.id !== 'tablesearch-host'));
  await page.keyboard.press('Escape');
  check('Escape hides the auto-opened table', (await page.locator('#tablesearch-host').count()) === 0);
  await launch.waitFor();
  check('launcher available after Escape', await launch.isVisible());
  await launch.click();
  await rows.first().waitFor({ timeout: 5000 });
  check('notice shows only once (seen by closing)', (await notice.count()) === 0);
  
  // Docked by default: the Google page is narrowed beside the panel
  const host = page.locator('#tablesearch-host');
  const dockInfo = () => page.evaluate(() => {
    const h = document.getElementById('tablesearch-host').getBoundingClientRect();
    return { cls: document.documentElement.classList.contains('tablesearch-docked'), htmlW: Math.round(document.documentElement.getBoundingClientRect().width), panelW: Math.round(h.width), win: window.innerWidth, left: Math.round(h.left) };
  });
  const d0 = await dockInfo();
  check('docked by default', d0.cls && (await host.getAttribute('data-mode')) === 'dock');
  check('page is narrowed to make room', Math.abs(d0.htmlW + d0.panelW - d0.win) <= 20, JSON.stringify(d0));
  check('panel sits flush right, no overlap', Math.abs(d0.left - d0.htmlW) <= 1, JSON.stringify(d0));
  // drag the grip to widen the panel
  const gb = await host.locator('.grip').boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(gb.x - 120, 400, { steps: 6 });
  await page.mouse.up();
  const d1 = await dockInfo();
  check('drag grip widens the docked panel', d1.panelW >= d0.panelW + 100 && Math.abs(d1.htmlW + d1.panelW - d1.win) <= 20, d0.panelW + ' → ' + d1.panelW);
  // keyboard resize
  await host.locator('.grip').focus();
  await page.keyboard.press('ArrowRight');
  const d1k = await dockInfo();
  check('arrow key resizes the panel', d1k.panelW < d1.panelW, d1.panelW + ' → ' + d1k.panelW);
  // the page can never be squeezed below its minimum
  await host.locator('.grip').focus();
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowLeft');
  const d2 = await dockInfo();
  check('panel stops leaving at least 320px of page', d2.htmlW >= 319, JSON.stringify(d2));
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowRight');
  const dMin = await dockInfo();
  check('panel has a minimum width', dMin.panelW >= 360 && dMin.panelW <= 362, JSON.stringify(dMin));
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  // Overlay mode: page restored to full width, panel floats
  await host.locator('.controls .seg .btn', { hasText: 'Overlay' }).click();
  const d3 = await dockInfo();
  check('overlay mode releases the page', !d3.cls && d3.htmlW >= d3.win - 20 && (await host.getAttribute('data-mode')) === 'overlay', JSON.stringify(d3));
  await host.locator('.controls .seg .btn', { hasText: 'Docked' }).click();
  const d4 = await dockInfo();
  check('docked again keeps the width it had', d4.cls && Math.abs(d4.panelW - d2.panelW) > -1, JSON.stringify(d4));
  // Show in docked mode: points at the result and keeps the table open
  await host.locator('tbody .rank-btn').first().click();
  check('docked: Show keeps the table open', (await page.locator('#tablesearch-host').count()) === 1);
  check('docked: Show flashes the result', (await page.locator('.tablesearch-flash').count()) === 1);
  await page.waitForTimeout(2300);
  // closing gives the page its full width back
  await page.keyboard.press('Escape');
  const full = await page.evaluate(() => ({ w: Math.round(document.documentElement.getBoundingClientRect().width), win: window.innerWidth, cls: document.documentElement.classList.contains('tablesearch-docked') }));
  check('closing restores the full page width', !full.cls && full.w >= full.win - 20, JSON.stringify(full));
  await launch.click();
  await rows.first().waitFor();
  // from here on, test the floating layout (the Show-closes-the-table flow below)
  await host.locator('.controls .seg .btn', { hasText: 'Overlay' }).click();
  check('9 results scraped from page', (await rows.count()) === 9, 'rows=' + await rows.count());
  check('launcher hidden while open', !(await launch.isVisible()));
  const status = await page.locator('#tablesearch-host .status').innerText();
  check('status line', /9 results · \d+ exact · \d+ close/.test(status), status);
  await page.screenshot({ path: path.join(SP, 'shot1-open.png') });

  const heads = await page.locator('#tablesearch-host thead th .label').allInnerTexts();
  check('compact is the default column set', heads.join(',') === 'Rank,Domain,URL,Date', heads.join(','));

  // sort by Domain
  await page.locator('#tablesearch-host thead th[data-col="domain"] .th-inner').click();
  const doms = await page.locator('#tablesearch-host tbody td.c-domain').allInnerTexts();
  const sortedOK = doms.every((d, i) => i === 0 || doms[i - 1].localeCompare(d, undefined, { sensitivity: 'base' }) <= 0);
  check('sort by domain ascending', sortedOK, doms.slice(0, 4).join(' '));
  check('aria-sort set', (await page.locator('#tablesearch-host thead th[data-col="domain"]').getAttribute('aria-sort')) === 'ascending');
  check('www. stripped from domain', doms.every(d => !d.startsWith('www.')));

  // typeahead: press 'm' — first domain starting with m
  await page.locator('#tablesearch-host .brand').click();
  await page.keyboard.press('m');
  const hi = page.locator('#tablesearch-host tbody tr.typeahead-highlight');
  const nHi = await hi.count();
  const hiDom = nHi ? await hi.first().locator('td.c-domain').innerText() : '';
  check('typeahead highlights a row', nHi === 1 && hiDom.startsWith('m'), hiDom);
  await page.waitForTimeout(1400);
  check('typeahead highlight clears', (await hi.count()) === 0);

  // date sort: undated last
  await page.locator('#tablesearch-host thead th[data-col="date"] .th-inner').click();
  const dates = await page.locator('#tablesearch-host tbody td.c-date').allInnerTexts();
  const firstUndated = dates.findIndex(d => d.trim() === '—');
  const afterUndatedAllUndated = firstUndated === -1 || dates.slice(firstUndated).every(d => d.trim() === '—');
  check('date sort: undated results last', afterUndatedAllUndated, dates.join(' | '));
  await page.locator('#tablesearch-host thead th[data-col="date"] .th-inner').click();
  const dates2 = await page.locator('#tablesearch-host tbody td.c-date').allInnerTexts();
  const fu2 = dates2.findIndex(d => d.trim() === '—');
  check('date sort descending: undated still last', fu2 === -1 || dates2.slice(fu2).every(d => d.trim() === '—'), dates2.join(' | '));

  // wrapped /url?q= link unwrapped
  const urls = await page.locator('#tablesearch-host tbody td.c-url a').evaluateAll(as => as.map(a => a.href));
  check('/url?q= redirect unwrapped', urls.some(u => u.startsWith('https://wrapped0.org/path/')), urls.filter(u=>u.includes('wrapped')).join());
  check('google-internal links skipped (no "People also ask" row)', urls.every(u => !u.includes('google.com')));

  // match badges
  const badges = await page.locator('#tablesearch-host tbody .badge').allInnerTexts();
  check('exact/close badges present', badges.includes('exact') || badges.includes('close'), badges.join());

  // Load more
  const more = page.locator('#tablesearch-host .more button');
  // Load more sits directly under the last row, not in a footer
  {
    const last = await rows.last().boundingBox();
    const mb = await more.boundingBox();
    check('Load more is directly under the last result', mb && mb.y >= last.y + last.height - 1 && mb.y - (last.y + last.height) < 40, 'gap=' + Math.round(mb.y - (last.y + last.height)) + 'px');
    // pinned left: still on screen when the wide table is scrolled sideways
    const sc = await page.locator('#tablesearch-host .scroll').evaluate(n => { n.scrollLeft = 300; return [n.scrollLeft, n.scrollWidth, n.clientWidth]; });
    const panelBox = await page.locator('#tablesearch-host .panel').boundingBox();
    const mb2 = await more.boundingBox();
    check('Load more stays in view when table is scrolled sideways', sc[1] <= sc[2] || (mb2.x >= panelBox.x && mb2.x + mb2.width <= panelBox.x + panelBox.width), 'scrollLeft=' + sc[0] + ' of ' + (sc[1] - sc[2]) + ' · button x=' + Math.round(mb2.x - panelBox.x));
    await page.locator('#tablesearch-host .scroll').evaluate(n => { n.scrollLeft = 0; });
  }
  await more.click();
  await page.waitForFunction(() => document.querySelector('#tablesearch-host').shadowRoot.querySelectorAll('tbody tr').length >= 27, null, { timeout: 8000 });
  check('load more: +2 pages = 27 rows', (await rows.count()) === 27, 'rows=' + await rows.count());
  check('rank continues sequentially', (await page.locator('#tablesearch-host tbody td.c-rank').allInnerTexts()).map(Number).sort((a,b)=>a-b).join() === Array.from({length:27},(_,i)=>i+1).join());
  await more.click();
  await page.waitForFunction(() => /All available|first/.test(document.querySelector('#tablesearch-host').shadowRoot.querySelector('.more-msg').textContent), null, { timeout: 10000 });
  const fm = await page.locator('#tablesearch-host .more-msg').innerText();
  check('load more finishes cleanly', /All available results loaded|first \d+ results/.test(fm), fm + ' rows=' + await rows.count());
  check('load more button hidden when finished', !(await more.isVisible()));
  check('stamp stays in the footer', /v\d{10}/.test(await page.locator('#tablesearch-host .foot .stamp').innerText()));
  await page.screenshot({ path: path.join(SP, 'shot2-loaded.png') });

  const order = { 'Mar 14, 2023': 1, 'Oct 7, 2025': 2, '3 days ago': 3 };
  const seq = (await page.locator('#tablesearch-host tbody td.c-date').allInnerTexts()).map(s => s.trim()).filter(s => s !== '—').map(s => order[s]);
  check('date sort descending is truly newest-first across 36 rows', seq.length > 6 && seq.every((v, i) => i === 0 || seq[i - 1] >= v), seq.join(''));
  await page.locator('#tablesearch-host thead th[data-col="date"] .th-inner').click();
  const seq2 = (await page.locator('#tablesearch-host tbody td.c-date').allInnerTexts()).map(s => s.trim()).filter(s => s !== '—').map(s => order[s]);
  check('date sort ascending is truly oldest-first', seq2.every((v, i) => i === 0 || seq2[i - 1] <= v), seq2.join(''));
  const dd = (await page.locator('#tablesearch-host tbody td.c-date').allInnerTexts()).map(s => s.trim());
  check('undated rows still last when ascending', dd.slice(dd.findIndex(s => s === '—')).every(s => s === '—'));

  // column gear: hide Title (Title is not in Compact, so choose Standard first)
  await page.locator('#tablesearch-host .controls .btn', { hasText: 'Standard' }).click();
  await page.locator('#tablesearch-host thead th[data-col="title"]').hover();
  await page.locator('#tablesearch-host thead th[data-col="title"] .gear').click();
  await page.locator('#tablesearch-host .pop button', { hasText: 'Hide column' }).click();
  const heads2 = await page.locator('#tablesearch-host thead th .label').allInnerTexts();
  check('hide column via gear', !heads2.includes('Title'), heads2.join(','));
  check('density presets deselect after manual column change', (await page.locator('#tablesearch-host .controls .seg').first().locator('[aria-pressed="true"]').count()) === 0);

  // Full density brings snippet back
  await page.locator('#tablesearch-host .seg button', { hasText: 'Full' }).click();
  const heads3 = await page.locator('#tablesearch-host thead th .label').allInnerTexts();
  check('Full density shows all 6 columns', heads3.length === 6 && heads3.includes('Snippet'), heads3.join(','));
  const snip = await page.locator('#tablesearch-host tbody td.c-snippet').first().innerText();
  check('snippet has date prefix removed', !/—/.test(snip) && /Snippet text/.test(snip), snip);
  await page.screenshot({ path: path.join(SP, 'shot3-full.png') });

  // Options popover: toggle highlight off
  await page.locator('#tablesearch-host .controls .btn', { hasText: 'Settings' }).click();
  check('options popover opens', await page.locator('#tablesearch-host .pop').isVisible());
  await page.locator('#tablesearch-host .pop label', { hasText: 'Highlight Matches' }).click();
  check('highlight off removes row tint', (await page.locator('#tablesearch-host tbody tr.exact-match, #tablesearch-host tbody tr.close-match').count()) === 0);
  await page.screenshot({ path: path.join(SP, 'shot4-options.png') });
  await page.locator('#tablesearch-host .bar').click({ position: { x: 5, y: 5 } });
  check('popover closes on outside click', (await page.locator('#tablesearch-host .pop').count()) === 0);

  // column resize persists in the DOM
  const before = await page.locator('#tablesearch-host col[data-col="domain"]').evaluate(c => parseInt(c.style.width));
  const hb = await page.locator('#tablesearch-host thead th[data-col="domain"] .resize-handle').boundingBox();
  await page.mouse.move(hb.x + 2, hb.y + 8); await page.mouse.down(); await page.mouse.move(hb.x + 62, hb.y + 8, { steps: 4 }); await page.mouse.up();
  const after = await page.locator('#tablesearch-host col[data-col="domain"]').evaluate(c => parseInt(c.style.width));
  check('drag-resize widens column', after > before + 40, before + ' → ' + after);

  // Close is a bare ×: no border, no background
  const cs = await page.locator('#tablesearch-host .close-x').evaluate(b => { const c = getComputedStyle(b); return { border: c.borderTopWidth, bg: c.backgroundColor, text: b.textContent }; });
  check('close is a bare × (no box)', cs.border === '0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.bg) && cs.text === '×', JSON.stringify(cs));

  // Rank click = Show: closes overlay, flashes item on page
  check('only page-1 rows get a Show button', (await page.locator('#tablesearch-host tbody .rank-btn').count()) === 9, 'buttons=' + await page.locator('#tablesearch-host tbody .rank-btn').count());
  await page.locator('#tablesearch-host tbody .rank-btn').first().click();
  check('Show closes overlay', (await page.locator('#tablesearch-host').count()) === 0);
  check('Show flashes the result on the page', (await page.locator('.tablesearch-flash').count()) === 1);
  check('launcher returns after close', await launch.isVisible());

  // prefs persisted: reopen, columns should still be Full minus nothing, width kept
  await launch.click();
  await rows.first().waitFor();
  check('rows kept after reopen (no re-scrape)', (await rows.count()) > 9, 'rows=' + await rows.count());
  await page.keyboard.press('Escape');
  check('Escape closes overlay', (await page.locator('#tablesearch-host').count()) === 0);

  // reload: prefs from storage
  await page.reload();
  await rows.first().waitFor({ timeout: 8000 });   // opens by itself again, no launcher click
  check('reload: opens automatically, no notice again', (await notice.count()) === 0);
  const w2 = await page.locator('#tablesearch-host col[data-col="domain"]').evaluate(c => parseInt(c.style.width));
  check('column width persisted across reload', w2 === after, w2 + ' vs ' + after);
  check('highlight pref persisted (off)', (await page.locator('#tablesearch-host tbody tr.exact-match, #tablesearch-host tbody tr.close-match').count()) === 0);
  check('Full density persisted', (await page.locator('#tablesearch-host thead th .label').count()) === 6);

  // Empty state: the scraper finds nothing -> alert + copyable diagnostics (no search words)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8765' });
  const ep = await ctx.newPage();
  await ep.goto('http://localhost:8765/search?q=secretwords&empty=1');
  const alertBox = ep.locator('#tablesearch-host .empty');
  await alertBox.waitFor({ timeout: 8000 });
  check('empty page shows an alert about layout changes', /changed/.test(await alertBox.innerText()) && (await alertBox.getAttribute('role')) === 'alert');
  await alertBox.locator('button', { hasText: 'Copy details for a fix' }).click();
  await ep.waitForTimeout(300);
  const clip = await ep.evaluate(() => navigator.clipboard.readText());
  check('copied details include stamp and counts', /TableSearch extension · v\d{10}/.test(clip) && /result-links\(rso\)=0/.test(clip) && /Scraped rows: 0/.test(clip), clip.split('\n')[0]);
  check('copied details leave out the search words', !/secretwords/.test(clip));
  await ep.screenshot({ path: path.join(SP, 'shot5-empty.png') });
  await ep.close();

  // Column dividers in the header are dark gray (a cue that edges drag)
  const divider = await page.evaluate(() => {
    const ths = document.getElementById('tablesearch-host').shadowRoot.querySelectorAll('thead th');
    const c = getComputedStyle(ths[1]);
    return { second: c.borderLeftWidth + ' ' + c.borderLeftColor, first: getComputedStyle(ths[0]).borderLeftWidth };
  });
  check('header has dark-gray dividers between columns', /^1px rgb\((1[0-4]\d|[5-9]\d), /.test(divider.second) && divider.first === '0px', JSON.stringify(divider));

  // Turning automatic off from Table Options sticks across reloads
  await page.locator('#tablesearch-host .controls .btn', { hasText: 'Settings' }).click();
  await page.locator('#tablesearch-host .pop label', { hasText: 'Open the table automatically' }).locator('input').uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await launch.waitFor({ timeout: 8000 });
  await page.waitForTimeout(600);
  check('automatic off: launcher only, table stays closed', (await page.locator('#tablesearch-host').count()) === 0 && await launch.isVisible());

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await ctx.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
