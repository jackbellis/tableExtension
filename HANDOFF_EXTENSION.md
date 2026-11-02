# TableSearch Extension: Handoff
**Stamp:** v2610291430 (`strings.js` `S.stamp`; `manifest.json` version 0.1.0)
**Written:** 2026-10-29

For a collaborator, or a Claude instance, picking this up. Read this first, then `README.md`.

---

## What it is

A Manifest V3 Chrome extension that turns a Google results page into the sortable, configurable table the TableSearch web app (tablesearch.netlify.app) provides, without Serper. It reads the results already on the page and fetches further pages from google.com using the user's own session.

It is a second front-end on the same idea, not a replacement. The web app stays the neutral-ranking, shareable, demo-able version. The extension is the daily-driver version.

Built in the structure of the owner's earlier **Sort On** extension (shadow-root overlay, `strings`-style separation, no inline styles, README with install steps). `types.js` is copied unchanged from Sort On.

---

## State at handoff

| | Status |
|---|---|
| Scraper reads real Google markup | **Verified** on a live results page (9 results, dates, snippets) and on a fetched page 2 |
| Same-origin fetch of pages 2+ returns parseable results | **Verified** on live google.com from a logged-in Chrome |
| Google's CSP doesn't block the overlay's stylesheet fetch | **Checked**: enforced policy on `/search` restricts only `object-src`, `base-uri`, `script-src` |
| Whole interface (40 checks) | **Passes** in headless Chromium against a local fixture shaped like the live markup |
| **Loaded as an unpacked extension on real google.com** | **Not yet done.** This is the first thing to do. |

First-run checklist for the owner (install steps are in the README):
1. Search anything on www.google.com, press Alt+T. Expect about 9 rows.
2. Click **Load 20 more results**. Expect about 27 rows. If Google shows a CAPTCHA message, reload and retry.
3. Sort Domain, then Date. Check undated results sit last.
4. Click a rank number: the overlay closes and the Google result flashes blue.

---

## Architecture

```
manifest.json    MV3. Content script on https://www.google.com/search*. Alt+T via _execute_action.
background.js    Toolbar click → message TS_TOGGLE to the tab.
strings.js       var S = {...}. ALL user-visible text. Same pattern as the web app.
types.js         SortOnTypes: parses "Oct 7, 2025", "3 days ago" → sortable time. From Sort On.
scrape.js        TSScrape.extract(doc, base). THE ONLY FILE THAT KNOWS GOOGLE'S MARKUP.
content.js       State, overlay, sorting, columns, typeahead, load more, prefs.
overlay.css      Shadow-root styles. Palette matches the web app.
page.css         One rule: the .tablesearch-flash outline on the Google page.
test/            server.js (fixture), test.js (40 checks), run.sh
```

Load order matters: `strings.js`, `types.js`, `scrape.js`, then `content.js`. They share one isolated world; `S`, `SortOnTypes`, `TSScrape` are `var` globals.

### How scraping works (scrape.js)
- Result = `#rso a:has(h3), #search a:has(h3)`: the one link per result that contains a heading.
- Result box = climb from that link until the parent would hold more than one such link.
- Snippet = outermost `[data-sncf]` nodes in the box. A leading `Oct 7, 2025 — ` or `3 days ago — ` is split off as the Date.
- Skips Google-internal links; unwraps `google.com/url?q=` redirects.
- Deliberately ignores Google's obfuscated class names (`MjjYud`, `yuRUbf`…). They change; these three structural hooks have been steadier. **They will still break eventually.**

### Load more (content.js `fetchMore`)
Fetches `/search?q=…&start=N` for N = 10, 20… (carrying `hl gl lr cr tbs safe udm`), parses with `DOMParser`, runs the same scraper. Two pages per click, 400 ms apart. Stops at 6 pages total (~54 results) or when a page adds nothing. A `/sorry/` redirect or HTTP 429 shows the CAPTCHA message. Results are de-duplicated by URL. Rows from fetched pages have no on-page element, so they get no "Show".

---

## Decisions (don't reverse without discussing)

- **Scrape the page; don't use Serper.** No key, no credits, no backend. Cost: tied to Google's markup, and rankings are the user's personalised ones. The README says so plainly.
- **No `innerHTML`, no inline styles in markup.** Google can enforce Trusted Types, and the owner's Sort On convention is presentation in CSS only. Column widths are set through the CSS object model (`col.style.width`) because they change while dragging; that is the one exception.
- **All text in `strings.js`.** The web app drifted into half-externalised strings and it cost the owner and a collaborator real time. Keep this complete: any new label goes in `S` first.
- **Column choice overrides density.** Compact/Standard/Full are shortcuts; toggling a column by hand deselects them (`prefs.density = ''`).
- **Undated results always sort last**, in either direction.
- **Typeahead uses Domain when sorted by Rank or Date.** There are no letters to match there. (This was the web app's long-standing "typeahead is broken" bug.)
- **Clicking a rank number closes the overlay and flashes the Google result.** The panel covers the page, so the page has to be visible to see the flash. State is kept; reopening is instant.
- **Overlay is a right-docked panel** (`min(1100px, 96vw)`), page still visible on the left.
- **`www.google.com` only for now.** Other TLDs are a `matches` edit.

---

## Conventions carried over from the web app project

- **Stamp** `vYYMMDDHHMM` in `S.stamp`; bump it on every change. Shown bottom-right of the overlay.
- Deliver **only the files that changed**, not a full zip.
- The owner runs **long sessions** and stops at a major function completion or when quality degrades. Don't stop early.
- The owner is a **reluctant programmer**: use **GitHub Desktop**, never git command line. Give instructions as **separate numbered steps**, one action per step.
- Update this doc at the end of each session.

---

## Backlog

Likely next, roughly in order:
1. **Real-Chrome verification** (above), then fix whatever it turns up.
2. **Other Google domains** (co.uk, ca, com.au…): add to `matches`; check the `start=` paging still behaves.
3. **A Kagi version.** Kagi results are served as ordinary HTML; a second scraper beside `scrape.js` plus a `matches` entry might be all it takes. Relevant to the owner's outreach to Kagi.
4. **Side panel** instead of an overlay (Chrome Side Panel API), so the page narrows beside the table. Idea carried from Sort On.
5. **Results per page.** Check whether Google still honours a larger `num=` for the fetched pages; it did not for the live page (9 results).
6. **Chrome Web Store** listing, after a few weeks of daily use.

Carried from the web app, not yet in the extension: search history (Google has its own), the "Search on Google" link (not needed here), the Serper usage counter (not needed here), column reorder by drag (still deferred everywhere).

---

## Running the tests

    cd test && npm install playwright && npx playwright install chromium && ./run.sh

If Google's markup changes: fix `scrape.js`, then update `test/server.js` to the new shape so the test guards it.
