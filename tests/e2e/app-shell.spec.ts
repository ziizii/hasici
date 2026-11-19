import { day, expect, join, nav, seedAbsence, seedActivity, startTodo, test, today } from './fixtures';

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
	await expect(page.getByRole('banner').getByText('SDH Zkouška')).toBeVisible();

	await seedActivity('cached', today, 'Změněný výcvik');
	await context.setOffline(false);
	await expect(page.getByRole('heading', { name: 'Změněný výcvik' })).toBeVisible({ timeout: 15_000 });
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

test('keyboard users can skip the navigation straight to the content', async ({ signedIn: page }) => {
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Přeskočit na obsah' });
	await expect(skip).toBeFocused();
	await expect(skip).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page.locator('#main-content')).toBeFocused();
});

test('an app left open overnight moves today on at midnight', async ({ page }) => {
	const tomorrow = '2026-11-20';
	await seedActivity('evening', today, 'Večerní cvičení', '22:00');
	await seedAbsence('tonight', { memberId: 'jana', from: today, to: today, note: 'Služba' });
	await page.clock.install({ time: new Date(`${today}T23:58:00+01:00`) });
	await join(page, '/ukoly');
	await startTodo(page, 'Doplnit vodu');
	await page.getByLabel('Termín dokončení').fill(today);
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	const due = page.getByText('Termín Čt 19. 11.');
	await expect(due).not.toHaveClass(/font-bold/);

	await page.clock.fastForward('03:00');
	await expect(due).toHaveClass(/font-bold/);
	await nav(page, 'Plán').click();
	await expect(day(page, tomorrow).locator('..')).toContainText('Dnes');
	await page.getByRole('navigation', { name: 'Přeskočit na' }).getByRole('button', { name: 'Dnes', exact: true }).click();
	await expect(day(page, tomorrow)).toBeFocused();
	await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
	await expect(day(page, tomorrow, true)).toHaveAttribute('aria-current', 'date');
	await nav(page, 'Já').click();
	await expect(page.getByRole('heading', { name: 'Nadcházející (0)' })).toBeVisible();
	await page.goto('/akce/evening');
	await expect(page.getByText('Přišlo 1 z 2')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Přece jen přijdu' })).toHaveCount(0);
});

test('a phone coming back from the background picks up the new day at once', async ({ signedIn: page }) => {
	await expect(day(page, today).locator('..')).toContainText('Dnes');
	// Timers don't run while the phone sleeps: only the clock moves on.
	await page.clock.setFixedTime(new Date('2026-11-20T07:00:00+01:00'));
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect(day(page, '2026-11-20').locator('..')).toContainText('Dnes');
	await expect(day(page, today).locator('..')).not.toContainText('Dnes');
});
