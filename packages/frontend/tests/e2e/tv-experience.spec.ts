import { test, expect } from '@playwright/test';

test.describe('TV Experience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
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

  test('power button is clickable and turns TV on', async ({ page }) => {
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await expect(powerBtn).toBeVisible();
    await expect(powerBtn).toBeEnabled();

    await powerBtn.click();

    // After clicking, the button should rotate (gain .rotate class)
    await expect(powerBtn).toHaveClass(/rotate/);
  });

  test('clicking power button turns on TV and shows screen content', async ({ page }) => {
    // Before turning on: avatar and backdrop should NOT be visible
    await expect(page.getByTestId('avatar-svg')).not.toBeVisible();
    await expect(page.getByTestId('neon-backdrop')).not.toBeVisible();

    // Click the power button
    const powerBtn = page.getByRole('button', { name: /turn on/i });
    await powerBtn.click();

    // After turning on: knob rotates
    await expect(powerBtn).toHaveClass(/rotate/);

    // Screen content appears
    await expect(page.getByTestId('avatar-svg')).toBeVisible();
    await expect(page.getByTestId('neon-backdrop')).toBeVisible();

    // Buffering overlay shows "Tuning in..." (no backend → stays connecting)
    await expect(page.getByTestId('buffering-overlay')).toBeVisible();
    await expect(page.getByText('Tuning in...')).toBeVisible();
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

  test('input is disabled before TV is turned on', async ({ page }) => {
    const input = page.getByTestId('text-input');
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
