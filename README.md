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

Read [the security baseline](.github/copilot-instructions.md) first.
Use a maintained jsdom-compatible Node.js release (22.13+ in the 22.x line,
or 24+) and **npm 11.21.2**. The package-manager version is pinned and checked;
older npm versions may not enforce release age.

Run these commands **inside a disposable VM or restricted non-root container**,
not on the host. Copy only this project's inputs, without browser profiles,
credentials, host-home mounts, or a Docker socket. Scrub inherited secrets and
restrict outbound traffic to the npm registry during installs; tests and
packaging need no network access.

```sh
npm ci --ignore-scripts
npm audit
npm test
npm run package
```

Installs block dependency lifecycle scripts. npm enforces a seven-day minimum
release age when resolving updates; **`npm ci` trusts the existing lockfile and
does not recheck release age**. Review publication dates as well as versions in
lockfile changes before accepting them. Dependabot uses the same cooldown for
routine updates; its security updates bypass the bot cooldown, not npm's
resolution gate. If an urgent verified fix needs an age exception, obtain
approval for the exact package/version, reason, scope, and expiry/review date;
pin the fix, remove temporary exemptions, and rerun validation. Do not use
`--force` or disable security gates to silence findings.

Packaging requires `zip` and `unzip` and writes the release ZIP and checksum
to `dist/`. Only the allowlisted runtime files, icons, and license are shipped;
jsdom and its dependencies are test-only and excluded. Tests use a simulated
X page; live testing needs consented accounts in an isolated browser profile,
not an everyday signed-in browser. There are no app credentials, server ports,
or persistent storage to configure.

</details>

## License

Copyright (c) 2026 Gaurav Ketkar. [Noncommercial use only](LICENSE);
commercial use or monetization requires prior written permission.
**Source-available, not open source.**

Independent of, and not endorsed by, X.
