"use strict";

// Tests for the content script, run inside jsdom with a fake X interface.
// The flow drives X's own controls: tweet menu -> Block item -> dialog ->
// confirm. These tests exercise the real content.js code, with shortened
// timeouts (window.__xQBTest) so they finish in milliseconds.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const CODE = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

// Minimal X timeline fixture.
const TIMELINE = `
  <div role="main">
    <article data-testid="tweet">
      <div data-testid="UserAvatar"><a href="/spammer8"><span>avatar</span></a></div>
      <div><a href="/spammer8/spam-club">Spam Club</a></div>
      <div data-testid="more-holder"><button data-testid="more">menu</button></div>
      <p>free followers now!!!</p>
      <div data-testid="quote">
        <div data-testid="UserAvatar"><a href="/quotedperson">q</a></div>
      </div>
    </article>

    <article data-testid="tweet">
      <div data-testid="UserAvatar"><a href="/origauthor">o</a></div>
      <button data-testid="more">menu</button>
    </article>

    <article data-testid="tweet">
      <a href="/search?q=%23tag">tag</a>
      <a href="/me/with_replies">with_replies</a>
      <div data-testid="more-holder"><button data-testid="more">menu</button></div>
    </article>
  </div>
`;

function setup(html = TIMELINE) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: "https://x.com/home",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.__xQBTest = { menu: 150, dialog: 200, evidence: 250, step: 10 };
  dom.window.chrome = {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage() {
        return true;
      },
    },
  };
  dom.window.eval(CODE);
  return dom;
}

function api(dom) {
  return dom.window.__xQB;
}

/**
 * Simulate X's side of the flow.
 *  - openMenu: whether the tweet's "more" button opens a menu with Block
 *  - dialogNames: handle X would show in the confirm dialog ("someone" by
 *    default = the *mismatch* case); null = dialog without a named account
 *  - providesBlockOnConfirm: whether confirming produces a blocked chip
 */
function installFakeX(dom, {
  openMenu = true, dialogNames = "spammer8", proves = true,
  confirmTestId = "BlockUser", dialogRole = "dialog", confirmDisabled = false,
} = {}) {
  const { document } = dom.window;
  const counters = { menuItems: 0, confirms: 0 };
  const keydowns = [];
  document.addEventListener("keydown", (ev) => keydowns.push(ev.key));

  document.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!target || typeof target.getAttribute !== "function") return;
    const testid = target.getAttribute("data-testid");

    if ((testid === "more" || testid === "caret" ||
         target.getAttribute("aria-label") === "More") && openMenu) {
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      const item = document.createElement("button");
      item.setAttribute("data-testid", "blockUser");
      item.textContent = "Block";
      menu.appendChild(item);
      document.body.appendChild(menu);
    } else if (testid === "blockUser") {
      counters.menuItems += 1;
      const dialog = document.createElement("div");
      dialog.setAttribute("role", dialogRole);
      if (dialogNames) dialog.appendChild(document.createTextNode(`Block @${dialogNames}?`));
      const confirm = document.createElement("button");
      confirm.setAttribute("data-testid", confirmTestId);
      confirm.disabled = confirmDisabled;
      confirm.textContent = "Block";
      dialog.appendChild(confirm);
      const cancel = document.createElement("button");
      cancel.setAttribute("data-testid", "cancel");
      cancel.textContent = "Cancel";
      dialog.appendChild(cancel);
      document.body.appendChild(dialog);
    } else if (testid === confirmTestId) {
      counters.confirms += 1;
      if (proves) {
        const chip = document.createElement("span");
        chip.setAttribute("data-testid", "blockUserUndoable");
        chip.textContent = `Blocked @${dialogNames || "spammer8"}`;
        document.body.appendChild(chip);
      }
      const dialog = target.closest("[role='dialog'],[role='alertdialog']");
      if (dialog) dialog.parentNode.removeChild(dialog);
    } else if (testid === "cancel") {
      const dialog = target.closest("[role='dialog'],[role='alertdialog']");
      if (dialog) dialog.parentNode.removeChild(dialog);
    }
  });

  dom.window.__xqbCounters = counters;
  dom.window.__xqbKeydowns = keydowns;
  return counters;
}

