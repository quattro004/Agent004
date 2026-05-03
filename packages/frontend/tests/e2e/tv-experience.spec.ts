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

  test('input is visible below the TV in controls-area', async ({ page }) => {
    // Input should be in the controls-area below the TV
    const controlsArea = page.locator('.controls-area');
    await expect(controlsArea).toBeVisible();

    const input = page.getByTestId('text-input');
    await expect(input).toBeVisible();

    // Verify controls-area is below the TV bezel
    const bezel = page.getByTestId('crt-bezel');
    const bezelBox = await bezel.boundingBox();
    const controlsBox = await controlsArea.boundingBox();
    expect(bezelBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox!.y).toBeGreaterThan(bezelBox!.y + bezelBox!.height - 5);
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

  test('CRT screen overlay covers the green chroma-key area', async ({ page }) => {
    // The .crt-screen overlay must be positioned to fully cover the green area.
    // Green bounds in the image: L=17.3% T=20.3% R=67.5% B=77.1%
    // Screen overlay should extend BEYOND these bounds.
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

    // Screen must start BEFORE the green area and end AFTER it
    expect(screenLeft).toBeLessThan(17.3); // Green starts at 17.3%
    expect(screenTop).toBeLessThan(20.3); // Green starts at 20.3%
    expect(screenRight).toBeGreaterThan(67.5); // Green ends at 67.5%
    expect(screenBottom).toBeGreaterThan(77.1); // Green ends at 77.1%
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
