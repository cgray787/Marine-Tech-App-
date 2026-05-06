#!/usr/bin/env node
// Regenerate iOS app icon as a flat 1024x1024 RGB PNG with no embedded
// rounded corners or transparency. iOS rounds corners automatically — bakingthem in causes the double-rounded look Apple flagged in 2.3.8.
//
// Also regenerates favicon.png at 1024x1024 to match. Splash icon stays
// the same since the splash composition uses contain-fit.
//
// Run from repo root:  node mobile/scripts/regen-icon.mjs

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "assets", "images");

const NAVY = "#060a12";
const GOLD = "#C9A96E";

// SVG icon — anchor with boat-hull base. Square, flat, no rounded corners.
// Designed to read clearly at 60×60 (smallest iOS icon size) and 1024×1024.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${NAVY}"/>
  <!-- Anchor ring -->
  <circle cx="512" cy="260" r="72" fill="none" stroke="${GOLD}" stroke-width="48"/>
  <!-- Anchor crossbar -->
  <rect x="320" y="380" width="384" height="48" rx="24" fill="${GOLD}"/>
  <!-- Anchor shaft -->
  <rect x="488" y="332" width="48" height="288" fill="${GOLD}"/>
  <!-- Hull / curved base -->
  <path d="M 220 540 L 290 540 L 380 740 L 644 740 L 734 540 L 804 540 L 700 800 Q 512 880 324 800 Z"
        fill="${GOLD}"/>
</svg>`;

// 1024×1024 flat RGB icon (iOS rounds the corners automatically)
await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .flatten({ background: NAVY })
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, "icon.png"));
console.log("✓ icon.png (1024×1024 flat RGB)");

// Favicon — same icon at 1024×1024 (Apple wants consistency across sizes)
await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .flatten({ background: NAVY })
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, "favicon.png"));
console.log("✓ favicon.png (1024×1024 flat RGB)");

// Splash icon — keep transparent center, navy frame around it; same anchor mark
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${NAVY}"/>
  <circle cx="512" cy="260" r="72" fill="none" stroke="${GOLD}" stroke-width="48"/>
  <rect x="320" y="380" width="384" height="48" rx="24" fill="${GOLD}"/>
  <rect x="488" y="332" width="48" height="288" fill="${GOLD}"/>
  <path d="M 220 540 L 290 540 L 380 740 L 644 740 L 734 540 L 804 540 L 700 800 Q 512 880 324 800 Z"
        fill="${GOLD}"/>
</svg>`;
await sharp(Buffer.from(splashSvg))
  .resize(1024, 1024)
  .flatten({ background: NAVY })
  .png({ compressionLevel: 9 })
  .toFile(join(outDir, "splash-icon.png"));
console.log("✓ splash-icon.png (1024×1024 flat RGB)");
