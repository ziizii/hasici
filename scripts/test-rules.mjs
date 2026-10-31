// Checks firestore.rules against the local emulators with the same writes the app makes.
// Run with `make test-rules` (starts throwaway emulators and runs this script).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
	addDoc,
	arrayUnion,
	collection,
	connectFirestoreEmulator,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	getFirestore,
	increment,
	onSnapshot,
	serverTimestamp,
	setDoc,
	updateDoc,
	writeBatch
} from 'firebase/firestore';
import { createHash } from 'node:crypto';

const hash = (password) => createHash('sha256').update('hasici:' + password).digest('hex');
const PASSWORD = 'tajne-heslo';
const LINK = 'abcdefghijkmnopqrstuvwx';

let n = 0;
/** A fresh browser: its own anonymous user. */
async function device() {
	const app = initializeApp({ apiKey: 'demo-key', appId: 'demo-app', projectId: 'demo-hasici' }, 'd' + n++);
	const auth = getAuth(app);
	connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
	const db = getFirestore(app);
	connectFirestoreEmulator(db, '127.0.0.1', 8080);
	const { user } = await signInAnonymously(auth);
	return { db, uid: user.uid };
}

let failed = 0;
async function expect(name, allowed, fn) {
	let ok;
	try {
		await fn();
		ok = true;
	} catch (e) {
		if (e.code !== 'permission-denied') throw e;
		ok = false;
	}
	const pass = ok === allowed;
	if (!pass) failed++;
	console.log(`${pass ? 'ok  ' : 'FAIL'} ${allowed ? 'allowed' : 'denied '}  ${name}`);
}

