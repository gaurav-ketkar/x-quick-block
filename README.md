# X Quick Block

**One click to block an account on X. An early beta for friends, not a finished product.**

> **Expect bugs.** X changes its interface frequently, and this extension may
> miss controls, look odd, or fail to complete a block. Please
> [report problems](https://github.com/gaurav-ketkar/x-quick-block/issues/new?template=bug_report.md)
> so we can improve it. Use it only if you are comfortable trying beta software.

Turn on Block mode and supported posts get a **Block @handle** button.
Click it once: the extension opens X's menu and confirms the block for you.
No repeated trips through menus.

**This acts on your real X account.** It checks the handle in X's confirmation
before submitting, but beta software can still have bugs. Review the handle
on the button before clicking. Disabling the extension does not undo blocks;
use X's own controls to unblock someone.

## Install the beta

You need desktop Chrome, an X account, and an invitation to this private
GitHub repository. Accept the invitation and sign in to GitHub first.

1. Open [Releases](https://github.com/gaurav-ketkar/x-quick-block/releases).
2. Download **`x-quick-block-0.1.0.zip`** from the Beta release's **Assets**.
   Choose this file, not GitHub's automatically generated "Source code" ZIP.
3. Extract it to a folder you will keep, such as `Documents/x-quick-block`.
4. Open `chrome://extensions` and enable **Developer mode**.
5. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Open [x.com](https://x.com). Find **X Quick Block** in Chrome's extensions
   menu and pin it for easy access.

No terminal, Node.js, or npm is needed to install the release ZIP. This beta
is not distributed through or reviewed by the Chrome Web Store. Managed
work or school browsers may not allow unpacked extensions.

## Use it

1. On an X tab, click the extension icon. An **ON** badge means Block mode is active.
2. Find a post by the account you want to block and click **Block @handle**.
3. The extension operates X's menu and confirmation. The confirmation may
   appear briefly, but you should not need to click it yourself.
4. Click the extension icon again to remove the buttons.

Only one block runs at a time. Block mode applies to the current tab and
resets on a full page refresh. It does not automatically detect spam or
block accounts in bulk.

If the extension says the result is **uncertain**, the block may already
have gone through. Check the account's profile in X before retrying.

## Update or remove

Updates are **manual**; GitHub does not update your installed copy.

To update, download the new release, extract it, and replace the files in
the folder you originally loaded. Click **Reload** for X Quick Block at
`chrome://extensions`, then **refresh every X tab using it** and enable
Block mode again. Keep the extension folder in place while it is installed.

To uninstall, click **Remove** at `chrome://extensions` and refresh your X
tabs. This removes the extension, not the blocks saved in your X account.

## Bugs and limitations

- Built for desktop X. Mobile and non-English layouts are not verified.
- Buttons appear only where the extension can identify an author and a
  supported control. Some posts may be skipped.
- Timelines, search, replies, quotes, and reposts need more real-world beta coverage.
- X changing its menus can break blocking without warning.
- A result message is not a substitute for checking X when something looks wrong.
- There is no bulk block, automatic spam detection, or extension-provided undo.

Found something wrong? **Please open a
[bug report](https://github.com/gaurav-ketkar/x-quick-block/issues/new?template=bug_report.md)**,
even if you are not sure how to reproduce it. Include your extension and
Chrome versions, operating system, X theme/language, steps, and exact error.
Screenshots help, but redact names, private posts, messages, and account details.
Never attach passwords, cookies, access tokens, or a full page export.

Reports in this private repo are visible to its collaborators, not just the
maintainer. For suggestions, [open an issue](https://github.com/gaurav-ketkar/x-quick-block/issues).

## Privacy and permissions

| Permission | Why it is needed |
|---|---|
| `activeTab` | Temporary access after you click the toolbar icon; activation is restricted to HTTPS x.com and www.x.com. |
| `scripting` | Add the packaged buttons/styles and operate X's block controls in that tab. |

There is no always-on host permission, analytics, or developer-operated
server. The extension reads author links, handles, and relevant page
controls locally. Temporary state stays in page memory until a reload or
tab close; no block history is written to disk or synced by the extension.

Clicking Block causes **X** to receive the action through your signed-in
session. It does not send your page data to the developer. Blocks remain
stored by X until you change them there.

## Development

Use Node.js 22.12 or newer in the 22.x line, or a current supported Node.js
release compatible with jsdom.

```sh
npm ci
npm test
```

The tests use Node's test runner and a simulated X page. They do not prove
compatibility with every live X layout. Use accounts you control or have
permission to block for live testing.

```sh
npm run package
```

This creates `dist/x-quick-block-0.1.0.zip` and a SHA-256 checksum. Packaging
requires `zip` and `unzip` (included on macOS) and includes only runtime
files plus the license, not dependencies or development files.

```sh
cd dist
shasum -a 256 -c x-quick-block-0.1.0.zip.sha256
```

`npm run icons` regenerates the current icons. Draft Chrome Web Store
materials live in [`store/`](store/SUBMISSION.md); no store submission has
been made.

## License

Copyright (c) 2026 Gaurav Ketkar. All rights reserved except as expressly
granted in [LICENSE](LICENSE).

You may use, study, modify, and share this software for noncommercial
purposes under that license. You may not sell it, monetize it, use it for
commercial advantage, or include it in a commercial product or service
without prior written permission from Gaurav Ketkar. Modified versions
must retain the notices and restrictions.

This is **source-available, not open-source software**. Access to a private
repository does not transfer ownership.

X Quick Block is independent and is not affiliated with or endorsed by X.
