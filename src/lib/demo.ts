// Dev-only sample data: `npm run dev`, then open http://localhost:5173/?demo
// Lets you work on the UI without a Firebase project. Writes do not persist.
// ?demo=30 generates a bigger unit to check how the layout copes.
import { PALETTE } from './colors.js';
import type { Absence, Event, Member, Series } from './data.svelte.js';
import { addDays, OPEN_END, todayKey } from './dates.js';

export function isDemo(url: URL): boolean {
	return import.meta.env.DEV && url.searchParams.has('demo');
}

export function demoData(count = 10): {
	members: Member[];
	absences: Absence[];
	events: Event[];
	series: Series[];
} {
	const names = [
		'Josef Beneš',
		'Jan Černý',
		'Petr Dvořák',
		'Karel Fiala',
		'Jiří Horák',
		'Eva Jelínková',
		'Lenka Králová',
		'Tomáš Novák',
		'Martin Svoboda',
		'Michal Veselý'
	];
	for (let i = names.length; i < count; i++) names.push(`Člen ${i + 1} Test`);
	const members = names
		.slice(0, Math.max(count, 1))
		.map((name, i) => ({ id: 'm' + i, name, color: PALETTE[i % PALETTE.length], archived: false }));
	const t = todayKey();
	const d = (n: number) => addDays(t, n);
	const absences: Absence[] = [
		{ id: 'a1', memberId: 'm8', from: d(0), to: d(3), note: 'Dovolená', weekdays: [], except: [] },
		{ id: 'a2', memberId: 'm5', from: d(2), to: d(4), note: 'Mimo obec', weekdays: [], except: [] },
		{ id: 'a3', memberId: 'm1', from: d(3), to: d(3), note: '', weekdays: [], except: [] },
		{ id: 'a4', memberId: 'm3', from: d(7), to: d(7), note: 'Práce / směna', weekdays: [], except: [] },
		{ id: 'a5', memberId: 'm7', from: d(10), to: d(11), note: 'Dovolená – hory', weekdays: [], except: [] },
		{ id: 'a6', memberId: 'm4', from: d(10), to: d(10), note: '', weekdays: [], except: [] },
		{ id: 'a7', memberId: 'm6', from: d(10), to: d(10), note: 'Práce', weekdays: [], except: [] },
		{ id: 'a8', memberId: 'm9', from: d(12), to: d(16), note: 'Služební cesta', weekdays: [], except: [] },
		{ id: 'a9', memberId: 'm2', from: d(0), to: OPEN_END, note: 'Práce', weekdays: [1], except: [] }
	];
	const events: Event[] = [
		{
			id: 'e1',
			title: 'Taktické cvičení – dálková doprava vody',
			date: d(10),
			time: '09:00',
			place: 'Hasičská zbrojnice',
			note: ''
		},
		{ id: 'e2', title: 'Kondiční jízdy', date: d(14), time: '18:00', place: 'Hasičská zbrojnice', note: '' },
		{ id: 'e3', title: 'Školení dýchací techniky', date: d(22), time: '18:30', place: 'Klubovna', note: '' }
	];
	const series: Series[] = [
		{
			id: 's1',
			title: 'Údržba techniky',
			time: '16:00',
			place: 'Hasičská zbrojnice',
			note: '',
			from: d(2),
			to: OPEN_END,
			except: []
		}
	];
	return { members, absences, events, series };
}
