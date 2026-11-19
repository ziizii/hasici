import type { Page } from '@playwright/test';
import { acceptDialog, expect, freezeDate, join, nav, seedSeries, startTodo, test } from './fixtures';

type Pattern = {
	name: string;
	from: string;
	until: string;
	frequency: 'day' | 'week' | 'month' | 'year';
	every?: string;
	pick?: (page: Page) => Promise<void>;
	slots: [string, string][];
	excluded: string[];
};

const patterns: Pattern[] = [
	{
		name: 'every two days across the Prague spring clock change',
		from: '2027-03-26', until: '2027-03-30', frequency: 'day', every: '2',
		slots: [['2027-03-26', 'Pá 26. 3. 2027'], ['2027-03-28', 'Ne 28. 3. 2027'], ['2027-03-30', 'Út 30. 3. 2027']],
		excluded: ['2027-03-27', '2027-04-01']
	},
	{
		name: 'two weekdays every other week with a midweek anchor',
		from: '2026-11-19', until: '2026-12-04', frequency: 'week', every: '2',
		pick: async (page) => {
			const days = page.getByRole('group', { name: 'Dny v týdnu' });
			await days.getByRole('button', { name: 'Čt', exact: true }).click();
			await days.getByRole('button', { name: 'Pá', exact: true }).click();
			await days.getByRole('button', { name: 'Po', exact: true }).click();
		},
		slots: [['2026-11-20', 'Pá 20. 11.'], ['2026-11-30', 'Po 30. 11.'], ['2026-12-04', 'Pá 4. 12.']],
		excluded: ['2026-11-16', '2026-11-19', '2026-11-23', '2026-12-14']
	},
	{
		name: 'the 31st of the month, skipping short months',
		from: '2027-01-31', until: '2027-05-31', frequency: 'month',
		pick: async (page) => {
			await expect(page.getByRole('group', { name: 'Dny v měsíci' }).getByRole('button', {
				name: '31', exact: true
			})).toHaveAttribute('aria-pressed', 'true');
		},
		slots: [['2027-01-31', 'Ne 31. 1. 2027'], ['2027-03-31', 'St 31. 3. 2027'], ['2027-05-31', 'Po 31. 5. 2027']],
		excluded: ['2027-02-28', '2027-04-30', '2027-07-31']
	},
	{
		name: 'two dates every other month',
		from: '2026-11-19', until: '2027-01-25', frequency: 'month', every: '2',
		pick: async (page) => {
			await page.getByRole('group', { name: 'Dny v měsíci' })
				.getByRole('button', { name: '25', exact: true }).click();
		},
		slots: [['2026-11-19', 'Čt 19. 11.'], ['2026-11-25', 'St 25. 11.'],
			['2027-01-19', 'Út 19. 1. 2027'], ['2027-01-25', 'Po 25. 1. 2027']],
		excluded: ['2026-12-19', '2026-12-25', '2027-03-19']
	},
	{
		name: 'a fifth Thursday, skipping months with only four',
		from: '2026-11-19', until: '2027-04-29', frequency: 'month',
		pick: async (page) => {
			await page.getByRole('radio', { name: 'V určitý den v týdnu' }).check();
			await page.getByLabel('Kolikátý').selectOption({ label: 'pátý' });
			await page.getByLabel('Den', { exact: true }).selectOption({ label: 'čtvrtek' });
		},
		slots: [['2026-12-31', 'Čt 31. 12.'], ['2027-04-29', 'Čt 29. 4. 2027']],
		excluded: ['2026-11-26', '2027-02-25', '2027-07-29']
	},
	{
		name: 'the last workday in selected months every other year',
		from: '2026-11-19', until: '2028-11-30', frequency: 'year', every: '2',
		pick: async (page) => {
			await page.getByRole('group', { name: 'Měsíce' }).getByRole('button', { name: 'pro' }).click();
			await page.getByRole('checkbox', { name: 'V určitý den v týdnu' }).check();
			await page.getByLabel('Kolikátý').selectOption({ label: 'poslední' });
			await page.getByLabel('Den', { exact: true }).selectOption({ label: 'pracovní den' });
		},
		slots: [['2026-11-30', 'Po 30. 11.'], ['2026-12-31', 'Čt 31. 12.'], ['2028-11-30', 'Čt 30. 11. 2028']],
		excluded: ['2026-11-29', '2027-11-30', '2028-12-29']
	}
];

