import { test, expect } from '@playwright/test';

test.describe('FROC E2E: Auth, Wallet Modals & Accessibility', () => {
  test('Auth Modal opens, switches between Login and Register, and closes with Escape', async ({ page }) => {
    await page.goto('/');

    // Click "Entrar" or "Conta" button in header
    const authBtn = page.locator('button[aria-label="Entrar ou Cadastrar"], header button:has-text("Entrar")').first();
    await expect(authBtn).toBeVisible();
    await authBtn.click();

    // Verify modal appears
    await expect(page.locator('text=Acesso ao Sistema').first()).toBeVisible();

    // Verify email & password fields
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Switch to registration mode inside modal
    const registerTab = page.locator('div.fixed button:has-text("Criar Conta")').first();
    await expect(registerTab).toBeVisible();
    await registerTab.click();
    await expect(page.locator('button[type="submit"]:has-text("Cadastrar & Obter 25 Créditos")').first()).toBeVisible();

    // Switch back to login mode inside modal
    const loginTab = page.locator('div.fixed button:has-text("Entrar")').first();
    await expect(loginTab).toBeVisible();
    await loginTab.click();
    await expect(page.locator('button[type="submit"]:has-text("Entrar no Sistema")').first()).toBeVisible();

    // Press Escape to test accessible modal dismissal
    await page.keyboard.press('Escape');
    await expect(page.locator('text=Acesso ao Sistema')).toHaveCount(0);
  });

  test('Wallet Modal displays transparent credit packages and closes with Escape', async ({ page }) => {
    await page.goto('/');

    // Click "Carteira" button in header using aria-label or title
    const walletBtn = page.locator('button[aria-label="Carteira e Créditos"], header button[title*="Carteira"]').first();
    await expect(walletBtn).toBeVisible();
    await walletBtn.click();

    // Verify Wallet Modal opens with credit balance & packages
    await expect(page.locator('text=CARTEIRA & CRÉDITOS PERICIAIS').first()).toBeVisible();

    // Verify transparency section
    await expect(page.locator('text=TRANSPARÊNCIA DO CUSTO POR CONSULTA').first()).toBeVisible();

    // Switch to Comprar Créditos tab
    const packagesTab = page.locator('button:has-text("Comprar Créditos"), button:has-text("Pacotes")').first();
    if (await packagesTab.isVisible()) {
      await packagesTab.click();
      await expect(page.locator('text=Mercado Pago (Checkout Pro)').first()).toBeVisible();
    }

    // Press Escape to dismiss
    await page.keyboard.press('Escape');
    await expect(page.locator('text=CARTEIRA & CRÉDITOS PERICIAIS')).toHaveCount(0);
  });
});
