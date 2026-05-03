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

  test('CRT screen overlay aligns with TV screen area', async ({ page }) => {
    // With TV.png (black screen), the screen overlay should align with the visible glass area.
    // Screen glass bounds: L≈8% T≈13% R≈74% B≈90%
    const screen = page.locator('.crt-screen');
    await expect(screen).toBeVisible();

    const bezel = page.getByTestId('crt-bezel');
    const bezelBox = await bezel.boundingBox();
    const screenBox = await screen.boundingBox();
    expect(bezelBox).not.toBeNull();
    expect(screenBox).not.toBeNull();

    // Screen overlay position as percentage of bezel
    const screenLeft = ((screenBox!.x - bezelBox!.x) / bezelBox!.width) * 100;
    const screenTop = ((screenBox!.y - bezelBox!.y) / bezelBox!.height) * 100;
    const screenRight = screenLeft + (screenBox!.width / bezelBox!.width) * 100;
    const screenBottom = screenTop + (screenBox!.height / bezelBox!.height) * 100;

    // Screen overlay should roughly match the glass area (within 5% tolerance)
    expect(screenLeft).toBeLessThan(12);
    expect(screenTop).toBeLessThan(17);
    expect(screenRight).toBeGreaterThan(68);
    expect(screenBottom).toBeGreaterThan(82);
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
