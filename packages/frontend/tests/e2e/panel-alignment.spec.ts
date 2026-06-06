import { test, expect } from '@playwright/test';

/**
 * Verify the invisible hit-areas of the TV panel controls line up
 * with the painted graphics on TV-frame.png (1536×1024).
 *
 * Measured painted positions (from PNG analysis):
 *   ON/OFF switch toggle: vertical center ~22% of bezel height
 *   VOLUME brass knob:    vertical center ~49% of bezel height
 *   CHANNEL knob:         vertical center ~58% of bezel height
 *   Right panel center:   horizontal ~81% of bezel width
 */

const PAINTED = {
  switch: { cy: 0.28, tol: 0.04 },
  volume: { cy: 0.41, tol: 0.015 },
  channel: { cy: 0.58, tolPx: 5 },
  panelCx: 0.8115,
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

  test('ChannelKnob centers over painted channel knob', async ({ page }) => {
    const bezel = page.getByTestId('crt-bezel');
    const knob = page.locator('.channel-knob');
    await expect(bezel).toBeVisible();
    await expect(knob).toBeVisible();

    const bezelBox = (await bezel.boundingBox())!;
    const knobBox = (await knob.boundingBox())!;
    const cyPx = knobBox.y + knobBox.height / 2 - bezelBox.y;
    const cxPx = knobBox.x + knobBox.width / 2 - bezelBox.x;
    const expectedCyPx = bezelBox.height * PAINTED.channel.cy;
    const expectedCxPx = bezelBox.width * PAINTED.panelCx;

    expect(Math.abs(cyPx - expectedCyPx)).toBeLessThanOrEqual(PAINTED.channel.tolPx);
    expect(Math.abs(cxPx - expectedCxPx)).toBeLessThanOrEqual(PAINTED.channel.tolPx);
  });

  // Regression: the LED bar / knob must stay anchored to the painted brass knob
  // across viewport resizes. Previously `translateY(-7vh)` on the wrapper caused
  // vertical drift because vh is viewport-relative, not bezel-relative.
  const RESIZE_VIEWPORTS = [
    { width: 1536, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 900 },
  ];

  for (const vp of RESIZE_VIEWPORTS) {
    test(`VolumeKnob stays anchored at viewport ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      const bezel = page.getByTestId('crt-bezel');
      const knob = page.locator('.volume-knob');
      await expect(bezel).toBeVisible();
      await expect(knob).toBeVisible();

      const bezelBox = (await bezel.boundingBox())!;
      const knobBox = (await knob.boundingBox())!;
      const cyRel = (knobBox.y + knobBox.height / 2 - bezelBox.y) / bezelBox.height;

      expect(cyRel).toBeGreaterThanOrEqual(PAINTED.volume.cy - PAINTED.volume.tol);
      expect(cyRel).toBeLessThanOrEqual(PAINTED.volume.cy + PAINTED.volume.tol);
    });

    test(`VolumeLedBar stays just below painted knob at ${vp.width}x${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      const bezel = page.getByTestId('crt-bezel');
      const ledBar = page.getByTestId('volume-led-bar');
      await expect(bezel).toBeVisible();
      await expect(ledBar).toBeVisible();

      const bezelBox = (await bezel.boundingBox())!;
      const ledBox = (await ledBar.boundingBox())!;
      const cyRel = (ledBox.y + ledBox.height / 2 - bezelBox.y) / bezelBox.height;

      // LED bar should sit a hair below the painted brass knob (cy ~0.41),
      // roughly in the 0.44–0.50 range. Tight enough to catch drift,
      // loose enough to allow minor styling tweaks.
      expect(cyRel).toBeGreaterThanOrEqual(0.44);
      expect(cyRel).toBeLessThanOrEqual(0.5);
    });
  }

  const CHANNEL_VIEWPORTS = [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ];

  for (const vp of CHANNEL_VIEWPORTS) {
    test(`ChannelKnob stays anchored at viewport ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      const bezel = page.getByTestId('crt-bezel');
      const knob = page.locator('.channel-knob');
      await expect(bezel).toBeVisible();
      await expect(knob).toBeVisible();

      const bezelBox = (await bezel.boundingBox())!;
      const knobBox = (await knob.boundingBox())!;
      const cyPx = knobBox.y + knobBox.height / 2 - bezelBox.y;
      const cxPx = knobBox.x + knobBox.width / 2 - bezelBox.x;
      const expectedCyPx = bezelBox.height * PAINTED.channel.cy;
      const expectedCxPx = bezelBox.width * PAINTED.panelCx;

      expect(Math.abs(cyPx - expectedCyPx)).toBeLessThanOrEqual(PAINTED.channel.tolPx);
      expect(Math.abs(cxPx - expectedCxPx)).toBeLessThanOrEqual(PAINTED.channel.tolPx);
    });
  }

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
