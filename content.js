"use strict";

/**
 * X Quick Block — content script.
 *
 * While Block mode is active in this tab:
 *  - adds a "Block @handle" button to every tweet (existing + newly loaded),
 *  - one click drives X's own menu → Block command → confirmation dialog,
 *  - refuses to submit unless the dialog names the intended account,
 *  - never blocks while another block is in flight.
 *
 * Deactivation removes only the extension's UI. Turning it off never unblocks
 * anyone and never retracts a block that was already submitted.
 *
 * The file is an idempotent IIFE; repeated injection is a no-op.
 */
(() => {
  if (window.__xQuickBlockState !== undefined) return; // already installed
  window.__xQuickBlockState = true;

  // ---- configurable timeouts (tests may shrink these before first use) ----
  const T = window.__xQBTest === undefined ? null : window.__xQBTest;
  const MENU_TIMEOUT_MS = T ? T.menu : 4000;
  const DIALOG_TIMEOUT_MS = T ? T.dialog : 5000;
  const EVIDENCE_TIMEOUT_MS = T ? T.evidence : 6000;
  const POLL_STEP_MS = T ? T.step : 80;

  const BUTTON_ATTR = "data-xqb-block";
  const HANDLE_RE = /^\/([A-Za-z0-9_]{1,30})\/?$/;
  // X reserves these top-level paths; a match here is a site route, not a
  // profile handle, even though it fits the handle character pattern.
  const RESERVED_PATHS = new Set([
    "home", "explore", "notifications", "messages", "i", "compose",
    "settings", "search", "hashtag", "intent", "tos", "privacy", "rules",
    "account", "download", "jobs", "about", "login", "logout", "signup",
    "oauth", "share", "premium", "topics", "communities", "lists",
    "bookmarks", "connect_people", "personalization", "help",
  ]);

  const state = {
    active: false,
    busy: false,
    scanTimer: null,
    toastTimer: null,
    blocked: new Map(), // handle -> "confirmed" (per-page memory)
    observer: null,
  };

  // ---- small DOM helpers ---------------------------------------------------

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function all(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function first(selector, root) {
    // Note: use querySelectorAll()[0] rather than querySelector() here.
    // Some environments (including jsdom) have shown querySelector to match
    // attribute-value selectors case-insensitively while querySelectorAll
    // matches correctly; querySelectorAll()[0] is spec-equivalent (first
    // match in document order) and avoids relying on the buggy path.
    return (root || document).querySelectorAll(selector)[0] || null;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    let computed;
    try {
      computed = getComputedStyle(el);
    } catch {
      computed = null;
    }
    if (
      computed &&
      (computed.display === "none" ||
        computed.visibility === "hidden" ||
        computed.visibility === "collapse")
    ) {
      return false;
    }
    return true;
  }

  async function waitFor(check, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = check();
      if (found) return found;
      if (Date.now() >= deadline) return null;
      await sleep(POLL_STEP_MS);
    }
  }

  function pressEscape() {
    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    } catch {
      // Ignore: best-effort cleanup of any open surface.
    }
  }

  // ---- author identification ----------------------------------------------

  /** Extract a bare handle from a same-site profile anchor href. */
  function handleFrom(anchor) {
    try {
      const raw = anchor && anchor.getAttribute ? anchor.getAttribute("href") : null;
      if (!raw || !raw.startsWith("/")) return null;
      const pathname = raw.split("?")[0].split("#")[0];
      const match = HANDLE_RE.exec(pathname);
      if (!match) return null;
      const handle = match[1].toLowerCase();
      if (RESERVED_PATHS.has(handle)) return null;
      return handle;
    } catch {
      return null;
    }
  }

  function isInsideQuote(anchor) {
    return Boolean(anchor && anchor.closest && anchor.closest("[data-testid='quote'],[data-testid='quote-tweet']"));
  }

  /**
   * The account a block from this tweet would affect.
   *
   * X's tweet header links the *author of the post body*. For a repost that
   * is the original author (the correct block target); embedded quoted posts
   * are excluded, as are hashtags, search links, and subpaths such as
   * /handle/with_replies.
   */
  function articleAuthor(article) {
    if (!article) return null;
    // 1) Avatar link is explicitly marked by X.
    const avatarLink = first("[data-testid='UserAvatar'] a[href]", article);
    if (avatarLink) {
      const handle = handleFrom(avatarLink);
      if (handle) return handle;
    }
    // 2) Fall back to the first clean profile link outside the quoted block.
    const anchors = all("a[href^='/']", article);
    for (const anchor of anchors) {
      if (isInsideQuote(anchor)) continue;
      const handle = handleFrom(anchor);
      if (handle) return handle;
    }
    return null;
  }

  function findTweets() {
    return all("article[data-testid='tweet']").filter((article) =>
      article.isConnected
    );
  }

  // ---- injected UI ----------------------------------------------------------

  function makeBlockButton(handle) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(BUTTON_ATTR, handle);
    button.classList.add("xqb-btn");
    button.textContent = "Block @" + handle;
    button.setAttribute("aria-label", "Block @" + handle + " (X Quick Block)");
    button.addEventListener("click", () => {
      onBlockClick(handle, button);
    });
    return button;
  }

  function findTweetControl(article, selectors) {
    for (const selector of selectors) {
      for (const candidate of all(selector, article)) {
        const control = candidate.closest("button,[role='button']");
        if (!control || control.closest("article[data-testid='tweet']") !== article ||
            isInsideQuote(control)) continue;
        let visible = true;
        for (let node = control; node; node = node.parentElement) {
          if (node.hidden || node.getAttribute("aria-hidden") === "true" || !isVisible(node)) {
            visible = false;
            break;
          }
        }
        if (visible && !control.disabled && control.getAttribute("aria-disabled") !== "true") {
          return control;
        }
      }
    }
    return null;
  }

  // Placement and blocking must recognize the same overflow-menu controls.
  function findMoreButton(article) {
    return findTweetControl(article, [
      "[data-testid='caret']",
      "[data-testid='more']",
      "button[aria-label='More' i],[role='button'][aria-label='More' i]",
    ]);
  }

  /** Attach beside a known control, never fall back to the article root. */
  function findAnchor(article) {
    return findMoreButton(article) || findTweetControl(article, [
      "[data-testid='reply']", "[data-testid='like']",
      "[data-testid='retweet']", "[data-testid='share']",
    ]);
  }

  /** Idempotently add a button to each tweet that can get one. */
  function ensureButtons(tweets) {
    for (const article of tweets) {
      if (!article.isConnected) continue;
      if (first("button[" + BUTTON_ATTR + "]", article)) continue;
      const handle = articleAuthor(article);
      if (!handle) continue;
      const anchor = findAnchor(article);
      if (!anchor) continue; // no safe row to attach to; skip rather than risk a broken layout
      const button = makeBlockButton(handle);
      anchor.parentElement.insertBefore(button, anchor);
    }
  }

  function setButtonsBusy(busy) {
    for (const button of all("button[" + BUTTON_ATTR + "]")) {
      button.disabled = busy;
    }
  }

  function markHandleBlocked(handle) {
    for (const button of all("button[" + BUTTON_ATTR + "]")) {
      if (button.getAttribute(BUTTON_ATTR) === handle) {
        button.textContent = "Blocked @" + handle;
        button.classList.add("xqb-done");
        button.disabled = true;
      }
    }
  }

  function showToast(message, isError) {
    const existing = first("[data-xqb-toast]");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.setAttribute("data-xqb-toast", "");
    toast.setAttribute("role", "status");
    toast.className = isError ? "xqb-toast xqb-toast-error" : "xqb-toast";
    toast.textContent = message;
    (document.body || document.documentElement).appendChild(toast);
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.remove(), 6000);
  }

  // ---- the block flow --------------------------------------------------------

  /**
   * Drive X's own controls to block `requestedHandle`, re-verifying the
   * target at every step. Returns:
   *   { status: "confirmed" }                       -> blocked, verified
   *   { status: "uncertain", message }              -> submit happened, proof didn't
   *   { status: "failed", message }                 -> submit did not happen
   */
  async function performBlock(requestedHandle, button) {
    const article = button && button.closest ? button.closest("article[data-testid='tweet']") : null;
    if (!article || !article.isConnected) {
      return { status: "failed", message: "That tweet has moved. Try again." };
    }

    // 1) Re-verify the visible author right now (guard against recycled nodes).
    const freshHandle = articleAuthor(article);
    if (!freshHandle || freshHandle !== requestedHandle) {
      return {
        status: "failed",
        message: "Stopped — the tweet's author changed. Nothing was blocked.",
      };
    }

    // 2) Open the tweet's overflow menu.
    const more = findMoreButton(article);
    if (!more) {
      return { status: "failed", message: "Couldn't find X's 'more' menu on this tweet." };
    }
    more.click();

    // 3) Find the Block menu item (X-specific testid first, text as fallback).
    const menuItem = await waitFor(() => {
      const byTestId = first("[data-testid='blockUser']");
      if (byTestId && isVisible(byTestId)) return byTestId;
      const items = all("[role='menuitem']");
      const byText = items.find((item) => {
        const text = (item.textContent || "").replace(/[^\p{L}\p{N}@ ]/gu, " ").replace(/\s+/g, " ").trim();
        return /^block\b/i.test(text);
      });
      return byText && isVisible(byText) ? byText : null;
    }, MENU_TIMEOUT_MS);
    if (!menuItem) {
      pressEscape();
      return { status: "failed", message: "X's Block menu item never appeared. Nothing was blocked." };
    }
    // 4) Safety: the menu item must be near/within a menu opened for this tweet.
    if (!isVisible(menuItem)) {
      return { status: "failed", message: "Menu state changed. Nothing was blocked." };
    }
    const existingDialogs = new Set(all("[role='dialog'],[role='alertdialog']"));
    menuItem.click();

    // X also uses its shared confirmation sheet, not just BlockUser.
    const confirmation = await waitFor(() => {
      for (const confirm of all("[data-testid='BlockUser'],[data-testid='confirmationSheetConfirm']")) {
        const dialog = confirm.closest("[role='dialog'],[role='alertdialog']");
        if (!dialog || existingDialogs.has(dialog) || !isVisible(dialog) ||
            !isVisible(confirm) || confirm.disabled ||
            confirm.getAttribute("aria-disabled") === "true") continue;
        return { dialog, confirm };
      }
      return null;
    }, DIALOG_TIMEOUT_MS);
    if (!confirmation) {
      pressEscape();
      return { status: "failed", message: "X's Block dialog never appeared. Nothing was blocked." };
    }
    const { dialog, confirm } = confirmation;

    // 6) Identity check: the dialog must name the intended account before
    //    we touch the confirm button. This is the load-bearing safety net.
    const dialogText = (dialog.innerText || dialog.textContent || "").toLowerCase();
    const namedHandles = dialogText.match(/@[a-z0-9_]+/g) || [];
    if (!namedHandles.includes("@" + requestedHandle)) {
      pressEscape();
      return {
        status: "failed",
        message: "Stopped — X's dialog doesn't name @" + requestedHandle + ". Nothing was blocked.",
      };
    }

    // 7) Submit.
    if (!confirm.isConnected || !dialog.contains(confirm)) {
      pressEscape();
      return { status: "failed", message: "Confirm button disappeared. Block may not have been submitted." };
    }
    confirm.click();

    // 8) Look for a "blocked" proof on the page. X shows a blocked state on
    //    the author row (undoable chip) after a successful block.
    const proved = await waitFor(() => {
      const chip = first("[data-testid='blockUserUndoable']");
      return Boolean(chip && isVisible(chip));
    }, EVIDENCE_TIMEOUT_MS);

    if (proved) {
      return { status: "confirmed" };
    }
    return {
      status: "uncertain",
      message: "Block was submitted but X didn't confirm it on this page. Check their profile.",
    };
  }

  async function onBlockClick(handle, button) {
    if (!state.active) return;
    if (state.busy) {
      showToast("One at a time — still working.", false);
      return;
    }
    state.busy = true;
    setButtonsBusy(true);
    let outcome;
    try {
      outcome = await performBlock(handle, button);
    } catch (err) {
      outcome = { status: "failed", message: "Something went wrong. Nothing confirmed." };
    }
    state.busy = false;
    setButtonsBusy(false);

    if (outcome.status === "confirmed") {
      state.blocked.set(handle, "confirmed");
      markHandleBlocked(handle);
      showToast("Blocked @" + handle, false);
    } else {
      showToast(outcome.message, true);
    }
  }

  // ---- lifecycle --------------------------------------------------------------

  function scheduleScan() {
    if (!state.active || state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (!state.active) return;
      ensureButtons(findTweets());
    }, 60);
  }

  function start() {
    if (state.active) return;
    state.active = true;
    ensureButtons(findTweets());
    if (typeof MutationObserver === "function" && document.body) {
      state.observer = new MutationObserver(scheduleScan);
      state.observer.observe(document.body, { childList: true, subtree: true });
    }
    notifyBadge(state.active);
  }

  function stop() {
    if (!state.active) return;
    state.active = false;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.scanTimer) {
      clearTimeout(state.scanTimer);
      state.scanTimer = null;
    }
    // Remove only what the extension injected.
    for (const el of all("[" + BUTTON_ATTR + "],[data-xqb-toast]")) {
      el.remove();
    }
    notifyBadge(state.active);
  }

  function notifyBadge(active) {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.sendMessage === "function"
      ) {
        chrome.runtime.sendMessage({ type: "xqb:setBadge", active: Boolean(active) });
      }
    } catch {
      // Runtime context may be gone during a reload; harmless.
    }
  }

  function handleRuntimeMessage(message) {
    if (!message || message.type !== "xqb:toggle") return undefined;
    if (state.active) stop();
    else start();
    return { active: state.active };
  }

  // Export surface for the page context (used by the IIFE below and by tests).
  const api = {
    state,
    start,
    stop,
    findTweets,
    articleAuthor,
    ensureButtons,
    performBlock,
    onBlockClick,
    handleRuntimeMessage,
    handleFrom,
    isVisible,
    waitFor,
  };
  window.__xQB = api;

  // Only register a runtime listener when we really are running as a content
  // script in a browser (not under plain Node/jsdom harness).
  try {
    const onMessage =
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.onMessage;
    if (onMessage && typeof onMessage.addListener === "function") {
      onMessage.addListener((message, _sender, sendResponse) => {
        const response = api.handleRuntimeMessage(message);
        if (response !== undefined) sendResponse(response);
      });
    }
  } catch {
    // No runtime in this context; headless/test use only.
  }
})();
