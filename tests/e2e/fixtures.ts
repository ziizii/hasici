import { createHash } from 'node:crypto';
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { startPageCoverage } from './coverage';

export { expect };
export const today = '2026-11-19';
export const password = 'hasiči-test';
export const member = 'Jana Nováková';
export const otherMember = 'Petr Dvořák';
const linkKey = 'playwright-local-link-key';
const firestore = 'http://127.0.0.1:8080';
const database = 'projects/demo-hasici/databases/(default)';

type Value = string | number | boolean | null | Date | Value[] | { [key: string]: Value };

function encode(value: Value): object {
	if (value === null) return { nullValue: null };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
	if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
	if (typeof value === 'number') return { integerValue: String(value) };
	return typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
}

function encodeFields(fields: Record<string, Value>) {
	return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, encode(value)]));
}

async function emulator(path: string, method: string, body?: unknown) {
	const response = await fetch(firestore + path, {
		method,
		headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) throw new Error(`Firestore emulator ${method} ${path}: ${await response.text()}`);
}

async function seed(path: string, fields: Record<string, Value>) {
	await emulator(`/v1/${database}/documents/${path}`, 'PATCH', { fields: encodeFields(fields) });
}

export async function seedMember(id: string, name: string, color: string) {
	await seed(`members/${id}`, { name, color, archived: false, createdAt: new Date('2026-10-01') });
}

export async function seedActivity(id: string, date: string, title: string, time = '09:00') {
	await seed(`events/${id}`, { date, title, time, place: '', note: '', createdAt: new Date('2026-10-01') });
}

export async function seedSeries(id: string, fields: Record<string, Value>) {
	await seed(`series/${id}`, {
		title: 'Výcvik', time: '09:00', place: '', note: '', except: [],
		createdAt: new Date('2026-10-01'), ...fields
	});
}

export async function freezeDate(page: Page, date = today) {
	await page.clock.setFixedTime(new Date(`${date}T12:00:00+01:00`));
}

export async function join(page: Page, path = '/', name = member, key = linkKey) {
	const url = new URL(path, 'http://localhost');
	url.searchParams.set('k', key);
	await page.goto(url.pathname + url.search);
	await page.getByRole('button', { name: new RegExp(name) }).click();
	await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
	await expect(page).not.toHaveURL(/[?&]k=/);
}

export function nav(page: Page, name: string) {
	return page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: name === 'Já' ? /^(Já|Moje nepřítomnost)$/ : name, exact: true });
}

export function day(page: Page, date: string, calendar = false) {
	const id = page.locator(`#${calendar ? 'c' : 'd'}-${date}`);
	return calendar ? id : id.getByRole('button', { name: /Otevřít den/ });
}

export function acceptDialog(page: Page) {
	page.once('dialog', (dialog) => dialog.accept());
}

export const test = base.extend<{
	emptyUnit: boolean;
	signedIn: Page;
	databaseReady: void;
	newDevice: () => Promise<Page>;
}>({
	emptyUnit: [false, { option: true }],
	databaseReady: [async ({ emptyUnit }, use) => {
		if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
			process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
			throw new Error('Start the throwaway emulators with npm test.');
		}
		await emulator(`/emulator/v1/${database}/documents`, 'DELETE');
		if (!emptyUnit) {
			const createdAt = new Date('2026-10-01');
			await Promise.all([
				seed('config/public', { initialized: true, name: 'SDH Zkouška' }),
				seed('config/access', {
					linkKey, passwordHash: createHash('sha256').update('hasici:' + password).digest('hex'),
					updatedAt: createdAt
				}),
				seedMember('jana', member, '#1F4E8C'),
				seedMember('petr', otherMember, '#AA303B')
			]);
		}
		await use();
	}, { auto: true }],
	page: async ({ page }, use) => {
		await freezeDate(page);
		const stop = await startPageCoverage(page);
		try {
			await use(page);
		} finally {
			await stop?.();
		}
	},
	newDevice: async ({ browser, baseURL }, use) => {
		const devices: { context: BrowserContext; stop?: () => Promise<void> }[] = [];
		try {
			await use(async () => {
				const context = await browser.newContext({ baseURL });
				const device: (typeof devices)[number] = { context };
				devices.push(device);
				const page = await context.newPage();
				device.stop = await startPageCoverage(page);
				return page;
			});
		} finally {
			for (const { context, stop } of devices) {
				try {
					await stop?.();
				} finally {
					await context.close();
				}
			}
		}
	},
	signedIn: async ({ page }, use) => {
		await join(page);
		await use(page);
	}
});

export async function startTodo(page: Page, title: string) {
	await page.getByRole('button', { name: 'Nový úkol', exact: true }).click();
	await page.getByLabel('Název', { exact: true }).fill(title);
}
