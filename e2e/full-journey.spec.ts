import { test, expect } from '@playwright/test';
import crypto from 'crypto';

test.describe('Full user journey with LLM interaction', () => {

  test('Invite → chat → signup → published page', async ({ page }) => {
    // Generous timeout: LLM calls are slow
    test.setTimeout(300_000); // 5 min — LLM calls are slow

    const randomStr = crypto.randomBytes(3).toString('hex');
    const username = `test-ai-${randomStr}`;
    const email = `${username}@example.com`;
    const personaName = 'Alex Tester';

    console.log(`[E2E] Starting with username: ${username}`);

    // ── 1. INVITE ──────────────────────────────────────────────
    await page.goto('/invite');
    await page.getByPlaceholder('Invite code').fill('code1');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/builder', { timeout: 15_000 });
    console.log('[E2E] Invite accepted, on /builder');

    // ── 2. LANGUAGE PICKER OR CHAT ─────────────────────────────
    // After bootstrapping, the builder shows either the language picker
    // (new session, no prior language) or the chat directly (language auto-detected).
    // Wait for whichever appears first.
    const chatInput = page.locator('input[name="prompt"]').first();
    const englishBtn = page.getByRole('button', { name: 'English' });

    await Promise.race([
      englishBtn.waitFor({ state: 'visible', timeout: 20_000 }),
      chatInput.waitFor({ state: 'visible', timeout: 20_000 }),
    ]);

    if (await englishBtn.isVisible()) {
      await englishBtn.click();
      await page.getByRole('button', { name: 'Continue' }).click();
      console.log('[E2E] Language selected: English');
    } else {
      console.log('[E2E] Language auto-detected, picker skipped');
    }

    // ── 3. CHAT WITH LLM ──────────────────────────────────────
    // Desktop + mobile layouts both mount ChatInput; take the first (desktop) one
    await chatInput.waitFor({ state: 'visible', timeout: 15_000 });
    console.log('[E2E] Chat input visible');

    const sendBtn = page.getByRole('button', { name: 'Send' }).first();

    // Helper: send a chat message and wait for the LLM response to finish.
    // The input field is disabled={isLoading} during streaming, so we wait for
    // it to become enabled again as the "response complete" signal.
    async function sendAndWait(message: string) {
      await chatInput.fill(message);
      await sendBtn.click();
      // Input becomes disabled during streaming
      await expect(chatInput).toBeDisabled({ timeout: 5_000 });
      // Wait for streaming to finish (input re-enabled)
      await expect(chatInput).toBeEnabled({ timeout: 90_000 });
    }

    // Message 1: introduce ourselves with enough facts for a page
    const intro = `Hi! My name is ${personaName}. I'm a software engineer from Berlin. I love building web apps, open-source tools, and hiking.`;
    console.log('[E2E] Sending intro message...');
    await sendAndWait(intro);
    console.log('[E2E] Got first response');

    // Message 2: request publish
    console.log('[E2E] Sending publish request...');
    await sendAndWait('That looks great! Please publish my page.');
    console.log('[E2E] Got publish response');

    // ── 4. PUBLISH BAR ─────────────────────────────────────────
    // The agent should have called request_publish, making the PublishBar appear.
    // In multi-user unauthenticated mode, it shows "Sign up to publish".
    // If it doesn't appear within 10s, send a more explicit follow-up message.
    const signupPublishBtn = page.getByRole('button', { name: 'Sign up to publish' });
    let publishBarVisible = await signupPublishBtn.isVisible().catch(() => false);
    if (!publishBarVisible) {
      // Wait a bit for preview polling to pick up the status
      try {
        await signupPublishBtn.waitFor({ state: 'visible', timeout: 10_000 });
        publishBarVisible = true;
      } catch {
        // Agent didn't call request_publish yet — send an explicit follow-up
        console.log('[E2E] PublishBar not visible, sending explicit publish request...');
        await sendAndWait('Please publish my page now.');
        await signupPublishBtn.waitFor({ state: 'visible', timeout: 30_000 });
      }
    }
    console.log('[E2E] PublishBar visible');
    await signupPublishBtn.click();

    // ── 5. SIGNUP MODAL ────────────────────────────────────────
    // Wait for the modal to appear
    await page.getByRole('heading', { name: 'Create your account' }).waitFor({ state: 'visible', timeout: 5_000 });
    console.log('[E2E] SignupModal open');

    // Username may be pre-filled by the agent, but override with our test username
    const usernameInput = page.locator('#signup-username');
    await usernameInput.clear();
    await usernameInput.fill(username);
    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-password').fill('TestPass123!');

    await page.getByRole('button', { name: 'Sign up & publish' }).click();
    console.log('[E2E] Submitted signup');

    // ── 6. VERIFY PUBLISHED PAGE ───────────────────────────────
    // After signup, the app redirects to /{username}
    await page.waitForURL(`**/${username}`, { timeout: 30_000 });
    console.log(`[E2E] Redirected to /${username}`);

    // The published page should contain the persona name
    const body = page.locator('body');
    await expect(body).toContainText(personaName, { timeout: 10_000 });
    console.log('[E2E] Published page contains persona name');

    console.log('[E2E] TEST PASSED');
  });
});
