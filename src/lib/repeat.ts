// How a series of events repeats, modelled on Apple's "Custom" repeat:
// every n days / weeks (on weekdays) / months (on days, or the nth weekday) / years.
// A rule is anchored at the series' first day `from`; missing fields default to it.

import { addDays, daysBetween, DOW_ON, parseKey, startOfWeek, weekdayIndex, type DateKey } from './dates';

export type Freq = 'day' | 'week' | 'month' | 'year';

export interface Repeat {
	freq: Freq;
	/** Every n days / weeks / months / years (≥ 1). */
	every: number;
	/** week: 0 = Mon … 6 = Sun. Default: `from`'s weekday. */
	weekdays?: number[];
	/** month: days of the month (1–31). Default: `from`'s day. Months without the day are skipped. */
	days?: number[];
	/** month / year: the nth (1–5, -1 = last) day of `kind` in the month, instead of `days`. */
	nth?: number;
	/** With `nth`: 0–6 a weekday, 7 any day, 8 a working day (Mon–Fri), 9 a weekend day. */
	kind?: number;
	/** year: months 1–12. Default: `from`'s month. Without `nth`, on `from`'s day. */
	months?: number[];
}

/** No rule: every week on `from`'s weekday (series stored before rules existed). */
export const WEEKLY: Repeat = { freq: 'week', every: 1 };

export const KIND_ANY = 7;
export const KIND_WORKDAY = 8;
export const KIND_WEEKEND = 9;

function fits(d: Date, kind: number): boolean {
	const w = (d.getDay() + 6) % 7;
	if (kind < 7) return w === kind;
	if (kind === KIND_WORKDAY) return w < 5;
	if (kind === KIND_WEEKEND) return w >= 5;
	return true;
}

/** Is `day` the nth (or last, -1) day of `kind` in its month? */
export function isNth(day: DateKey, nth: number, kind: number): boolean {
	const d = parseKey(day);
	if (!fits(d, kind)) return false;
	const y = d.getFullYear();
	const m = d.getMonth();
	const date = d.getDate();
	if (nth > 0) {
		let count = 0;
		for (let i = 1; i <= date; i++) if (fits(new Date(y, m, i), kind)) count++;
		return count === nth;
	}
	const last = new Date(y, m + 1, 0).getDate();
	for (let i = date + 1; i <= last; i++) if (fits(new Date(y, m, i), kind)) return false;
	return true;
}

/** Does a series starting on `from` fall on `day` (≥ `from`)? */
export function matches(r: Repeat, from: DateKey, day: DateKey): boolean {
	const a = parseKey(from);
	const d = parseKey(day);
	switch (r.freq) {
		case 'day':
			return daysBetween(from, day) % r.every === 0;
		case 'week':
			return (
				(daysBetween(startOfWeek(from), startOfWeek(day)) / 7) % r.every === 0 &&
				(r.weekdays ?? [weekdayIndex(from)]).includes(weekdayIndex(day))
			);
		case 'month': {
			const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth();
			if (months % r.every) return false;
			return r.nth ? isNth(day, r.nth, r.kind ?? KIND_ANY) : (r.days ?? [a.getDate()]).includes(d.getDate());
		}
		case 'year':
			if ((d.getFullYear() - a.getFullYear()) % r.every) return false;
			if (!(r.months ?? [a.getMonth() + 1]).includes(d.getMonth() + 1)) return false;
			return r.nth ? isNth(day, r.nth, r.kind ?? KIND_ANY) : d.getDate() === a.getDate();
	}
}

/** Days of the series (`from`–`to`, rule `r`) within `start`–`end`, at most `limit`. */
export function repeatDays(
	r: Repeat | undefined,
	from: DateKey,
	to: DateKey,
	start: DateKey,
	end: DateKey,
	limit = Infinity
): DateKey[] {
	r ??= WEEKLY;
	const first = start > from ? start : from;
	const last = end < to ? end : to;
	const out: DateKey[] = [];
	// A fixed step: daily, or weekly on a single weekday.
	const step =
		r.freq === 'day'
			? r.every
			: r.freq === 'week' && (!r.weekdays || r.weekdays.join() === String(weekdayIndex(from)))
				? 7 * r.every
				: 0;
	if (step) {
		const k = Math.ceil(daysBetween(from, first) / step) * step;
		for (let d = addDays(from, k); d <= last && out.length < limit; d = addDays(d, step)) out.push(d);
		return out;
	}
	for (let d = first; d <= last && out.length < limit; d = addDays(d, 1)) {
		if (matches(r, from, d)) out.push(d);
	}
	return out;
}

/** About 10 years: rules like "every 12 months on the 5th Thursday" can skip years. */
const HORIZON = 3700;

/** The first day of the series after `day`, if any. */
export function nextAfter(r: Repeat | undefined, from: DateKey, to: DateKey, day: DateKey): DateKey | undefined {
	return repeatDays(r, from, to, addDays(day, 1), addDays(day, HORIZON), 1)[0];
}

/** The last day of a series with an end. */
export function lastDay(r: Repeat | undefined, from: DateKey, to: DateKey): DateKey | undefined {
	return repeatDays(r, from, to, addDays(to, -HORIZON), to).at(-1);
}

