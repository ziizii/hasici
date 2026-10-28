import {
	addDoc,
	arrayUnion,
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
import {
	addDays,
	daysBetween,
	formatRange,
	formatShort,
	OPEN_END,
	todayKey,
	weekdayIndex,
	type DateKey
} from './dates';
import { nextColor } from './colors';
import { describe, matches, normalize, repeatDays, WEEKLY, type Repeat } from './repeat';
import { mark } from './perf';

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
	/** Repeating: only the days of this rule (from `from`) within the range. None = every day. */
	repeat?: Repeat;
	/** Days skipped in a repeating / open-ended absence ("this Tuesday I can come"). */
	except: DateKey[];
}

/** Absences with exceptions instead of being split when a single day is freed. */
export function hasExceptions(a: Absence): boolean {
	return !!a.repeat || a.to === OPEN_END;
}

/** True when the absence would cover the day if it weren't an exception. */
function inPattern(a: Absence, day: DateKey): boolean {
	return a.from <= day && a.to >= day && (!a.repeat || matches(a.repeat, a.from, day));
}

export function covers(a: Absence, day: DateKey): boolean {
	return inPattern(a, day) && !a.except.includes(day);
}

/** The next `n` days the pattern falls on from `day` on (exceptions included). */
export function occurrences(a: Absence, day: DateKey, n: number): DateKey[] {
	return repeatDays(a.repeat ?? { freq: 'day', every: 1 }, a.from, a.to, day, addDays(day, 3700), n);
}

/** The "Nejsem k dispozici" switch: every day, no end. */
export function isSwitch(a: Absence): boolean {
	return a.to === OPEN_END && !a.repeat;
}

/** A row in an absence list: consecutive plain absences of one member shown as one range. */
export interface AbsenceGroup {
	/** The merged view (id of the first part). */
	absence: Absence;
	parts: Absence[];
}

/** Merges overlapping or back-to-back dated absences per member (1., 2., 3. -> 1.–3.). */
export function groupAbsences(list: Absence[]): AbsenceGroup[] {
	const plain = (a: Absence) => !a.repeat && a.to !== OPEN_END && !a.except.length;
	const sorted = [...list].sort((x, y) => x.from.localeCompare(y.from));
	const out: AbsenceGroup[] = [];
	const open = new Map<string, AbsenceGroup>(); // member -> group still extendable
	for (const a of sorted) {
		if (!plain(a)) {
			out.push({ absence: a, parts: [a] });
			continue;
		}
		const g = open.get(a.memberId);
		if (g && a.from <= addDays(g.absence.to, 1)) {
			const notes = [...new Set([g.absence.note, a.note].filter(Boolean))].join(', ');
			g.absence = { ...g.absence, to: a.to > g.absence.to ? a.to : g.absence.to, note: notes };
			g.parts.push(a);
		} else {
			const ng = { absence: a, parts: [a] };
			open.set(a.memberId, ng);
			out.push(ng);
		}
	}
	return out;
}

/** "do 30. 10.", "od Út 3. 11.", "Út každý týden, do odvolání" … for lists. */
export function absenceWhen(a: Absence, today: DateKey): string {
	const range =
		a.to === OPEN_END
			? a.from <= today
				? 'do odvolání'
				: `od ${formatShort(a.from)}`
			: a.from <= today && a.from !== a.to
				? `do ${formatShort(a.to)}`
				: formatRange(a.from, a.to);
	const skipped = a.except.filter((d) => d >= today);
	const except = skipped.length ? ` (kromě ${skipped.slice(0, 2).map(formatShort).join(', ')}${skipped.length > 2 ? ' …' : ''})` : '';
	const rule = a.repeat && describe(a.repeat, a.from).replace(/^./, (c) => c.toUpperCase());
	return (rule ? `${rule}, ${range}` : range) + except;
}

/** The exception list with `day` added or removed; past days are dropped to keep it short. */
function withException(a: Absence, day: DateKey, on: boolean): DateKey[] {
	const today = todayKey();
	const rest = a.except.filter((d) => d !== day && d >= today);
	return (on ? [...rest, day] : rest).sort();
}

