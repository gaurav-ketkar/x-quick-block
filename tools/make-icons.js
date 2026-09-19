"use strict";

// Generates icons/icon{16,32,48,128}.png — a simple white "X" on X's dark
// background, with rounded corners. Pure Node: zlib for DEFLAT, hand-rolled
// CRC32 and chunk framing. No third-party dependencies.

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const BG = [15, 20, 25, 255]; // #0f1419
const FG = [231, 233, 234, 255]; // #e7e9ea

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Color at normalized coords (u, v) in [0,1). */
function pixel(u, v) {
  // Rounded corner mask via clamped-center distance.
  const r = 0.2;
  const cx = Math.max(r, Math.min(1 - r, u));
  const cy = Math.max(r, Math.min(1 - r, v));
  if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return null; // transparent

  // X: union of the two diagonals, stroke width via threshold on |du - dv|.
  const du = Math.abs(2 * u - 1);
  const dv = Math.abs(2 * v - 1);
  if (Math.abs(du - dv) <= 0.2) return FG;
  return BG;
}

function renderPng(size) {
  const rawStride = 1 + size * 4;
  const raw = Buffer.alloc(size * rawStride);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const rgba = pixel((x + 0.5) / size, (y + 0.5) / size) || [0, 0, 0, 0];
      raw[o++] = rgba[0];
      raw[o++] = rgba[1];
      raw[o++] = rgba[2];
      raw[o++] = rgba[3];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, renderPng(size));
  console.log(`wrote ${file}`);
}
