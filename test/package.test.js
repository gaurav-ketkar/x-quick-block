"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");
const { RELEASE_FILES, validateManifest } = require("../tools/package");

test("current manifest satisfies the release metadata and permission checks", () => {
  assert.doesNotThrow(() => validateManifest(manifest));
});

test("release contains runtime files and license, with manifest at the ZIP root", () => {
  assert.deepEqual(RELEASE_FILES, [
    "manifest.json", "background.js", "content.js", "styles.css",
    "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
    "LICENSE",
  ]);
});

test("packaging rejects descriptions over the store limit", () => {
  assert.throws(() => validateManifest({ ...manifest, description: "x".repeat(133) }),
    /Description must be/);
});

test("packaging rejects permission changes until disclosures are reviewed", () => {
  assert.throws(() => validateManifest({ ...manifest, permissions: [...manifest.permissions, "tabs"] }),
    /Review store disclosures/);
  assert.throws(() => validateManifest({ ...manifest, host_permissions: ["https://x.com/*"] }),
    /Review store disclosures/);
});

test("packaging rejects invalid versions and paths in version strings", () => {
  for (const version of ["../test", "1.2.3.4.5", "65536", "0.0.0", "01.0"]) {
    assert.throws(() => validateManifest({ ...manifest, version }));
  }
});
