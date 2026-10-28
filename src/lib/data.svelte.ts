import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	serverTimestamp,
	setDoc,
	updateDoc,
	writeBatch,
	type FirestoreError,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { addDays, OPEN_END, todayKey, type DateKey } from './dates';
import { nextColor } from './colors';

export interface Member {
	id: string;
	name: string;
	color: string;
	/** Archived members drop out of the plan; their colour becomes free again. */
	archived: boolean;
}

/** Whole-day absence, inclusive range. */
export interface Absence {
	id: string;
	memberId: string;
	from: DateKey;
	to: DateKey;
	note: string;
}

export interface Event {
	id: string;
	title: string;
	date: DateKey;
	/** 'HH:MM' or '' */
	time: string;
	place: string;
	note: string;
}

export interface DayAvailability {
	available: Member[];
	away: { member: Member; absence: Absence }[];
}

const collator = new Intl.Collator('cs');

/** Names are "First Last…": sort by everything after the first word, then the first word. */
function byLastName(a: Member, b: Member): number {
	const split = (name: string) => {
		const [first, ...rest] = name.trim().split(/\s+/);
		return [rest.join(' '), first];
	};
	const [lastA, firstA] = split(a.name);
	const [lastB, firstB] = split(b.name);
	return collator.compare(lastA, lastB) || collator.compare(firstA, firstB);
}

class Data {
	/** Everyone, including archived members. */
	allMembers = $state<Member[]>([]);
	/** Active members: the ones shown in the plan and pickers. */
	members = $derived(this.allMembers.filter((m) => !m.archived));
	archived = $derived(this.allMembers.filter((m) => m.archived));
	absences = $state<Absence[]>([]);
	events = $state<Event[]>([]);
	/** Default event places, set on the Jednotka page. */
	defaultPlaces = $state<string[]>([]);
	loaded = $state({ members: false, absences: false, events: false });

	#unsubs: Unsubscribe[] = [];

	get ready() {
		return this.loaded.members && this.loaded.absences && this.loaded.events;
	}

	#demo = false;

	/** Dev-only: fill with sample data instead of Firestore. */
	loadDemo(sample: { members: Member[]; absences: Absence[]; events: Event[] }) {
		this.#demo = true;
		this.allMembers = [...sample.members].sort(byLastName);
		this.absences = sample.absences;
		this.events = sample.events;
		this.loaded = { members: true, absences: true, events: true };
	}

