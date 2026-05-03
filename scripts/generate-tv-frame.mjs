#!/usr/bin/env node
/**
 * generate-tv-frame.mjs
 *
 * One-time script to produce TV-frame.png from TV.png.
 * Makes the CRT screen area transparent so the TV frame image
 * can be layered ON TOP of content — the opaque wood/chrome
 * naturally masks anything outside the glass.
 *
 * Usage: node scripts/generate-tv-frame.mjs
 * Requires: npm install --no-save sharp
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

  // Read raw RGBA pixel data
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  // Define the screen region where pixels should become transparent.
  // These are conservative bounds that cover the dark glass area
  // but stop INSIDE the chrome bezel trim.
  //
  // We use brightness thresholding within this region: any pixel
  // darker than the threshold becomes transparent, preserving the
  // glass reflections and chrome edges as opaque parts of the frame.
  const SCREEN_BOUNDS = {
    left: Math.round(width * 0.12),
    top: Math.round(height * 0.16),
    right: Math.round(width * 0.64),
    bottom: Math.round(height * 0.84),
  };

  // Brightness threshold: pixels darker than this become transparent.
  // Chrome bezel is ~60 brightness, so 30 safely keeps chrome opaque
  // while making the near-black screen transparent.
  const BRIGHTNESS_THRESHOLD = 30;

  // Feather radius in pixels for smooth edge transitions
  const FEATHER = Math.round(width * 0.02);

  let transparentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;

      // Only process pixels within the screen region
      if (
        x >= SCREEN_BOUNDS.left &&
        x <= SCREEN_BOUNDS.right &&
        y >= SCREEN_BOUNDS.top &&
        y <= SCREEN_BOUNDS.bottom
      ) {
        // Distance from the edge of the screen bounds (for feathering)
        const distFromLeft = x - SCREEN_BOUNDS.left;
        const distFromRight = SCREEN_BOUNDS.right - x;
        const distFromTop = y - SCREEN_BOUNDS.top;
        const distFromBottom = SCREEN_BOUNDS.bottom - y;
        const edgeDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);

        // Feather factor: 0 at edge, 1 when fully inside
        const feather = Math.min(1, edgeDist / FEATHER);

        if (brightness < BRIGHTNESS_THRESHOLD) {
          // Scale alpha by feather (smooth transition at edges)
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
