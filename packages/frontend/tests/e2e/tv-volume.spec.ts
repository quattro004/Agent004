import { expect, test } from '@playwright/test';

test.describe('TV volume knob', () => {
  test('turns both ways, clamps at the ends, and supports wheel and keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('button', { name: 'Turn off' })).toBeVisible();

    const volume = page.getByRole('group', { name: 'Volume' });
    const up = page.getByRole('button', { name: 'Volume up' });
    const down = page.getByRole('button', { name: 'Volume down' });

    for (let step = 0; step < 6; step += 1) await up.click();
    await expect(volume).toHaveAttribute('aria-valuenow', '11');
    await up.click();
    await expect(volume).toHaveAttribute('aria-valuenow', '11');

    await down.click();
    await expect(volume).toHaveAttribute('aria-valuenow', '10');
    await volume.focus();
    await page.keyboard.press('ArrowDown');
    await expect(volume).toHaveAttribute('aria-valuenow', '9');

    await volume.hover();
    await page.mouse.wheel(0, -100);
    await expect(volume).toHaveAttribute('aria-valuenow', '10');
  });

  test('indicator ignores pointer input and disables motion when requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const indicator = page.locator('.volume-knob-indicator');
    await expect(indicator).toBeVisible();
    expect(await indicator.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
      'none',
    );
    expect(
      await indicator.evaluate((element) => getComputedStyle(element).transitionProperty),
    ).toBe('none');
  });
});