	/**
	 * onSnapshot stops for good after an error (e.g. the page loaded before new rules
	 * were deployed), so re-subscribe after a short wait instead of going stale.
	 */
	#watch(subscribe: (onError: (e: FirestoreError) => void) => Unsubscribe) {
		let unsub: Unsubscribe = () => {};
		let retry: ReturnType<typeof setTimeout> | undefined;
		const run = () => {
			unsub = subscribe((e) => {
				console.error(e);
				retry = setTimeout(run, 5000);
			});
		};
		run();
		this.#unsubs.push(() => {
			clearTimeout(retry);
			unsub();
		});
	}

	/** Realtime subscriptions. The whole unit is small, so everything is synced. */
	start() {
		if (this.#demo || this.#unsubs.length) return;
		this.#watch((onError) =>
			onSnapshot(
				collection(db, 'members'),
				(snap) => {
					this.allMembers = snap.docs
						.map((d) => {
							const x = d.data();
							return { id: d.id, name: x.name, color: x.color, archived: x.archived === true };
						})
						.sort(byLastName);
					this.loaded.members = true;
				},
				onError
			)
		);
		this.#watch((onError) =>
			onSnapshot(
				collection(db, 'absences'),
				(snap) => {
					this.absences = snap.docs.map((d) => {
						const x = d.data();
						return { id: d.id, memberId: x.memberId, from: x.from, to: x.to, note: x.note ?? '' };
					});
					this.loaded.absences = true;
				},
				onError
			)
		);
		this.#watch((onError) =>
			onSnapshot(
				doc(db, 'config', 'places'),
				(snap) => {
					const list = snap.data()?.list;
					this.defaultPlaces = Array.isArray(list) ? list : [];
				},
				onError
			)
		);
		this.#watch((onError) =>
			onSnapshot(
				collection(db, 'events'),
				(snap) => {
					this.events = snap.docs
						.map((d) => {
							const x = d.data();
							return {
								id: d.id,
								title: x.title,
								date: x.date,
								time: x.time ?? '',
								place: x.place ?? '',
								note: x.note ?? ''
							};
						})
						.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
					this.loaded.events = true;
				},
				onError
			)
		);
	}

	member(id: string | null | undefined): Member | undefined {
		return id ? this.members.find((m) => m.id === id) : undefined;
	}

	event(id: string): Event | undefined {
		return this.events.find((e) => e.id === id);
	}

	eventsOn(day: DateKey): Event[] {
		return this.events.filter((e) => e.date === day);
	}

	absenceOn(memberId: string, day: DateKey): Absence | undefined {
		return this.absences.find((a) => a.memberId === memberId && a.from <= day && a.to >= day);
	}

	/** The member's "do odvolání" absence, if switched on. */
	openAbsence(memberId: string): Absence | undefined {
		return this.absences.find((a) => a.memberId === memberId && a.to === OPEN_END);
	}

	availability(day: DateKey): DayAvailability {
		const available: Member[] = [];
		const away: DayAvailability['away'] = [];
		for (const member of this.members) {
			const absence = this.absenceOn(member.id, day);
			if (absence) away.push({ member, absence });
			else available.push(member);
		}
		return { available, away };
	}

	/** Default places first, then places used before (most recent first), for the event form. */
	get places(): string[] {
		const seen = new Set<string>(this.defaultPlaces);
		for (let i = this.events.length - 1; i >= 0; i--) {
			const p = this.events[i].place.trim();
			if (p) seen.add(p);
		}
		return [...seen];
	}

	async setDefaultPlaces(list: string[]) {
		await setDoc(doc(db, 'config', 'places'), { list });
	}

	// --- members ----------------------------------------------------------

	async addMember(name: string): Promise<string> {
		const ref = await addDoc(collection(db, 'members'), {
			name: name.trim(),
			color: nextColor(this.members.map((m) => m.color)),
			archived: false,
			createdAt: serverTimestamp()
		});
		return ref.id;
	}

	async updateMember(id: string, patch: Partial<Pick<Member, 'name' | 'color'>>) {
		await updateDoc(doc(db, 'members', id), patch);
	}

	/** Hides the member from the plan and frees their colour; history is kept. */
	async archiveMember(id: string) {
		await updateDoc(doc(db, 'members', id), { archived: true });
	}

	/** Brings a member back; picks a new colour if theirs was taken meanwhile. */
	async restoreMember(id: string) {
		const m = this.allMembers.find((x) => x.id === id);
		if (!m) return;
		const used = this.members.map((x) => x.color.toUpperCase());
		const color = used.includes(m.color.toUpperCase()) ? nextColor(used) : m.color;
		await updateDoc(doc(db, 'members', id), { archived: false, color });
	}

	/** Removes the member together with all their absences. */
	async deleteMember(id: string) {
		const batch = writeBatch(db);
		for (const a of this.absences.filter((a) => a.memberId === id)) {
			batch.delete(doc(db, 'absences', a.id));
		}
		batch.delete(doc(db, 'members', id));
		await batch.commit();
	}

	// --- absences ---------------------------------------------------------

	async addAbsence(memberId: string, from: DateKey, to: DateKey, note = ''): Promise<string> {
		if (to < from) [from, to] = [to, from];
		const ref = await addDoc(collection(db, 'absences'), {
			memberId,
			from,
			to,
			note: note.trim(),
			createdAt: serverTimestamp()
		});
		return ref.id;
	}

	async updateAbsenceNote(id: string, note: string) {
		await updateDoc(doc(db, 'absences', id), { note: note.trim() });
	}

	async deleteAbsence(id: string) {
		await deleteDoc(doc(db, 'absences', id));
	}

	/** Puts back a deleted absence under the same id (undo). */
	async restoreAbsence(a: Absence) {
		await setDoc(doc(db, 'absences', a.id), {
			memberId: a.memberId,
			from: a.from,
			to: a.to,
			note: a.note,
			createdAt: serverTimestamp()
		});
	}

	/** "Nemůžu přijít": a regular one-day absence. */
	async markAway(memberId: string, day: DateKey, note = ''): Promise<string> {
		const existing = this.absenceOn(memberId, day);
		if (existing) return existing.id;
		return this.addAbsence(memberId, day, day, note);
	}

	/**
	 * "Přece jen přijdu": frees a single day. Absences covering it are deleted,
	 * shortened, or split in two so the other days stay recorded.
	 */
	async markAvailable(memberId: string, day: DateKey) {
		const batch = writeBatch(db);
		for (const a of this.absences.filter(
			(a) => a.memberId === memberId && a.from <= day && a.to >= day
		)) {
			const ref = doc(db, 'absences', a.id);
			if (a.from === day && a.to === day) batch.delete(ref);
			else if (a.from === day) batch.update(ref, { from: addDays(day, 1) });
			else if (a.to === day) batch.update(ref, { to: addDays(day, -1) });
			else {
				batch.update(ref, { to: addDays(day, -1) });
				batch.set(doc(collection(db, 'absences')), {
					memberId,
					from: addDays(day, 1),
					to: a.to,
					note: a.note,
					createdAt: serverTimestamp()
				});
			}
		}
		await batch.commit();
	}

	/**
	 * "Nejsem k dispozici do odvolání": an absence from today with no end.
	 * Switching it off ends it yesterday (or deletes it if it started today).
	 */
	async setUnavailable(memberId: string, on: boolean) {
		const today = todayKey();
		if (on) {
			if (!this.openAbsence(memberId)) await this.addAbsence(memberId, today, OPEN_END);
			return;
		}
		const batch = writeBatch(db);
		for (const a of this.absences.filter((a) => a.memberId === memberId && a.to === OPEN_END)) {
			const ref = doc(db, 'absences', a.id);
			if (a.from >= today) batch.delete(ref);
			else batch.update(ref, { to: addDays(today, -1) });
		}
		await batch.commit();
	}

	// --- events -----------------------------------------------------------

	async addEvent(e: Omit<Event, 'id'>): Promise<string> {
		const ref = await addDoc(collection(db, 'events'), {
			title: e.title.trim(),
			date: e.date,
			time: e.time,
			place: e.place.trim(),
			note: e.note.trim(),
			createdAt: serverTimestamp()
		});
		return ref.id;
	}

	async updateEvent(id: string, e: Omit<Event, 'id'>) {
		await updateDoc(doc(db, 'events', id), {
			title: e.title.trim(),
			date: e.date,
			time: e.time,
			place: e.place.trim(),
			note: e.note.trim()
		});
	}

	async deleteEvent(id: string) {
		await deleteDoc(doc(db, 'events', id));
	}
}

export const data = new Data();
