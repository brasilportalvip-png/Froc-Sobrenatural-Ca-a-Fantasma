import { test, expect } from '@playwright/test';

test.describe('FROC Supernatural E2E Quality Gate', () => {
  test('Application loads and renders forensic header and core tabs', async ({ page }) => {
    await page.goto('/');

    // Verify main brand heading or title
    await expect(page).toHaveTitle(/Froc Sobrenatural/i);

    // Verify navigation tabs
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();

    // Verify presence of core modules
    await expect(page.locator('button:has-text("Comunicação")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Visão")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Ouija")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Sensores")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Evidências")').first()).toBeVisible();
  });

  test('Communication module displays authoritative tool session gate with pricing information', async ({ page }) => {
    await page.goto('/');

    // Verify Communication tab displays ToolSessionGate with 4 minutes / 5 credits transparent pricing
    await expect(page.locator('text=Duração da Sessão').first()).toBeVisible();
    await expect(page.locator('text=4 minutos').first()).toBeVisible();
    await expect(page.locator('text=5 créditos').first()).toBeVisible();
  });

  test('Sensors module renders physics telemetry and calibration controls', async ({ page }) => {
    await page.goto('/');

    // Navigate to sensors tab
    await page.click('button:has-text("Sensores")');

    // Verify sensors telemetry cards
    await expect(page.locator('text=Acelerômetro').first()).toBeVisible();
  });

  test('Tool session gate protects premium tools transparently with authoritative pricing', async ({ page }) => {
    await page.goto('/');

    // Navigate to vision tab
    await page.click('button:has-text("Visão")');

    // Verify ToolSessionGate renders with authoritative pricing and transparent terms
    await expect(page.locator('text=Duração da Sessão').first()).toBeVisible();
    await expect(page.locator('text=4 minutos').first()).toBeVisible();
    await expect(page.locator('text=5 créditos').first()).toBeVisible();

    // Navigate to ouija tab
    await page.click('button:has-text("Ouija")');
    await expect(page.locator('text=Duração da Sessão').first()).toBeVisible();
    await expect(page.locator('text=5 créditos').first()).toBeVisible();
  });

  test('Legal terms and privacy policy render correctly with contact information', async ({ page }) => {
    await page.goto('/');

    // Click on Política de Privacidade in footer
    const privacyBtn = page.locator('button:has-text("Política de Privacidade")').first();
    await expect(privacyBtn).toBeVisible();
    await privacyBtn.click();

    // Verify Privacy Policy content and email
    await expect(page.locator('text=POLÍTICA DE PRIVACIDADE').first()).toBeVisible();
    await expect(page.locator('text=brasilportalvip@gmail.com').first()).toBeVisible();

    // Return to app
    await page.click('button:has-text("Voltar aos Instrumentos")');

    // Click on Termos de Uso
    const termsBtn = page.locator('button:has-text("Termos de Uso")').first();
    await expect(termsBtn).toBeVisible();
    await termsBtn.click();

    // Verify Terms of Use content and email
    await expect(page.locator('text=TERMOS DE USO').first()).toBeVisible();
    await expect(page.locator('text=brasilportalvip@gmail.com').first()).toBeVisible();
  });
});

