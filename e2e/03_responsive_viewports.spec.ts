import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'Mobile SE (375x667)', width: 375, height: 667 },
  { name: 'Mobile Modern (390x844)', width: 390, height: 844 },
  { name: 'Tablet (768x1024)', width: 768, height: 1024 },
  { name: 'Desktop (1440x900)', width: 1440, height: 900 },
];

test.describe('FROC E2E: Responsive Viewports & Layout Integrity', () => {
  for (const vp of VIEWPORTS) {
    test(`Layout renders cleanly on ${vp.name} without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Verify header is visible
      const header = page.locator('header').first();
      await expect(header).toBeVisible();

      // Check that document body has no horizontal overflow
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing, `Página não deve ter scroll horizontal em ${vp.name}`).toBe(false);

      // Verify that navigation tabs are scrollable or visible
      const nav = page.locator('nav').first();
      await expect(nav).toBeVisible();

      // Check that footer renders
      const footer = page.locator('footer').first();
      await expect(footer).toBeVisible();
    });
  }
});
