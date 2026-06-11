/*
  Javascript that is injected into active tab.
  Returns the DOM of the window's contents
*/
"use strict";

var parseResults = { 
    messageType: "ParseResults",
    document: document.all[0].outerHTML,
  url: document.URL,
  authStorage: null
};
try {
  parseResults.authStorage = window.localStorage.getItem("auth-storage");
} catch (error) {
  // Ignore storage access errors and continue
}
chrome.runtime.sendMessage(parseResults);
