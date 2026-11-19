import { acceptDialog, day, expect, join, member, nav, otherMember, seedActivity, seedMember, startTodo, test, today } from './fixtures';

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

test('a failed copy asks to select the link by hand, and toasts can be dismissed', async ({ signedIn: page }) => {
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new Error('denied')) }
		});
	});
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: 'Kopírovat' }).click();
	await expect(page.getByRole('status')).toHaveText('Kopírování se nepovedlo, označte odkaz ručně.');

	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.getByRole('button', { name: 'Archivovat' }).click();
	await expect(page.getByRole('button', { name: 'Vrátit zpět' })).toBeVisible();
	await page.getByRole('button', { name: 'Skrýt oznámení' }).click();
	await expect(page.getByRole('button', { name: 'Vrátit zpět' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Archiv (1)' })).toBeVisible();
});

test('new members get a free palette color, and a restored member gets a new one if theirs was taken', async ({ signedIn: page }) => {
	await nav(page, 'Jednotka').click();
	const members = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Členové/ }) });
	const add = async (name: string) => {
		await members.getByLabel('Jméno nového člena').fill(name);
		await members.getByRole('button', { name: 'Přidat', exact: true }).click();
		await expect(members.getByRole('button', { name: new RegExp(name) })).toBeVisible();
	};
	const colorOf = async (name: string, color: string) => {
		await members.getByRole('button', { name: new RegExp(name) }).click();
		await expect(members.getByRole('button', { name: `Barva ${color}` })).toHaveAttribute('aria-pressed', 'true');
		await members.getByRole('button', { name: 'Hotovo' }).click();
	};
	// Jana has the first palette color; Petr's color is not in the palette.
	await add('Karel Malý');
	await colorOf('Karel Malý', '#9C2A2A');
	await members.getByRole('button', { name: /Karel Malý/ }).click();
	await members.getByRole('button', { name: 'Archivovat' }).click();
	await add('Eva Malá');
	await colorOf('Eva Malá', '#9C2A2A');
	await members.getByRole('button', { name: 'Archiv (1)' }).click();
	await members.getByRole('button', { name: 'Obnovit' }).click();
	await colorOf('Karel Malý', '#1E6B45');
});

test('with every palette color taken, a new member shares the least used one', async ({ signedIn: page }) => {
	const palette = ['#9C2A2A', '#1E6B45', '#6B3FA0', '#0F6E73', '#A3245A', '#4F5F12', '#005F87', '#8F4207', '#2C3E9E',
		'#7A5200', '#7D2E8E', '#3B6E1E', '#8A3B12', '#44546A', '#9A1F4F', '#00695C', '#5B3A29', '#4B3F99', '#B23A8A'];
	await Promise.all(palette.map((color, i) => seedMember(`m${i}`, `Člen ${i + 1}`, color)));
	await seedMember('dup', 'Člen Navíc', '#9C2A2A');
	await nav(page, 'Jednotka').click();
	const members = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Členové/ }) });
	await expect(members.getByRole('heading', { name: 'Členové (22)' })).toBeVisible();
	await members.getByLabel('Jméno nového člena').fill('Nový Člen');
	await members.getByRole('button', { name: 'Přidat', exact: true }).click();
	await members.getByRole('button', { name: /Nový Člen/ }).click();
	await expect(members.getByRole('button', { name: 'Barva #1F4E8C' })).toHaveAttribute('aria-pressed', 'true');
});

test('places from earlier activities are suggested, and Escape closes the list', async ({ page }) => {
	await seedActivity('used', '2026-11-10', 'Starší akce', '09:00', 'Hasičská louka');
	await join(page);
	await day(page, today).click();
	const place = page.getByRole('combobox', { name: 'Místo' });
	await place.fill('hasic');
	const option = page.getByRole('option', { name: 'Hasičská louka' });
	await expect(option).toBeVisible();
	await place.press('Escape');
	await expect(option).toHaveCount(0);
	await expect(place).toHaveValue('hasic');
	await place.press('ArrowDown');
	await expect(option).toBeVisible();
	await option.click();
	await expect(place).toHaveValue('Hasičská louka');
});

