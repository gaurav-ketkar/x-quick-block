"use strict";

// Tests for background.js: the tab-scope guard, the toggle sequence
// (insertCSS -> executeScript -> sendMessage), and the badge helpers.
// background.js registers its chrome.* listeners at module load time, so
// each test gets its own fresh mock chrome + fresh require via the module
// cache trick below (Node caches by resolved path; we bypass that using
// `delete require.cache` after each load).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.join(__dirname, "..", "background.js");

function makeChromeMock({ insertCSSFails = false, executeScriptFails = false, sendMessageResponse = { active: true }, sendMessageFails = false } = {}) {
  const calls = {
    setBadgeText: [],
    setBadgeBackgroundColor: [],
    insertCSS: [],
    executeScript: [],
    sendMessage: [],
  };
  const listeners = {
    onClicked: [],
    onMessage: [],
    onUpdated: [],
    onRemoved: [],
  };

  const chrome = {
    action: {
      onClicked: { addListener: (fn) => listeners.onClicked.push(fn) },
      setBadgeText: (opts) => calls.setBadgeText.push(opts),
      setBadgeBackgroundColor: (opts) => calls.setBadgeBackgroundColor.push(opts),
    },
    scripting: {
      insertCSS: async (opts) => {
        calls.insertCSS.push(opts);
        if (insertCSSFails) throw new Error("insertCSS failed");
      },
      executeScript: async (opts) => {
        calls.executeScript.push(opts);
        if (executeScriptFails) throw new Error("executeScript failed");
      },
    },
    tabs: {
      sendMessage: async (tabId, message) => {
        calls.sendMessage.push({ tabId, message });
        if (sendMessageFails) throw new Error("sendMessage failed");
        return sendMessageResponse;
      },
      onUpdated: { addListener: (fn) => listeners.onUpdated.push(fn) },
      onRemoved: { addListener: (fn) => listeners.onRemoved.push(fn) },
    },
    runtime: {
      onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
    },
  };

  return { chrome, calls, listeners };
}

function loadBackground(chromeMock) {
  delete require.cache[MODULE_PATH];
  // Keep the mock installed as the global `chrome` for the rest of this
  // test: background.js's registered listeners reference `chrome` at call
  // time (not a captured local), so restoring the previous value here would
  // break any listener invoked after this function returns.
  globalThis.chrome = chromeMock;
  return require(MODULE_PATH);
}

test("isSupportedTab accepts only https x.com / www.x.com", () => {
  const { chrome } = makeChromeMock();
  const { isSupportedTab } = loadBackground(chrome);

  assert.equal(isSupportedTab({ url: "https://x.com/home" }), true);
  assert.equal(isSupportedTab({ url: "https://www.x.com/home" }), true);
  assert.equal(isSupportedTab({ url: "http://x.com/home" }), false, "must require https");
  assert.equal(isSupportedTab({ url: "https://evil.com/x.com" }), false);
  assert.equal(isSupportedTab({ url: "https://m.x.com/home" }), false, "mobile subdomain not in allowlist");
  assert.equal(isSupportedTab({ url: "chrome://extensions" }), false);
  assert.equal(isSupportedTab({ url: "not a url" }), false, "invalid URL must not throw");
  assert.equal(isSupportedTab({}), false, "missing url must not throw");
});

test("toggle refuses unsupported tabs without touching scripting APIs", async () => {
  const { chrome, calls } = makeChromeMock();
  const { toggle } = loadBackground(chrome);

  const result = await toggle({ id: 7, url: "https://example.com/" });
  assert.deepEqual(result, { ok: false, active: false });
  assert.equal(calls.insertCSS.length, 0);
  assert.equal(calls.executeScript.length, 0);
  assert.equal(calls.sendMessage.length, 0);
});

test("toggle drives insertCSS -> executeScript -> sendMessage and reports active state", async () => {
  const { chrome, calls } = makeChromeMock({ sendMessageResponse: { active: true } });
  const { toggle } = loadBackground(chrome);

  const result = await toggle({ id: 42, url: "https://x.com/home" });
  assert.deepEqual(result, { ok: true, active: true });
  assert.equal(calls.insertCSS.length, 1);
  assert.equal(calls.insertCSS[0].target.tabId, 42);
  assert.equal(calls.executeScript.length, 1);
  assert.equal(calls.executeScript[0].target.tabId, 42);
  assert.equal(calls.sendMessage.length, 1);
  assert.deepEqual(calls.sendMessage[0], { tabId: 42, message: { type: "xqb:toggle" } });
});