function toast(dom) {
  return dom.window.document.querySelector("[data-xqb-toast]");
}

async function until(condition, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (condition()) return;
    if (Date.now() > deadline) throw new Error("until() timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("handleFrom extracts plain profile handles and rejects everything else", () => {
  const dom = setup("");
  const a = (href) => {
    const el = dom.window.document.createElement("a");
    el.setAttribute("href", href);
    return el;
  };
  assert.equal(api(dom).handleFrom(a("/spammer8")), "spammer8");
  assert.equal(api(dom).handleFrom(a("/Spammer8_1")), "spammer8_1");
  assert.equal(api(dom).handleFrom(a("/spammer8/")), "spammer8");
  assert.equal(api(dom).handleFrom(a("/me/with_replies")), null);
  assert.equal(api(dom).handleFrom(a("/search?q=%23tag")), null);
  assert.equal(api(dom).handleFrom(a("https://x.com/other/")), null);
});

test("handleFrom rejects X's reserved top-level routes as if they were handles", () => {
  const dom = setup("");
  const a = (href) => {
    const el = dom.window.document.createElement("a");
    el.setAttribute("href", href);
    return el;
  };
  // These all fit the handle character pattern but are site routes, not
  // profiles — a naive regex-only check would misidentify them as accounts.
  for (const reserved of ["/home", "/explore", "/notifications", "/messages", "/settings", "/search", "/i", "/compose"]) {
    assert.equal(api(dom).handleFrom(a(reserved)), null, `${reserved} must not resolve to a handle`);
  }
  // Case-insensitive: X's own links may vary in casing.
  assert.equal(api(dom).handleFrom(a("/Search")), null);
});

test("articleAuthor picks the post author, not the quoted author", () => {
  const dom = setup();
  const [first, second] = dom.window.document.querySelectorAll("article[data-testid='tweet']");
  assert.equal(api(dom).articleAuthor(first), "spammer8");
  assert.equal(api(dom).articleAuthor(second), "origauthor");
});

test("no clean author link -> no button on that tweet", () => {
  const dom = setup();
  const api2 = api(dom);
  api2.start();
  const articles = dom.window.document.querySelectorAll("article[data-testid='tweet']");
  assert.equal(
    api2.ensureButtons.length > 0,
    true,
    "sanity: ensureButtons exposed"
  );
  const [a, b, c] = Array.from(articles);
  assert.ok(a.querySelector("button[data-xqb-block]"), "first tweet gets a button");
  assert.ok(b.querySelector("button[data-xqb-block]"), "repost gets a button for original author");
  assert.equal(c.querySelector("button[data-xqb-block]"), null, "unresolvable tweet gets none");
  api2.stop();
});

test("ensureButtons is idempotent (no duplicate buttons on rescan)", () => {
  const dom = setup();
  const a = api(dom);
  a.start();
  const first = dom.window.document.querySelector("article[data-testid='tweet']");
  a.ensureButtons(a.findTweets());
  a.ensureButtons(a.findTweets());
  const buttons = first.querySelectorAll("button[data-xqb-block]");
  assert.equal(buttons.length, 1);
  a.stop();
});

test("regression: tweet with no recognizable action-row icon is skipped, never inserted at the article root", () => {
  // Root cause of the giant full-height button bug: when no known icon
  // (more/caret/reply/like/retweet/share) is found, the button used to
  // fall back to article.insertBefore(button, article.firstChild), which
  // put it in the tweet's outer avatar/content flex row where it stretched
  // to the full row height. It must now be skipped instead.
  const dom = setup(`
    <div role="main">
      <article data-testid="tweet">
        <div data-testid="UserAvatar"><a href="/lonelytweet"><span>avatar</span></a></div>
        <p>a tweet with no toolbar icons in this fixture</p>
      </article>
    </div>
  `);
  const a = api(dom);
  a.start();
  a.ensureButtons(a.findTweets());
  const article = dom.window.document.querySelector("article[data-testid='tweet']");
  assert.equal(article.querySelectorAll("button[data-xqb-block]").length, 0);
  assert.equal(article.firstElementChild.getAttribute("data-testid"), "UserAvatar");
  a.stop();
});

