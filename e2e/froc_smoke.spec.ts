import { test, expect } from '@playwright/test';

test.describe('FROC Supernatural E2E Quality Gate', () => {
  test('Application loads and renders forensic header and core tabs', async ({ page }) => {
    await page.goto('/');

    // Verify main brand heading or title
    await expect(page).toHaveTitle(/Froc Sobrenatural/i);

    // Verify navigation tabs
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Verify presence of core modules
    await expect(page.locator('text=Visão').first()).toBeVisible();
    await expect(page.locator('text=Ouija').first()).toBeVisible();
    await expect(page.locator('text=Sensores').first()).toBeVisible();
    await expect(page.locator('text=Evidências').first()).toBeVisible();
  });

  test('Vision module renders low-light engine controls and disclaimers', async ({ page }) => {
    await page.goto('/');

    // Navigate to vision tab
    await page.click('button:has-text("Visão")');

    // Verify disclaimer about physical limitations (anti-sensationalism)
    await expect(
      page.locator('text=Celulares e navegadores não possuem visão noturna verdadeira').first()
    ).toBeVisible();

    // Verify camera activation button
    await expect(page.locator('button:has-text("Ativar Câmera")').first()).toBeVisible();
  });

  test('Ouija module renders physical sensor telemetry banner and disclaimer', async ({ page }) => {
    await page.goto('/');

    // Navigate to ouija tab
    await page.click('button:has-text("Ouija")');

    // Verify objective physics disclaimer
    await expect(
      page.locator('text=TABULEIRO DIGITAL & TELEMETRIA MULTI-SENSOR').first()
    ).toBeVisible();
  });
});
