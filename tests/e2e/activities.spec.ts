import { acceptDialog, day, expect, join, nav, seedActivity, seedSeries, test } from './fixtures';

test('plans an activity, edits its details, and shares attendance across the whole day', async ({ page }) => {
	await seedActivity('second', '2026-11-20', 'Druhá akce', '18:00');
	await join(page);
	await page.getByRole('button', { name: 'Naplánovat akci' }).click();
	const date = page.getByLabel('Datum', { exact: true });
	await expect(date).toHaveValue('');
	await date.fill('2026-11-20');
	await page.getByLabel('Název', { exact: true }).fill('Zkouška sirény');
	await page.getByLabel('Hodina').selectOption('17');
	await page.getByLabel('Minuta').selectOption('15');
	await page.getByRole('combobox', { name: 'Místo' }).fill('Náměstí');
	await page.getByRole('button', { name: 'Uložit akci' }).click();
	await page.getByRole('link', { name: /Zkouška sirény/ }).click();
	await expect(page.getByRole('heading', { name: 'Zkouška sirény' })).toBeVisible();
	await expect(page.getByText('Sraz v 17:15')).toBeVisible();
	await expect(page.getByText('Náměstí', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Nemůžu přijít', exact: true }).click();
	const reason = page.getByLabel('Důvod (nepovinné)');
	await reason.fill('Odpolední směna');
	await reason.blur();
	await expect(page.getByText('1 z 2 přijde')).toBeVisible();
	await page.goto('/akce/second');
	await expect(page.getByText('Na tuto akci nepřijdete')).toBeVisible();
	await expect(page.getByLabel('Důvod (nepovinné)')).toHaveValue('Odpolední směna');

	await nav(page, 'Plán').click();
	await day(page, '2026-11-20').click();
	await expect(page.getByText(/Jana Nováková \(Odpolední směna\)/)).toBeVisible();
	await page.getByRole('link', { name: /Zkouška sirény/ }).click();
	await page.getByRole('button', { name: 'Přece jen přijdu' }).click();
	await expect(page.getByText('2 z 2 přijde')).toBeVisible();
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await page.getByLabel('Název', { exact: true }).fill('Zkouška techniky');
	await page.getByLabel('Poznámka').fill('Přineste přilby.');
	await page.getByLabel('Hodina').selectOption('');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByRole('heading', { name: 'Zkouška techniky' })).toBeVisible();
	await expect(page.getByText('Přineste přilby.')).toBeVisible();
	await expect(page.getByText(/Sraz v/)).toHaveCount(0);

	const deletedURL = page.url();
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Smazat akci' }).click();
	await expect(page.getByRole('heading', { name: 'Plán' })).toBeVisible();
	await page.goto(deletedURL);
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
});

test('moves and cancels individual legacy weekly occurrences', async ({ page }) => {
	await seedSeries('weekly', { from: '2026-11-19', to: '2026-12-17' });
	await join(page, '/akce/weekly_2026-11-26');
	await page.getByRole('button', { name: 'Změnit jen tento termín' }).click();
	await expect(page.getByRole('radio', { name: 'Jen tento termín' })).toBeChecked();
	await page.getByLabel('Datum', { exact: true }).fill('2026-11-28');
	await page.getByLabel('Název', { exact: true }).fill('Přesunutý výcvik');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByText(/Tento termín je přesunutý z Čt 26\. 11\./)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Přesunutý výcvik' })).toBeVisible();
	await nav(page, 'Plán').click();
	await expect(day(page, '2026-11-26').locator('..')).not.toContainText('Výcvik');
	await expect(day(page, '2026-11-28').locator('..')).toContainText('Přesunutý výcvik');
	await page.goto('/akce/weekly_2026-12-03');
	await expect(page.getByRole('heading', { name: 'Výcvik' })).toBeVisible();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Zrušit tento termín' }).click();
	await expect(page.getByRole('heading', { name: 'Plán' })).toBeVisible();
	await page.goto('/akce/weekly_2026-12-03');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
	await page.goto('/akce/weekly_2026-12-10');
	await expect(page.getByRole('heading', { name: 'Výcvik' })).toBeVisible();
});

test('splits a series, changes its rule and end, then stops repeating', async ({ page }) => {
	await seedSeries('split', { from: '2026-11-19', to: '2026-12-17' });
	await join(page, '/akce/split_2026-12-10');
	await page.getByRole('button', { name: 'Změnit jen tento termín' }).click();
	await page.getByLabel('Název', { exact: true }).fill('Pozdější výjimka');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByRole('heading', { name: 'Pozdější výjimka' })).toBeVisible();

	await page.goto('/akce/split_2026-11-26');
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await page.getByRole('radio', { name: 'Tento i všechny další' }).check();
	await page.getByLabel('Název', { exact: true }).fill('Obnovený výcvik');
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByLabel('Frekvence').selectOption('day');
	await page.getByRole('spinbutton', { name: /Jednou za/ }).fill('2');
	await page.getByLabel(/Opakovat do/).fill('2026-12-02');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByRole('heading', { name: 'Obnovený výcvik' })).toBeVisible();
	await expect(page).toHaveURL(/_2026-11-26$/);
	const newSeries = page.url().slice(0, -10);
	await page.goto('/akce/split_2026-11-19');
	await expect(page.getByRole('heading', { name: 'Výcvik' })).toBeVisible();
	await page.goto('/akce/split_2026-12-10');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
	await page.goto(newSeries + '2026-12-02');
	await expect(page.getByRole('heading', { name: 'Obnovený výcvik' })).toBeVisible();
	await page.goto(newSeries + '2026-12-04');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();

	await page.goto(newSeries + '2026-11-28');
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await page.getByRole('radio', { name: 'Tento i všechny další' }).check();
	await page.getByRole('radio', { name: 'Neopakovat' }).check();
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByRole('heading', { name: 'Obnovený výcvik' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Zrušit tento termín' })).toHaveCount(0);
	await page.goto(newSeries + '2026-11-30');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
});

test('turns a one-off into a weekly activity and deletes this and later dates', async ({ page }) => {
	await seedActivity('standalone', '2026-11-19', 'Výjezd');
	await join(page, '/akce/standalone');
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await page.getByRole('radio', { name: /Opakovat každý týden/ }).check();
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page).toHaveURL(/_2026-11-19$/);
	const series = page.url().slice(0, -10);
	await page.goto(series + '2026-11-26');
	await expect(page.getByRole('heading', { name: 'Výjezd' })).toBeVisible();
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Smazat tuto i všechny další' }).click();
	await expect(page.getByRole('heading', { name: 'Plán' })).toBeVisible();
	await page.goto(series + '2026-12-03');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
	await page.goto(series + '2026-11-19');
	await expect(page.getByRole('heading', { name: 'Výjezd' })).toBeVisible();
});