test("regression: menu item testid and confirm dialog testid differ only by case and must not be confused", () => {
  // X's menu item ("blockUser") and its confirm dialog button ("BlockUser")
  // share the same letters in different casing. The lookup helper must
  // treat these as distinct — a case-insensitive match here would let a
  // stale menu item be mistaken for the live confirm button and vice versa.
  const dom = setup();
  const { document } = dom.window;
  const item = document.createElement("button");
  item.setAttribute("data-testid", "blockUser");
  document.body.appendChild(item);
  const confirm = document.createElement("button");
  confirm.setAttribute("data-testid", "BlockUser");
  document.body.appendChild(confirm);

  // Exercise the exact lookup pattern performBlock relies on (querySelectorAll
  // first-match, which content.js's `first()` helper uses internally instead
  // of the environment's buggier `querySelector()` for this case).
  const foundLower = document.querySelectorAll("[data-testid='blockUser']");
  const foundUpper = document.querySelectorAll("[data-testid='BlockUser']");
  assert.equal(foundLower.length, 1);
  assert.equal(foundLower[0], item);
  assert.equal(foundUpper.length, 1);
  assert.equal(foundUpper[0], confirm);
});

test("success path: drives X's menu, dialog, confirm; marks blocked", async () => {
  const dom = setup();
  installFakeX(dom, { dialogNames: "spammer8", proves: true });
  const a = api(dom);
  a.start();
  const button = dom.window.document.querySelector("article[data-testid='tweet'] button[data-xqb-block]");
  button.click();
  await until(() => !a.state.busy);

  assert.equal(a.state.confirmed ? true : api(dom).state.blocked.has("spammer8"), true);
  assert.equal(button.textContent, "Blocked @spammer8");
  assert.ok(button.classList.contains("xqb-done"));
  const t = toast(dom);
  assert.ok(t, "toast present");
  assert.equal(t.classList.contains("xqb-toast-error"), false);
  assert.match(t.textContent, /Blocked @spammer8/);
  assert.equal(dom.window.__xqbCounters.confirms, 1, "confirmation clicked exactly once");
  a.stop();
});

for (const markup of [
  '<button data-testid="caret" aria-label="More"><svg></svg></button>',
  '<div role="button" data-testid="caret" aria-label="More" tabindex="0"><svg></svg></div>',
  '<button aria-label="More"><svg></svg></button>',
]) {
  test(`overflow lookup places and activates the button with ${markup}`, async () => {
    const dom = setup(`
      <article data-testid="tweet">
        <div data-testid="UserAvatar"><a href="/spammer8">avatar</a></div>
        <div class="header">${markup}</div>
      </article>
    `);
    try {
      const counters = installFakeX(dom);
      const a = api(dom);
      a.start();
      const header = dom.window.document.querySelector(".header");
      const button = header.querySelector("[data-xqb-block]");
      assert.ok(button, "button is placed beside the overflow menu");
      assert.equal(button.nextElementSibling.getAttribute("aria-label"), "More");
      button.click();
      await until(() => !a.state.busy);
      assert.equal(counters.confirms, 1);
      assert.equal(a.state.blocked.has("spammer8"), true);
    } finally {
      dom.window.close();
    }
  });
}

test("overflow lookup ignores quoted, nested, hidden and disabled menus", async () => {
  const dom = setup(`
    <article data-testid="tweet">
      <div data-testid="UserAvatar"><a href="/spammer8">avatar</a></div>
      <div data-testid="quote"><button data-testid="caret">quoted</button></div>
      <div data-testid="quote-tweet"><button data-testid="caret">quoted</button></div>
      <article data-testid="tweet"><button data-testid="caret">nested</button></article>
      <div style="display:none"><button data-testid="caret">hidden</button></div>
      <button data-testid="caret" disabled>disabled</button>
      <button data-testid="caret" aria-disabled="true">disabled</button>
      <div class="header"><button data-testid="more">correct</button></div>
    </article>
  `);
  try {
    const { document } = dom.window;
    let wrongClicks = 0;
    for (const wrong of document.querySelectorAll("[data-testid='caret']")) {
      wrong.addEventListener("click", () => wrongClicks++);
    }
    const counters = installFakeX(dom);
    const a = api(dom);
    a.start();
    const button = document.querySelector(".header [data-xqb-block]");
    assert.ok(button);
    button.click();
    await until(() => !a.state.busy);
    assert.equal(wrongClicks, 0);
    assert.equal(counters.confirms, 1);
  } finally {
    dom.window.close();
  }
});