test('archived members leave the plan bar and the assignee picker', async ({ signedIn: page }) => {
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.getByRole('button', { name: 'Archivovat' }).click();
	await nav(page, 'Plán').click();
	await expect(day(page, today)).toHaveAccessibleName(/může 1 z 1/);
	await day(page, today).click();
	await expect(page.getByRole('button', { name: new RegExp(otherMember) })).toHaveCount(0);
	await nav(page, 'Úkoly').click();
	await page.getByRole('button', { name: 'Nový úkol', exact: true }).click();
	await expect(page.getByLabel('Řešitel').getByRole('option', { name: otherMember })).toHaveCount(0);
	await expect(page.getByLabel('Řešitel').getByRole('option', { name: member })).toHaveCount(1);
});

test('dismissing a confirmation leaves things as they were', async ({ page }) => {
	await seedActivity('kept', '2026-11-25', 'Údržba stříkačky');
	await join(page, '/akce/kept');
	const dismiss = () => page.once('dialog', (dialog) => dialog.dismiss());

	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	dismiss();
	await page.getByRole('button', { name: 'Smazat akci' }).click();
	await page.goto('/akce/kept');
	await expect(page.getByRole('heading', { name: 'Údržba stříkačky' })).toBeVisible();

	await nav(page, 'Jednotka').click();
	const link = page.getByLabel('Odkaz', { exact: true });
	await expect(link).toHaveValue(/\?k=/);
	const before = await link.inputValue();
	dismiss();
	await page.getByRole('button', { name: 'Vytvořit nový odkaz' }).click();
	await page.reload();
	await expect(link).toHaveValue(before);

	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.getByRole('button', { name: 'Archivovat' }).click();
	await page.getByRole('button', { name: 'Archiv (1)' }).click();
	dismiss();
	await page.getByRole('button', { name: `Trvale smazat ${otherMember}` }).click();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Archiv (1)' })).toBeVisible();

	await nav(page, 'Úkoly').click();
	await startTodo(page, 'Zkontrolovat hydranty');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('button', { name: 'Upravit: Zkontrolovat hydranty' }).click();
	dismiss();
	await page.getByRole('button', { name: 'Smazat úkol' }).click();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Dokončit: Zkontrolovat hydranty' })).toBeVisible();
});

test('without a share sheet, "Sdílet" copies the link', async ({ signedIn: page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
	});
	await nav(page, 'Jednotka').click();
	const link = page.getByLabel('Odkaz', { exact: true });
	await expect(link).toHaveValue(/\?k=/);
	await page.getByRole('button', { name: 'Sdílet', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Odkaz zkopírován');
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(await link.inputValue());
});

test('tapping "Výchozí" again clears the default place', async ({ signedIn: page }) => {
	await nav(page, 'Jednotka').click();
	const places = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Místa akcí' }) });
	await places.getByLabel('Nové místo').fill('Zbrojnice');
	await places.getByRole('button', { name: 'Přidat', exact: true }).click();
	await places.getByRole('button', { name: 'Nastavit výchozí' }).click();
	const current = places.getByRole('button', { name: 'Výchozí', exact: true });
	await expect(current).toHaveAttribute('aria-pressed', 'true');
	await current.click();
	await expect(places.getByRole('button', { name: 'Nastavit výchozí' })).toBeVisible();
	await nav(page, 'Plán').click();
	await day(page, today).click();
	await expect(page.getByRole('combobox', { name: 'Místo' })).toHaveValue('');
});

test('more than ten past activities can be expanded', async ({ signedIn: page }) => {
	await Promise.all(Array.from({ length: 11 }, (_, i) =>
		seedActivity(`past-${i + 1}`, `2026-10-${String(i + 10).padStart(2, '0')}`, `Zásah ${i + 1}`)
	));
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: /Proběhlé akce/ }).click();
	const oldest = page.getByRole('link', { name: /^Zásah 1 / });
	await expect(page.getByRole('link', { name: /^Zásah 11 / })).toBeVisible();
	await expect(oldest).toHaveCount(0);
	await page.getByRole('button', { name: 'Zobrazit všechny (11)' }).click();
	await expect(oldest).toBeVisible();
	await page.getByRole('button', { name: 'Zobrazit méně' }).click();
	await expect(oldest).toHaveCount(0);
});
