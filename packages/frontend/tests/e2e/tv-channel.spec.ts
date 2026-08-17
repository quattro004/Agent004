import { test, expect } from '@playwright/test';

test.describe('Channel knob behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto('/');
  });

  test('cycles themes and replays a greeting without rerunning tuning', async ({ page }) => {
    const powerKnob = page.locator('.tv-knob');
    const channelKnob = page.getByRole('button', { name: /channel/i });
    const avatar = page.getByTestId('avatar-frame');
    const broadcastText = page.getByTestId('broadcast-text');
    const tuningOverlay = page.locator('[data-testid="tuning-overlay"]');
    const tuneInGlitch = page.locator('[data-testid="tune-in-glitch"]');

    await expect(channelKnob).toBeDisabled();

    await powerKnob.click();
    await expect(page.locator('.tv-knob.on')).toBeVisible();
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute('src', /\/avatar\/retro\//);
    await expect(broadcastText).toBeVisible();
    await expect(channelKnob).toBeEnabled();

    const initialGreetingText = await broadcastText.textContent();

    await channelKnob.click();
    await expect(avatar).toHaveAttribute('src', /\/avatar\/pop-art\//);
    await expect(broadcastText).not.toHaveText(initialGreetingText ?? '');
    await expect(tuningOverlay).toHaveCount(0);
    await expect(tuneInGlitch).toHaveCount(0);

    await channelKnob.click();
    await expect(avatar).toHaveAttribute('src', /\/avatar\/cartoon\//);

    await channelKnob.click();
    await expect(avatar).toHaveAttribute('src', /\/avatar\/retro\//);
  });
});
