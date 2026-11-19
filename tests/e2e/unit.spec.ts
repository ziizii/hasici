import { acceptDialog, day, expect, member, nav, otherMember, seedActivity, seedMember, test, today } from './fixtures';

test('renames the unit and manages member names, nicknames, colors and the archive', async ({ signedIn: page }) => {
	await nav(page, 'Jednotka').click();
	const unitName = page.getByLabel('Název jednotky');
	await unitName.fill('SDH Lhota');
	await unitName.press('Enter');
	await expect(page.getByRole('banner').getByText('SDH Lhota')).toBeVisible();

	const members = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Členové/ }) });
	const newMember = members.getByLabel('Jméno nového člena');
	await newMember.fill('Petr Nový');
	await members.getByRole('button', { name: 'Přidat', exact: true }).click();
	const added = members.getByRole('button', { name: /Petr Nový/ });
	await expect(added).toBeVisible();
	await added.click();
	const name = members.getByLabel('Jméno', { exact: true });
	await name.fill('Petr Novotný');
	await name.press('Enter');
	const nickname = members.getByLabel(/^Přezdívka/);
	await nickname.fill('Novas');
	await nickname.press('Enter');
	const color = members.getByLabel('Vlastní barva');
	await color.fill('#fefefe');
	await members.getByRole('button', { name: 'Hotovo' }).click();
	const renamed = members.getByRole('button', { name: /Petr Novotný.*Novas/ });
	await expect(renamed.locator('span').first()).toHaveCSS('background-color', 'rgb(254, 254, 254)');
	await expect(renamed.locator('span').first()).toHaveCSS('color', 'rgb(0, 0, 0)');

	await renamed.click();
	await members.getByRole('button', { name: 'Archivovat' }).click();
	const archive = members.getByRole('button', { name: 'Archiv (1)' });
	await expect(archive).toBeVisible();
	await page.getByRole('button', { name: 'Vrátit zpět' }).click();
	await expect(renamed).toBeVisible();
	await renamed.click();
	await members.getByRole('button', { name: 'Archivovat' }).click();
	await archive.click();
	await members.getByRole('button', { name: 'Obnovit' }).click();
	await expect(renamed).toBeVisible();

	await renamed.click();
	await members.getByRole('switch', { name: /^Není k dispozici/ }).click();
	await expect(page.getByRole('heading', { name: 'Nedostupní (1)' })).toBeVisible();
	await members.getByRole('button', { name: 'Archivovat' }).click();
	if (await archive.getAttribute('aria-expanded') === 'false') await archive.click();
	acceptDialog(page);
	await members.getByRole('button', { name: 'Trvale smazat Petr Novotný' }).click();
	await expect(archive).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Nedostupní (0)' })).toBeVisible();
	await page.reload();
	await expect(members.getByRole('heading', { name: 'Členové (2)' })).toBeVisible();
	await expect(members.getByRole('button', { name: new RegExp(otherMember) })).toBeVisible();
});

test('a member can update their own palette color and sees it in the plan', async ({ signedIn: page }) => {
	await nav(page, 'Já').click();
	await page.getByRole('button', { name: /^Moje barva/ }).click();
	const swatch = page.getByRole('button', { name: /^Barva #/, pressed: false }).first();
	const selected = (await swatch.getAttribute('aria-label'))!;
	const hex = selected.slice(-6);
	const rgb = (hex.match(/../g) ?? []).map((n) => parseInt(n, 16)).join(', ');
	await swatch.click();
	await expect(page.getByRole('button', { name: selected, pressed: true })).toBeVisible();
	await nav(page, 'Plán').click();
	await day(page, today).click();
	await expect(page.getByRole('button', { name: new RegExp(`\\(${member}\\): může`) }).locator('span').first())
		.toHaveCSS('background-color', `rgb(${rgb})`);
});

test('saved places can be suggested by keyboard, set as default, and removed', async ({ signedIn: page }) => {
	await nav(page, 'Jednotka').click();
	const places = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Místa akcí' }) });
	const placeName = places.getByLabel('Nové místo');
	for (const name of ['Zbrojnice', 'Školní hřiště']) {
		await placeName.fill(name);
		await places.getByRole('button', { name: 'Přidat', exact: true }).click();
		await expect(places.getByText(name, { exact: true })).toBeVisible();
	}
	await places.getByRole('listitem').filter({ hasText: 'Zbrojnice' })
		.getByRole('button', { name: 'Nastavit výchozí' }).click();
	await expect(places.getByRole('button', { name: 'Výchozí', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await nav(page, 'Plán').click();
	await day(page, today).click();
	const place = page.getByRole('combobox', { name: 'Místo' });
	await expect(place).toHaveValue('Zbrojnice');
	await page.getByRole('button', { name: 'Smazat místo' }).click();
	await place.fill('skolni');
	await expect(page.getByRole('option', { name: 'Školní hřiště' })).toBeVisible();
	await place.press('ArrowDown');
	await place.press('Enter');
	await expect(place).toHaveValue('Školní hřiště');
	await page.getByLabel('Název', { exact: true }).fill('Cvičení na hřišti');
	await page.getByRole('button', { name: 'Uložit akci' }).click();
	await expect(page.getByRole('link', { name: /Cvičení na hřišti/ })).toBeVisible();
	await nav(page, 'Jednotka').click();
	await places.getByRole('button', { name: 'Odebrat Zbrojnice' }).click();
	await expect(places.getByText('Zbrojnice', { exact: true })).toHaveCount(0);
	await nav(page, 'Plán').click();
	await page.getByRole('button', { name: 'Naplánovat akci' }).click();
	await expect(place).toHaveValue('');
});

test('the Unit expands and collapses the longer upcoming-activity list', async ({ signedIn: page }) => {
	await Promise.all(Array.from({ length: 11 }, (_, i) =>
		seedActivity(`upcoming-${i + 1}`, `2026-12-${String(i + 1).padStart(2, '0')}`, `Cvičení ${i + 1}`)
	));
	await nav(page, 'Jednotka').click();
	const lastActivity = page.getByRole('link', { name: /^Cvičení 11 / });
	await expect(page.getByRole('heading', { name: 'Nadcházející akce (11)' })).toBeVisible();
	await expect(lastActivity).toHaveCount(0);
	await page.getByRole('button', { name: 'Zobrazit všechny (11)' }).click();
	await expect(lastActivity).toBeVisible();
	await page.getByRole('button', { name: 'Zobrazit méně' }).click();
	await expect(lastActivity).toHaveCount(0);
});

test('the plan disambiguates duplicate first names and uses a nickname when set', async ({ signedIn: page }) => {
	await seedMember('petr-n', 'Petr Nový', '#296931');
	const row = day(page, today).locator('..');
	await expect(row.getByText('Petr D.', { exact: true })).toBeVisible();
	await expect(row.getByText('Petr N.', { exact: true })).toBeVisible();
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: /Petr Nový/ }).click();
	const nickname = page.getByLabel(/^Přezdívka/);
	await nickname.fill('Novas');
	await nickname.press('Enter');
	await page.getByRole('button', { name: 'Hotovo', exact: true }).click();
	await nav(page, 'Plán').click();
	await expect(row.getByText('Petr', { exact: true })).toBeVisible();
	await expect(row.getByText('Novas', { exact: true })).toBeVisible();
});
