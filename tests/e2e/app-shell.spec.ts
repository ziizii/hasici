import { day, expect, join, nav, seedActivity, test, today } from './fixtures';

test('the installable app opens the last synced plan offline', async ({ page, context }) => {
	await seedActivity('cached', today, 'Databázová zkouška');
	await join(page);
	await expect(day(page, today).locator('..')).toContainText('Databázová zkouška');

	const manifestLink = page.locator('link[rel="manifest"]');
	const manifestURL = await manifestLink.getAttribute('href');
	expect(manifestURL).toBeTruthy();
	const response = await page.request.get(manifestURL!);
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest).toMatchObject({ lang: 'cs', start_url: '/', display: 'standalone' });
	expect(manifest.icons).toEqual(expect.arrayContaining([
		expect.objectContaining({ sizes: '192x192' }),
		expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })
	]));
	for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);

	await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
	await expect.poll(() => page.evaluate(() => localStorage.getItem('hasici.cache.v2')))
		.toContain('Databázová zkouška');
	await context.setOffline(true);
	await page.reload();
	await expect(nav(page, 'Plán')).toBeVisible();
	await expect(day(page, today).locator('..')).toContainText('Databázová zkouška');
	await day(page, today).click();
	await expect(page.getByRole('link', { name: /Databázová zkouška/ })).toBeVisible();
	await page.goto('/akce/cached');
	await expect(page.getByRole('heading', { name: 'Databázová zkouška' })).toBeVisible();
});

test.describe('version polling', () => {
	test.use({ serviceWorkers: 'block' });

	test('discovers a new release and reloads when the user leaves the active text field', async ({ page }) => {
		let newVersion = false;
		let sawNewVersionRequest = false;
		await page.clock.install({ time: new Date('2026-11-19T12:00:00+01:00') });
		await page.route('**/_app/version.json*', async (route) => {
			if (!newVersion) return route.continue();
			sawNewVersionRequest = true;
			await route.fulfill({ json: { version: 'playwright-next-release' } });
		});
		await join(page);
		await nav(page, 'Plán').click();
		await day(page, today).click();
		const title = page.getByLabel('Název', { exact: true });
		await title.fill('Rozpracovaná akce');
		newVersion = true;
		await page.clock.fastForward(61_000);
		await expect.poll(() => sawNewVersionRequest).toBe(true);
		await expect(title).toHaveValue('Rozpracovaná akce');
		await expect(title).toBeFocused();

		const reload = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame());
		await title.blur();
		await reload;
		await expect(nav(page, 'Plán')).toBeVisible();
	});
});
