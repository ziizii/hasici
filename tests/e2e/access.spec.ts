import { expect, join, member, nav, otherMember, password, test } from './fixtures';

test.describe('uninitialized unit', () => {
	test.use({ emptyUnit: true });

	test('sets up a password and creates the first member', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: /Nastavte heslo jednotky/ })).toBeVisible();
		await page.getByLabel('Nové heslo').fill(password);
		await page.getByLabel('Heslo znovu').fill('jiné heslo');
		await page.getByRole('button', { name: 'Zobrazit heslo' }).click();
		await expect(page.getByLabel('Nové heslo')).toHaveAttribute('type', 'text');
		await page.getByRole('button', { name: /Uložit heslo a pokračovat/ }).click();
		await expect(page.getByRole('alert')).toHaveText('Hesla se neshodují.');
		await page.getByLabel('Heslo znovu').fill(password);
		await page.getByRole('button', { name: /Uložit heslo a pokračovat/ }).click();
		await page.getByLabel('Jméno a příjmení').fill(member);
		await page.getByRole('button', { name: 'Přidat a pokračovat' }).click();
		await expect(nav(page, 'Plán')).toBeVisible();
		await page.reload();
		await expect(nav(page, 'Plán')).toBeVisible();
	});
});

test('rejects a wrong password, throttles guesses, and accepts the password on a new device', async ({ page, newDevice }) => {
	await page.goto('/');
	await page.getByLabel('Heslo jednotky').fill('chybné heslo');
	await page.getByRole('button', { name: 'Vstoupit' }).click();
	await expect(page.getByRole('alert')).toContainText('Špatné heslo');
	await page.getByRole('button', { name: 'Vstoupit' }).click();
	await expect(page.getByRole('alert')).toContainText('Moc pokusů');

	const newPage = await newDevice();
	await newPage.goto('/');
	await newPage.getByLabel('Heslo jednotky').fill(password);
	await newPage.getByRole('button', { name: 'Vstoupit' }).click();
	await newPage.getByRole('button', { name: new RegExp(member) }).click();
	await expect(nav(newPage, 'Plán')).toBeVisible();
});

test('remembers a shared-link session and lets the device pick another member', async ({ signedIn: page }) => {
	await nav(page, 'Já').click();
	await page.getByRole('button', { name: 'Nejsem to já' }).click();
	await page.getByRole('button', { name: new RegExp(otherMember) }).click();
	await page.reload();
	await expect(page.getByText(otherMember, { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Moje nepřítomnost' })).toBeVisible();
});

test('copies and rotates the share link, changes the password, and signs out other devices', async ({
	signedIn: page, context, newDevice
}) => {
	await nav(page, 'Jednotka').click();
	const link = page.getByLabel('Odkaz', { exact: true });
	await expect(link).toHaveValue(/\?k=/);
	const previous = await link.inputValue();
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: 'Kopírovat' }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(previous);

	const other = await newDevice();
	await join(other, '/', otherMember);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Vytvořit nový odkaz' }).click();
	await expect(link).not.toHaveValue(previous);
	const rotated = await link.inputValue();
	// An already signed-in device keeps its session during ordinary rotation.
	await other.reload();
	await expect(nav(other, 'Plán')).toBeVisible();
	const rejected = await newDevice();
	await rejected.goto(previous);
	await expect(rejected.getByRole('heading', { name: 'Přístup k jednotce' })).toBeVisible();

	await page.getByRole('button', { name: 'Změnit', exact: true }).click();
	await page.getByLabel('Nové heslo', { exact: true }).fill('nové-heslo');
	await page.getByRole('button', { name: 'Uložit heslo' }).click();
	await expect(page.getByRole('status')).toHaveText('Heslo změněno');

	await page.getByRole('button', { name: 'Odhlásit…' }).click();
	await page.getByRole('button', { name: 'Odhlásit ostatní', exact: true }).click();
	await expect(other.getByRole('heading', { name: 'Přístup k jednotce' })).toBeVisible();
	await expect(link).not.toHaveValue(rotated);
	await expect(nav(page, 'Jednotka')).toBeVisible();
	const newPage = await newDevice();
	await newPage.goto('/');
	await newPage.getByLabel('Heslo jednotky').fill('nové-heslo');
	await newPage.getByRole('button', { name: 'Vstoupit' }).click();
	await newPage.getByRole('button', { name: new RegExp(otherMember) }).click();
	await expect(nav(newPage, 'Plán')).toBeVisible();
});

test('passes the current invite to the native share sheet', async ({ signedIn: page }) => {
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'share', {
			value: async ({ url }: ShareData) => sessionStorage.setItem('shared-url', url ?? '')
		});
	});
	await nav(page, 'Jednotka').click();
	const link = page.getByLabel('Odkaz', { exact: true });
	await expect(link).toHaveValue(/\?k=/);
	await page.getByRole('button', { name: 'Sdílet', exact: true }).click();
	await expect.poll(() => page.evaluate(() => sessionStorage.getItem('shared-url'))).toBe(await link.inputValue());
});
