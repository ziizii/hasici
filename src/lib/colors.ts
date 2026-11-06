// Dark, distinguishable colours that all carry white text at >= 4.5:1.
export const PALETTE = [
	'#1F4E8C',
	'#9C2A2A',
	'#1E6B45',
	'#6B3FA0',
	'#0F6E73',
	'#A3245A',
	'#4F5F12',
	'#005F87',
	'#8F4207',
	'#2C3E9E',
	'#7A5200',
	'#7D2E8E',
	'#3B6E1E',
	'#8A3B12',
	'#44546A',
	'#9A1F4F',
	'#00695C',
	'#5B3A29',
	'#4B3F99',
	'#B23A8A'
];

/**
 * One colour per activity of a day (by time) in the calendar, so two activities show as
 * two halves of the day's circle. The first is the usual red; all carry white text and
 * differ from the availability ring colours.
 */
export const EVENT_COLORS = ['#B3261A', '#2C3E9E', '#7D2E8E', '#0F6E73'];

export function eventColor(i: number): string {
	return EVENT_COLORS[i % EVENT_COLORS.length];
}

/**
 * Colour for a new member: the first palette colour no active member uses.
 * Archived members don't count, so their colours get recycled. With more
 * members than colours, the least-used colour is shared.
 */
export function nextColor(used: string[]): string {
	const counts = new Map(PALETTE.map((c) => [c, 0]));
	for (const c of used) {
		const key = c.toUpperCase();
		if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
	}
	let best = PALETTE[0];
	for (const c of PALETTE) if (counts.get(c)! < counts.get(best)!) best = c;
	return best;
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * What the availability bar shows for each member: the nickname if set, else the first
 * name. Members whose first name is shown for someone else too get the start of their
 * surname ("Jan N.", "Jan Nov."), so the label stays unique. Derived from the current
 * list, so once a name is unique again it goes back to just the first name.
 */
export function shortNames(members: { id: string; name: string; nickname?: string }[]): Map<string, string> {
	const out = new Map<string, string>();
	const base = (m: (typeof members)[number]) => m.nickname?.trim() || firstName(m.name);
	const groups = new Map<string, typeof members>();
	for (const m of members) {
		const key = base(m).toLocaleLowerCase('cs');
		groups.set(key, [...(groups.get(key) ?? []), m]);
	}
	for (const group of groups.values()) {
		const plain = group.filter((m) => !m.nickname?.trim());
		// A nickname is what people chose to be called: it stays as it is.
		for (const m of group) if (m.nickname?.trim()) out.set(m.id, m.nickname.trim());
		if (group.length === 1) {
			for (const m of plain) out.set(m.id, base(m));
			continue;
		}
		const surname = (m: (typeof members)[number]) => m.name.trim().split(/\s+/).slice(1).join(' ');
		for (const m of plain) {
			const last = surname(m);
			let label = last ? '' : m.name.trim();
			for (let n = 1; !label && n <= last.length; n++) {
				const prefix = last.slice(0, n).toLocaleLowerCase('cs');
				const clash = plain.some(
					(o) => o !== m && surname(o).slice(0, n).toLocaleLowerCase('cs') === prefix
				);
				if (!clash) label = `${firstName(m.name)} ${last.slice(0, n)}${n < last.length ? '.' : ''}`;
			}
			out.set(m.id, label || m.name.trim());
		}
	}
	return out;
}
