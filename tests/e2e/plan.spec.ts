import { devices } from '@playwright/test';
import { day, expect, freezeDate, join, nav, seedActivity, test, today } from './fixtures';

test('filters weekends, Czech holidays and activity days, and jumps and extends the timeline', async ({ page }) => {
	await seedActivity('future', '2026-11-23', 'Kontrola výzbroje');
	await seedActivity('distant', '2028-01-01', 'Výroční cvičení');
	await join(page);
	const filters = page.getByRole('group', { name: 'Zobrazit dny' });
	await filters.getByRole('button', { name: 'Víkendy' }).click();
	await expect(day(page, today)).toHaveCount(0);
	await expect(day(page, '2026-11-21')).toBeVisible();
	const holiday = day(page, '2026-12-24');
	await expect(holiday.locator('..')).toContainText('Štědrý den');
	await holiday.click();
	await expect(page.getByText('Státní svátek · Štědrý den')).toBeVisible();
	await page.getByRole('button', { name: 'Zavřít', exact: true }).click();
	await filters.getByRole('button', { name: 'Akce', exact: true }).click();
	await expect(day(page, '2026-11-23').locator('..')).toContainText('Kontrola výzbroje');
	await expect(day(page, '2026-11-21')).toHaveCount(0);
	const searchFarther = page.getByRole('button', { name: 'Hledat akce dál' });
	await searchFarther.click();
	await expect(day(page, '2028-01-01').locator('..')).toContainText('Výroční cvičení');

	await filters.getByRole('button', { name: 'Vše', exact: true }).click();
	const jumps = page.getByRole('navigation', { name: 'Přeskočit na' });
	await jumps.getByRole('button', { name: 'Příští týden' }).click();
	await expect(jumps.getByRole('button', { name: 'Příští týden' })).toHaveAttribute('aria-current', 'true');
	await expect(day(page, '2026-11-23')).toBeFocused();
	await jumps.getByRole('button', { name: 'Dnes', exact: true }).click();
	await expect(day(page, today)).toBeFocused();
	await page.getByRole('button', { name: 'Zobrazit dřívější dny' }).click();
	await expect(day(page, '2026-11-18')).toBeVisible();
});

test('calendar remembers the view and shows today, availability and ordered activity slices', async ({ page }) => {
	await seedActivity('later', today, 'Večerní schůze', '19:00');
	await seedActivity('earlier', today, 'Ranní schůze', '07:00');
	await join(page);
	await day(page, today).click();
	await page.getByRole('button', { name: 'Tento den nemůžu' }).click();
	await expect(day(page, today)).toHaveAccessibleName(/může 1 z 2/);
	await page.getByRole('button', { name: 'Zavřít', exact: true }).click();
	const calendar = page.getByRole('button', { name: 'Kalendář', exact: true });
	await calendar.click();
	const cell = day(page, today, true);
	await expect(cell).toHaveAttribute('aria-current', 'date');
	await expect(cell).toHaveAccessibleName(/Dostupní členové: 1 z 2/);
	await expect(cell.locator('circle[stroke-dasharray]')).toHaveAttribute('stroke-dasharray', '50 100');
	await expect(cell.locator('[style*="conic-gradient"]')).toHaveCount(1);
	await expect(cell).toContainText(/Ranní schůze.*Večerní schůze/s);
	await page.reload();
	await expect(calendar).toHaveAttribute('aria-pressed', 'true');
	await cell.click();
	const activities = page.getByRole('complementary', { name: 'Vybraný den' });
	await expect(activities.getByRole('link', { name: /Ranní schůze/ })).toBeVisible();
	await expect(activities.getByRole('link', { name: /Večerní schůze/ })).toBeVisible();
	await page.getByRole('button', { name: 'Zobrazit dřívější měsíc' }).click();
	await expect(day(page, '2026-10-31', true)).toBeVisible();
});

test.describe('phone layout', () => {
	test.use({
		viewport: devices['Pixel 7'].viewport,
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 1
	});

	test('large text keeps navigation usable and the day dialog restores keyboard focus', async ({ signedIn: page }) => {
		await page.evaluate(() => { document.documentElement.style.fontSize = '150%'; });
		const trigger = day(page, today);
		await trigger.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'Zavřít' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);
		await expect(trigger).toBeFocused();
		await expect.poll(() => page.evaluate(() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth
		)).toBe(true);
		await nav(page, 'Úkoly').click();
		await expect(page.getByRole('heading', { name: 'Úkoly' })).toBeVisible();
	});
});

test('a Czech movable holiday is included in the weekend filter', async ({ page }) => {
	await freezeDate(page, '2027-03-25');
	await join(page);
	await page.getByRole('button', { name: 'Víkendy' }).click();
	await expect(day(page, '2027-03-26').locator('..')).toContainText('Velký pátek');
	await expect(day(page, '2027-03-29').locator('..')).toContainText('Velikonoční pondělí');
});