/** Only the fields that matter for its frequency; undefined for the plain weekly repeat. */
export function normalize(r: Repeat, from: DateKey): Repeat | undefined {
	const every = Math.max(1, Math.min(99, Math.round(r.every) || 1));
	const sorted = (xs: number[] | undefined) => (xs?.length ? [...new Set(xs)].sort((a, b) => a - b) : undefined);
	const nth = r.nth ? { nth: r.nth, kind: r.kind ?? KIND_ANY } : {};
	switch (r.freq) {
		case 'day':
			return { freq: 'day', every };
		case 'week': {
			const weekdays = sorted(r.weekdays);
			if (every === 1 && (!weekdays || weekdays.join() === String(weekdayIndex(from)))) return undefined;
			return { freq: 'week', every, ...(weekdays ? { weekdays } : {}) };
		}
		case 'month': {
			const days = sorted(r.days);
			return { freq: 'month', every, ...(r.nth ? nth : days ? { days } : {}) };
		}
		case 'year': {
			const months = sorted(r.months);
			return { freq: 'year', every, ...(months ? { months } : {}), ...nth };
		}
	}
}

/** A rule that can never fall on a day (nothing picked). */
export function isEmpty(r: Repeat): boolean {
	return (
		(r.freq === 'week' && r.weekdays?.length === 0) ||
		(r.freq === 'month' && !r.nth && r.days?.length === 0) ||
		(r.freq === 'year' && r.months?.length === 0)
	);
}

// --- Czech wording ----------------------------------------------------------

const UNITS: Record<Freq, [string, string, string]> = {
	day: ['den', 'dny', 'dní'],
	week: ['týden', 'týdny', 'týdnů'],
	month: ['měsíc', 'měsíce', 'měsíců'],
	year: ['rok', 'roky', 'let']
};

/** "den", "dny", "dní" for 1, 2–4, 5+. */
export function unit(freq: Freq, n: number): string {
	const [one, few, many] = UNITS[freq];
	return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/** "každý týden", "každé 2 týdny", "každých 5 týdnů" */
function everyText(freq: Freq, n: number): string {
	const each = n === 1 ? 'každý' : n <= 4 ? 'každé' : 'každých';
	return n === 1 ? `${each} ${unit(freq, 1)}` : `${each} ${n} ${unit(freq, n)}`;
}

/** Just the step, for a short label: "každý rok", "každé 2 týdny". */
export function everyLabel(r: Repeat | undefined): string {
	r ??= WEEKLY;
	return everyText(r.freq, r.every);
}

/** "a, b a c" */
function join(items: string[]): string {
	return items.length > 1 ? `${items.slice(0, -1).join(', ')} a ${items.at(-1)}` : (items[0] ?? '');
}

/** Accusative ("každou středu"), and the matching "každý". */
const KIND_ACC = ['pondělí', 'úterý', 'středu', 'čtvrtek', 'pátek', 'sobotu', 'neděli', 'den', 'pracovní den', 'víkendový den'];
const KIND_EACH = ['každé', 'každé', 'každou', 'každý', 'každý', 'každou', 'každou', 'každý', 'každý', 'každý'];
export const KIND_NAMES = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle', 'den', 'pracovní den', 'víkendový den'];
export const NTH_NAMES: [number, string][] = [
	[1, 'první'],
	[2, 'druhý'],
	[3, 'třetí'],
	[4, 'čtvrtý'],
	[5, 'pátý'],
	[-1, 'poslední']
];
/** "29. října" */
const MONTHS_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
/** "v říjnu" */
const MONTHS_LOC = ['v lednu', 'v únoru', 'v březnu', 'v dubnu', 'v květnu', 'v červnu', 'v červenci', 'v srpnu', 'v září', 'v říjnu', 'v listopadu', 'v prosinci'];
export const MONTHS_ABBR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

/** "5. čtvrtek", "poslední neděli" (accusative) */
function nthText(nth: number, kind: number): string {
	return `${nth > 0 ? `${nth}.` : 'poslední'} ${KIND_ACC[kind]}`;
}

/** "každý týden ve čtvrtek", "každý 5. čtvrtek v měsíci", "29. každého měsíce" … (lower case). */
export function describe(r: Repeat | undefined, from: DateKey): string {
	r ??= WEEKLY;
	const a = parseKey(from);
	const every = everyText(r.freq, r.every);
	const kind = r.kind ?? KIND_ANY;
	switch (r.freq) {
		case 'day':
			return every;
		case 'week': {
			const days = [...(r.weekdays ?? [weekdayIndex(from)])].sort((x, y) => x - y);
			const on =
				days.join() === '0,1,2,3,4'
					? 'v pracovní dny'
					: days.join() === '5,6'
						? 'o víkendech'
						: join(days.map((d) => DOW_ON[d]));
			return `${every} ${on}`;
		}
		case 'month': {
			if (r.nth) {
				return r.every === 1
					? `${KIND_EACH[kind]} ${nthText(r.nth, kind)} v měsíci`
					: `${every}, vždy ${nthText(r.nth, kind)}`;
			}
			const days = join([...(r.days ?? [a.getDate()])].sort((x, y) => x - y).map((d) => `${d}.`));
			return r.every === 1 ? `${days} každého měsíce` : `${every}, vždy ${days} den`;
		}
		case 'year': {
			const months = [...(r.months ?? [a.getMonth() + 1])].sort((x, y) => x - y).map((m) => m - 1);
			if (r.nth) return `${every} ${nthText(r.nth, kind)} ${join(months.map((m) => MONTHS_LOC[m]))}`;
			return `${every} ${a.getDate()}. ${join(months.map((m) => MONTHS_GEN[m]))}`;
		}
	}
}

/** The usual choices for an event on `day`: weekly, nth weekday, same day each month. "Last" is in Vlastní. */
export function quickRepeats(day: DateKey): Repeat[] {
	const d = parseKey(day);
	const w = weekdayIndex(day);
	return [
		WEEKLY,
		{ freq: 'month', every: 1, nth: Math.ceil(d.getDate() / 7), kind: w },
		{ freq: 'month', every: 1, days: [d.getDate()] }
	];
}
