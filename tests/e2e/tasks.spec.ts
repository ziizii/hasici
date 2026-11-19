import { acceptDialog, day, expect, freezeDate, join, member, nav, otherMember, seedActivity, startTodo, test } from './fixtures';

test('creates, sorts, edits, completes, reopens and deletes shared tasks', async ({ signedIn: page, newDevice }) => {
	const other = await newDevice();
	await freezeDate(other);
	await join(other, '/ukoly', otherMember);
	await nav(page, 'Úkoly').click();
	await expect(page.getByText('Žádné otevřené úkoly.')).toBeVisible();
	await startTodo(page, 'Úklid');
	await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
	await expect(page.getByText('Žádné otevřené úkoly.')).toBeVisible();

	await startTodo(page, 'Úklid');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await startTodo(page, 'Revize');
	await page.getByLabel('Termín dokončení').fill('2026-11-18');
	await page.getByLabel('Řešitel').selectOption({ label: otherMember });
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	const list = page.getByRole('list', { name: 'Seznam úkolů' });
	await expect(list.getByRole('listitem').first()).toContainText('Revize');
	await expect(list.getByRole('listitem').first()).toContainText(otherMember);
	await expect(list.getByText('Termín St 18. 11.')).toHaveClass(/font-bold/);
	await other.getByRole('button', { name: 'Upravit: Revize' }).click();
	await other.getByLabel('Název', { exact: true }).fill('Revize auta');
	await other.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('button', { name: 'Dokončit: Revize auta' }).click();
	await page.getByRole('button', { name: 'Hotové', exact: true }).click();
	await expect(list.getByText('Hotovo Čt 19. 11.')).toBeVisible();
	await page.getByRole('button', { name: 'Znovu otevřít: Revize auta' }).click();
	await page.getByRole('button', { name: 'Otevřené', exact: true }).click();
	await page.getByRole('button', { name: 'Upravit: Revize auta' }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Smazat úkol' }).click();
	await expect(other.getByRole('button', { name: 'Dokončit: Revize auta' })).toHaveCount(0);
	await expect(other.getByRole('button', { name: 'Dokončit: Úklid' })).toBeVisible();
});

test('shows a task on its assigned day and due day, with one checklist item when the dates coincide', async ({ signedIn: page }) => {
	await day(page, '2026-11-20').click();
	await page.getByRole('link', { name: 'Spravovat úkoly' }).click();
	await expect(page).toHaveURL(/den=2026-11-20$/);
	await startTodo(page, 'Připravit hadice');
	await expect(page.getByLabel('Den', { exact: true })).toHaveValue('2026-11-20');
	await page.getByLabel('Termín dokončení').fill('2026-11-20');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await nav(page, 'Plán').click();
	await expect(day(page, '2026-11-20')).toHaveAccessibleName(/Úkoly: Připravit hadice/);
	await day(page, '2026-11-20').click();
	const checkbox = page.getByRole('checkbox', { name: /Připravit hadice/ });
	await expect(checkbox).toHaveCount(1);
	await checkbox.check();
	await expect(checkbox).toBeChecked();
	await page.getByRole('link', { name: 'Spravovat úkoly' }).click();
	await page.getByRole('button', { name: 'Hotové', exact: true }).click();
	await page.getByRole('button', { name: 'Upravit: Připravit hadice' }).click();
	await page.getByLabel('Termín dokončení').fill('2026-11-21');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await expect(page.getByRole('button', { name: 'Znovu otevřít: Připravit hadice' })).toBeVisible();

	await nav(page, 'Plán').click();
	await page.getByRole('button', { name: 'Kalendář', exact: true }).click();
	for (const date of ['2026-11-20', '2026-11-21']) {
		await expect(day(page, date, true)).toHaveAccessibleName(/Připravit hadice/);
		await day(page, date, true).click();
		await expect(checkbox).toBeChecked();
	}
	await checkbox.uncheck();
	await expect(checkbox).not.toBeChecked();
	await page.getByRole('link', { name: 'Spravovat úkoly' }).click();
	await expect(page).toHaveURL(/den=2026-11-21$/);
	await expect(page.getByRole('button', { name: 'Dokončit: Připravit hadice' })).toBeVisible();
});

test('activity tasks appear in activity and due-day checklists, and successors are standalone', async ({ page }) => {
	await seedActivity('past', '2026-11-18', 'Starý výjezd');
	await seedActivity('future', '2026-11-20', 'Údržba');
	await join(page, '/akce/future');
	await page.getByRole('link', { name: 'Spravovat úkoly' }).click();
	await expect(page).toHaveURL(/akce=future$/);
	await startTodo(page, 'Vyměnit baterie');
	const event = page.getByRole('combobox', { name: 'Akce', exact: true });
	await expect(event).toHaveValue('future');
	await expect(event.getByRole('option', { name: /Starý výjezd/ })).toHaveCount(0);
	await page.getByLabel('Termín dokončení').fill('2026-11-21');
	await page.getByLabel('Řešitel').selectOption({ label: member });
	await page.getByLabel('Opakování úkolu').selectOption('completion');
	await page.getByLabel('Jednotka').selectOption('week');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('link', { name: /Údržba ·/ }).click();

	const checkbox = page.getByRole('checkbox', { name: /Vyměnit baterie/ });
	await checkbox.check();
	await expect(checkbox).toBeChecked();
	await nav(page, 'Plán').click();
	await day(page, '2026-11-21').click();
	await expect(checkbox).toBeChecked();
	await nav(page, 'Úkoly').click();
	const successor = page.getByRole('listitem').filter({ hasText: 'Vyměnit baterie' });
	await expect(successor).toHaveCount(1);
	await expect(successor).toContainText('Termín Čt 26. 11.');
	await expect(successor).toContainText(member);
	await expect(successor.getByRole('link')).toHaveCount(0);
	await page.goto('/ukoly?akce=past');
	await expect(page.getByText('Nové úkoly lze přiřadit k akcím ode dneška.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nový úkol' })).toHaveCount(0);
});