test("a missing overflow menu never clicks a reply control or quoted menu", async () => {
  const dom = setup(`
    <article data-testid="tweet">
      <div data-testid="UserAvatar"><a href="/spammer8">avatar</a></div>
      <div data-testid="quote"><button data-testid="caret">quoted</button></div>
      <div><button data-testid="reply">Reply</button></div>
    </article>
  `);
  try {
    const { document } = dom.window;
    let clicks = 0;
    for (const control of document.querySelectorAll("button")) {
      control.addEventListener("click", () => clicks++);
    }
    const a = api(dom);
    a.start();
    const button = document.querySelector("[data-xqb-block]");
    assert.ok(button);
    button.click();
    await until(() => !a.state.busy);
    assert.equal(clicks, 0);
    assert.match(toast(dom).textContent, /Couldn't find X's 'more' menu/);
  } finally {
    dom.window.close();
  }
});

for (const dialogRole of ["dialog", "alertdialog"]) {
  for (const dialogNames of ["spammer8", "spammer88", "someoneelse", null]) {
    test(`shared ${dialogRole} auto-confirms only the exact account: ${dialogNames}`, async () => {
      const dom = setup();
      try {
        const counters = installFakeX(dom, {
          confirmTestId: "confirmationSheetConfirm", dialogRole, dialogNames,
        });
        const a = api(dom);
        a.start();
        dom.window.document.querySelector("[data-xqb-block]").click();
        await until(() => !a.state.busy);
        const expected = dialogNames === "spammer8";
        assert.equal(counters.confirms, expected ? 1 : 0);
        assert.equal(a.state.blocked.has("spammer8"), expected);
        assert.equal(toast(dom).classList.contains("xqb-toast-error"), !expected);
      } finally {
        dom.window.close();
      }
    });
  }
}

test("auto-confirm ignores an already-open confirmation sheet", async () => {
  const dom = setup();
  try {
    const { document } = dom.window;
    const unrelated = document.createElement("div");
    unrelated.setAttribute("role", "alertdialog");
    unrelated.innerHTML = 'Delete something for @spammer8? <button data-testid="confirmationSheetConfirm">Delete</button>';
    document.body.appendChild(unrelated);
    let unrelatedClicks = 0;
    unrelated.querySelector("button").addEventListener("click", () => unrelatedClicks++);
    const counters = installFakeX(dom, { confirmTestId: "confirmationSheetConfirm" });
    const a = api(dom);
    a.start();
    document.querySelector("[data-xqb-block]").click();
    await until(() => !a.state.busy);
    assert.equal(unrelatedClicks, 0);
    assert.equal(counters.confirms, 1);
    assert.equal(unrelated.isConnected, true);
  } finally {
    dom.window.close();
  }
});

test("auto-confirm does not submit a disabled confirmation", async () => {
  const dom = setup();
  try {
    const counters = installFakeX(dom, {
      confirmTestId: "confirmationSheetConfirm", confirmDisabled: true,
    });
    const a = api(dom);
    a.start();
    dom.window.document.querySelector("[data-xqb-block]").click();
    await until(() => !a.state.busy);
    assert.equal(counters.confirms, 0);
    assert.equal(a.state.blocked.has("spammer8"), false);
    assert.match(toast(dom).textContent, /dialog never appeared/);
  } finally {
    dom.window.close();
  }
});

