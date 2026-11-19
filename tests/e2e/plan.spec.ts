import { devices } from '@playwright/test';
import { day, expect, freezeDate, join, nav, seedAbsence, seedActivity, seedMember, test, today } from './fixtures';
import type { Locator } from '@playwright/test';

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

	test('the calendar works on a phone and opens a day as a bottom sheet', async ({ signedIn: page }) => {
		await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
		const cell = day(page, '2026-11-26', true);
		await cell.click();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Čtvrtek 26. 11. 2026');
		await dialog.getByRole('button', { name: 'Tento den nemůžu' }).click();
		await dialog.getByRole('button', { name: 'Zavřít', exact: true }).click();
		await expect(cell).toHaveAccessibleName(/Dostupní členové: 1 z 2/);
		await expect.poll(() => page.evaluate(() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth
		)).toBe(true);
	});
});

async function inView(row: Locator) {
	await expect.poll(async () => {
		const box = await row.boundingBox();
		const height = row.page().viewportSize()!.height;
		return !!box && box.y >= 0 && box.y < height / 2;
	}).toBe(true);
}

test('later jump buttons, endless scrolling, and switching views keep the place', async ({ signedIn: page }) => {
	// Instant jumps: switching views mid-scroll would keep the place passed through.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const jumps = page.getByRole('navigation', { name: 'Přeskočit na' });
	await jumps.getByRole('button', { name: 'Za 2 týdny' }).click();
	await expect(day(page, '2026-11-30')).toBeFocused();
	await expect(jumps.getByRole('button', { name: 'Za 2 týdny' })).toHaveAttribute('aria-current', 'true');
	// The calendar keeps the month that was at the top of the list.
	await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
	await inView(page.locator('#cm-2026-11'));
	await jumps.getByRole('button', { name: 'Březen 2027' }).click();
	await inView(page.locator('#cm-2027-03'));
	await expect(jumps.getByRole('button', { name: 'Březen 2027' })).toHaveAttribute('aria-current', 'true');
	await page.getByRole('button', { name: 'Seznam', exact: true }).click();
	await inView(day(page, '2027-03-01'));

	// Scrolling to the end keeps loading days, also in the calendar.
	await expect(day(page, '2027-06-01')).toHaveCount(0);
	for (let i = 0; i < 20 && !(await day(page, '2027-06-01').count()); i++) {
		await page.keyboard.press('End');
		await page.mouse.wheel(0, 20_000);
	}
	await expect(day(page, '2027-06-01')).toBeAttached();
	await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
	for (let i = 0; i < 20 && !(await day(page, '2027-10-01', true).count()); i++) {
		await page.mouse.wheel(0, 20_000);
	}
	await expect(day(page, '2027-10-01', true)).toBeAttached();
});

test('a Czech movable holiday is included in the weekend filter', async ({ page }) => {
	await freezeDate(page, '2027-03-25');
	await join(page);
	await page.getByRole('button', { name: 'Víkendy' }).click();
	await expect(day(page, '2027-03-26').locator('..')).toContainText('Velký pátek');
	await expect(day(page, '2027-03-29').locator('..')).toContainText('Velikonoční pondělí');
});

test.describe('phone sheets', () => {
	test.use({
		viewport: devices['Pixel 7'].viewport,
		isMobile: true,
		hasTouch: true,
		deviceScaleFactor: 1
	});

	test('"Naplánovat akci" in a bottom sheet saves and opens the day', async ({ signedIn: page }) => {
		await page.getByRole('button', { name: 'Naplánovat akci' }).click();
		const sheet = page.getByRole('dialog');
		await sheet.getByLabel('Datum', { exact: true }).fill('2026-11-24');
		await sheet.getByLabel('Název', { exact: true }).fill('Kontrola hydrantů');
		await sheet.getByRole('button', { name: 'Uložit akci' }).click();
		await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Úterý 24. 11. 2026');
		await expect(sheet.getByRole('link', { name: /Kontrola hydrantů/ })).toBeVisible();
	});

	test('tapping outside the sheet closes it, and a place is picked by touch', async ({ page }) => {
		await seedActivity('used', '2026-11-10', 'Starší akce', '09:00', 'Hasičská louka');
		await join(page);
		await day(page, today).tap();
		const sheet = page.getByRole('dialog');
		const place = sheet.getByRole('combobox', { name: 'Místo' });
		await place.tap();
		await sheet.getByRole('option', { name: 'Hasičská louka' }).tap();
		await expect(place).toHaveValue('Hasičská louka');
		await expect(sheet.getByRole('listbox', { name: 'Uložená místa' })).toHaveCount(0);
		await page.mouse.click(20, 20);
		await expect(sheet).toHaveCount(0);
	});
});

test('calendar jumps to today and next week', async ({ signedIn: page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
	const jumps = page.getByRole('navigation', { name: 'Přeskočit na' });
	await jumps.getByRole('button', { name: 'Příští týden' }).click();
	await expect(day(page, '2026-11-23', true)).toBeFocused();
	await jumps.getByRole('button', { name: 'Dnes', exact: true }).click();
	await expect(day(page, today, true)).toBeFocused();
});

test('the activity filter says when nothing is planned for a year', async ({ signedIn: page }) => {
	await page.getByRole('group', { name: 'Zobrazit dny' }).getByRole('button', { name: 'Akce', exact: true }).click();
	await expect(page.getByText('Na rok dopředu žádné akce.')).toBeVisible();
});

test('the count is coloured by how many can come', async ({ page }) => {
	await Promise.all([
		seedMember('m3', 'Karel Malý', '#1E6B45'),
		seedMember('m4', 'Eva Malá', '#6B3FA0'),
		seedMember('m5', 'Josef Velký', '#0F6E73')
	]);
	const away = async (date: string, ids: string[]) => Promise.all(ids.map((memberId) =>
		seedAbsence(`${memberId}-${date}`, { memberId, from: date, to: date })));
	await away('2026-11-20', ['m3']);
	await away('2026-11-21', ['m3', 'm4']);
	await away('2026-11-22', ['m3', 'm4', 'm5']);
	await join(page);
	for (const [date, color] of [['2026-11-20', 'text-good'], ['2026-11-21', 'text-ink-2'], ['2026-11-22', 'text-warn']]) {
		await expect(day(page, date).locator('..').locator(`span.${color}.lg\\:block`)).toBeVisible();
	}
});