async function pickPattern(page: Page, pattern: Pattern) {
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByLabel('Frekvence').selectOption(pattern.frequency);
	if (pattern.every) await page.getByRole('spinbutton', { name: /Jednou za/ }).fill(pattern.every);
	await pattern.pick?.(page);
	await page.getByLabel(/Opakovat do/).fill(pattern.until);
}

async function startActivity(page: Page, title: string, date: string) {
	await nav(page, 'Plán').click();
	await page.getByRole('button', { name: 'Naplánovat akci' }).click();
	await page.getByLabel('Datum', { exact: true }).fill(date);
	await page.getByLabel('Název', { exact: true }).fill(title);
}

for (const pattern of patterns) {
	test(`task and activity recurrence agree for ${pattern.name}`, async ({ signedIn: page }) => {
		await startActivity(page, 'Pravidelná akce', pattern.from);
		await pickPattern(page, pattern);
		const preview = page.getByText(/^Nejbližší:/);
		for (const [, label] of pattern.slots) await expect(preview).toContainText(label);
		await page.getByRole('button', { name: 'Uložit akci' }).click();
		await expect(page.getByRole('status')).toHaveText('Opakovaná akce uložena');
		await nav(page, 'Jednotka').click();
		const firstLink = page.getByRole('link', { name: /Pravidelná akce/ }).first();
		await expect(firstLink).toHaveAttribute('href', new RegExp(`_${pattern.slots[0][0]}$`));
		const seriesPath = (await firstLink.getAttribute('href'))!.slice(0, -10);
		for (const [slot] of pattern.slots) {
			await page.goto(seriesPath + slot);
			await expect(page.getByRole('heading', { name: 'Pravidelná akce' })).toBeVisible();
		}
		for (const slot of pattern.excluded) {
			await page.goto(seriesPath + slot);
			await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
		}

		await nav(page, 'Úkoly').click();
		await startTodo(page, 'Pravidelný úkol');
		await page.getByLabel('Termín dokončení').fill(pattern.from);
		await page.getByLabel('Opakování úkolu').selectOption('calendar');
		await pickPattern(page, pattern);
		await expect(preview).toHaveText(`Nejbližší: ${pattern.slots[0][1]}`);
		await page.getByRole('button', { name: 'Uložit úkol' }).click();

		const complete = page.getByRole('button', { name: 'Dokončit: Pravidelný úkol' });
		const row = page.getByRole('listitem').filter({ has: complete });
		for (const [, label] of pattern.slots) {
			await expect(row).toHaveCount(1);
			await expect(row.getByText(`Termín ${label}`, { exact: true })).toBeVisible();
			await complete.click();
		}
		await expect(page.getByText('Žádné otevřené úkoly.')).toBeVisible();
		await page.getByRole('button', { name: 'Hotové', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Znovu otevřít: Pravidelný úkol' }))
			.toHaveCount(pattern.slots.length);
	});
}

test('rejects an empty pattern and a bounded pattern with zero occurrences', async ({ signedIn: page }) => {
	await startActivity(page, 'Nevychází', '2026-11-19');
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByRole('button', { name: 'Čt', exact: true }).click();
	await expect(page.getByText('Vyberte aspoň jeden den.')).toBeVisible();
	const saveActivity = page.getByRole('button', { name: 'Uložit akci' });
	await expect(saveActivity).toBeDisabled();
	await page.getByRole('button', { name: 'Pá', exact: true }).click();
	await page.getByLabel(/Opakovat do/).fill('2026-11-19');
	await expect(page.getByText('Do zvoleného konce už nevychází žádný den.')).toBeVisible();
	await expect(saveActivity).toBeDisabled();

	await nav(page, 'Úkoly').click();
	await startTodo(page, 'Nevychází');
	await page.getByLabel('Opakování úkolu').selectOption('calendar');
	const saveTodo = page.getByRole('button', { name: 'Uložit úkol' });
	await expect(saveTodo).toBeDisabled();
	await page.getByLabel('Termín dokončení').fill('2026-11-19');
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByRole('button', { name: 'Čt', exact: true }).click();
	await expect(saveTodo).toBeDisabled();
	await page.getByRole('button', { name: 'Pá', exact: true }).click();
	await page.getByLabel(/Opakovat do/).fill('2026-11-19');
	await expect(saveTodo).toBeDisabled();
});

test('keeps a yearly series editable when its next leap day is decades away', async ({ page }) => {
	// 2100 is not a leap year, so the sixteen-year rule skips its 2100 slot.
	await seedSeries('century', {
		from: '2084-02-29', to: '2116-02-29', repeat: { freq: 'year', every: 16, months: [2] }
	});
	await seedSeries('ends-early', {
		from: '2084-02-29', to: '2116-02-28', repeat: { freq: 'year', every: 16, months: [2] }
	});
	await join(page, '/akce/century_2084-02-29');
	await expect(page.getByRole('heading', { name: 'Výcvik' })).toBeVisible();
	await expect(page.getByText(/do So 29\. 2\. 2116/)).toBeVisible();
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Tento i všechny další' })).toBeVisible();
	await page.goto('/akce/ends-early_2084-02-29');
	await expect(page.getByText(/do Út 29\. 2\. 2084/)).toBeVisible();
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Tento i všechny další' })).toHaveCount(0);
});

test('late completion skips overdue dates and reopening removes exactly one successor', async ({ signedIn: page }) => {
	await nav(page, 'Úkoly').click();
	await startTodo(page, 'Prohlídka');
	await page.getByLabel('Termín dokončení').fill('2026-11-13');
	await page.getByLabel('Opakování úkolu').selectOption('calendar');
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByLabel('Frekvence').selectOption('day');
	await page.getByRole('spinbutton', { name: /Jednou za/ }).fill('2');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	const complete = page.getByRole('button', { name: 'Dokončit: Prohlídka' });
	const open = page.getByRole('button', { name: 'Otevřené', exact: true });
	const done = page.getByRole('button', { name: 'Hotové', exact: true });
	const reopen = page.getByRole('button', { name: 'Znovu otevřít: Prohlídka' });
	await complete.click();
	await expect(page.getByText('Termín So 21. 11.')).toBeVisible();
	await done.click();
	await reopen.click(); // Dismiss the confirmation.
	await expect(reopen).toHaveCount(1);
	acceptDialog(page);
	await reopen.click();
	await expect(page.getByText('Žádné hotové úkoly.')).toBeVisible();
	await open.click();
	await expect(page.getByText('Termín Pá 13. 11.')).toBeVisible();
	await complete.click();
	await expect(page.getByText('Termín So 21. 11.')).toBeVisible();
	await complete.click();
	await expect(page.getByText('Termín Po 23. 11.')).toBeVisible();
	await done.click();
	const previous = page.getByRole('listitem').filter({ hasText: 'Termín Pá 13. 11.' });
	await previous.getByRole('button', { name: 'Znovu otevřít: Prohlídka' }).click();
	await expect(page.getByRole('status')).toHaveText('Další výskyt už byl dokončen nebo smazán.');
	await expect(reopen).toHaveCount(2);
});

test('completion intervals use completion day and clamp a short month', async ({ page }) => {
	await freezeDate(page, '2028-01-31');
	await join(page, '/ukoly');
	await startTodo(page, 'Výměna oleje');
	await page.getByLabel('Termín dokončení').fill('2028-02-12');
	await page.getByLabel('Opakování úkolu').selectOption('completion');
	await page.getByLabel('Jednotka').selectOption('month');
	const interval = page.getByLabel('Za jak dlouho po dokončení');
	await interval.fill('0');
	const save = page.getByRole('button', { name: 'Uložit úkol' });
	await expect(save).toBeDisabled();
	await interval.fill('1');
	await save.click();
	await page.getByRole('button', { name: 'Dokončit: Výměna oleje' }).click();
	await expect(page.getByText('Termín Út 29. 2.')).toBeVisible();
	await page.getByRole('button', { name: 'Upravit: Výměna oleje' }).click();
	await expect(page.getByLabel('Opakování úkolu')).toHaveValue('completion');
	await page.getByLabel('Opakování úkolu').selectOption('none');
	await save.click();
	await page.getByRole('button', { name: 'Dokončit: Výměna oleje' }).click();
	await expect(page.getByText('Žádné otevřené úkoly.')).toBeVisible();
});