/** Every week on these weekdays: stored as `weekdays`, as before repeat rules existed. */
function weeklyDays(r: Repeat | undefined, from: DateKey): number[] | undefined {
	if (r?.freq !== 'week' || r.every !== 1) return undefined;
	return [...(r.weekdays ?? [weekdayIndex(from)])].sort();
}

/** Firestore fields; a repeat only when repeating, so plain absences stay as before. */
function absenceFields(a: Omit<Absence, 'id'>) {
	const weekdays = weeklyDays(a.repeat, a.from);
	return {
		memberId: a.memberId,
		from: a.from,
		to: a.to,
		note: a.note,
		...(weekdays ? { weekdays } : a.repeat ? { repeat: a.repeat } : {}),
		...(a.except.length ? { except: [...a.except].sort() } : {}),
		createdAt: serverTimestamp()
	};
}

export interface Event {
	id: string;
	title: string;
	date: DateKey;
	/** 'HH:MM' or '' */
	time: string;
	place: string;
	note: string;
	/** Set for repeats: the series id, and the repeat's own day (`date` may differ once edited). */
	series?: string;
	slot?: DateKey;
}

/**
 * Activity repeated from `from` until `to` (OPEN_END = until cancelled), by `repeat`
 * or, without it, every week on `from`'s weekday. Repeats are computed, not stored; a repeat edited
 * on its own is stored as an event with id `<series>_<day>` and its day goes
 * to `except`, as does a deleted one.
 */
export interface Series {
	id: string;
	title: string;
	time: string;
	place: string;
	note: string;
	from: DateKey;
	to: DateKey;
	except: DateKey[];
	repeat?: Repeat;
}

function occurs(s: Series, day: DateKey): boolean {
	return (
		day >= s.from &&
		day <= s.to &&
		matches(s.repeat ?? WEEKLY, s.from, day) &&
		!s.except.includes(day)
	);
}

function occurrence(s: Series, day: DateKey): Event {
	const { title, time, place, note } = s;
	return { id: `${s.id}_${day}`, title, date: day, time, place, note, series: s.id, slot: day };
}

const byDateTime = (a: Event, b: Event) => (a.date + a.time).localeCompare(b.date + b.time);

export interface DayAvailability {
	available: Member[];
	away: { member: Member; absence: Absence }[];
}

const collator = new Intl.Collator('cs');

function eventFields(e: Omit<Event, 'id'>) {
	return {
		title: e.title.trim(),
		date: e.date,
		time: e.time,
		place: e.place.trim(),
		note: e.note.trim()
	};
}

/**
 * Last synced data, so a known device shows the plan at once. Firebase Auth re-checks
 * the user over the network on every start and Firestore can't read even its own cache
 * before that, which on a slow connection meant seconds of "Načítám…".
 */
const CACHE_KEY = 'hasici.cache.v2';

