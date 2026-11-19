import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
	testDir: './tests/e2e',
	// Every test resets the same throwaway emulator database.
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL,
		browserName: 'chromium',
		locale: 'cs-CZ',
		timezoneId: 'Europe/Prague',
		viewport: { width: 1440, height: 1000 },
		trace: 'retain-on-failure'
	}
});