/** As access.#createSession(): record the attempt, then (in a separate request) the session. */
async function session(d, key) {
	await attempt(d, key);
	return setSession(d, key);
}
function attempt(d, key) {
	return setDoc(doc(d.db, 'attempts', d.uid), { key, at: serverTimestamp(), n: increment(1) }, { merge: true });
}
function setSession(d, key) {
	return setDoc(doc(d.db, 'sessions', d.uid), { key, createdAt: serverTimestamp() });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const outsider = await device();
const founder = await device();
const byLink = await device();
const byPassword = await device();

await expect('anyone reads config/public', true, () => getDoc(doc(outsider.db, 'config', 'public')));
await expect('access doc alone, without config/public', false, async () => {
	const b = writeBatch(outsider.db);
	b.set(doc(outsider.db, 'config', 'access'), { linkKey: 'x'.repeat(20), passwordHash: hash('x'), updatedAt: serverTimestamp() });
	b.set(doc(outsider.db, 'sessions', outsider.uid), { key: hash('x'), createdAt: serverTimestamp() });
	await b.commit();
});

// First run, as in access.setup().
await expect('first visitor sets up the unit', true, async () => {
	const b = writeBatch(founder.db);
	b.set(doc(founder.db, 'config', 'access'), { linkKey: LINK, passwordHash: hash(PASSWORD), updatedAt: serverTimestamp() });
	b.set(doc(founder.db, 'config', 'public'), { initialized: true });
	b.set(doc(founder.db, 'sessions', founder.uid), { key: hash(PASSWORD), createdAt: serverTimestamp() });
	await b.commit();
});
await expect('second setup is refused', false, async () => {
	const b = writeBatch(outsider.db);
	b.set(doc(outsider.db, 'config', 'access'), { linkKey: 'y'.repeat(20), passwordHash: hash('y'), updatedAt: serverTimestamp() });
	b.set(doc(outsider.db, 'config', 'public'), { initialized: true });
	b.set(doc(outsider.db, 'sessions', outsider.uid), { key: hash('y'), createdAt: serverTimestamp() });
	await b.commit();
});

// Without a session.
await expect('outsider reads config/access', false, () => getDoc(doc(outsider.db, 'config', 'access')));
await expect('outsider reads members', false, () => getDocs(collection(outsider.db, 'members')));
await expect('outsider adds a member', false, () =>
	addDoc(collection(outsider.db, 'members'), { name: 'X', color: '#123456', archived: false, createdAt: serverTimestamp() })
);
await expect('wrong password', false, () => session(outsider, hash('spatne')));
await expect('wrong link', false, async () => session(await device(), 'nope'.repeat(5)));

// Guess limit.
const guesser = await device();
await expect('first attempt', true, () => attempt(guesser, hash('a')));
await expect('second attempt right away', false, () => attempt(guesser, hash('b')));
await expect('session without a matching attempt', false, () => setSession(guesser, hash(PASSWORD)));
await expect('attempt and session in one batch', false, async () => {
	const b = writeBatch(guesser.db);
	b.set(doc(guesser.db, 'attempts', guesser.uid), { key: hash(PASSWORD), at: serverTimestamp(), n: increment(1) }, { merge: true });
	b.set(doc(guesser.db, 'sessions', guesser.uid), { key: hash(PASSWORD), createdAt: serverTimestamp() });
	await b.commit();
});
await expect('attempt that resets the counter', false, () =>
	setDoc(doc(guesser.db, 'attempts', guesser.uid), { key: hash('c'), at: serverTimestamp(), n: 1 })
);
await expect('attempt with a fake time', false, () =>
	setDoc(doc(guesser.db, 'attempts', guesser.uid), { key: hash('c'), at: new Date(0), n: increment(1) }, { merge: true })
);
await sleep(2100);
await expect('second attempt after 2 s', true, () => attempt(guesser, hash('b')));
await expect('third attempt after 2 s (needs 4 s)', false, async () => (await sleep(2100), attempt(guesser, hash('c'))));
await expect('reading another browser’s attempt', false, () => getDoc(doc(outsider.db, 'attempts', guesser.uid)));
await expect('outsider renames the unit', false, () => updateDoc(doc(outsider.db, 'config', 'public'), { name: 'X' }));

// Unlocking.
await expect('unlock with the link', true, () => session(byLink, LINK));
await expect('unlock with the password', true, () => session(byPassword, hash(PASSWORD)));
await expect('a session cannot be changed to a wrong key', false, () => setSession(byLink, 'other'.repeat(4)));
await expect('reading another device’s session', false, () => getDoc(doc(byLink.db, 'sessions', founder.uid)));

// Members, absences, events with a session.
const db = byLink.db;
let memberId;
await expect('add a member', true, async () => {
	memberId = (await addDoc(collection(db, 'members'), { name: 'Jan Novák', color: '#C62828', archived: false, createdAt: serverTimestamp() })).id;
});
await expect('rename a member', true, () => updateDoc(doc(db, 'members', memberId), { name: 'Jan Nový' }));
await expect('archive a member', true, () => updateDoc(doc(db, 'members', memberId), { archived: true }));
await expect('member with an empty name', false, () =>
	addDoc(collection(db, 'members'), { name: '', color: '#C62828', archived: false, createdAt: serverTimestamp() })
);
await expect('member with an unknown field', false, () =>
	addDoc(collection(db, 'members'), { name: 'A', color: '#C62828', archived: false, admin: true, createdAt: serverTimestamp() })
);

let absenceId;
await expect('add an absence', true, async () => {
	absenceId = (await addDoc(collection(db, 'absences'), { memberId, from: '2026-07-01', to: '2026-07-05', note: 'Dovolená', createdAt: serverTimestamp() })).id;
});
await expect('weekly absence with an exception', true, () =>
	addDoc(collection(db, 'absences'), { memberId, from: '2026-01-05', to: '9999-12-31', note: '', weekdays: [0], except: ['2026-01-12'], createdAt: serverTimestamp() })
);
await expect('absence with a repeat rule', true, () =>
	addDoc(collection(db, 'absences'), { memberId, from: '2026-01-05', to: '9999-12-31', note: '', repeat: { freq: 'month', every: 1, nth: 1, kind: 4 }, createdAt: serverTimestamp() })
);
await expect('absence ending before it starts', false, () =>
	addDoc(collection(db, 'absences'), { memberId, from: '2026-07-05', to: '2026-07-01', note: '', createdAt: serverTimestamp() })
);
await expect('shorten an absence', true, () => updateDoc(doc(db, 'absences', absenceId), { to: '2026-07-03' }));
await expect('delete an absence', true, () => deleteDoc(doc(db, 'absences', absenceId)));

let seriesId;
await expect('add an event', true, () =>
	addDoc(collection(db, 'events'), { title: 'Cvičení', date: '2026-07-10', time: '18:00', place: 'Zbrojnice', note: '', createdAt: serverTimestamp() })
);
await expect('add a repeating event', true, async () => {
	seriesId = (await addDoc(collection(db, 'series'), {
		title: 'Kondiční jízdy', time: '18:00', place: '', note: '', from: '2026-07-01', to: '9999-12-31', except: [],
		repeat: { freq: 'week', every: 2, weekdays: [2] }, createdAt: serverTimestamp()
	})).id;
});
await expect('move one date of a repeat', true, async () => {
	const b = writeBatch(db);
	b.set(doc(db, 'events', `${seriesId}_2026-07-15`), { title: 'Kondiční jízdy', date: '2026-07-16', time: '18:00', place: '', note: '', series: seriesId, createdAt: serverTimestamp() });
	b.update(doc(db, 'series', seriesId), { except: arrayUnion('2026-07-15') });
	await b.commit();
});
await expect('event without a title', false, () =>
	addDoc(collection(db, 'events'), { title: '', date: '2026-07-10', time: '', place: '', note: '', createdAt: serverTimestamp() })
);
await expect('bad repeat rule', false, () =>
	addDoc(collection(db, 'series'), { title: 'X', time: '', place: '', note: '', from: '2026-07-01', to: '9999-12-31', except: [], repeat: { freq: 'hour', every: 1 }, createdAt: serverTimestamp() })
);

await expect('a batch of 40 writes (rules look up the session and access docs once)', true, async () => {
	const b = writeBatch(db);
	for (let i = 0; i < 40; i++)
		b.set(doc(collection(db, 'absences')), { memberId, from: '2026-08-01', to: '2026-08-01', note: '', createdAt: serverTimestamp() });
	await b.commit();
});

// Unit settings.
await expect('rename the unit', true, () => updateDoc(doc(db, 'config', 'public'), { name: 'SDH Lhota' }));
await expect('save default places', true, () => setDoc(doc(db, 'config', 'places'), { list: ['Zbrojnice', 'Hřiště'] }));
await expect('rotate the link', true, () => updateDoc(doc(db, 'config', 'access'), { linkKey: 'n'.repeat(24), updatedAt: serverTimestamp() }));
await expect('old link no longer opens', false, async () => session(await device(), LINK));
await expect('change the password', true, () => updateDoc(doc(db, 'config', 'access'), { passwordHash: hash('nove-heslo'), updatedAt: serverTimestamp() }));
await expect('old password no longer opens', false, async () => session(await device(), hash(PASSWORD)));
await expect('new password opens', true, async () => session(await device(), hash('nove-heslo')));
await expect('config/public cannot be deleted', false, () => deleteDoc(doc(db, 'config', 'public')));

// Log out all other devices, as in access.logOutOthers().
const NEW_LINK = 'r'.repeat(24);
let lost = false;
const stop = onSnapshot(doc(byPassword.db, 'config', 'access'), () => {}, (e) => (lost = e.code === 'permission-denied'));
await expect('log out the others', true, async () => {
	const b = writeBatch(db);
	b.update(doc(db, 'config', 'access'), { linkKey: NEW_LINK, revokedAt: serverTimestamp(), updatedAt: serverTimestamp() });
	b.set(doc(db, 'sessions', byLink.uid), { key: NEW_LINK, createdAt: serverTimestamp() });
	await b.commit();
});
await expect('the one who logged out the others keeps access', true, () => getDocs(collection(db, 'members')));
await expect('a logged-out device reads members', false, () => getDocs(collection(byPassword.db, 'members')));
await expect('a logged-out device writes', false, () => updateDoc(doc(byPassword.db, 'config', 'public'), { name: 'X' }));
await expect('a logged-out device re-keys its session without an attempt', false, () => setSession(byPassword, hash('nove-heslo')));
await sleep(500);
console.log(`${lost ? 'ok  ' : 'FAIL'} a logged-out device’s open listener is cut off`);
if (!lost) failed++;
stop();
await sleep(2100); // its last attempt (unlocking with the password) was just now
await expect('a logged-out device comes back with the new link', true, () => session(byPassword, NEW_LINK));
await expect('revokedAt cannot be moved back', false, () =>
	updateDoc(doc(db, 'config', 'access'), { revokedAt: new Date(0) })
);
await expect('revokedAt cannot be removed', false, async () => {
	const { passwordHash, linkKey } = (await getDoc(doc(db, 'config', 'access'))).data();
	await setDoc(doc(db, 'config', 'access'), { passwordHash, linkKey });
});

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
