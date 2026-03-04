import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Read from default ".env" file.
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true, // Esegue tutti i file di test in parallelo
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4, // Usa 4 worker in locale (simula 4 utenti contemporaneamente)
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  timeout: 120 * 1000,
  expect: {
    timeout: 15 * 1000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Enable GPU acceleration via NVIDIA PRIME offload (GTX 860M).
          // When DISPLAY is set (desktop session), PRIME env vars activate the discrete GPU.
          // In headless environments they are silently ignored.
          args: [
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            '--enable-accelerated-2d-canvas',
            '--enable-accelerated-video-decode',
            '--disable-software-rasterizer',
          ],
          env: {
            __NV_PRIME_RENDER_OFFLOAD: '1',
            __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
          },
        },
      },
    },
  ],

  // Avvia il server di Next.js automaticamente prima dei test
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
