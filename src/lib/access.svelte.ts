import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, ensureUser } from './firebase';

export type GateState = 'loading' | 'setup' | 'locked' | 'ready' | 'error';

const MEMBER_KEY = 'hasici.memberId';
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

function readStoredMember(): string | null {
	try {
		return localStorage.getItem(MEMBER_KEY);
	} catch {
		return null;
	}
}

class Access {
	state = $state<GateState>('loading');
	error = $state<string | null>(null);
	uid = $state<string | null>(null);
	/** Which member this device acts as (remembered in localStorage). */
	memberId = $state<string | null>(readStoredMember());
	/** config/access — only readable once the device has a session. */
	linkKey = $state<string | null>(null);
	/** Unit name from config/public (readable before login), e.g. "SDH Lhota". */
	unitName = $state('');

	#stopAccessDoc: (() => void) | null = null;

	async init(url: URL) {
		onSnapshot(
			doc(db, 'config', 'public'),
			(snap) => (this.unitName = (snap.data()?.name as string) ?? ''),
			(e) => console.error(e)
		);
		try {
			const user = await ensureUser();
			this.uid = user.uid;

			const session = await getDoc(doc(db, 'sessions', user.uid));
			if (session.exists()) return this.#ready(url);

			const fromLink = url.searchParams.get(LINK_PARAM);
			if (fromLink && (await this.#createSession(fromLink))) return this.#ready(url);

			const pub = await getDoc(doc(db, 'config', 'public'));
			this.state = pub.exists() ? 'locked' : 'setup';
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

	#ready(url?: URL) {
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
		try {
			if (id) localStorage.setItem(MEMBER_KEY, id);
			else localStorage.removeItem(MEMBER_KEY);
		} catch {
			/* private mode: keep it in memory only */
		}
	}
}

export const access = new Access();
