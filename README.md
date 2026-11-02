# TableSearch (Chrome extension)

Google decides how its results look. TableSearch lets you decide.

On a Google results page, press **Alt+T** (or click the **TableSearch** button, or the toolbar icon) and the results become a table you can sort by domain, URL or date, with the columns you choose. Results whose address contains what you searched for are marked **exact**, so you can see at a glance which hits really are about your search.

It reads the results Google has already sent to your browser. There is no account, no API key, no search service and no credit limit. The web app at tablesearch.netlify.app uses Serper (2,500 free credits); this does not.

## Install (load unpacked)

1. Unzip `tablesearch-ext.zip` somewhere permanent, e.g. `Documents/tablesearch-ext`.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `tablesearch-ext` folder.
6. Reload any Google tab that was already open. Pages open before install don't have the extension yet.
7. Optional: click the puzzle-piece icon in the toolbar and pin **TableSearch**.

## Use

1. Search on Google as usual (www.google.com, the **All** tab).
2. Press **Alt+T**, or click the blue **TableSearch** button at the bottom right of the page.
3. Click a column header to sort. Click again to reverse.
4. Hover a header and click its gear for sort and hide.
5. Type any letter or digit to jump to the first row starting with it (it uses Domain when sorted by Rank or Date). Type it again for the next match. The row flashes aquamarine.
6. Click a **rank number** to close the table and scroll Google's page to that result. (Only the results on Google's own page can do this.)
7. Click **Load 20 more results** for the next two Google pages, fetched the same way your browser would. It stops around 54 results.
8. Press **Esc** or **×** to close.

**Compact / Standard / Full** pick a set of columns. **Table Options** has the column checklist, the highlight switch, and **Open the table automatically**, which shows the table on every results page without pressing anything. Column widths (drag a header edge), columns, density and options are remembered.

## What it sorts by

- **Rank, Domain, URL, Title, Snippet:** numbers inside text sort naturally ("Item 2" before "Item 10").
- **Date:** Google shows a date on only some results ("Oct 7, 2025", "3 days ago"). Those sort by real time, oldest or newest first. Results with no date always sit at the bottom, whichever way you sort.

Hover a date to see how it was read.

## How it works

1. **Scrape.** `scrape.js` finds each result by its structure: one link containing a heading, plus the snippet block. It avoids Google's scrambled class names, which change often.
2. **Match.** Exact means your query, run together, appears in the URL or domain ("jack bellis" inside `linkedin.com/in/jackbellis`). Close means any word longer than two letters does.
3. **Load more.** The extension asks google.com for the next result pages from inside the Google tab, using your own session, and reads them the same way.
4. **Show.** The table lives in an isolated shadow layer, so Google's styles can't touch it and it can't touch Google's.

Nothing leaves your browser except those requests to google.com. No analytics, no other servers.

## Differences from the web app

| | Web app | Extension |
|---|---|---|
| Data | Serper API, 2,500 free credits | The Google page you're on |
| Setup | none | load unpacked, Chrome only |
| Rankings | neutral | **your** Google: personalised by your location and history |
| Results per search | 20, then 20 more | about 9 per Google page, up to ~54 |
| Breaks when | Serper changes | Google changes its page |

The personalisation point matters if you're checking where something really ranks. Use the web app, or a private window, for that.

## When it stops working

If the table opens but says **No results found on this page** on a page that clearly has results, Google has probably changed its markup. Only `scrape.js` knows about Google's page, so only that file needs fixing. The three things it relies on are listed at the top of the file.

If **Load more** says Google asked for a check, reload the Google tab, complete the check, and try again.

## Limits

- **www.google.com only.** Other countries (google.co.uk and so on) need adding to `matches` in `manifest.json`.
- **Web results only.** Not Images, News, Videos or Maps.
- **Organic results only.** Ads, maps, "People also ask" and similar blocks are skipped.
- **Rank** is the order in the table's list, not an official Google position.
- Chrome and other Chromium browsers. Not yet in the Chrome Web Store.

## Files

| File | Role |
|---|---|
| `manifest.json` | Extension definition (Manifest V3) |
| `background.js` | Toolbar button and Alt+T |
| `strings.js` | **All** user-visible text. Edit here to change any label. |
| `scrape.js` | Reads Google's results out of a page. The only file that knows Google's markup. |
| `types.js` | Reads dates like "Oct 7, 2025" and "3 days ago". Shared with the Sort On extension. |
| `content.js` | The table: sorting, columns, typeahead, load more |
| `overlay.css` | Table styles, isolated in a shadow root |
| `page.css` | The only style added to Google's page: the flash on "Show" |
| `test/` | End-to-end test. See `test/README.md`. |
| `HANDOFF_EXTENSION.md` | Notes for whoever (or whichever Claude) picks this up |

No inline styles in markup and no `innerHTML`. The only styles set from script are column widths while you drag.
