// TableSearch — background service worker.
// The toolbar button (and its Alt+T shortcut) tells the page's content script to
// show or hide the table.

chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: 'TS_TOGGLE' }).catch(() => {
    // Not a Google results page, or the page was open before the extension was
    // installed or reloaded. A page refresh fixes the second case.
    console.warn('TableSearch: open a Google results page (or reload it), then try again.');
  });
});
