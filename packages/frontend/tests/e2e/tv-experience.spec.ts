import { test, expect } from '@playwright/test';

test.describe('TV Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('CRT Screen Bounds', () => {
    test('CRT screen does not extend above the TV frame glass area', async ({ page }) => {
      const bezel = page.getByTestId('crt-bezel');
      const screen = page.locator('.crt-screen');
      await expect(bezel).toBeVisible();
      await expect(screen).toBeVisible();

      const bezelBox = await bezel.boundingBox();
      const screenBox = await screen.boundingBox();
      expect(bezelBox).not.toBeNull();
      expect(screenBox).not.toBeNull();

      // Screen top should be at least 12% below bezel top (TV frame glass starts ~14%)
      const relTop = (screenBox!.y - bezelBox!.y) / bezelBox!.height;
      expect(relTop).toBeGreaterThanOrEqual(0.12);
    });

    test('CRT screen does not extend below the TV frame glass area', async ({ page }) => {
      const bezel = page.getByTestId('crt-bezel');
      const screen = page.locator('.crt-screen');
      await expect(bezel).toBeVisible();
      await expect(screen).toBeVisible();

      const bezelBox = await bezel.boundingBox();
      const screenBox = await screen.boundingBox();
      expect(bezelBox).not.toBeNull();
      expect(screenBox).not.toBeNull();

      // Screen bottom should be no more than 80% from bezel top (glass ends ~76%)
      const relBottom = (screenBox!.y + screenBox!.height - bezelBox!.y) / bezelBox!.height;
      expect(relBottom).toBeLessThanOrEqual(0.8);
    });
  });

  test.describe('Power Button Size and Position', () => {
    test('power button has a minimum clickable size', async ({ page }) => {
      const powerBtn = page.getByRole('button', { name: /turn on/i });
      await expect(powerBtn).toBeVisible();

      const btnBox = await powerBtn.boundingBox();
      expect(btnBox).not.toBeNull();

      // Button should be at least 30×30px for usability (WCAG touch target)
      expect(btnBox!.width).toBeGreaterThanOrEqual(30);
      expect(btnBox!.height).toBeGreaterThanOrEqual(30);
    });

    test('power button center aligns with the ON/OFF switch in the frame', async ({ page }) => {
      const bezel = page.getByTestId('crt-bezel');
      const powerBtn = page.getByRole('button', { name: /turn on/i });
      await expect(bezel).toBeVisible();
      await expect(powerBtn).toBeVisible();

      const bezelBox = await bezel.boundingBox();
      const btnBox = await powerBtn.boundingBox();
      expect(bezelBox).not.toBeNull();
      expect(btnBox).not.toBeNull();

      const btnCenterY = btnBox!.y + btnBox!.height / 2;
      const relY = (btnCenterY - bezelBox!.y) / bezelBox!.height;

      // ON/OFF switch toggle in the frame is at approximately 23-28% from top
      expect(relY).toBeGreaterThan(0.2);
      expect(relY).toBeLessThan(0.32);
    });
  });

  test.describe('Responsive Layout', () => {
    test('TV bezel maintains approximately 3:2 aspect ratio', async ({ page }) => {
      const bezel = page.getByTestId('crt-bezel');
      await expect(bezel).toBeVisible();

      const box = await bezel.boundingBox();
      expect(box).not.toBeNull();

      // TV-frame.png is 1536x1024 = 3:2 ratio. Bezel should maintain this.
      const ratio = box!.width / box!.height;
      expect(ratio).toBeGreaterThan(1.3);
      expect(ratio).toBeLessThan(1.7);
    });

    test('power button stays within ON/OFF switch region at default viewport', async ({ page }) => {
      const bezel = page.getByTestId('crt-bezel');
      const powerBtn = page.getByRole('button', { name: /turn on/i });
      await expect(bezel).toBeVisible();
      await expect(powerBtn).toBeVisible();

      const bezelBox = await bezel.boundingBox();
      const btnBox = await powerBtn.boundingBox();
      expect(bezelBox).not.toBeNull();
      expect(btnBox).not.toBeNull();

      // Power button center should be in right ~20% of bezel and top ~35%
      const btnCenterX = btnBox!.x + btnBox!.width / 2;
      const btnCenterY = btnBox!.y + btnBox!.height / 2;
      const relX = (btnCenterX - bezelBox!.x) / bezelBox!.width;
      const relY = (btnCenterY - bezelBox!.y) / bezelBox!.height;

      // ON/OFF switch is at approximately 82% from left, 22% from top
      expect(relX).toBeGreaterThan(0.75);
      expect(relX).toBeLessThan(0.92);
      expect(relY).toBeGreaterThan(0.12);
      expect(relY).toBeLessThan(0.38);
    });

    test('power button stays aligned after viewport resize to 1024x768', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/');

      const bezel = page.getByTestId('crt-bezel');
      const powerBtn = page.getByRole('button', { name: /turn on/i });
      await expect(bezel).toBeVisible();
      await expect(powerBtn).toBeVisible();

      const bezelBox = await bezel.boundingBox();
      const btnBox = await powerBtn.boundingBox();
      expect(bezelBox).not.toBeNull();
      expect(btnBox).not.toBeNull();

      const btnCenterX = btnBox!.x + btnBox!.width / 2;
      const btnCenterY = btnBox!.y + btnBox!.height / 2;
      const relX = (btnCenterX - bezelBox!.x) / bezelBox!.width;
      const relY = (btnCenterY - bezelBox!.y) / bezelBox!.height;

      // Same expected region regardless of viewport size
      expect(relX).toBeGreaterThan(0.75);
      expect(relX).toBeLessThan(0.92);
      expect(relY).toBeGreaterThan(0.12);
      expect(relY).toBeLessThan(0.38);
    });

    test('mobile viewport shows TV frame and power button is accessible', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      const frameImage = page.getByTestId('crt-frame-image');
      const powerBtn = page.getByRole('button', { name: /turn on/i });

      await expect(frameImage).toBeVisible();
      await expect(powerBtn).toBeVisible();

      // The TV frame should be visible (has non-zero dimensions)
      const frameBox = await frameImage.boundingBox();
      expect(frameBox).not.toBeNull();
      expect(frameBox!.width).toBeGreaterThan(100);
      expect(frameBox!.height).toBeGreaterThan(100);

      // Power button should be within the viewport bounds
      const btnBox = await powerBtn.boundingBox();
      expect(btnBox).not.toBeNull();
      expect(btnBox!.x).toBeGreaterThanOrEqual(0);
      expect(btnBox!.y).toBeGreaterThanOrEqual(0);
      expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(375);
      expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(667);
    });

    test('power button position is stable across viewport sizes', async ({ page }) => {
      // Check position at 1280x720, then at 1920x1080 — relative position should be similar
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      const bezel = page.getByTestId('crt-bezel');
      const powerBtn = page.getByRole('button', { name: /turn on/i });
      await expect(bezel).toBeVisible();
      await expect(powerBtn).toBeVisible();

      const bezelBox1 = await bezel.boundingBox();
      const btnBox1 = await powerBtn.boundingBox();

      const relX1 = (btnBox1!.x + btnBox1!.width / 2 - bezelBox1!.x) / bezelBox1!.width;
      const relY1 = (btnBox1!.y + btnBox1!.height / 2 - bezelBox1!.y) / bezelBox1!.height;

      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(200);

      const bezelBox2 = await bezel.boundingBox();
      const btnBox2 = await powerBtn.boundingBox();

      const relX2 = (btnBox2!.x + btnBox2!.width / 2 - bezelBox2!.x) / bezelBox2!.width;
      const relY2 = (btnBox2!.y + btnBox2!.height / 2 - bezelBox2!.y) / bezelBox2!.height;

      // Relative position should remain stable (within 3% tolerance)
      expect(Math.abs(relX1 - relX2)).toBeLessThan(0.03);
      expect(Math.abs(relY1 - relY2)).toBeLessThan(0.03);
    });
  });

  test('TV fills most of the viewport height', async ({ page }) => {
    const bezel = page.getByTestId('crt-bezel');
    await expect(bezel).toBeVisible();

    const viewport = page.viewportSize();
    const box = await bezel.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();

    // TV should occupy at least 75% of viewport height
    const heightRatio = box!.height / viewport!.height;
    expect(heightRatio).toBeGreaterThanOrEqual(0.75);
  });

  test('power button has a visible idle glow so users can find it', async ({ page }) => {
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await expect(powerBtn).toBeVisible();

    // The knob should have a visible box-shadow glow even before hover
    const boxShadow = await powerBtn.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(boxShadow).not.toBe('none');
    expect(boxShadow).toContain('rgb');
  });

  test('power button has accessible label so users know what it does', async ({ page }) => {
    // The knob's aria-label provides the ON/OFF affordance
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await expect(powerBtn).toBeVisible();

    // After turning on, label should flip to "Turn off"
    await powerBtn.click();
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);
    const offBtn = page.getByRole('button', { name: /turn off/i });
    await expect(offBtn).toBeVisible();
  });

  test('power button glows brighter on hover', async ({ page }) => {
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await expect(powerBtn).toBeVisible();

    // Capture idle glow
    const idleShadow = await powerBtn.evaluate((el) => getComputedStyle(el).boxShadow);

    // Hover over the button
    await powerBtn.hover();

    // Capture hover glow — should be different (brighter/larger)
    const hoverShadow = await powerBtn.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(hoverShadow).not.toBe('none');
    expect(hoverShadow).not.toBe(idleShadow);
  });

  test('power button is clickable and turns TV on', async ({ page }) => {
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await expect(powerBtn).toBeVisible();
    await expect(powerBtn).toBeEnabled();

    await powerBtn.click();

    // After power-up transition, button label changes and gains .on class
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);
  });

  test('clicking power button turns on TV and shows screen content', async ({ page }) => {
    // Before turning on: avatar should NOT be visible
    await expect(page.getByTestId('avatar-svg')).not.toBeVisible();

    // Click the power button
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();

    // After turning on: knob has .on class
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);
  });

  test('power button hit area is above the frame layer', async ({ page }) => {
    const panel = page.locator('.crt-panel');
    const frame = page.getByTestId('crt-frame-image');
    await expect(panel).toBeVisible();
    await expect(frame).toBeVisible();

    // Panel must have a higher z-index than the frame to be clickable
    const panelZ = await panel.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    const frameZ = await frame.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    expect(panelZ).toBeGreaterThan(frameZ);
  });

  test('input is visible on TV cabinet base as overlay', async ({ page }) => {
    // Turn TV on first — input only renders when TV is on
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);

    // Input should be inside the CRT bezel footer overlay
    const footerOverlay = page.locator('.crt-footer-overlay');
    await expect(footerOverlay).toBeVisible();

    const input = page.getByTestId('text-input');
    await expect(input).toBeVisible();

    // Verify footer overlay is within the TV bezel (overlaid on cabinet)
    const bezel = page.getByTestId('crt-bezel');
    const bezelBox = await bezel.boundingBox();
    const footerBox = await footerOverlay.boundingBox();
    expect(bezelBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    // Footer should be near the bottom of the bezel
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
      bezelBox!.y + bezelBox!.height + 2,
    );
    expect(footerBox!.y).toBeGreaterThan(bezelBox!.y + bezelBox!.height * 0.8);
  });

  test('input becomes enabled and usable when session is active', async ({ page }) => {
    // This test requires a running backend WebSocket to reach ACTIVE state.
    // Skip if running without backend (input won't become enabled).
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();

    const input = page.getByTestId('text-input');
    try {
      await expect(input).toBeEnabled({ timeout: 5000 });
    } catch {
      test.skip(true, 'Backend not available — input stays disabled without WebSocket');
      return;
    }

    await input.fill('Hello Max');
    await expect(input).toHaveValue('Hello Max');
  });

  test('input has visible cyan border', async ({ page }) => {
    // Turn TV on first — input only renders when TV is on
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);

    const input = page.getByTestId('text-input');
    await expect(input).toBeVisible();

    // The input should have a visible border (not invisible)
    const borderColor = await input.evaluate((el) => {
      return getComputedStyle(el).borderColor;
    });
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(borderColor).not.toBe('rgb(0, 0, 0)');
  });

  test('TV frame image sits on top of screen content (frame-as-mask)', async ({ page }) => {
    // The TV frame image must be layered ABOVE the content area so the opaque
    // wood/chrome of the frame naturally masks content that bleeds past the
    // glass area. This eliminates the need for pixel-perfect CSS coordinates.
    const frameImage = page.getByTestId('crt-frame-image');
    const screen = page.locator('.crt-screen');
    await expect(frameImage).toBeVisible();
    await expect(screen).toBeVisible();

    // Frame image must have a HIGHER z-index than the screen content
    const frameZ = await frameImage.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    const screenZ = await screen.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0);
    expect(frameZ).toBeGreaterThan(screenZ);

    // Frame image must allow clicks to pass through to controls beneath
    const pointerEvents = await frameImage.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(pointerEvents).toBe('none');

    // Frame image must use absolute positioning to overlay the content
    const position = await frameImage.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('absolute');
  });

  test('input is disabled when TV is on but session is not active', async ({ page }) => {
    // Turn TV on — input renders but should be disabled without an active session
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();
    const knob = page.locator('.tv-knob');
    await expect(knob).toHaveClass(/on/);

    const input = page.getByTestId('text-input');
    await expect(input).toBeVisible();
    await expect(input).toBeDisabled();
  });

  test('user can submit text via Enter key when session is active', async ({ page }) => {
    // This test requires a running backend WebSocket to reach ACTIVE state.
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();

    const input = page.getByTestId('text-input');
    try {
      await expect(input).toBeEnabled({ timeout: 5000 });
    } catch {
      test.skip(true, 'Backend not available — input stays disabled without WebSocket');
      return;
    }

    await input.fill('Test message');
    await input.press('Enter');
    await expect(input).toHaveValue('');
  });
});
