/*
 * background.js runs in the background on Chrome. It now ensures that if a dedicated
 * Google Meet PWA window isn’t found, it creates one automatically.
 */

let googleMeetWindowId;

// helper to launch the PWA window if needed
function launchPwa(tabId, tabUrl, source = '') {
  // Launch a new window. Using type 'popup' usually makes it look like a PWA.
  chrome.windows.create({ url: tabUrl, type: 'popup' }, function (newWindow) {
    googleMeetWindowId = newWindow.id;
    const queryParameters = tabUrl.split('/')[3] || '';
    chrome.storage.local.set({
      originatingTabId: tabId,
      queryParams: queryParameters,
      source: source
    });
  });
}

// clear referring state on page load
chrome.tabs.onCreated.addListener(() => {
  chrome.storage.local.set({
    originatingTabId: '',
    queryParams: '__gmInitialState',
    source: '',
  });
});

chrome.tabs.onUpdated.addListener((tabId, tabChangeInfo, tab) => {
  // Only act if the tab has a URL
  if (!tab.url) return;
  
  // Special handling for /new meetings
  if (tab.url.includes('meet.google.com/new')) {
    chrome.windows.getAll({ populate: true, windowTypes: ['app', 'popup'] }, function (windows) {
      // Try to find a window that looks like the Meet PWA
      windows.forEach((window) => {
        if (
          window.tabs.length > 0 &&
          window.tabs[0].url.startsWith('https://meet.google.com/')
        ) {
          googleMeetWindowId = window.id;
        }
      });
      
      if (!googleMeetWindowId) {
        // No PWA found: launch one
        launchPwa(tabId, tab.url, 'NEW_MEETING');
        return;
      }
      
      // if not in the PWA window, stop the loading and set up redirection
      if (tab.windowId !== googleMeetWindowId) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          injectImmediately: true,
          func: () => { window.stop(); }
        }, function () {
          const queryParameters = tab.url.split('/')[3] || '';
          chrome.storage.local.set({
            originatingTabId: tabId,
            queryParams: queryParameters,
            source: 'NEW_MEETING'
          });
        });
      }
    });
  
  // Handling for regular meet.google.com URLs
  } else if (tabChangeInfo.status === 'complete' && tab.url.includes('meet.google.com')) {
    chrome.windows.getAll({ populate: true, windowTypes: ['app', 'popup'] }, function (windows) {
      windows.forEach((window) => {
        if (
          window.tabs.length > 0 &&
          window.tabs[0].url.startsWith('https://meet.google.com/')
        ) {
          googleMeetWindowId = window.id;
        }
      });
      
      if (!googleMeetWindowId) {
        // No PWA found: launch one automatically
        launchPwa(tabId, tab.url);
        return;
      }
      
      // Only attempt redirection if not already in the PWA window
      if (tab.windowId !== googleMeetWindowId) {
        const parameters = tab.url.split('/')[3] || '';
        if (!parameters.startsWith('new') && !parameters.startsWith('_meet')) {
          chrome.storage.local.set({
            originatingTabId: tabId,
            queryParams: parameters,
          });
        }
      }
    });
  }
});

chrome.storage.onChanged.addListener(function (changes) {
  if (changes['googleMeetOpenedUrl']) {
    // Bring the Google Meet PWA window into focus
    chrome.windows.update(googleMeetWindowId, { focused: true }, function () {
      chrome.storage.local.get(['originatingTabId', 'queryParams', 'source'], function ({ originatingTabId, queryParams, source }) {
        let timeout = source === 'NEW_MEETING' ? 0 : 3000;
        setTimeout(function () {
          if (queryParams !== '') {
            chrome.tabs.remove(originatingTabId);
          }
        }, timeout);
      });
    });
  }
});