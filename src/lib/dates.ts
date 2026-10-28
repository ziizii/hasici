// All dates are handled as local calendar days in 'YYYY-MM-DD' form ("keys").
// String comparison of keys equals chronological comparison.

export type DateKey = string;

/** `to` of an absence that lasts until it is switched off ("do odvolání"). */
export const OPEN_END: DateKey = '9999-12-31';

const pad = (n: number) => (n < 10 ? '0' + n : String(n));

export function toKey(d: Date): DateKey {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key: DateKey): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

// The unit is in Czechia: "today" is the Prague calendar day wherever the device is.
const pragueDay = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Prague',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

export function todayKey(): DateKey {
	return pragueDay.format(new Date());
}

export function addDays(key: DateKey, n: number): DateKey {
	const d = parseKey(key);
	d.setDate(d.getDate() + n);
	return toKey(d);
}

export function daysBetween(a: DateKey, b: DateKey): number {
	return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(key: DateKey): number {
	return (parseKey(key).getDay() + 6) % 7;
}

export function isWeekend(key: DateKey): boolean {
	return weekdayIndex(key) >= 5;
}

export function startOfWeek(key: DateKey): DateKey {
	return addDays(key, -weekdayIndex(key));
}

export function isoWeek(key: DateKey): number {
	const d = parseKey(key);
	const target = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const firstThursday = new Date(target.getFullYear(), 0, 4);
	return (
		1 +
		Math.round(
			((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7
		)
	);
}

export const DOW_SHORT = ['PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO', 'NE'];
export const DOW_ABBR = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
export const DOW_LONG = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
/** "každý týden ve středu" */
export const DOW_ON = ['v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu', 'v neděli'];
export const MONTHS = [
	'Leden',
	'Únor',
	'Březen',
	'Duben',
	'Květen',
	'Červen',
	'Červenec',
	'Srpen',
	'Září',
	'Říjen',
	'Listopad',
	'Prosinec'
];

/** "So 7. 11." */
export function formatShort(key: DateKey): string {
	const d = parseKey(key);
	return `${DOW_ABBR[weekdayIndex(key)]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

/** "sobota 7. 11. 2026" */
export function formatLong(key: DateKey): string {
	const d = parseKey(key);
	return `${DOW_LONG[weekdayIndex(key)]} ${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** "7. 11." */
export function formatDayMonth(key: DateKey): string {
	const d = parseKey(key);
	return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function formatRange(from: DateKey, to: DateKey): string {
	if (to === OPEN_END) return `od ${formatShort(from)}`;
	return from === to ? formatShort(from) : `${formatShort(from)} – ${formatShort(to)}`;
}

/** Repeating absences: "Út, Čt každý týden", "Víkendy". */
export function formatWeekdays(days: number[]): string {
	const sorted = [...days].sort();
	if (sorted.join() === '5,6') return 'Víkendy';
	if (sorted.join() === '0,1,2,3,4') return 'Pracovní dny';
	return `${sorted.map((d) => DOW_ABBR[d]).join(', ')} každý týden`;
}

export function rangeLength(from: DateKey, to: DateKey): number {
	return daysBetween(from, to) + 1;
}

export function pluralDays(n: number): string {
	if (n === 1) return '1 den';
	if (n >= 2 && n <= 4) return `${n} dny`;
	return `${n} dní`;
}

// --- Czech public holidays ------------------------------------------------

function easterSunday(year: number): Date {
	// Anonymous Gregorian algorithm
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(year, month - 1, day);
}

const holidayCache = new Map<number, Map<string, string>>();

function holidaysFor(year: number): Map<string, string> {
	let map = holidayCache.get(year);
	if (map) return map;
	map = new Map();
	const fixed: [string, string][] = [
		['01-01', 'Nový rok'],
		['05-01', 'Svátek práce'],
		['05-08', 'Den vítězství'],
		['07-05', 'Cyril a Metoděj'],
		['07-06', 'Jan Hus'],
		['09-28', 'Den české státnosti'],
		['10-28', 'Vznik Československa'],
		['11-17', 'Den boje za svobodu'],
		['12-24', 'Štědrý den'],
		['12-25', '1. svátek vánoční'],
		['12-26', '2. svátek vánoční']
	];
	for (const [md, name] of fixed) map.set(`${year}-${md}`, name);
	const easter = toKey(easterSunday(year));
	map.set(addDays(easter, -2), 'Velký pátek');
	map.set(addDays(easter, 1), 'Velikonoční pondělí');
	holidayCache.set(year, map);
	return map;
}

export function holiday(key: DateKey): string | undefined {
	return holidaysFor(Number(key.slice(0, 4))).get(key);
}
