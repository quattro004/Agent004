import { test, expect } from '@playwright/test';

/**
 * Verify the invisible hit-areas of the TV panel controls line up
 * with the painted graphics on TV-frame.png (1536×1024).
 *
 * Measured painted positions (from PNG analysis):
 *   ON/OFF switch toggle: vertical center ~22% of bezel height
 *   VOLUME brass knob:    vertical center ~49% of bezel height
 *   Right panel center:   horizontal ~82% of bezel width
 */

const PAINTED = {
  switch: { cy: 0.28, tol: 0.04 },
  volume: { cy: 0.41, tol: 0.015 },
  panelCx: 0.82,
  panelTol: 0.03,
};

test.describe('Panel control alignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto('/');
  });

  test('TvKnob centers over painted ON/OFF switch', async ({ page }) => {
    const bezel = page.getByTestId('crt-bezel');
    const knob = page.locator('.tv-knob');
    await expect(bezel).toBeVisible();
    await expect(knob).toBeVisible();

    const bezelBox = (await bezel.boundingBox())!;
    const knobBox = (await knob.boundingBox())!;
    const cyRel = (knobBox.y + knobBox.height / 2 - bezelBox.y) / bezelBox.height;
    const cxRel = (knobBox.x + knobBox.width / 2 - bezelBox.x) / bezelBox.width;

    expect(cyRel).toBeGreaterThanOrEqual(PAINTED.switch.cy - PAINTED.switch.tol);
    expect(cyRel).toBeLessThanOrEqual(PAINTED.switch.cy + PAINTED.switch.tol);
    expect(cxRel).toBeGreaterThanOrEqual(PAINTED.panelCx - PAINTED.panelTol);
    expect(cxRel).toBeLessThanOrEqual(PAINTED.panelCx + PAINTED.panelTol);
  });

  test('VolumeKnob centers over painted brass volume knob', async ({ page }) => {
    const bezel = page.getByTestId('crt-bezel');
    const knob = page.locator('.volume-knob');
    await expect(bezel).toBeVisible();
    await expect(knob).toBeVisible();

    const bezelBox = (await bezel.boundingBox())!;
    const knobBox = (await knob.boundingBox())!;
    const cyRel = (knobBox.y + knobBox.height / 2 - bezelBox.y) / bezelBox.height;
    const cxRel = (knobBox.x + knobBox.width / 2 - bezelBox.x) / bezelBox.width;

    expect(cyRel).toBeGreaterThanOrEqual(PAINTED.volume.cy - PAINTED.volume.tol);
    expect(cyRel).toBeLessThanOrEqual(PAINTED.volume.cy + PAINTED.volume.tol);
    expect(cxRel).toBeGreaterThanOrEqual(PAINTED.panelCx - PAINTED.panelTol);
    expect(cxRel).toBeLessThanOrEqual(PAINTED.panelCx + PAINTED.panelTol);
  });

  test('panel screenshot for visual review', async ({ page }) => {
    const bezel = page.getByTestId('crt-bezel');
    const bezelBox = (await bezel.boundingBox())!;
    // Capture the right control panel area
    await page.screenshot({
      path: 'test-results/panel-area.png',
      clip: {
        x: bezelBox.x + bezelBox.width * 0.7,
        y: bezelBox.y,
        width: bezelBox.width * 0.3,
        height: bezelBox.height * 0.7,
      },
    });
  });
});