test("toggle tolerates insertCSS failing (already-injected sheet) and still proceeds", async () => {
  const { chrome, calls } = makeChromeMock({ insertCSSFails: true, sendMessageResponse: { active: false } });
  const { toggle } = loadBackground(chrome);

  const result = await toggle({ id: 5, url: "https://x.com/home" });
  assert.deepEqual(result, { ok: true, active: false });
  assert.equal(calls.executeScript.length, 1, "executeScript still runs after insertCSS failure");
});

test("toggle reports failure when executeScript rejects (e.g. restricted page)", async () => {
  const { chrome, calls } = makeChromeMock({ executeScriptFails: true });
  const { toggle } = loadBackground(chrome);

  const result = await toggle({ id: 5, url: "https://x.com/home" });
  assert.deepEqual(result, { ok: false, active: false });
  assert.equal(calls.sendMessage.length, 0, "must not message a tab it couldn't inject into");
});

test("toggle reports failure when the content script can't be reached", async () => {
  const { chrome } = makeChromeMock({ sendMessageFails: true });
  const { toggle } = loadBackground(chrome);

  const result = await toggle({ id: 5, url: "https://x.com/home" });
  assert.deepEqual(result, { ok: false, active: false });
});

test("setBadge reflects active state with distinct text/color", () => {
  const { chrome, calls } = makeChromeMock();
  const { setBadge } = loadBackground(chrome);

  setBadge(9, true);
  assert.deepEqual(calls.setBadgeText[0], { tabId: 9, text: "ON" });
  assert.equal(calls.setBadgeBackgroundColor[0].tabId, 9);

  setBadge(9, false);
  assert.deepEqual(calls.setBadgeText[1], { tabId: 9, text: "" });
});

test("action.onClicked listener toggles and updates the badge for that tab", async () => {
  const { chrome, calls, listeners } = makeChromeMock({ sendMessageResponse: { active: true } });
  loadBackground(chrome);

  assert.equal(listeners.onClicked.length, 1);
  await listeners.onClicked[0]({ id: 3, url: "https://x.com/home" });
  assert.deepEqual(calls.setBadgeText[calls.setBadgeText.length - 1], { tabId: 3, text: "ON" });
});

test("runtime.onMessage listener updates the sender tab's badge on xqb:setBadge", () => {
  const { chrome, calls, listeners } = makeChromeMock();
  loadBackground(chrome);

  assert.equal(listeners.onMessage.length, 1);
  listeners.onMessage[0]({ type: "xqb:setBadge", active: true }, { tab: { id: 11 } });
  assert.deepEqual(calls.setBadgeText[calls.setBadgeText.length - 1], { tabId: 11, text: "ON" });

  listeners.onMessage[0]({ type: "xqb:setBadge", active: false }, { tab: { id: 11 } });
  assert.deepEqual(calls.setBadgeText[calls.setBadgeText.length - 1], { tabId: 11, text: "" });

  // Messages without a sender tab, or of a different type, must not throw
  // or touch the badge.
  const before = calls.setBadgeText.length;
  listeners.onMessage[0]({ type: "xqb:setBadge", active: true }, {});
  listeners.onMessage[0]({ type: "other" }, { tab: { id: 11 } });
  assert.equal(calls.setBadgeText.length, before);
});

test("tabs.onUpdated listener clears the badge once a supported page finishes loading", () => {
  const { chrome, calls, listeners } = makeChromeMock();
  loadBackground(chrome);

  assert.equal(listeners.onUpdated.length, 1);
  listeners.onUpdated[0](21, { status: "complete", url: "https://x.com/home" });
  assert.deepEqual(calls.setBadgeText[calls.setBadgeText.length - 1], { tabId: 21, text: "" });

  // A same-tab in-page navigation to an unsupported URL should also clear
  // (mode can't have survived it either way).
  const before = calls.setBadgeText.length;
  listeners.onUpdated[0](22, { status: "loading", url: "https://x.com/home" });
  assert.equal(calls.setBadgeText.length, before, "non-complete updates are ignored");
});

test("tabs.onRemoved listener clears the badge as a safety net", () => {
  const { chrome, calls, listeners } = makeChromeMock();
  loadBackground(chrome);

  assert.equal(listeners.onRemoved.length, 1);
  listeners.onRemoved[0](99);
  assert.deepEqual(calls.setBadgeText[calls.setBadgeText.length - 1], { tabId: 99, text: "" });
});
