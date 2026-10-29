// Retakes the README screenshots in docs/screenshots. Run with `make screenshots`
// (starts throwaway emulators, then this script starts two dev servers: one for
// ?demo, one against the emulators for the first-run screens).
// Needs Playwright with Chromium: `npm i -g playwright && npx playwright install chromium`.
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs/screenshots/');
const lib = (m) => require(path.join(ROOT, 'node_modules', m));
const DEMO = 'http://localhost:5183';
const EMU = 'http://localhost:5184';
const PASSWORD = 'Stříkačka2026';
const UNIT = 'SDH Lhota';

function server(port, env) {
	const p = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		env: { ...process.env, ...env },
		stdio: 'ignore'
	});
	return p;
}

async function waitFor(url) {
	for (let i = 0; i < 60; i++) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error('Dev server did not start: ' + url);
}

/** Day of the first demo event (lib/demo.ts puts it 10 days from today). */
function eventDay() {
	const d = new Date();
	d.setDate(d.getDate() + 10);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function demoShots(browser) {
	const init = (name) => localStorage.setItem('hasici.unitName', name);
	const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
	await phone.addInitScript(init, UNIT);
	const p = await phone.newPage();
	await p.goto(DEMO + '/?demo');
	await p.waitForTimeout(2000);
	await p.screenshot({ path: OUT + 'telefon-plan.png' });
	await p.click(`#d-${eventDay()}`);
	await p.waitForTimeout(800);
	await p.screenshot({ path: OUT + 'telefon-den.png' });
	await p.getByText('Taktické cvičení').last().click();
	await p.waitForTimeout(1000);
	await p.screenshot({ path: OUT + 'telefon-akce.png' });
	await p.locator('nav a[href="/ja"]').last().click();
	await p.waitForTimeout(1000);
	await p.screenshot({ path: OUT + 'telefon-ja.png' });

	const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'cs-CZ' });
	await desk.addInitScript(init, UNIT);
	const d = await desk.newPage();
	await d.goto(DEMO + '/?demo');
	await d.waitForTimeout(2000);
	await d.click(`#d-${eventDay()}`);
	await d.waitForTimeout(800);
	await d.screenshot({ path: OUT + 'pocitac-plan.png' });
}

async function firstRunShots(browser) {
	const ctx = () => browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'cs-CZ' });

	// The very first visitor sets the password and adds themselves.
	const a = await (await ctx()).newPage();
	await a.goto(EMU + '/');
	await a.getByText('Vítejte!').waitFor({ timeout: 30000 });
	await a.fill('#pw', PASSWORD);
	await a.fill('#pw2', PASSWORD);
	await a.screenshot({ path: OUT + 'telefon-heslo.png' });
	await a.getByText('Uložit heslo a pokračovat').click();
	await a.fill('#new-member', 'Josef Beneš');
	await a.getByText('Přidat a pokračovat').click();
	await a.waitForTimeout(1000);

	// More members, added straight to the emulator with a password session.
	const { initializeApp } = lib('firebase/app');
	const { getAuth, connectAuthEmulator, signInAnonymously } = lib('firebase/auth');
	const { getFirestore, connectFirestoreEmulator, doc, setDoc, addDoc, collection, serverTimestamp } = lib('firebase/firestore');
	const app = initializeApp({ apiKey: 'demo-key', appId: 'demo-app', projectId: 'demo-hasici' }, 'seed');
	const auth = getAuth(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
	const db = getFirestore(app);
	connectFirestoreEmulator(db, '127.0.0.1', 8080);
	const { user } = await signInAnonymously(auth);
	const key = createHash('sha256').update('hasici:' + PASSWORD).digest('hex');
	await setDoc(doc(db, 'sessions', user.uid), { key, createdAt: serverTimestamp() });
	const members = [['Jan Černý', '#9C2A2A'], ['Petr Dvořák', '#1F6B45'], ['Karel Fiala', '#6B3FA0'], ['Jiří Horák', '#0F6E70'], ['Eva Jelínková', '#A12160']];
	for (const [name, color] of members) {
		await addDoc(collection(db, 'members'), { name, color, archived: false, createdAt: serverTimestamp() });
	}
	await setDoc(doc(db, 'config', 'public'), { initialized: true, name: UNIT });

	// A new phone: password, then "Kdo jste?", then the share link on Jednotka.
	const c = await (await ctx()).newPage();
	await c.goto(EMU + '/');
	await c.getByText('Vstoupit').waitFor({ timeout: 30000 });
	await c.waitForTimeout(500);
	await c.screenshot({ path: OUT + 'telefon-prihlaseni.png' });
	await c.fill('#pw', PASSWORD);
	await c.getByText('Vstoupit').click();
	await c.getByText('Eva Jelínková').waitFor({ timeout: 30000 });
	await c.waitForTimeout(500);
	await c.screenshot({ path: OUT + 'telefon-kdo-jste.png' });
	await c.getByText('Petr Dvořák').click();
	await c.waitForTimeout(1000);
	await c.locator('nav a[href="/jednotka"]').last().click();
	await c.getByText('Odkaz pro členy').waitFor({ timeout: 30000 });
	await c.waitForTimeout(800);
	// Show a realistic address instead of localhost.
	await c.evaluate((emu) => {
		for (const i of document.querySelectorAll('input')) {
			if (i.value.includes('?k=')) i.value = i.value.replace(emu, 'https://sdh-lhota.web.app');
		}
	}, EMU);
	await c.getByText('Odkaz pro členy').evaluate((el) => el.closest('section, div').scrollIntoView({ block: 'start' }));
	await c.evaluate(() => window.scrollBy(0, -20));
	await c.waitForTimeout(400);
	await c.screenshot({ path: OUT + 'telefon-odkaz.png' });
}

(async () => {
	const servers = [server(5183, {}), server(5184, { VITE_USE_EMULATORS: '1' })];
	let code = 0;
	try {
		await Promise.all([waitFor(DEMO), waitFor(EMU)]);
		const browser = await chromium.launch();
		await demoShots(browser);
		await firstRunShots(browser);
		await browser.close();
		console.log('Screenshots written to docs/screenshots/');
	} catch (e) {
		console.error(e);
		code = 1;
	} finally {
		for (const s of servers) s.kill();
	}
	process.exit(code);
})();