test('two devices completing the same recurring task create only one successor', async ({ signedIn: page, newDevice }) => {
	await nav(page, 'Úkoly').click();
	await startTodo(page, 'Kontrola světel');
	await page.getByLabel('Opakování úkolu').selectOption('completion');
	await page.getByLabel('Jednotka').selectOption('day');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();

	const other = await newDevice();
	await freezeDate(other);
	await join(other, '/ukoly', otherMember);
	const button = { name: 'Dokončit: Kontrola světel' };
	// Release both actual transaction requests together so the second device still has
	// the original row in its UI when the user clicks.
	let release!: () => void;
	const bothRequests = new Promise<void>((resolve) => { release = resolve; });
	const reads: string[] = [];
	for (const client of [page, other]) {
		await client.route('**/documents:batchGet*', async (route) => {
			reads.push(route.request().postData() ?? '');
			if (reads.length === 2) release();
			await bothRequests;
			await route.continue();
		});
	}
	await Promise.all([page.getByRole('button', button).click(), other.getByRole('button', button).click()]);
	await expect(page.getByText('Termín Pá 20. 11.')).toBeVisible();
	await expect(page.getByRole('button', button)).toHaveCount(1);
	await expect(other.getByRole('button', button)).toHaveCount(1);
	await expect(other.getByText('Termín Pá 20. 11.')).toBeVisible();
	expect(reads.length).toBeGreaterThanOrEqual(2);
	expect(reads[0]).toBe(reads[1]);
	await page.getByRole('button', { name: 'Hotové', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Znovu otevřít: Kontrola světel' })).toHaveCount(1);
});

test('a dated recurring task carries its day offset forward and deleting it ends the chain', async ({ signedIn: page }) => {
	await nav(page, 'Úkoly').click();
	await startTodo(page, 'Vyčistit vybavení');
	await page.getByLabel('Přiřadit k').selectOption('date');
	await page.getByLabel('Den', { exact: true }).fill('2026-11-18');
	await page.getByLabel('Termín dokončení').fill('2026-11-19');
	await page.getByLabel('Opakování úkolu').selectOption('calendar');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('button', { name: 'Dokončit: Vyčistit vybavení' }).click();
	await expect(page.getByText('Den St 25. 11.')).toBeVisible();
	await expect(page.getByText('Termín Čt 26. 11.')).toBeVisible();
	await page.getByRole('button', { name: 'Upravit: Vyčistit vybavení' }).click();
	const accepted = page.waitForEvent('dialog').then(async (dialog) => {
		expect(dialog.message()).toContain('Tím skončí i jeho opakování.');
		await dialog.accept();
	});
	await Promise.all([accepted, page.getByRole('button', { name: 'Smazat úkol' }).click()]);
	await expect(page.getByText('Žádné otevřené úkoly.')).toBeVisible();
	await page.getByRole('button', { name: 'Hotové', exact: true }).click();
	await page.getByRole('button', { name: 'Znovu otevřít: Vyčistit vybavení' }).click();
	await expect(page.getByRole('status')).toHaveText('Další výskyt už byl dokončen nebo smazán.');
});

test('a day view links back to all tasks, and tasks show a deleted activity or a former member', async ({ page }) => {
	await seedActivity('inspection', '2026-11-24', 'Kontrola hydrantů');
	await join(page, '/ukoly?akce=inspection');
	await startTodo(page, 'Připravit klíče');
	await page.getByLabel('Řešitel').selectOption({ label: otherMember });
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.goto('/ukoly?den=2026-11-25');
	await startTodo(page, 'Koupit baterie');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await expect(page.getByRole('button', { name: 'Dokončit: Připravit klíče' })).toHaveCount(0);
	await page.getByRole('link', { name: 'Všechny úkoly' }).click();
	await expect(page).toHaveURL(/\/ukoly$/);
	await expect(page.getByRole('button', { name: 'Dokončit: Připravit klíče' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Dokončit: Koupit baterie' })).toBeVisible();

	await page.goto('/akce/inspection');
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Smazat akci' }).click();
	await expect(page.getByRole('heading', { name: 'Plán' })).toBeVisible();
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.getByRole('button', { name: 'Archivovat' }).click();
	await nav(page, 'Úkoly').click();
	const task = page.getByRole('listitem').filter({ hasText: 'Připravit klíče' });
	await expect(task).toContainText('Nedostupná akce');
	await expect(task).toContainText(otherMember);
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: 'Archiv (1)' }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: `Trvale smazat ${otherMember}` }).click();
	await nav(page, 'Úkoly').click();
	await expect(task).toContainText('Bývalý člen');
});

test('editing a task keeps its repeat end, and shows a deleted activity and assignee', async ({ page }) => {
	await seedActivity('drill', '2026-11-24', 'Cvičení');
	await join(page, '/ukoly?akce=drill');
	await startTodo(page, 'Nachystat hadice');
	await page.getByLabel('Řešitel').selectOption({ label: otherMember });
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('link', { name: 'Všechny úkoly' }).click();
	await startTodo(page, 'Vyprat zásahovky');
	await page.getByLabel('Termín dokončení').fill('2026-11-20');
	await page.getByLabel('Opakování úkolu').selectOption('calendar');
	await page.getByLabel(/Opakovat do/).fill('2026-12-31');
	await page.getByRole('button', { name: 'Uložit úkol' }).click();
	await page.getByRole('button', { name: 'Upravit: Vyprat zásahovky' }).click();
	await expect(page.getByLabel(/Opakovat do/)).toHaveValue('2026-12-31');
	await page.getByRole('button', { name: 'Zrušit', exact: true }).click();

	await page.goto('/akce/drill');
	await page.getByRole('button', { name: 'Upravit', exact: true }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: 'Smazat akci' }).click();
	await expect(page.getByRole('heading', { name: 'Plán' })).toBeVisible();
	await nav(page, 'Jednotka').click();
	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.getByRole('button', { name: 'Archivovat' }).click();
	await page.getByRole('button', { name: 'Archiv (1)' }).click();
	acceptDialog(page);
	await page.getByRole('button', { name: `Trvale smazat ${otherMember}` }).click();
	await nav(page, 'Úkoly').click();
	await page.getByRole('button', { name: 'Upravit: Nachystat hadice' }).click();
	await expect(page.getByRole('combobox', { name: 'Akce', exact: true }).locator('option:checked')).toHaveText('Nedostupná akce');
	await expect(page.getByLabel('Řešitel').locator('option:checked')).toHaveText('Bývalý člen');
});
