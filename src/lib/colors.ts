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
