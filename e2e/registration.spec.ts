import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe.parallel('Simulazione multi-utente E2E con IP Random', () => {

  // Generiamo 10 simulazioni di utenti diversi
  for (let i = 1; i <= 10; i++) {
    test(`Utente ${i}: Viaggio completo dalla Home alla Registrazione (Simula IP Univoco)`, async ({ page }) => {
      
      // Dati generati randomicamente per l'utente "i"
      const randomStr = crypto.randomBytes(4).toString('hex');
      const validUsername = `user-${i}-${randomStr}`;
      const validEmail = `${validUsername}@example.com`;
      const validPassword = `PassW0rd!${randomStr}`;

      // 1. SIMULIAMO UN IP DIVERSO PER OGNI UTENTE AGGIUNGENDO L'HEADER X-Forwarded-For
      const fakeIp = `203.0.113.${i + Math.floor(Math.random() * 100)}`;
      await page.setExtraHTTPHeaders({
        'x-forwarded-for': fakeIp,
      });

      console.log(`[Utente ${i} - IP: ${fakeIp}] Inizia la simulazione.`);

      // UAT 1: Inizio del Builder dalla Homepage
      await page.goto('/');
      await expect(page).toHaveTitle(/OpenSelf/i); 
      
      const createPageBtn = page.getByRole('link', { name: 'Create your page' });
      await expect(createPageBtn).toBeVisible();
      await createPageBtn.click();
      
      // Aspettiamo che appaia il LanguagePicker
      try {
        const langBtn = page.getByRole('button', { name: 'English' });
        await langBtn.waitFor({ state: 'visible', timeout: 5000 });
        await langBtn.click();
      } catch (e) {
        console.log(`[Utente ${i} - IP: ${fakeIp}] LanguagePicker non visto, skippato.`);
      }

      // Navighiamo al signup
      await page.goto('/signup');

      // UAT 2/3/4/5/7: Compilazione form e validazione
      const userField = page.getByPlaceholder('Username');
      const emailField = page.getByPlaceholder('Email');
      const passwordField = page.getByPlaceholder('Password');
      const submitBtn = page.getByRole('button', { name: /Create account/i });

      // Verifiche sui campi (es: minuscolo automatico per lo username)
      await userField.fill('BAD_USER_NAME!!!');
      await expect(userField).toHaveValue('badusername'); 

      // Dati per completare la registrazione atomica (UAT 9)
      await userField.fill(validUsername);
      await emailField.fill(validEmail);
      await passwordField.fill(validPassword);
      
      await submitBtn.click();

      // UAT 10: Avvio del processo di Pubblicazione e Login automatico
      // Il redirect è immediato, quindi saltiamo il check sul bottone e attendiamo l'URL
      await page.waitForURL('**/builder', { timeout: 10000 });
      
      console.log(`[Utente ${i} - IP: ${fakeIp}] Simulazione conclusa con successo! Account: ${validUsername}`);
    });
  }
});
