/* TableSearch — content script.
   Runs on Google results pages. Reads the results already on the page
   (scrape.js), shows them as a sortable table in an isolated overlay, and can
   fetch further result pages from google.com itself ("Load more").
   Nothing is sent anywhere except to google.com, as your own browser would.

   No inline styles in markup, and no innerHTML: every node is built with the DOM
   API (Google enforces Trusted Types). The only styles set from script are
   column widths, which change as you drag them. */
(() => {
  'use strict';
  if (window.__tableSearchLoaded) return;
  window.__tableSearchLoaded = true;

  // ---------- constants ----------

  const ALL_COLS = ['rank', 'domain', 'url', 'date', 'title', 'snippet'];
  const PRESETS = {
    compact:  ['rank', 'domain', 'url', 'date'],
    standard: ['rank', 'domain', 'url', 'date', 'title'],
    full:     ['rank', 'domain', 'url', 'date', 'title', 'snippet']
  };
  const DENSITIES = ['compact', 'standard', 'full'];
  const DEFAULT_WIDTHS = { rank: 56, domain: 150, url: 280, date: 100, title: 260, snippet: 320 };
  const PAGE_STEP = 10;     // Google's start= advances 10 per page
  const MAX_PAGES = 6;      // first page + 5 fetched ≈ 54 results
  const BATCH_PAGES = 2;    // pages fetched per "Load more" click
  const PREFS_KEY = 'ts_prefs';
  const GEAR_PATH = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

  // ---------- page facts ----------

  const params = new URL(location.href).searchParams;
  const query = (params.get('q') || '').trim();
  // Web results only: not Images (tbm=isch), News, or Google's other verticals (udm=…).
  const isWebTab = !params.get('tbm') && (!params.get('udm') || params.get('udm') === '14');
  const startBase = parseInt(params.get('start') || '0', 10) || 0;

  // ---------- state ----------

  const prefs = {
    density: 'compact',             // '' when the columns were chosen by hand
    visibleCols: PRESETS.compact.slice(),
    dock: true,               // docked beside the page (true) or floating over it (false)
    dockWidth: 0,             // px; 0 = automatic, a share of the window
    overlayWidth: 0,          // px; 0 = automatic
    colWidths: {},
    highlight: true,
    autoOpen: true,           // installing a table-view extension is itself the request for one
    autoOpenChosen: false,    // true once the user has answered the notice or flipped the switch
    introSeen: false          // the one-time notice has been shown
  };

  const state = {
    rows: [],
    seen: new Set(),
    pagesLoaded: 1,
    sortCol: 'rank',
    sortDir: 'asc',
    loading: false,
    done: false,
    error: ''
  };

  let ui = null;         // the open overlay's DOM references; null when closed
  let opening = false;
  let launcher = null;
  let sheet = null;
  let typeChar = null;
  let typeIndex = 0;
  let typeTimer = null;

  // ---------- helpers ----------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function gearIcon() {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', GEAR_PATH);
    s.append(c, p);
    return s;
  }

  const labels = () => ({
    rank: S.colRank, domain: S.colDomain, url: S.colUrl,
    date: S.colDate, title: S.colTitle, snippet: S.colSnippet
  });
  const visibleCols = () => ALL_COLS.filter((c) => prefs.visibleCols.includes(c));
  const widthOf = (c) => prefs.colWidths[c] || DEFAULT_WIDTHS[c] || 120;
  const stripScheme = (u) => u.replace(/^https?:\/\//i, '');

  // ---------- preferences ----------

  async function loadPrefs() {
    try {
      const got = await chrome.storage.local.get(PREFS_KEY);
      const p = got[PREFS_KEY];
      if (!p || typeof p !== 'object') return;
      if (typeof p.density === 'string') prefs.density = p.density;
      if (Array.isArray(p.visibleCols)) prefs.visibleCols = p.visibleCols.filter((c) => ALL_COLS.includes(c));
      if (p.colWidths && typeof p.colWidths === 'object') prefs.colWidths = p.colWidths;
      if (typeof p.highlight === 'boolean') prefs.highlight = p.highlight;
      if (typeof p.dock === 'boolean') prefs.dock = p.dock;
      if (Number.isFinite(p.dockWidth)) prefs.dockWidth = p.dockWidth;
      if (Number.isFinite(p.overlayWidth)) prefs.overlayWidth = p.overlayWidth;
      if (typeof p.autoOpenChosen === 'boolean') prefs.autoOpenChosen = p.autoOpenChosen;
      if (typeof p.introSeen === 'boolean') prefs.introSeen = p.introSeen;
      // Automatic opening is the default. A saved "off" only counts if the user chose it.
      if (prefs.autoOpenChosen && typeof p.autoOpen === 'boolean') prefs.autoOpen = p.autoOpen;
    } catch { /* storage unavailable: keep defaults */ }
  }

  function savePrefs() {
    try { chrome.storage.local.set({ [PREFS_KEY]: prefs }); } catch { /* ignore */ }
  }

  // ---------- results ----------

  function addRows(found) {
    const now = Date.now();
    let added = 0;
    for (const f of found) {
      const key = f.url.replace(/#.*$/, '');
      if (state.seen.has(key)) continue;
      state.seen.add(key);
      const read = f.date ? SortOnTypes.read(f.date, 'date', now) : null;
      state.rows.push({
        ...f,
        rank: state.rows.length + 1,
        dateKey: read ? read.key : null,
        dateHint: read ? read.hint : ''
      });
      added++;
    }
    return added;
  }

  // Exact: the query, run together, is inside the URL or domain.
  // Close: any word of the query longer than two letters is.
  function matchType(r) {
    if (!query) return 'none';
    const qn = query.toLowerCase().replace(/\s+/g, '');
    const url = r.url.toLowerCase();
    const dom = r.domain.toLowerCase();
    if (url.includes(qn) || dom.includes(qn)) return 'exact';
    const words = query.toLowerCase().split(/\s+/);
    if (words.some((w) => w.length > 2 && (url.includes(w) || dom.includes(w)))) return 'close';
    return 'none';
  }

  function sortedRows() {
    const c = state.sortCol;
    const s = state.sortDir === 'asc' ? 1 : -1;
    return [...state.rows].sort((a, b) => {
      if (c === 'rank') return (a.rank - b.rank) * s;
      if (c === 'date') {
        // undated results always go last, whichever way the dates run
        if (a.dateKey == null && b.dateKey == null) return a.rank - b.rank;
        if (a.dateKey == null) return 1;
        if (b.dateKey == null) return -1;
        return (a.dateKey - b.dateKey) * s || a.rank - b.rank;
      }
      const av = c === 'url' ? stripScheme(a.url) : String(a[c] ?? '');
      const bv = c === 'url' ? stripScheme(b.url) : String(b[c] ?? '');
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * s || a.rank - b.rank;
    });
  }

  // Fetch the next pages of Google results from google.com, as the browser would.
  async function fetchMore() {
    if (state.loading || state.done || state.pagesLoaded >= MAX_PAGES) return;
    state.loading = true;
    state.error = '';
    renderFoot();
    try {
      for (let i = 0; i < BATCH_PAGES && state.pagesLoaded < MAX_PAGES; i++) {
        const u = new URL('/search', location.origin);
        for (const k of ['q', 'hl', 'gl', 'lr', 'cr', 'tbs', 'safe', 'udm']) {
          if (params.get(k)) u.searchParams.set(k, params.get(k));
        }
        u.searchParams.set('start', String(startBase + state.pagesLoaded * PAGE_STEP));
        const res = await fetch(u.href, { credentials: 'include' });
        if (res.status === 429 || res.url.includes('/sorry/')) throw new Error(S.errorBlocked);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const found = TSScrape.extract(doc, u.href);
        state.pagesLoaded++;
        if (!addRows(found)) { state.done = true; break; }
        renderBody();
        renderStatus();
        if (i < BATCH_PAGES - 1) await sleep(400);   // be gentle with Google
      }
    } catch (e) {
      state.error = e.message === S.errorBlocked ? S.errorBlocked : S.errorFetch(e.message);
    } finally {
      state.loading = false;
      if (ui) { renderBody(); renderStatus(); renderFoot(); }
    }
  }

  // ---------- styles ----------

  async function getSheet() {
    if (sheet) return sheet;
    const css = await fetch(chrome.runtime.getURL('overlay.css')).then((r) => r.text());
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  }

  async function adoptStyles(root) {
    try {
      root.adoptedStyleSheets = [await getSheet()];
    } catch {
      const link = el('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('overlay.css');
      root.append(link);
    }
  }

  // ---------- launcher ----------

  async function createLauncher() {
    if (launcher) return;
    const host = el('div');
    host.dataset.role = 'launch';
    const root = host.attachShadow({ mode: 'open' });
    await adoptStyles(root);
    const b = el('button', 'launch', S.launch);
    b.type = 'button';
    b.title = S.launchTitle;
    b.addEventListener('click', () => openOverlay());
    root.append(b);
    document.documentElement.append(host);
    launcher = host;
    if (ui) host.hidden = true;
  }

  // ---------- overlay ----------

  async function openOverlay(opts) {
    const auto = !!(opts && opts.auto);
    if (ui || opening) return;
    opening = true;
    try {
      if (!state.rows.length) addRows(TSScrape.extract(document, location.href));

      const host = el('div');
      host.id = 'tablesearch-host';
      const root = host.attachShadow({ mode: 'open' });
      await adoptStyles(root);

      const panel = el('section', 'panel');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'TableSearch results');

      // header
      const bar = el('header', 'bar');
      const heading = el('div', 'heading');
      heading.append(el('span', 'brand', S.brand), el('span', 'field', query ? `“${query}”` : ''));

      const controls = el('div', 'controls');
      const seg = el('div', 'seg');
      const densityBtns = {};
      for (const d of DENSITIES) {
        const b = el('button', 'btn', S[d]);
        b.type = 'button';
        b.addEventListener('click', () => setDensity(d));
        densityBtns[d] = b;
        seg.append(b);
      }
      const optionsBtn = el('button', 'btn', S.tableOptions);
      optionsBtn.type = 'button';
      optionsBtn.addEventListener('click', (e) => { e.stopPropagation(); openOptionsPop(optionsBtn); });
      const closeBtn = el('button', 'close-x', '×');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', S.close);
      closeBtn.title = S.closeTitle;
      closeBtn.addEventListener('click', closeOverlay);
      const modeSeg = el('div', 'seg');
      modeSeg.setAttribute('role', 'group');
      modeSeg.setAttribute('aria-label', S.viewMode);
      const modeBtns = {};
      for (const [m, label, tip] of [['dock', S.viewDocked, S.viewDockedTitle], ['overlay', S.viewOverlay, S.viewOverlayTitle]]) {
        const b = el('button', 'btn', label);
        b.type = 'button';
        b.title = tip;
        b.addEventListener('click', () => setMode(m === 'dock'));
        modeBtns[m] = b;
        modeSeg.append(b);
      }
      controls.append(seg, modeSeg, optionsBtn, closeBtn);

      const status = el('div', 'status');
      status.setAttribute('role', 'status');
      bar.append(heading, controls, status);

      // table
      const scroll = el('div', 'scroll');
      const results = el('div', 'results');
      const table = el('table', 'grid');
      const colgroup = el('colgroup');
      const thead = el('thead');
      const tbody = el('tbody');
      table.append(colgroup, thead, tbody);

      // Load more: right under the last row, and pinned to the left edge so it
      // stays in view when a wide table is scrolled sideways
      const more = el('div', 'more');
      const moreBtn = el('button', 'btn');
      moreBtn.type = 'button';
      moreBtn.addEventListener('click', fetchMore);
      const moreMsg = el('span', 'more-msg');
      more.append(moreBtn, moreMsg);
      results.append(table, more);
      scroll.append(results);

      // footer: just the version stamp
      const foot = el('footer', 'foot');
      foot.append(el('span', 'stamp', S.stamp));

      panel.append(bar, scroll, foot);

      // Drag handle on the left edge: resize the panel (arrow keys too)
      const grip = el('div', 'grip');
      grip.setAttribute('role', 'separator');
      grip.setAttribute('aria-orientation', 'vertical');
      grip.setAttribute('aria-label', S.gripLabel);
      grip.tabIndex = 0;
      grip.addEventListener('mousedown', startPanelResize);
      grip.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        setPanelWidth(panelWidth() + (e.key === 'ArrowLeft' ? 24 : -24), true);
      });
      panel.append(grip);

      // One-time notice: the table opens by itself, and that is the user's choice.
      let notice = null;
      if (prefs.autoOpen && !prefs.introSeen) {
        notice = el('div', 'notice');
        notice.setAttribute('role', 'note');
        const keep = el('button', 'btn', S.introKeep);
        keep.type = 'button';
        keep.addEventListener('click', () => answerIntro(true));
        const off = el('button', 'btn', S.introOff);
        off.type = 'button';
        off.addEventListener('click', () => answerIntro(false));
        notice.append(el('span', 'notice-text', S.introText), keep, off);
        panel.insertBefore(notice, scroll);
      }
      root.append(panel);

      ui = { host, root, panel, table, colgroup, thead, tbody, status, more, moreBtn, moreMsg, scroll, densityBtns, modeBtns, grip, notice, pop: null };

      // header clicks: sort, gear, resize
      thead.addEventListener('click', (e) => {
        if (e.target.closest('.resize-handle')) return;
        const th = e.target.closest('th');
        if (!th) return;
        const gear = e.target.closest('.gear');
        if (gear) { e.stopPropagation(); openColPop(gear, th.dataset.col); return; }
        sortBy(th.dataset.col);
      });
      thead.addEventListener('mousedown', (e) => {
        const h = e.target.closest('.resize-handle');
        if (h) startResize(e, h);
      });
      panel.addEventListener('click', (e) => {
        // ui is null if this very click closed the overlay (e.g. a rank button)
        if (ui && ui.pop && !ui.pop.contains(e.target)) closePop();
      });

      document.addEventListener('keydown', onKeyDown, true);

      syncDensity();
      renderHead();
      renderBody();
      renderStatus();
      renderFoot();

      document.documentElement.append(host);
      applyMode();
      window.addEventListener('resize', applyMode);
      if (launcher) launcher.hidden = true;
      // Opened by the user: focus the dialog. Opened automatically: leave focus alone, so
      // typing still goes to Google's search box and typeahead keys still work.
      if (!auto) closeBtn.focus();
    } finally {
      opening = false;
    }
  }

  function closeOverlay() {
    if (!ui) return;
    closePop();
    if (ui.notice && !prefs.introSeen) { prefs.introSeen = true; savePrefs(); }   // they saw it
    ui.host.remove();
    ui = null;
    releasePage();
    window.removeEventListener('resize', applyMode);
    document.removeEventListener('keydown', onKeyDown, true);
    clearTimeout(typeTimer);
    if (launcher) launcher.hidden = false;
  }

  function removeNotice() {
    if (ui && ui.notice) { ui.notice.remove(); ui.notice = null; }
  }

  function answerIntro(keepOn) {
    prefs.autoOpen = keepOn;
    prefs.autoOpenChosen = true;
    prefs.introSeen = true;
    savePrefs();
    removeNotice();
  }

  // ---------- docking ----------
  // Docked: the Google page is narrowed by the panel's width (class + CSS variable on <html>,
  // rule in page.css), so the page and the table sit side by side. Overlay: the panel floats
  // over the page as before. Both are resizable; each remembers its own width.

  const MIN_PANEL = 360;
  const MIN_PAGE = 340;   // keep at least ~320px of the Google page (plus its scrollbar) visible when docked

  function maxPanelWidth() {
    return Math.max(MIN_PANEL, window.innerWidth - (prefs.dock ? MIN_PAGE : 24));
  }

  function panelWidth() {
    const saved = prefs.dock ? prefs.dockWidth : prefs.overlayWidth;
    const auto = prefs.dock
      ? Math.round(window.innerWidth * 0.45)
      : Math.min(1100, Math.round(window.innerWidth * 0.96));
    const w = saved > 0 ? saved : auto;
    return Math.min(maxPanelWidth(), Math.max(MIN_PANEL, w));
  }

  function setPanelWidth(w, save) {
    const v = Math.round(Math.min(maxPanelWidth(), Math.max(MIN_PANEL, w)));
    if (prefs.dock) prefs.dockWidth = v; else prefs.overlayWidth = v;
    if (save) savePrefs();
    applyMode();
  }

  function applyMode() {
    if (!ui) return;
    const w = panelWidth();
    ui.host.dataset.mode = prefs.dock ? 'dock' : 'overlay';
    ui.host.style.setProperty('width', w + 'px');
    const root = document.documentElement;
    root.classList.toggle('tablesearch-docked', prefs.dock);
    if (prefs.dock) root.style.setProperty('--ts-dock-w', w + 'px');
    else root.style.removeProperty('--ts-dock-w');
    for (const m of Object.keys(ui.modeBtns)) {
      ui.modeBtns[m].setAttribute('aria-pressed', String((m === 'dock') === prefs.dock));
    }
  }

  function setMode(dock) {
    if (prefs.dock === dock) return;
    prefs.dock = dock;
    savePrefs();
    closePop();
    applyMode();
  }

  function releasePage() {
    const root = document.documentElement;
    root.classList.remove('tablesearch-docked');
    root.style.removeProperty('--ts-dock-w');
  }

  function startPanelResize(e) {
    e.preventDefault();
    e.stopPropagation();
    ui.host.classList.add('resizing');   // lets the grip keep the mouse while dragging
    const move = (ev) => setPanelWidth(window.innerWidth - ev.clientX, false);
    const up = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      if (ui) ui.host.classList.remove('resizing');
      savePrefs();
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  }

  function toggleOverlay() { if (ui) closeOverlay(); else openOverlay(); }

  // ---------- rendering ----------

  function setTableWidth() {
    const sum = visibleCols().reduce((n, c) => n + widthOf(c), 0);
    ui.table.style.width = sum + 'px';
  }

  function renderHead() {
    const cols = visibleCols();
    const names = labels();

    ui.colgroup.replaceChildren(...cols.map((c) => {
      const col = el('col');
      col.dataset.col = c;
      col.style.width = widthOf(c) + 'px';
      return col;
    }));
    setTableWidth();

    const tr = el('tr');
    for (const c of cols) {
      const th = el('th');
      th.dataset.col = c;
      th.scope = 'col';
      const sorted = state.sortCol === c;
      th.setAttribute('aria-sort', sorted ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');

      const inner = el('div', 'th-inner');
      const gear = el('button', 'gear');
      gear.type = 'button';
      gear.title = S.colOptions;
      gear.setAttribute('aria-label', S.colOptions);
      gear.append(gearIcon());
      inner.append(el('span', 'label', names[c]), el('span', 'arrow', sorted ? (state.sortDir === 'asc' ? '↑' : '↓') : '⇅'), gear);

      th.append(inner, el('div', 'resize-handle'));
      tr.append(th);
    }
    ui.thead.replaceChildren(tr);
  }

  function cellFor(c, r, mt) {
    const td = el('td', 'c-' + c);
    if (c === 'rank') {
      if (r.el) {
        const b = el('button', 'rank-btn', String(r.rank));
        b.type = 'button';
        b.title = S.showTitle;
        // Docked, the page is already visible beside the table: just point at the result.
        // Floating, the panel covers the page, so get out of the way first.
        b.addEventListener('click', () => { if (!prefs.dock) closeOverlay(); locate(r.el); });
        td.append(b);
      } else {
        td.textContent = String(r.rank);
      }
    } else if (c === 'domain') {
      const a = el('a', 'domain-link', r.domain);
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
      td.append(a);
    } else if (c === 'url') {
      const text = stripScheme(r.url);
      const a = el('a', 'url-link', text.length > 60 ? text.slice(0, 60) + '…' : text);
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.title = r.url;
      td.append(a);
      if (mt === 'exact') td.append(el('span', 'badge exact', S.badgeExact));
      else if (mt === 'close') td.append(el('span', 'badge close', S.badgeClose));
    } else if (c === 'date') {
      const s = el('span', 'date-text', r.date || S.dateUndated);
      if (r.dateHint) s.title = '= ' + r.dateHint;
      td.append(s);
    } else if (c === 'title') {
      td.append(el('span', 'title-text', r.title));
    } else if (c === 'snippet') {
      td.append(el('span', 'snippet-text', r.snippet));
    }
    return td;
  }

  // What a fixer needs to know when the scraper finds nothing. No search words, no results.
  function diagnostics() {
    const n = (sel) => { try { return document.querySelectorAll(sel).length; } catch { return 'n/a'; } };
    return [
      S.stamp,
      'Page: ' + location.hostname + location.pathname,
      'Tab params: tbm=' + (params.get('tbm') || '-') + ' udm=' + (params.get('udm') || '-'),
      'Browser: ' + navigator.userAgent,
      'Counts: #rso=' + n('#rso') + ' #search=' + n('#search') +
        ' result-links(rso)=' + n('#rso a:has(h3)') + ' result-links(search)=' + n('#search a:has(h3)') +
        ' h3=' + n('h3') + ' data-sncf=' + n('[data-sncf]'),
      'Scraped rows: ' + state.rows.length
    ].join('\n');
  }

  function renderBody() {
    if (!ui) return;
    const cols = visibleCols();
    if (!state.rows.length) {
      ui.table.hidden = true;
      if (!ui.empty) {
        ui.empty = el('div', 'empty');
        ui.empty.setAttribute('role', 'alert');
        const copyBtn = el('button', 'btn', S.emptyCopy);
        copyBtn.type = 'button';
        const copyMsg = el('span', 'copy-msg');
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(diagnostics());
            copyMsg.textContent = S.emptyCopied;
          } catch {
            copyMsg.textContent = S.emptyCopyFailed;
          }
        });
        ui.empty.append(
          el('p', 'message', S.errorNoResults),
          el('p', 'alert-text', S.emptyAlert),
          el('p', 'hint', S.errorNoResultsHint),
          el('p', 'copy-row')
        );
        ui.empty.lastChild.append(copyBtn, copyMsg);
        ui.scroll.append(ui.empty);
      }
      return;
    }
    if (ui.empty) { ui.empty.remove(); ui.empty = null; }
    ui.table.hidden = false;

    const frag = document.createDocumentFragment();
    for (const r of sortedRows()) {
      const mt = prefs.highlight ? matchType(r) : 'none';
      const tr = el('tr', mt === 'exact' ? 'exact-match' : mt === 'close' ? 'close-match' : '');
      tr.dataset.rank = String(r.rank);
      for (const c of cols) tr.append(cellFor(c, r, mt));
      frag.append(tr);
    }
    ui.tbody.replaceChildren(frag);
  }

  function renderStatus() {
    if (!ui) return;
    let exact = 0, close = 0;
    for (const r of state.rows) {
      const m = matchType(r);
      if (m === 'exact') exact++; else if (m === 'close') close++;
    }
    ui.status.textContent = state.rows.length ? S.statusResults(state.rows.length, exact, close) : '';
  }

  function renderFoot() {
    if (!ui) return;
    const capped = state.pagesLoaded >= MAX_PAGES;
    const finished = state.done || capped;
    ui.moreBtn.hidden = finished || !state.rows.length;
    ui.moreBtn.disabled = state.loading;
    ui.moreBtn.textContent = state.loading ? S.loadMoreLoading : S.loadMoreButton;
    ui.moreMsg.classList.toggle('error', !!state.error);
    ui.moreMsg.textContent = state.error
      || (state.done ? S.loadMoreDone : capped ? S.loadMoreCapped(state.rows.length) : '');
    ui.more.hidden = ui.moreBtn.hidden && !ui.moreMsg.textContent;
  }

  function syncDensity() {
    for (const d of DENSITIES) ui.densityBtns[d].setAttribute('aria-pressed', String(prefs.density === d));
    for (const d of DENSITIES) ui.table.classList.toggle('d-' + d, (prefs.density || 'standard') === d);
  }

  // ---------- actions ----------

  function setDensity(d) {
    prefs.density = d;
    prefs.visibleCols = PRESETS[d].slice();
    savePrefs();
    closePop();
    syncDensity();
    renderHead();
    renderBody();
  }

  function toggleCol(c, show) {
    const set = new Set(prefs.visibleCols);
    if (show) set.add(c); else set.delete(c);
    prefs.visibleCols = ALL_COLS.filter((x) => set.has(x));
    prefs.density = '';                // columns chosen by hand: presets no longer apply
    savePrefs();
    syncDensity();
    renderHead();
    renderBody();
  }

  function sortBy(c) {
    if (state.sortCol === c) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = c; state.sortDir = 'asc'; }
    renderHead();
    renderBody();
  }

  function setSort(c, dir) {
    state.sortCol = c;
    state.sortDir = dir;
    renderHead();
    renderBody();
  }

  function locate(item) {
    if (!item || !item.isConnected) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.classList.remove('tablesearch-flash');
    void item.offsetWidth; // restart the animation
    item.classList.add('tablesearch-flash');
    setTimeout(() => item.classList.remove('tablesearch-flash'), 2200);
  }

  // ---------- column resize ----------

  function startResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    const th = handle.closest('th');
    const c = th.dataset.col;
    const col = ui.colgroup.querySelector(`col[data-col="${c}"]`);
    const startX = e.clientX;
    const startW = widthOf(c);
    handle.classList.add('resizing');

    const move = (ev) => {
      const w = Math.max(40, startW + (ev.clientX - startX));
      prefs.colWidths[c] = w;
      col.style.width = w + 'px';
      setTableWidth();
    };
    const up = () => {
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      handle.classList.remove('resizing');
      savePrefs();
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  }

  // ---------- popovers ----------

  function closePop() {
    if (!ui || !ui.pop) return;
    ui.pop.remove();
    ui.pop = null;
  }

  function placePop(pop, anchor) {
    ui.panel.append(pop);
    const a = anchor.getBoundingClientRect();
    const p = ui.panel.getBoundingClientRect();
    const left = Math.min(Math.max(8, a.left - p.left), p.width - pop.offsetWidth - 8);
    pop.style.top = (a.bottom - p.top + 6) + 'px';
    pop.style.left = Math.max(8, left) + 'px';
    ui.pop = pop;
  }

  const popTitle = (t) => el('div', 'pop-title', t);

  function checkItem(label, checked, onChange) {
    const row = el('div', 'pop-item');
    const lab = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    lab.append(box, el('span', null, label));
    row.append(lab);
    return row;
  }

  function actionItem(label, fn) {
    const b = el('button', 'pop-item', label);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); closePop(); fn(); });
    return b;
  }

  function openOptionsPop(anchor) {
    const reopen = ui.pop && ui.pop.dataset.kind === 'options';
    closePop();
    if (reopen) return;
    const pop = el('div', 'pop');
    pop.dataset.kind = 'options';

    pop.append(popTitle(S.sectionDisplay));
    pop.append(checkItem(S.highlightMatches, prefs.highlight, (v) => {
      prefs.highlight = v; savePrefs(); renderBody();
    }));
    pop.append(checkItem(S.autoOpen, prefs.autoOpen, (v) => answerIntro(v)));
    pop.append(el('hr'));

    pop.append(popTitle(S.sectionLegend));
    for (const [kind, text] of [['exact', S.legendExact], ['close', S.legendClose]]) {
      const row = el('div', 'pop-item pop-static');
      row.append(el('span', 'dot ' + kind), el('span', null, text));
      pop.append(row);
    }
    pop.append(el('hr'));

    pop.append(popTitle(S.sectionTypeahead), el('div', 'pop-blurb', S.typeaheadBlurb), el('hr'));

    pop.append(popTitle(S.sectionColumns));
    const names = labels();
    for (const c of ALL_COLS) {
      pop.append(checkItem(names[c], prefs.visibleCols.includes(c), (v) => toggleCol(c, v)));
    }
    placePop(pop, anchor);
  }

  function openColPop(anchor, col) {
    closePop();
    const pop = el('div', 'pop');
    pop.dataset.kind = 'column';
    const isDate = col === 'date';
    pop.append(actionItem(isDate ? S.colSortOldest : S.colSortAsc, () => setSort(col, 'asc')));
    pop.append(actionItem(isDate ? S.colSortNewest : S.colSortDesc, () => setSort(col, 'desc')));
    pop.append(el('hr'));
    pop.append(actionItem(S.colHide, () => toggleCol(col, false)));
    placePop(pop, anchor);
  }

  // ---------- keyboard ----------

  // Typeahead: press a letter or digit to jump to the first row (in the current
  // sort order) whose value starts with it. Press it again for the next match.
  // Sorted by Rank or Date there are no letters to match, so Domain is used.
  function typeCol() {
    return state.sortCol === 'rank' || state.sortCol === 'date' ? 'domain' : state.sortCol;
  }

  function typeValue(r, col) {
    return (col === 'url' ? stripScheme(r.url) : String(r[col] || '')).toLowerCase();
  }

  function jumpTo(rank) {
    for (const t of ui.tbody.querySelectorAll('tr.typeahead-highlight')) t.classList.remove('typeahead-highlight');
    const row = ui.tbody.querySelector(`tr[data-rank="${rank}"]`);
    if (!row) return;
    row.classList.add('typeahead-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => row.classList.remove('typeahead-highlight'), 1200);
  }

  function onKeyDown(e) {
    if (!ui) return;
    if (e.key === 'Escape') {
      if (ui.pop) { closePop(); e.stopPropagation(); return; }
      e.stopPropagation();
      closeOverlay();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || !/^[a-z0-9]$/i.test(e.key)) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;

    const ch = e.key.toLowerCase();
    if (ch !== typeChar) { typeChar = ch; typeIndex = 0; }
    const col = typeCol();
    const matches = sortedRows().filter((r) => typeValue(r, col).startsWith(ch));
    if (!matches.length) return;
    if (typeIndex >= matches.length) typeIndex = 0;
    e.stopPropagation();
    jumpTo(matches[typeIndex].rank);
    typeIndex++;
  }

  // ---------- start ----------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'TS_TOGGLE') toggleOverlay();
  });

  (async () => {
    await loadPrefs();
    if (!isWebTab) return;
    await createLauncher();
    if (prefs.autoOpen) openOverlay({ auto: true });
  })();
})();
