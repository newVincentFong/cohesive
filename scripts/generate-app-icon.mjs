#!/usr/bin/env node
/**
 * Generate Cohesive brand icons from one shared geometry.
 *
 * Outputs:
 *   assets/brand/icon-1024.png
 *   assets/brand/icon.svg
 *
 * Usage:
 *   node scripts/generate-app-icon.mjs
 *   node scripts/generate-app-icon.mjs --png-only
 *   node scripts/generate-app-icon.mjs --svg-only
 *
 * Then regenerate Tauri / platform icons:
 *   npx tauri icon assets/brand/icon-1024.png
 */

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const brandDir = path.join(root, "assets/brand");

/** Shared mark geometry (unit square of the rounded tile, after padding). */
export const BRAND = {
  canvas: 1024,
  /** Transparent margin around the rounded tile, as a fraction of canvas. */
  pad: 0.08,
  /** Corner radius of the tile, as a fraction of canvas. */
  corner: 0.22,
  /** "C" ring center in tile-normalized coords. */
  cx: 0.52,
  cy: 0.5,
  outer: 0.28,
  inner: 0.155,
  /** Half-angle of the right-side gap (radians from +x). */
  gap: 0.7,
  gradient: {
    top: { r: 37, g: 99, b: 235 }, // #2563eb
    bottom: { r: 29, g: 78, b: 216 }, // #1d4ed8
  },
};

function parseArgs(argv) {
  return {
    pngOnly: argv.includes("--png-only"),
    svgOnly: argv.includes("--svg-only"),
  };
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b, a] = paint(x, y, size);
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
}

function layout(canvas = BRAND.canvas) {
  const pad = Math.floor(canvas * BRAND.pad);
  const tile = canvas - pad * 2;
  const corner = Math.floor(canvas * BRAND.corner);
  return {
    canvas,
    pad,
    tile,
    corner,
    cx: pad + BRAND.cx * tile,
    cy: pad + BRAND.cy * tile,
    rOuter: BRAND.outer * tile,
    rInner: BRAND.inner * tile,
    gap: BRAND.gap,
  };
}

function roundedRectContains(x, y, size, radius) {
  const cx = Math.max(radius, Math.min(size - 1 - radius, x));
  const cy = Math.max(radius, Math.min(size - 1 - radius, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function inC(x, y, size) {
  const nx = (x + 0.5) / size;
  const ny = (y + 0.5) / size;
  const dx = nx - BRAND.cx;
  const dy = ny - BRAND.cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > BRAND.outer || r < BRAND.inner) return false;
  const angle = Math.atan2(dy, dx);
  return !(angle > -BRAND.gap && angle < BRAND.gap);
}

function paintIcon(x, y, size) {
  const { pad, tile, corner } = layout(size);
  const ix = x - pad;
  const iy = y - pad;

  if (ix < 0 || iy < 0 || ix >= tile || iy >= tile) {
    return [0, 0, 0, 0];
  }
  if (!roundedRectContains(ix, iy, tile, corner)) {
    return [0, 0, 0, 0];
  }

  const t = iy / tile;
  const { top, bottom } = BRAND.gradient;
  const r = Math.round(top.r + (bottom.r - top.r) * t);
  const g = Math.round(top.g + (bottom.g - top.g) * t);
  const b = Math.round(top.b + (bottom.b - top.b) * t);

  if (inC(ix, iy, tile)) {
    return [255, 255, 255, 255];
  }
  return [r, g, b, 255];
}

function fmt(n) {
  return Number(n.toFixed(3)).toString();
}

function pointOnCircle(cx, cy, radius, angle) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

/**
 * Vector "C" matching the raster ring sector:
 * keep the annulus, cut out the eastern gap of ±gap radians.
 */
function cPath(geo) {
  const start = geo.gap;
  const end = -geo.gap;
  const outerStart = pointOnCircle(geo.cx, geo.cy, geo.rOuter, start);
  const outerEnd = pointOnCircle(geo.cx, geo.cy, geo.rOuter, end);
  const innerEnd = pointOnCircle(geo.cx, geo.cy, geo.rInner, end);
  const innerStart = pointOnCircle(geo.cx, geo.cy, geo.rInner, start);

  // Large clockwise outer arc, then large counter-clockwise inner arc.
  return [
    `M ${fmt(outerStart.x)} ${fmt(outerStart.y)}`,
    `A ${fmt(geo.rOuter)} ${fmt(geo.rOuter)} 0 1 1 ${fmt(outerEnd.x)} ${fmt(outerEnd.y)}`,
    `L ${fmt(innerEnd.x)} ${fmt(innerEnd.y)}`,
    `A ${fmt(geo.rInner)} ${fmt(geo.rInner)} 0 1 0 ${fmt(innerStart.x)} ${fmt(innerStart.y)}`,
    "Z",
  ].join(" ");
}

function buildStaticSvg() {
  const geo = layout(BRAND.canvas);
  const { top, bottom } = BRAND.gradient;
  const topHex = `#${[top.r, top.g, top.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  const bottomHex = `#${[bottom.r, bottom.g, bottom.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.canvas} ${geo.canvas}" fill="none" role="img" aria-label="Cohesive">
  <defs>
    <linearGradient id="cohesive-mark-bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${topHex}"/>
      <stop offset="100%" stop-color="${bottomHex}"/>
    </linearGradient>
  </defs>
  <rect
    x="${geo.pad}"
    y="${geo.pad}"
    width="${geo.tile}"
    height="${geo.tile}"
    rx="${geo.corner}"
    ry="${geo.corner}"
    fill="url(#cohesive-mark-bg)"
  />
  <path d="${cPath(geo)}" fill="#ffffff"/>
</svg>
`;
}

/** Geometry consumed by in-app BrandMark (theme via CSS variables). */
function buildGeometryModule() {
  const geo = layout(BRAND.canvas);
  return `/* Generated by scripts/generate-app-icon.mjs — do not edit by hand. */
export const brandMarkViewBox = "0 0 ${geo.canvas} ${geo.canvas}";

export const brandMarkTile = {
  x: ${geo.pad},
  y: ${geo.pad},
  width: ${geo.tile},
  height: ${geo.tile},
  rx: ${geo.corner},
  ry: ${geo.corner},
} as const;

export const brandMarkPath = "${cPath(geo)}";
`;
}

const { pngOnly, svgOnly } = parseArgs(process.argv.slice(2));
fs.mkdirSync(brandDir, { recursive: true });

const geometryPath = path.join(root, "src/assets/brand-mark.geometry.ts");

if (!svgOnly) {
  const pngPath = path.join(brandDir, "icon-1024.png");
  writePng(pngPath, BRAND.canvas, paintIcon);
  console.log(`Wrote ${path.relative(root, pngPath)}`);
}

if (!pngOnly) {
  const svgPath = path.join(brandDir, "icon.svg");
  fs.writeFileSync(svgPath, buildStaticSvg(), "utf8");
  console.log(`Wrote ${path.relative(root, svgPath)}`);

  fs.mkdirSync(path.dirname(geometryPath), { recursive: true });
  fs.writeFileSync(geometryPath, buildGeometryModule(), "utf8");
  console.log(`Wrote ${path.relative(root, geometryPath)}`);
}

if (!svgOnly) {
  console.log("Next: npx tauri icon assets/brand/icon-1024.png");
}
