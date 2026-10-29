// Puts the app on your own Firebase project, step by step, in Czech.
//   npm run setup    first time (or after downloading a new version): login, pick project, deploy
//   npm run deploy   just build and deploy again to the project in .env
// Uses only Node built-ins, so it runs before `npm install`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const FIREBASE = ['npx', '-y', 'firebase-tools@15'];
const deployOnly = process.argv.includes('--deploy');

function say(text = '') {
	console.log(text);
}

function fail(text) {
	console.error('\n✖ ' + text);
	process.exit(1);
}

/** Runs a command with its output shown; stops the script if it fails. */
function run(cmd, args, what) {
	const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
	if (r.status !== 0) fail(`${what} se nepodařilo. Podívejte se na chybu výše.`);
}

/** Runs a Firebase CLI command with --json and returns its `result`. */
function firebaseJson(args) {
	const [cmd, ...rest] = FIREBASE;
	const r = spawnSync(cmd, [...rest, ...args, '--json'], {
		encoding: 'utf8',
		shell: process.platform === 'win32'
	});
	try {
		const out = JSON.parse(r.stdout);
		if (out.status === 'success') return out.result;
		return { error: out.error ?? 'neznámá chyba' };
	} catch {
		return { error: r.stderr || r.stdout || 'neznámá chyba' };
	}
}

function readEnvProject() {
	if (!existsSync('.env')) return null;
	const m = readFileSync('.env', 'utf8').match(/^VITE_FIREBASE_PROJECT_ID=(.+)$/m);
	return m ? m[1].trim() : null;
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 12)) {
	fail(`Máte Node.js ${process.versions.node}. Nainstalujte novější verzi (LTS) z https://nodejs.org a spusťte znovu.`);
}

let project = readEnvProject();

if (!deployOnly) {
	say('\n=== 1/5 Instalace knihoven (může trvat pár minut) ===');
	run('npm', ['install', '--no-audit', '--no-fund'], 'Instalace');

	say('\n=== 2/5 Přihlášení do Firebase ===');
	say('Otevře se prohlížeč. Přihlaste se stejným účtem Google, kterým jste založili projekt.');
	say('Na otázku o sbírání dat (Gemini / usage) můžete odpovědět „n“ (ne).');
	run(FIREBASE[0], [...FIREBASE.slice(1), 'login'], 'Přihlášení');

	say('\n=== 3/5 Výběr projektu ===');
	const projects = firebaseJson(['projects:list']);
	if (!Array.isArray(projects)) fail('Nepodařilo se načíst projekty: ' + projects.error);
	if (projects.length === 0) {
		fail('Na tomto účtu není žádný projekt Firebase. Založte ho podle návodu v README a spusťte znovu.');
	}
	projects.forEach((p, i) => say(`  ${i + 1}) ${p.displayName}  (${p.projectId})`));
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	let choice = projects.length === 1 ? 1 : 0;
	while (!(choice >= 1 && choice <= projects.length)) {
		choice = Number(await rl.question(`Napište číslo projektu (1–${projects.length}) a stiskněte Enter: `));
	}
	rl.close();
	project = projects[choice - 1].projectId;
	say(`Projekt: ${project}`);

	say('\n=== 4/5 Nastavení aplikace ===');
	let apps = firebaseJson(['apps:list', 'WEB', '--project', project]);
	if (!Array.isArray(apps)) fail('Nepodařilo se načíst aplikace projektu: ' + apps.error);
	let appId = apps[0]?.appId;
	if (!appId) {
		say('Vytvářím webovou aplikaci v projektu…');
		const created = firebaseJson(['apps:create', 'WEB', 'Hasici', '--project', project]);
		if (!created.appId) fail('Webovou aplikaci se nepodařilo vytvořit: ' + created.error);
		appId = created.appId;
	}
	const sdk = firebaseJson(['apps:sdkconfig', 'WEB', appId, '--project', project]);
	const config = sdk.sdkConfig ?? sdk;
	if (!config.apiKey) fail('Nepodařilo se načíst nastavení aplikace: ' + sdk.error);
	writeFileSync(
		'.env',
		[
			'# Vytvořeno příkazem npm run setup. Hodnoty nejsou tajné.',
			`VITE_FIREBASE_API_KEY=${config.apiKey}`,
			`VITE_FIREBASE_AUTH_DOMAIN=${config.authDomain}`,
			`VITE_FIREBASE_PROJECT_ID=${config.projectId}`,
			`VITE_FIREBASE_APP_ID=${config.appId}`,
			`VITE_FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId}`,
			`VITE_FIREBASE_STORAGE_BUCKET=${config.storageBucket ?? ''}`,
			''
		].join('\n')
	);
	say('Uloženo do souboru .env');

	const databases = firebaseJson(['firestore:databases:list', '--project', project]);
	if (Array.isArray(databases) && databases.length === 0) {
		fail('Projekt ještě nemá databázi Firestore. Založte ji podle návodu v README (krok „Databáze“) a spusťte znovu.');
	}
}

if (!project) fail('Chybí soubor .env. Spusťte nejdřív: npm run setup');
if (deployOnly && !existsSync('node_modules')) run('npm', ['install', '--no-audit', '--no-fund'], 'Instalace');

say('\n=== 5/5 Sestavení a nahrání na web ===');
run('npm', ['run', 'build'], 'Sestavení');
run(
	FIREBASE[0],
	[...FIREBASE.slice(1), 'deploy', '--only', 'firestore:rules,hosting', '--project', project, '--non-interactive'],
	'Nahrání'
);

say(`
✔ Hotovo. Aplikace běží na:

    https://${project}.web.app

Pokud jde o první spuštění, otevřete adresu hned teď a nastavte heslo jednotky.
Kdo ji otevře jako první, heslo nastaví.
`);
