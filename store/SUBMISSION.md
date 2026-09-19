# Chrome Web Store submission

Status: local release preparation only. No store account has been created,
no policy has been hosted, and nothing has been uploaded or submitted.
The ZIP is a candidate for an unlisted beta, not a completed launch.

## Store listing draft

**Name:** X Quick Block

**Short description:** Block accounts on X in one click. Turn on Block mode
to add buttons to posts, with no always-on site access.

**Language:** English

**Category:** Choose the closest productivity/tools category available in the dashboard.

**Detailed description:**

Reduce the clicks needed to block accounts on X.

Activate Block mode with the extension's toolbar icon. A Block @handle
button appears on supported posts. Click it to open X's menu and complete
the block automatically, including X's confirmation dialog.

- You choose each account; there is no bulk blocking or automatic spam detection.
- The extension checks that X's confirmation names the selected handle before submitting.
- Works with supported desktop X timelines, search results, and reply threads,
  including posts loaded while scrolling.
- Block mode applies to the current tab and resets when you refresh the page.
- No analytics, developer-operated server, or always-on website permission.

Important: clicking Block uses your signed-in X account and automatically
confirms the action. The dialog may appear briefly. Turning off or removing
the extension does not undo blocks. Unblock accounts using X's own controls.

This extension depends on X's page layout. If X changes its interface, a
control may stop working. If a result is reported as uncertain, check the
account's profile before retrying. Mobile and non-English layouts have not
been verified for this release.

X Quick Block is an independent extension and is not affiliated with or
endorsed by X.

## Privacy tab draft

**Single purpose:** Let users block an individually selected account from a
post on desktop X with one click, using X's existing controls.

**activeTab justification:** Grants temporary access to the tab after the
user clicks the toolbar icon. The extension checks that the URL is HTTPS
x.com or www.x.com and activates Block mode only on those sites.

**scripting justification:** Injects the packaged content script and CSS
into that tab to display Block buttons and operate X's native block flow.

**Remote code:** No remotely hosted executable code. Extension JavaScript
and CSS are packaged in the ZIP.

**Privacy policy URL:** [PUBLISH THE REVIEWED PRIVACY.md AND INSERT ITS PUBLIC HTTPS URL]

### Data disclosure notes

Review the dashboard's current definitions before answering its data-use
questions. Do not equate "no server" with "no data access."

| Data handled | Purpose | Retention / destination |
|---|---|---|
| Account handles and profile links | Identify the selected author | Local page memory; no developer transmission |
| Page controls, dialog text, and block result | Operate and check the block flow | Processed locally |
| Current tab URL | Restrict activation to X | No browsing-history database |
| Block-mode and in-flight status | Coordinate controls and badge | Local page/tab state |
| User-requested block action | Block the chosen account | X receives it through its signed-in interface |

Handles are usernames; website content and current-page URL access also
need consideration under Google's disclosure guidance, including local-only
processing. Make the listing, policy, and dashboard answers consistent.
There is no sale, advertising use, creditworthiness use, or analytics.

## Reviewer instructions draft

1. Use desktop Chrome and sign in to X with a dedicated test account.
   The extension has no separate login or subscription.
2. Use a second account you control or have permission to block as the target.
   Do not test against unrelated people.
3. Visit a page containing a post by that target account.
4. Click the extension toolbar icon. Confirm that its ON badge and a
   Block @handle button appear.
5. Click the Block button once. The extension opens X's menu, chooses
   Block, checks the handle in the confirmation, and confirms automatically.
   No second click is required. This changes the test account's real block list.
6. Verify the block in X's account/profile controls. A submitted action can
   be reported as uncertain if X does not expose the expected result.
7. Turn Block mode off and confirm the injected buttons disappear.
   Refresh the page and confirm Block mode stays off.
8. Restore the test account by unblocking the target through X.

If the review team requires credentials, provide dedicated test credentials
only through the dashboard's private test-instructions field. Never put
passwords in this repository, the ZIP, or the public listing.

## Required before submission

- [ ] Register the publisher, pay the registration fee, and complete
  Google's account, contact verification, and security requirements.
- [ ] Choose a public publisher name and support contact.
- [ ] Review PRIVACY.md, fill its placeholders, remove its draft notice,
  and host it at a public HTTPS URL.
- [ ] Complete the dashboard privacy declarations using its current definitions.
- [ ] Replace or approve the placeholder white-X icon. A distinct icon is
  recommended to avoid implying official X affiliation.
- [ ] Capture at least one truthful 1280x800 screenshot of the current
  extension on desktop X, using accounts you control and no private content.
- [ ] Prepare a 440x280 small promotional image and a 128x128 store icon.
  Confirm all asset requirements in the dashboard at upload time.
- [ ] Complete the live release checks below against the extracted ZIP.
- [ ] Review X's current terms and automation rules; Chrome approval is
  not permission from X.
- [ ] Review listing claims against observed behavior. Narrow any unsupported claims.
- [ ] Rebuild the ZIP after final changes; choose unlisted distribution for
  the initial beta and defer publishing until approval has been reviewed.

## Live release checks

These are pending, not evidence of completed live testing. Record the Chrome
version, X language/theme, date, and result when each check is performed.
Use only consented test accounts for actions that change a block list.

| Scenario | Expected result | Result |
|---|---|---|
| Timeline, search, replies, and post detail | Correct author and compact button placement | Pending |
| Quote and repost | Intended post author, not an unrelated quoted account | Pending |
| Long handles, image/video posts, narrow window | No stretched button or broken layout | Pending |
| Light, dim, and dark themes; keyboard navigation | Readable labels and visible focus | Pending |
| Scroll to load posts; navigate within X | Buttons added once to supported posts | Pending |
| One click on a consented target | Correct block and automatic confirmation | Pending |
| Existing block / own post / missing controls | No unrelated action or wrong-account block | Pending |
| Slow network or missing result | Honest failure/uncertainty, no false success | Pending |
| Click another Block while busy | Only one block flow at a time | Pending |
| Mode off, refresh, tab close, unrelated site | No unexpected activation or leftover controls | Pending |
| Unblock through X after test | Test account restored | Pending |

## Packaging and updates

From the project root:

```
npm run package
unzip -l dist/x-quick-block-0.1.0.zip
```

Run the checksum command from `dist/`, because the checksum records only
the ZIP filename:

```
cd dist
shasum -a 256 -c x-quick-block-0.1.0.zip.sha256
```

Load an extracted copy of the ZIP as an unpacked extension in a separate
Chrome test profile for live checks. Do not rely solely on loading the source
folder: the shipped file set is what matters.

For a later store upload, increment the manifest version (and keep the npm
package version in sync), then rebuild. The ZIP has exactly the runtime
files plus the license, and no tests, dependencies, store drafts, or developer credentials.
Creating it does not certify Chrome approval or live-site compatibility.

## Official references

- [Registration](https://developer.chrome.com/docs/webstore/register)
- [Prepare a submission](https://developer.chrome.com/docs/webstore/prepare)
- [Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [User data policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Publish](https://developer.chrome.com/docs/webstore/publish)
