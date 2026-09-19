"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

// Explicit files only: runtime and license, not dependencies or local drafts.
const RELEASE_FILES = [
  "manifest.json", "background.js", "content.js", "styles.css",
  "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
  "LICENSE",
];

function validateManifest(manifest) {
  assert.equal(manifest.manifest_version, 3, "Manifest V3 is required");
  assert.ok(typeof manifest.name === "string" && manifest.name.trim(), "Name is required");
  assert.ok(typeof manifest.description === "string" &&
    manifest.description.length > 0 && manifest.description.length <= 132,
  "Description must be 1-132 characters");
  assert.match(manifest.version, /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/, "Invalid version");
  const parts = manifest.version.split(".").map(Number);
  assert.ok(parts.every((part) => part <= 65535) && parts.some((part) => part > 0),
    "Version components must be 0-65535 and not all zero");
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting"],
    "Review store disclosures before changing permissions");
  assert.ok(!manifest.host_permissions?.length && !manifest.optional_host_permissions?.length &&
    !manifest.optional_permissions?.length && !manifest.content_scripts?.length,
  "Review store disclosures before adding standing access or optional permissions");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.icons, {
    16: "icons/icon16.png", 32: "icons/icon32.png",
    48: "icons/icon48.png", 128: "icons/icon128.png",
  });
}

function buildRelease(root = path.resolve(__dirname, "..")) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  validateManifest(manifest);
  for (const file of RELEASE_FILES) {
    assert.ok(fs.lstatSync(path.join(root, file)).isFile(), `Not a regular file: ${file}`);
  }
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist, { recursive: true });
  const temp = fs.mkdtempSync(path.join(dist, ".package-"));
  const archive = path.join(temp, "extension.zip");
  const output = path.join(dist, `x-quick-block-${manifest.version}.zip`);
  try {
    // A fresh archive avoids retaining stale entries from an earlier build.
    execFileSync("zip", ["-X", "-q", archive, ...RELEASE_FILES], { cwd: root, stdio: "inherit" });
    execFileSync("unzip", ["-tqq", archive], { stdio: "inherit" });
    const entries = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(entries.sort(), [...RELEASE_FILES].sort(), "Unexpected archive contents");
    fs.renameSync(archive, output);
    const digest = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
    fs.writeFileSync(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
    console.log(`Release candidate: ${output}`);
    console.log("Not submitted. Complete store/SUBMISSION.md before uploading.");
    return output;
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmdirSync(temp);
  }
}

if (require.main === module) buildRelease();

module.exports = { RELEASE_FILES, validateManifest, buildRelease };