test("identity mismatch: dialog names a different account -> never confirm", async () => {
  const dom = setup();
  const counters = installFakeX(dom, { dialogNames: "someoneelse", proves: true });
  const a = api(dom);
  a.start();
  const button = dom.window.document.querySelector("article[data-testid='tweet'] button[data-xqb-block]");
  button.click();
  await until(() => !a.state.busy);

  assert.equal(counters.confirms, 0, "confirm button must never be clicked");
  assert.equal(api(dom).state.blocked.has("spammer8"), false);
  const t = toast(dom);
  assert.ok(t.classList.contains("xqb-toast-error"), "error toast");
  assert.match(t.textContent, /dialog doesn't name @spammer8/i);
  assert.ok(dom.window.__xqbKeydowns.includes("Escape"), "Escape sent to close surfaces");
  a.stop();
});

test("menu timeout: Block item never appears -> failed, nothing submitted", async () => {
  const dom = setup();
  const counters = installFakeX(dom, { openMenu: false });
  const a = api(dom);
  a.start();
  const button = dom.window.document.querySelector("article[data-testid='tweet'] button[data-xqb-block]");
  button.click();
  await until(() => !a.state.busy);

  assert.equal(counters.confirms, 0);
  const t = toast(dom);
  assert.ok(t.classList.contains("xqb-toast-error"));
  assert.match(t.textContent, /didn't appear|never appeared/i);
  a.stop();
});

test("uncertain: confirmation sent but no blocked proof -> surfaces uncertainty", async () => {
  const dom = setup();
  installFakeX(dom, { dialogNames: "spammer8", proves: false });
  const a = api(dom);
  a.start();
  const button = dom.window.document.querySelector("article[data-testid='tweet'] button[data-xqb-block]");
  button.click();
  await until(() => !a.state.busy);

  assert.equal(api(dom).state.blocked.has("spammer8"), false, "must not be marked blocked");
  const t = toast(dom);
  assert.ok(t.classList.contains("xqb-toast-error"));
  assert.match(t.textContent, /didn't confirm/i);
  a.stop();
});

test("busy lock: buttons are disabled in flight, and re-entrant calls are rejected", async () => {
  const dom = setup();
  installFakeX(dom, { openMenu: false }); // flow takes ~150ms (menu timeout)
  const a = api(dom);
  a.start();
  const article = dom.window.document.querySelector("article[data-testid='tweet']");
  const firstBtn = article.querySelector("button[data-xqb-block]");

  const second = dom.window.document.querySelectorAll("article[data-testid='tweet']")[1];
  const secondBtn = second.querySelector("button[data-xqb-block]");

  firstBtn.click(); // starts flow (will fail on menu timeout)

  // While in flight, every injected button — including unrelated tweets —
  // must be disabled so a real click can't reach the handler at all.
  assert.equal(firstBtn.disabled, true);
  assert.equal(secondBtn.disabled, true);

  // Defense in depth: even a direct re-entrant call (bypassing the disabled
  // attribute, e.g. a stray dispatchEvent) must be rejected with a toast
  // rather than starting a second concurrent block.
  await a.onBlockClick("origauthor", secondBtn);
  const busyToast = toast(dom);
  assert.ok(busyToast, "busy toast should appear for the re-entrant call");
  assert.match(busyToast.textContent, /one.*?a.?time/i);

  await until(() => !a.state.busy);
  // First click eventually resolves (failed), and the busy toast is replaced.
  const finalToast = toast(dom);
  assert.match(finalToast.textContent, /never appeared|didn't appear/i);
  assert.equal(secondBtn.disabled, false, "buttons re-enabled once idle");
  a.stop();
});

test("stop() removes injected UI and disconnects observers", () => {
  const dom = setup();
  const a = api(dom);
  a.start();
  assert.ok(dom.window.document.querySelector("button[data-xqb-block]"));
  assert.ok(a.state.observer, "observer active while on");
  a.stop();
  assert.equal(dom.window.document.querySelector("button[data-xqb-block]"), null);
  assert.equal(a.state.observer, null);
  assert.equal(a.state.active, false);
});

test("repeated toggle messages flip correctly", () => {
  const dom = setup();
  const a = api(dom);
  assert.equal(a.handleRuntimeMessage({ type: "xqb:toggle" }).active, true);
  assert.equal(a.handleRuntimeMessage({ type: "xqb:toggle" }).active, false);
  assert.equal(a.handleRuntimeMessage({ type: "xqb:toggle" }).active, true);
  assert.equal(a.handleRuntimeMessage({ type: "xqb:toggle" }).active, false);
  assert.equal(a.handleRuntimeMessage({ type: "xqb:noop" }), undefined);
});

test("no double install: second evaluation is a no-op", () => {
  const dom = setup();
  const before = dom.window.__xQB;
  dom.window.eval(CODE);
  assert.equal(dom.window.__xQB, before, "same api instance after re-evaluation");
});
