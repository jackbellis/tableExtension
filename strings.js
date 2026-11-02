// strings.js — single source of truth for all user-visible text in the
// TableSearch extension. Edit here to change any label, message, or string.
// (Same pattern as the web app's strings.js, as `var` so the content script can
// be loaded more than once without a redeclaration error.)

var S = {

  // Launcher button on the Google page
  launch:              'TableSearch',
  launchTitle:         'Show these results as a table (Alt+T)',

  // Header
  brand:               'TableSearch',
  close:               'Close',
  closeTitle:          'Close (Esc)',

  // Density presets
  compact:             'Compact',
  standard:            'Standard',
  full:                'Full',

  // Table Options
  tableOptions:        'Settings',

  sectionDisplay:      'Display',
  highlightMatches:    'Highlight Matches',
  autoOpen:            'Open the table automatically',

  // Docked / Overlay
  viewMode:            'Layout',
  viewDocked:          'Docked',
  viewDockedTitle:     'Dock the table beside the Google page',
  viewOverlay:         'Overlay',
  viewOverlayTitle:    'Float the table over the Google page',
  gripLabel:           'Resize the table (drag, or use the arrow keys)',

  // One-time notice, shown the first time the table opens by itself
  introText:           'The table now opens automatically on Google results. Esc hides it and Alt+T brings it back. You can change this any time in Settings.',
  introKeep:           'Keep automatic',
  introOff:            'Turn off automatic',
  sectionLegend:       'Legend for highlights',
  legendExact:         'Exact URL match',
  legendClose:         'Close match',
  sectionTypeahead:    'Typeahead',
  typeaheadBlurb:      'Press any letter key to jump to results starting with that letter. When sorted by Rank, typeahead searches by domain.',
  sectionColumns:      'Columns',

  // Column headers (table header and column chooser)
  colRank:             'Rank',
  colDomain:           'Domain',
  colUrl:              'URL',
  colDate:             'Date',
  colTitle:            'Title',
  colSnippet:          'Snippet',

  // Column gear popover
  colOptions:          'Column options',
  colSortAsc:          '↑ Sort Ascending',
  colSortDesc:         '↓ Sort Descending',
  colSortOldest:       '↑ Oldest First',
  colSortNewest:       '↓ Most Recent First',
  colHide:             'Hide column',

  // Row actions
  show:                'Show',
  showTitle:           'Scroll the Google page to this result',

  // Match badges (shown in the URL cell)
  badgeExact:          'exact',
  badgeClose:          'close',

  // Date — when Google shows none
  dateUndated:         '—',

  // Status line (header)
  statusResults:       (total, exact, close) => `${total} results · ${exact} exact · ${close} close`,

  // Load more (footer)
  loadMoreButton:      'Load 20 more results',
  loadMoreLoading:     'Loading more results...',
  loadMoreDone:        'All available results loaded',
  loadMoreCapped:      n => `Showing the first ${n} results`,

  // Error / empty states
  errorNoResults:      'No results found on this page.',
  emptyAlert:          'If this page does show results, TableSearch can no longer read Google\u2019s page layout (Google has probably changed it). The table is empty rather than wrong.',
  emptyCopy:           'Copy details for a fix',
  emptyCopied:         'Copied. Paste it to whoever maintains TableSearch.',
  emptyCopyFailed:     'Couldn\u2019t copy automatically.',
  errorNoResultsHint:  'A search that really has no results looks the same. See the README, "When it stops working".',
  errorFetch:          msg => `Couldn’t load more results: ${msg}`,
  errorBlocked:        'Google asked for a check (CAPTCHA). Reload the Google page, complete it, then try again.',

  // Stamp
  stamp:               'TableSearch extension · v2610291900',

};
