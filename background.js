"use strict";

// Background service worker: toggles Block mode on the current tab.
// Only two permissions are used (activeTab + scripting): the extension
// gains tab access solely when the user clicks the toolbar action.

const SUPPORTED_HOSTS = new Set(["x.com", "www.x.com"]);

function isSupportedTab(tab) {
  try {
    const url = new URL(tab.url);
    return url.protocol === "https:" && SUPPORTED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function setBadge(tabId, active) {
  chrome.action.setBadgeText({ tabId, text: active ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: active ? "#1d9bf0" : "#8899a6",
  });
}

async function toggle(tab) {
  if (!isSupportedTab(tab) || tab.id == null) {
    return { ok: false, active: false };
  }
  try {
    // Re-insertion is idempotent; Chrome keeps the sheet if already loaded.
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["styles.css"],
    });
  } catch {
    /* ignore: CSS may already be present */
  }

  try {
    // content.js is idempotent (guarded by window.__xQuickBlock).
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch {
    return { ok: false, active: false };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "xqb:toggle" });
    return { ok: true, active: Boolean(response && response.active) };
  } catch {
    return { ok: false, active: false };
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const result = await toggle(tab);
  if (tab.id != null) setBadge(tab.id, Boolean(result.active));
});

// Content script pushes state changes (e.g. after a full reload, mode is off).
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "xqb:setBadge") {
    if (sender.tab && sender.tab.id != null) {
      setBadge(sender.tab.id, Boolean(message.active));
    }
  }
});

// Mode is per-tab and per-page-load: a full reload resets it, so clear the
// badge on that tab once the fresh document has loaded.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    let shouldClear = false;
    if (changeInfo.url) {
      try {
        shouldClear = isSupportedTab({ url: changeInfo.url });
      } catch {
        shouldClear = false;
      }
    } else {
      shouldClear = true;
    }
    if (shouldClear) setBadge(tabId, false);
  }
});

// Safety net: if the tab closes before the content script reports, drop badge.
chrome.tabs.onRemoved.addListener((tabId) => {
  setBadge(tabId, false);
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isSupportedTab, toggle, setBadge };
}
