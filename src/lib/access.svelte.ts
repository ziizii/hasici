import { doc, getDoc, getDocFromServer, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { clearCachedData } from './data.svelte';
import { db, ensureUser } from './firebase';
import { mark } from './perf';

export type GateState = 'loading' | 'setup' | 'locked' | 'ready' | 'error';

const MEMBER_KEY = 'hasici.memberId';
/** uid whose session was confirmed on this device, so later visits can skip the wait. */
const SESSION_KEY = 'hasici.sessionUid';
const UNIT_NAME_KEY = 'hasici.unitName';
const LINK_PARAM = 'k';

/** SHA-256 of the password (salted with a fixed app prefix), as hex. */
export async function hashPassword(password: string): Promise<string> {
	const bytes = new TextEncoder().encode('hasici:' + password.trim());
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomKey(length = 24): string {
	const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string | null) {
	try {
		if (value) localStorage.setItem(key, value);
		else localStorage.removeItem(key);
	} catch {
		// private mode etc.; the device just won't remember
	}
}

class Access {
	state = $state<GateState>('loading');
	error = $state<string | null>(null);
	/** What the loading screen is waiting for, so people see something is happening. */
	step = $state('Načítám aplikaci…');
	uid = $state<string | null>(null);
	/** Which member this device acts as (remembered in localStorage). */
	memberId = $state<string | null>(readStored(MEMBER_KEY));
	/** config/access — only readable once the device has a session. */
	linkKey = $state<string | null>(null);
	/** Unit name from config/public (readable before login), e.g. "SDH Lhota". */
	unitName = $state(readStored(UNIT_NAME_KEY) ?? '');

	#stopAccessDoc: (() => void) | null = null;

	async init(url: URL) {
		// Started first and readable without a session; its first answer also tells
		// whether the unit is set up, so the gate doesn't ask the server again.
		let setUp: (exists: boolean) => void = () => {};
		let failed: (e: unknown) => void = () => {};
		const unitExists = new Promise<boolean>((resolve, reject) => ((setUp = resolve), (failed = reject)));
		onSnapshot(
			doc(db, 'config', 'public'),
			(snap) => {
				this.unitName = (snap.data()?.name as string) ?? '';
				writeStored(UNIT_NAME_KEY, this.unitName);
				if (!snap.metadata.fromCache) setUp(snap.exists());
			},
			(e) => (console.error(e), failed(e))
		);
		// Known device: open at once from the cached data and sign in / check the session
		// in the background (Firebase Auth goes to the network on every start).
		const known = readStored(SESSION_KEY);
		if (known) {
			this.uid = known;
			this.#ready(url);
			ensureUser()
				.then(({ user }) => (mark('Firebase přihlášen'), user))
				.then((user) => (user.uid === known ? this.#recheckSession(known) : this.#lockAgain()))
				.catch((e) => console.error(e));
			return;
		}

		try {
			this.step = 'Přihlašuji se…';
			const { user, created } = await ensureUser(
				() => (this.step = 'Vytvářím přístup pro toto zařízení…')
			);
			mark('Firebase přihlášen');
			this.uid = user.uid;

			// A brand-new device can't have a session yet: skip that round trip.
			if (!created) {
				this.step = 'Ověřuji přístup…';
				const session = await getDoc(doc(db, 'sessions', user.uid));
				if (session.exists()) return this.#ready(url);
			}

			const fromLink = url.searchParams.get(LINK_PARAM);
			if (fromLink) {
				this.step = 'Otevírám odkaz jednotky…';
				if (await this.#createSession(fromLink)) return this.#ready(url);
			}

			this.step = 'Zjišťuji stav jednotky…';
			// Fall back to asking directly if the listener has no server answer yet.
			const askDirectly = new Promise<boolean>((resolve, reject) =>
				setTimeout(
					() => getDoc(doc(db, 'config', 'public')).then((s) => resolve(s.exists()), reject),
					4000
				)
			);
			this.state = (await Promise.race([unitExists, askDirectly])) ? 'locked' : 'setup';
		} catch (e) {
			console.error(e);
			this.error = 'Nepodařilo se připojit. Zkontrolujte připojení a obnovte stránku.';
			this.state = 'error';
		}
	}

	/** Dev-only sample mode (see lib/demo.ts). */
	startDemo(memberId: string) {
		this.memberId = memberId;
		this.linkKey = 'demo-link-key';
		this.state = 'ready';
	}

	async #createSession(key: string): Promise<boolean> {
		try {
			await setDoc(doc(db, 'sessions', this.uid!), { key, createdAt: serverTimestamp() });
			return true;
		} catch {
			return false;
		}
	}

	async #recheckSession(uid: string) {
		try {
			const session = await getDocFromServer(doc(db, 'sessions', uid));
			// Session was removed (e.g. from the console): lock this device again.
			if (!session.exists()) this.#lockAgain();
		} catch {
			// Offline or slow network: keep going with the cached data.
		}
	}

	#lockAgain() {
		writeStored(SESSION_KEY, null);
		clearCachedData();
		location.reload();
	}

	#ready(url?: URL) {
		writeStored(SESSION_KEY, this.uid);
		if (url?.searchParams.has(LINK_PARAM)) {
			url.searchParams.delete(LINK_PARAM);
			history.replaceState(history.state, '', url.pathname + url.search + url.hash);
		}
		this.#stopAccessDoc?.();
		this.#stopAccessDoc = onSnapshot(doc(db, 'config', 'access'), (snap) => {
			this.linkKey = (snap.data()?.linkKey as string) ?? null;
		});
		this.state = 'ready';
	}

	/** First visitor ever: sets the unit password and creates the share link. */
	async setup(password: string) {
		const passwordHash = await hashPassword(password);
		const batch = writeBatch(db);
		batch.set(doc(db, 'config', 'access'), {
			linkKey: randomKey(),
			passwordHash,
			updatedAt: serverTimestamp()
		});
		batch.set(doc(db, 'config', 'public'), { initialized: true });
		batch.set(doc(db, 'sessions', this.uid!), { key: passwordHash, createdAt: serverTimestamp() });
		await batch.commit();
		this.#ready();
	}

	/** Returns false when the password is wrong. */
	async unlock(password: string): Promise<boolean> {
		const ok = await this.#createSession(await hashPassword(password));
		if (ok) this.#ready();
		return ok;
	}

	async setUnitName(name: string) {
		await updateDoc(doc(db, 'config', 'public'), { name: name.trim() });
	}

	async changePassword(password: string) {
		await updateDoc(doc(db, 'config', 'access'), {
			passwordHash: await hashPassword(password),
			updatedAt: serverTimestamp()
		});
	}

	async rotateLink() {
		await updateDoc(doc(db, 'config', 'access'), {
			linkKey: randomKey(),
			updatedAt: serverTimestamp()
		});
	}

	shareUrl(): string | null {
		if (!this.linkKey) return null;
		return `${location.origin}/?${LINK_PARAM}=${this.linkKey}`;
	}

	setMember(id: string | null) {
		this.memberId = id;
		writeStored(MEMBER_KEY, id);
	}
}

export const access = new Access();
