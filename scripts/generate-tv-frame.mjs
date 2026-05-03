#!/usr/bin/env node
/**
 * generate-tv-frame.mjs
 *
 * Produces TV-frame.png from TV.png by making the dark CRT screen
 * area transparent. The frame image is layered ON TOP of content —
 * opaque wood/chrome naturally masks anything outside the glass.
 *
 * Usage: node scripts/generate-tv-frame.mjs
 * Requires: sharp (already in devDependencies)
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = join(__dirname, '..', 'packages', 'frontend', 'public', 'TV.png');
const OUTPUT = join(__dirname, '..', 'packages', 'frontend', 'public', 'TV-frame.png');

async function main() {
  const image = sharp(INPUT);
  const { width, height } = await image.metadata();

  if (!width || !height) throw new Error('Cannot read image dimensions');

  console.log(`Input: ${width}x${height}`);

  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Screen region covering the dark CRT glass.
  // Right bound at 67% is conservative — chrome bezel starts ~70%.
  const SCREEN_BOUNDS = {
    left: Math.round(width * 0.12),
    top: Math.round(height * 0.16),
    right: Math.round(width * 0.67),
    bottom: Math.round(height * 0.84),
  };

  // Dark glass is <25 brightness; chrome bezel is ~55+.
  const BRIGHTNESS_THRESHOLD = 35;

  // Feather radius for smooth edge transitions
  const FEATHER = Math.round(width * 0.02);

  let transparentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

      if (
        x >= SCREEN_BOUNDS.left &&
        x <= SCREEN_BOUNDS.right &&
        y >= SCREEN_BOUNDS.top &&
        y <= SCREEN_BOUNDS.bottom
      ) {
        const distFromLeft = x - SCREEN_BOUNDS.left;
        const distFromRight = SCREEN_BOUNDS.right - x;
        const distFromTop = y - SCREEN_BOUNDS.top;
        const distFromBottom = SCREEN_BOUNDS.bottom - y;
        const edgeDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);

        const feather = Math.min(1, edgeDist / FEATHER);

        if (brightness < BRIGHTNESS_THRESHOLD) {
          data[i + 3] = Math.round(255 * (1 - feather));
          if (feather >= 1) transparentCount++;
        }
      }
    }
  }

  console.log(`Made ${transparentCount} pixels fully transparent`);

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(OUTPUT);

  console.log(`Output: ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