export function clearCachedData() {
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {
		// nothing cached
	}
}

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
	/** Events stored one by one (one-off, or a repeat edited on its own). */
	stored = $state<Event[]>([]);
	series = $state<Series[]>([]);
	/** Stored events plus repeats up to a year ahead, by date and time. */
	events = $derived.by(() => {
		const end = addDays(todayKey(), 366);
		const out = [...this.stored];
		for (const s of this.series) {
			for (const d of repeatDays(s.repeat, s.from, s.to, s.from, end)) {
				if (!s.except.includes(d)) out.push(occurrence(s, d));
			}
		}
		return out.sort(byDateTime);
	});
	/** Default event places, set on the Jednotka page. */
	defaultPlaces = $state<string[]>([]);
	loaded = $state({ members: false, absences: false, events: false, series: false });

	#unsubs: Unsubscribe[] = [];
	#saveTimer: ReturnType<typeof setTimeout> | undefined;

	#loadCached() {
		try {
			const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
			if (!c) return;
			this.allMembers = c.members;
			this.absences = c.absences;
			this.stored = c.events;
			this.series = c.series ?? [];
			this.defaultPlaces = c.defaultPlaces;
			this.loaded = { members: true, absences: true, events: true, series: true };
			mark('data z paměti zařízení');
		} catch {
			// unreadable cache: wait for Firestore as before
		}
	}

	/** Called after every live update; writes are batched. */
	#saveSoon() {
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => {
			try {
				localStorage.setItem(
					CACHE_KEY,
					JSON.stringify({
						members: this.allMembers,
						absences: this.absences,
						events: this.stored,
						series: this.series,
						defaultPlaces: this.defaultPlaces
					})
				);
			} catch {
				// storage full or unavailable: just no fast start next time
			}
		}, 500);
	}

	get ready() {
		return (
			this.loaded.members && this.loaded.absences && this.loaded.events && this.loaded.series
		);
	}

	#demo = false;

	/** Dev-only: fill with sample data instead of Firestore. */
	loadDemo(sample: { members: Member[]; absences: Absence[]; events: Event[]; series: Series[] }) {
		this.#demo = true;
		this.allMembers = [...sample.members].sort(byLastName);
		this.absences = sample.absences;
		this.stored = sample.events;
		this.series = sample.series;
		this.loaded = { members: true, absences: true, events: true, series: true };
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
		this.#loadCached();
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
					mark('živá data: členové');
					this.#saveSoon();
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
						return {
							id: d.id,
							memberId: x.memberId,
							from: x.from,
							to: x.to,
							note: x.note ?? '',
							except: Array.isArray(x.except) ? x.except : [],
							...(x.repeat
								? { repeat: x.repeat as Repeat }
								: Array.isArray(x.weekdays) && x.weekdays.length
									? { repeat: { freq: 'week', every: 1, weekdays: x.weekdays } as Repeat }
									: {})
						};
					});
					this.loaded.absences = true;
					mark('živá data: nepřítomnosti');
					this.#saveSoon();
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
					this.#saveSoon();
				},
				onError
			)
		);
		this.#watch((onError) =>
			onSnapshot(
				collection(db, 'events'),
				(snap) => {
					this.stored = snap.docs
						.map((d) => {
							const x = d.data();
							const ev: Event = {
								id: d.id,
								title: x.title,
								date: x.date,
								time: x.time ?? '',
								place: x.place ?? '',
								note: x.note ?? ''
							};
							if (x.series && d.id.startsWith(`${x.series}_`)) {
								ev.series = x.series;
								ev.slot = d.id.slice(x.series.length + 1);
							}
							return ev;
						})
						.sort(byDateTime);
					this.loaded.events = true;
					mark('živá data: akce');
					this.#saveSoon();
				},
				onError
			)
		);
		this.#watch((onError) =>
			onSnapshot(
				collection(db, 'series'),
				(snap) => {
					this.series = snap.docs.map((d) => {
						const x = d.data();
						return {
							id: d.id,
							title: x.title,
							time: x.time ?? '',
							place: x.place ?? '',
							note: x.note ?? '',
							from: x.from,
							to: x.to ?? OPEN_END,
							except: x.except ?? [],
							...(x.repeat ? { repeat: x.repeat as Repeat } : {})
						};
					});
					this.loaded.series = true;
					this.#saveSoon();
				},
				onError
			)
		);
	}

	member(id: string | null | undefined): Member | undefined {
		return id ? this.members.find((m) => m.id === id) : undefined;
	}

	event(id: string): Event | undefined {
		const stored = this.stored.find((e) => e.id === id);
		if (stored) return stored;
		const cut = id.lastIndexOf('_');
		const s = this.series.find((x) => x.id === id.slice(0, cut));
		const day = id.slice(cut + 1);
		return s && occurs(s, day) ? occurrence(s, day) : undefined;
	}

	/** Works for any day, also beyond the year that `events` covers. */
	eventsOn(day: DateKey): Event[] {
		return [
			...this.stored.filter((e) => e.date === day),
			...this.series.filter((s) => occurs(s, day)).map((s) => occurrence(s, day))
		].sort(byDateTime);
	}

	/** The weekly repeat `ev` belongs to, if it is still part of it. */
	seriesOf(ev: Event): Series | undefined {
		const s = ev.series ? this.series.find((x) => x.id === ev.series) : undefined;
		return s && ev.slot && ev.slot >= s.from && ev.slot <= s.to ? s : undefined;
	}

	absenceOn(memberId: string, day: DateKey): Absence | undefined {
		return this.absences.find((a) => a.memberId === memberId && covers(a, day));
	}

	/** The member's "do odvolání" absence, if switched on. */
	openAbsence(memberId: string): Absence | undefined {
		return this.absences.find((a) => a.memberId === memberId && isSwitch(a));
	}

	/**
	 * Day toggles not yet saved ("memberId|day" -> away). Shown at once, because
	 * Firestore only reflects local writes after it has signed in.
	 */
	pending = $state<Record<string, boolean>>({});

	setPending(memberId: string, day: DateKey, away: boolean | null) {
		const key = `${memberId}|${day}`;
		const { [key]: _, ...rest } = this.pending;
		this.pending = away === null ? rest : { ...rest, [key]: away };
	}

	availability(day: DateKey): DayAvailability {
		const available: Member[] = [];
		const away: DayAvailability['away'] = [];
		for (const member of this.members) {
			const pending = this.pending[`${member.id}|${day}`];
			const absence =
				pending === false
					? undefined
					: (this.absenceOn(member.id, day) ??
						(pending
							? { id: '', memberId: member.id, from: day, to: day, note: '', except: [] }
							: undefined));
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

	async addAbsence(
		memberId: string,
		from: DateKey,
		to: DateKey,
		note = '',
		repeat?: Repeat
	): Promise<string> {
		if (to < from) [from, to] = [to, from];
		// for series no rule means weekly; for absences it means every day
		const rule = repeat && (normalize(repeat, from) ?? { freq: 'week', every: 1, weekdays: [weekdayIndex(from)] });
		const ref = await addDoc(
			collection(db, 'absences'),
			absenceFields({ memberId, from, to, note: note.trim(), except: [], ...(rule ? { repeat: rule } : {}) })
		);
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
		await setDoc(doc(db, 'absences', a.id), absenceFields(a));
	}

	/** "Nemůžu přijít": a regular one-day absence. */
	async markAway(memberId: string, day: DateKey, note = ''): Promise<string> {
		const existing = this.absenceOn(memberId, day);
		if (existing) return existing.id;
		// The day was an exception of a schedule: put it back instead of adding a new absence.
		const skipped = this.absences.find(
			(a) => a.memberId === memberId && a.except.includes(day) && inPattern(a, day)
		);
		if (skipped) {
			await this.setException(skipped, day, false);
			return skipped.id;
		}
		return this.addAbsence(memberId, day, day, note);
	}

	/**
	 * "Přece jen přijdu": frees a single day. Absences covering it are deleted,
	 * shortened, or split in two so the other days stay recorded.
	 */
	async markAvailable(memberId: string, day: DateKey) {
		const batch = writeBatch(db);
		for (const a of this.absences.filter((a) => a.memberId === memberId && covers(a, day))) {
			const ref = doc(db, 'absences', a.id);
			if (hasExceptions(a) && a.from !== day) {
				batch.update(ref, { except: withException(a, day, true) });
				continue;
			}
			if (a.from === day && a.to === day) batch.delete(ref);
			else if (a.from === day) batch.update(ref, { from: addDays(day, 1) });
			else if (a.to === day) batch.update(ref, { to: addDays(day, -1) });
			else {
				batch.update(ref, { to: addDays(day, -1) });
				batch.set(doc(collection(db, 'absences')), absenceFields({ ...a, from: addDays(day, 1) }));
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
		for (const a of this.absences.filter((a) => a.memberId === memberId && isSwitch(a))) {
			const ref = doc(db, 'absences', a.id);
			if (a.from >= today) batch.delete(ref);
			else batch.update(ref, { to: addDays(today, -1) });
		}
		await batch.commit();
	}

	/** Skip (`on`) or restore one day of a repeating / open-ended absence. */
	async setException(a: Absence, day: DateKey, on: boolean) {
		await updateDoc(doc(db, 'absences', a.id), { except: withException(a, day, on) });
	}

	// --- events -----------------------------------------------------------

	async addEvent(e: Omit<Event, 'id'>): Promise<string> {
		const ref = await addDoc(collection(db, 'events'), {
			...eventFields(e),
			createdAt: serverTimestamp()
		});
		return ref.id;
	}

	/** Repeats from `e.date` by `repeat` (default every week), until `to` (inclusive) or until cancelled. */
	async addSeries(e: Omit<Event, 'id'>, to: DateKey = OPEN_END, repeat?: Repeat) {
		const { date, ...fields } = eventFields(e);
		const rule = repeat && normalize(repeat, date);
		await addDoc(collection(db, 'series'), {
			...fields,
			from: date,
			to,
			except: [],
			...(rule ? { repeat: rule } : {}),
			createdAt: serverTimestamp()
		});
	}

	/** Changes just this event; a repeat is taken out of its series as its own event. */
	async updateEvent(ev: Event, e: Omit<Event, 'id'>) {
		const s = this.seriesOf(ev);
		if (!s || !ev.slot) return updateDoc(doc(db, 'events', ev.id), eventFields(e));
		const batch = writeBatch(db);
		batch.set(doc(db, 'events', ev.id), {
			...eventFields(e),
			series: s.id,
			createdAt: serverTimestamp()
		});
		batch.update(doc(db, 'series', s.id), { except: arrayUnion(ev.slot) });
		await batch.commit();
	}

	/**
	 * Changes this repeat and all later ones: the series is split at this day.
	 * A plain weekly repeat moves along with a new date (and so its weekday). Other
	 * rules (e.g. "the 5th Thursday") stay put; only this day moves, as its own event.
	 */
	async updateFollowing(ev: Event, e: Omit<Event, 'id'>) {
		const s = this.seriesOf(ev);
		if (!s || !ev.slot) return this.updateEvent(ev, e);
		const { date, ...fields } = eventFields(e);
		const slot = ev.slot;
		const moved = !!s.repeat && date !== slot;
		const shift = s.repeat ? 0 : daysBetween(slot, date);
		const from = s.repeat ? slot : date;
		const except = s.except.filter((d) => d >= slot).map((d) => addDays(d, shift));
		if (moved) except.push(slot);
		const batch = writeBatch(db);
		let id = s.id;
		if (slot === s.from) {
			batch.update(doc(db, 'series', s.id), { ...fields, from, except });
		} else {
			batch.update(doc(db, 'series', s.id), { to: addDays(slot, -1) });
			const ref = doc(collection(db, 'series'));
			id = ref.id;
			batch.set(ref, {
				...fields,
				from,
				to: s.to,
				except,
				...(s.repeat ? { repeat: s.repeat } : {}),
				createdAt: serverTimestamp()
			});
		}
		// a repeat edited on its own stays as it is, apart from this one
		if (this.stored.some((x) => x.id === ev.id)) batch.delete(doc(db, 'events', ev.id));
		if (moved) {
			batch.set(doc(db, 'events', `${id}_${slot}`), {
				...eventFields(e),
				series: id,
				createdAt: serverTimestamp()
			});
		}
		await batch.commit();
	}

	async deleteEvent(ev: Event) {
		const s = this.seriesOf(ev);
		if (!s || !ev.slot) return deleteDoc(doc(db, 'events', ev.id));
		const batch = writeBatch(db);
		batch.update(doc(db, 'series', s.id), { except: arrayUnion(ev.slot) });
		if (this.stored.some((x) => x.id === ev.id)) batch.delete(doc(db, 'events', ev.id));
		await batch.commit();
	}

	/** Ends the repeat: this day and all later ones go. */
	async deleteFollowing(ev: Event) {
		const s = this.seriesOf(ev);
		if (!s || !ev.slot) return this.deleteEvent(ev);
		const batch = writeBatch(db);
		if (ev.slot <= s.from) batch.delete(doc(db, 'series', s.id));
		else batch.update(doc(db, 'series', s.id), { to: addDays(ev.slot, -1) });
		for (const x of this.stored) {
			if (x.series === s.id && x.slot && x.slot >= ev.slot) {
				batch.delete(doc(db, 'events', x.id));
			}
		}
		await batch.commit();
	}
}

export const data = new Data();