test('rescheduling from an already moved weekly occurrence keeps that occurrence and later cancellations', async ({ page }) => {
	await seedSeries('moved', { from: '2026-11-19', to: '2026-12-17', except: ['2026-12-03'] });
	await join(page, '/akce/moved_2026-11-26');
	await page.getByRole('button', { name: 'Změnit jen tento termín' }).click();
	await page.getByLabel('Datum', { exact: true }).fill('2026-11-28');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page.getByText(/přesunutý z Čt 26\. 11\./)).toBeVisible();

	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	await page.getByRole('radio', { name: 'Tento i všechny další' }).check();
	await page.getByLabel('Název', { exact: true }).fill('Sobotní výcvik');
	await page.getByRole('button', { name: 'Uložit změny' }).click();
	await expect(page).toHaveURL(/_2026-11-28$/);
	await expect(page.getByRole('heading', { name: 'Sobotní výcvik' })).toBeVisible();
	const newSeries = page.url().slice(0, -10);
	await page.goto(newSeries + '2026-12-05');
	await expect(page.getByRole('heading', { name: 'Akce už neexistuje.' })).toBeVisible();
	await page.goto(newSeries + '2026-12-12');
	await expect(page.getByRole('heading', { name: 'Sobotní výcvik' })).toBeVisible();
	await page.goto('/akce/moved_2026-11-19');
	await expect(page.getByRole('heading', { name: 'Výcvik' })).toBeVisible();
});
