# X Quick Block

A Chrome extension that adds a **`Block @handle`** button to posts on X.
One click opens X's menu and confirms the block for you.

> **Beta — expect bugs.** X's interface changes can break this extension.
> Please [report problems](https://github.com/gaurav-ketkar/x-quick-block/issues/new?template=bug_report.md).

## Install

1. **[Download the Beta ZIP](https://github.com/gaurav-ketkar/x-quick-block/releases/download/v0.1.0-beta.1/x-quick-block-0.1.0.zip)** and extract it to a folder you'll keep.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Open X and click **X Quick Block** in Chrome's extensions menu.

Desktop Chrome only. No terminal or GitHub account needed. Not reviewed by
the Chrome Web Store.

## Use

Click the extension icon to toggle **Block mode**, then click a post's
**`Block @handle`** button. Mode resets when you refresh the page.

**Blocks affect your real account, with no second confirmation click.**
Check the handle first. If the result is uncertain, check the profile in X
before retrying. Unblock through X; removing the extension won't undo blocks.

## Report a bug

[Open an issue](https://github.com/gaurav-ketkar/x-quick-block/issues/new?template=bug_report.md)
with your Chrome/extension versions, steps, and error message.
**Reports are public:** redact screenshots and never share passwords,
cookies, tokens, or private messages.

<details>
<summary>Updates and removal</summary>

Updates are manual: download the next release, replace the installed files,
click **Reload** at `chrome://extensions`, and refresh your X tabs.
To uninstall, click **Remove** there and refresh X.

</details>

<details>
<summary>Privacy and limitations</summary>

Uses only `activeTab` and `scripting`, with no always-on site access,
analytics, or developer server. Handles and page controls are processed
locally; temporary state clears on page reload or tab close. X receives
your block action through its signed-in interface.

Some posts may be skipped. Mobile and non-English layouts aren't verified.
There is no bulk blocking or automatic spam detection.

</details>

<details>
<summary>Development</summary>

Use Node.js 22.12+ in the 22.x line, or another jsdom-compatible release.

```sh
npm ci
npm test
npm run package
```

Packaging requires `zip` and `unzip` and writes the release ZIP and checksum
to `dist/`. Tests use a simulated X page; live testing needs consented accounts.

</details>

## License

Copyright (c) 2026 Gaurav Ketkar. [Noncommercial use only](LICENSE);
commercial use or monetization requires prior written permission.
**Source-available, not open source.**

Independent of, and not endorsed by, X.
