# Tests

`./run.sh` loads the extension into Chromium, points it at a local stand-in for a
Google results page (`server.js`, shaped like the real markup), and drives the
whole interface: scraping, sorting, date order, typeahead, load more, columns,
density, popovers, resize, Show, and preferences surviving a reload.

    npm install playwright
    npx playwright install chromium
    ./run.sh

It prints PASS/FAIL per check and saves screenshots to the working folder it names.

**What it can't tell you:** whether Google has changed its real markup. The
fixture copies the structure verified on a live results page on 2026-10-29. If the
live page changes and results stop appearing, fix `scrape.js`, then update
`server.js` to match so this test keeps guarding the new shape.
