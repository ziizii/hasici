import { day, expect, join, member, nav, otherMember, seedActivity, test, today } from './fixtures';

test('records and undoes a quick absence, then splits a dated range around a freed day', async ({ signedIn: page }) => {
	await nav(page, 'Já').click();
	const create = page.getByRole('button', { name: 'Naplánovat nepřítomnost' });
	await create.click();
	await page.getByRole('button', { name: 'Dnes', exact: true }).click();
	await page.getByRole('button', { name: 'Nemoc', exact: true }).click();
	await page.getByRole('button', { name: 'Uložit', exact: true }).click();
	const absence = page.getByRole('listitem').filter({ hasText: 'Nemoc' });
	await expect(absence).toBeVisible();
	await absence.getByRole('button', { name: /Smazat nepřítomnost/ }).click();
	await expect(absence).toHaveCount(0);
	await page.getByRole('button', { name: 'Vrátit zpět' }).click();
	await expect(absence).toBeVisible();

	await create.click();
	await page.getByRole('button', { name: 'Zítra', exact: true }).click();
	await expect(page.getByLabel('Od', { exact: true })).toHaveValue('2026-11-20');
	await page.getByRole('button', { name: 'Víkend', exact: true }).click();
	await expect(page.getByLabel('Od', { exact: true })).toHaveValue('2026-11-21');
	await expect(page.getByLabel(/^Do \(/)).toHaveValue('2026-11-22');
	await page.getByLabel('Od', { exact: true }).fill('2026-11-21');
	await page.getByLabel(/^Do \(/).fill('2026-11-24');
	await page.getByLabel('Poznámka').fill('Kurz');
	await page.getByRole('button', { name: 'Uložit', exact: true }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Kurz' })).toHaveCount(1);

	await nav(page, 'Jednotka').click();
	await expect(page.getByRole('heading', { name: 'Nadcházející nepřítomnosti (2)' })).toBeVisible();
	await expect(page.getByText(/–.*Kurz/)).toBeVisible();
	await nav(page, 'Plán').click();
	const middle = day(page, '2026-11-23');
	await expect(middle).toHaveAccessibleName(/může 1 z 2/);
	await middle.click();
	await expect(page.getByText(/Jana Nováková \(Kurz\)/)).toBeVisible();
	await page.getByRole('button', { name: /přece jen můžu/ }).click();
	await expect(middle).toHaveAccessibleName(/může 2 z 2/);
	for (const neighbor of ['2026-11-22', '2026-11-24']) {
		await expect(day(page, neighbor)).toHaveAccessibleName(/může 1 z 2/);
	}
	await page.getByRole('button', { name: 'Tento den nemůžu' }).click();
	await expect(middle).toHaveAccessibleName(/může 1 z 2/);
	await nav(page, 'Já').click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Kurz' })).toHaveCount(1);
});

test('a repeating absence flags activity conflicts and supports a per-day exception', async ({ page }) => {
	await seedActivity('practice', '2026-11-26', 'Cvičení');
	await join(page, '/ja');
	await page.getByRole('button', { name: 'Naplánovat nepřítomnost' }).click();
	await page.getByRole('radio', { name: /Opakovat každý týden/ }).check();
	await page.getByLabel(/Opakovat do/).fill('2026-12-03');
	await page.getByLabel('Poznámka').fill('Směna');
	await page.getByRole('button', { name: 'Uložit', exact: true }).click();
	const clash = page.getByRole('link', { name: 'Překrývá se s akcí Cvičení' });
	await expect(clash).toBeVisible();
	await page.getByRole('button', { name: 'Čt 26. 11.: nemůžu' }).click();
	await expect(clash).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Čt 26. 11.: můžu' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Čt 3. 12.: nemůžu' })).toBeVisible();
	await page.getByRole('button', { name: 'Čt 26. 11.: můžu' }).click();
	await clash.click();
	await expect(page.getByText('1 z 2 přijde')).toBeVisible();
	await page.getByRole('button', { name: 'Přece jen přijdu' }).click();
	await expect(page.getByText('2 z 2 přijde')).toBeVisible();
	await page.getByRole('button', { name: 'Nemůžu přijít' }).click();
	await nav(page, 'Já').click();
	await expect(page.getByRole('button', { name: 'Čt 26. 11.: nemůžu' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Nadcházející (1)' })).toBeVisible();
});

test('long-term unavailability is excluded from the count and can be ended from Unit', async ({ signedIn: page }) => {
	await nav(page, 'Já').click();
	const unavailable = page.getByRole('switch', { name: /^Nejsem k dispozici/ });
	await unavailable.click();
	await expect(unavailable).toBeChecked();
	await nav(page, 'Plán').click();
	await expect(day(page, today)).toHaveAccessibleName(/může 1 z 1/);
	await day(page, today).click();
	await expect(page.getByText(/Dlouhodobě mimo: Jana Nováková/)).toBeVisible();
	await nav(page, 'Jednotka').click();
	await expect(page.getByRole('heading', { name: 'Nedostupní (1)' })).toBeVisible();
	await page.getByRole('button', { name: 'Je zpět' }).click();
	await expect(page.getByRole('heading', { name: 'Nedostupní (0)' })).toBeVisible();
	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	const teammate = page.getByRole('switch', { name: /^Není k dispozici/ });
	await teammate.click();
	await expect(teammate).toBeChecked();
	await expect(page.getByRole('heading', { name: 'Nedostupní (1)' })).toBeVisible();
	await nav(page, 'Plán').click();
	await expect(day(page, today)).toHaveAccessibleName(/může 1 z 1/);
	await day(page, today).click();
	await expect(page.getByText(/Dlouhodobě mimo: Petr Dvořák/)).toBeVisible();
	await expect(page.getByRole('button', { name: new RegExp(`\\(${member}\\): může`) })).toBeVisible();
});

test('history excludes members added later and supports attendance corrections', async ({ page }) => {
	await seedActivity('old', '2026-11-18', 'Středeční zásah');
	await seedActivity('older', '2026-09-27', 'Zářijový zásah');
	await join(page, '/jednotka');
	await expect(page.getByRole('link', { name: /Středeční zásah/ })).toHaveCount(0);
	await page.getByRole('button', { name: /Proběhlé akce/ }).click();
	await page.getByRole('link', { name: /Zářijový zásah/ }).click();
	await expect(page.getByText('Přišlo 0 z 0')).toBeVisible();
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: /Proběhlé akce/ }).click();
	await page.getByRole('link', { name: /Středeční zásah/ }).click();
	await expect(page.getByText('Přišlo 2 z 2')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nemůžu přijít', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: /\(Petr Dvořák\): může\./ }).click();
	await expect(page.getByText('Přišlo 1 z 2')).toBeVisible();
	await expect(page.getByRole('heading', { name: /Nepřišli \(1\)/ })).toBeVisible();
});

test('rejects an impossible absence range and reaches future sparse occurrences', async ({ signedIn: page }) => {
	await nav(page, 'Já').click();
	await page.getByRole('button', { name: 'Naplánovat nepřítomnost' }).click();
	await page.getByLabel('Od', { exact: true }).fill('2028-02-29');
	await page.getByRole('radio', { name: 'Vlastní' }).check();
	await page.getByLabel('Frekvence').selectOption('year');
	await page.getByRole('spinbutton', { name: /Jednou za/ }).fill('16');
	const end = page.getByLabel(/Opakovat do/);
	const save = page.getByRole('button', { name: 'Uložit', exact: true });
	await page.getByRole('group', { name: 'Měsíce' }).getByRole('button', { name: 'úno' }).click();
	await page.getByRole('group', { name: 'Měsíce' }).getByRole('button', { name: 'bře' }).click();
	await end.fill('2028-02-29');
	await expect(save).toBeDisabled();
	await page.getByRole('group', { name: 'Měsíce' }).getByRole('button', { name: 'bře' }).click();
	await page.getByRole('group', { name: 'Měsíce' }).getByRole('button', { name: 'úno' }).click();
	await end.fill('2044-02-29');
	await save.click();
	await expect(page.getByRole('button', { name: 'Út 29. 2. 2028: nemůžu' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Po 29. 2. 2044: nemůžu' })).toBeVisible();
});
