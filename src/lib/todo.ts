import { addDays, daysBetween, OPEN_END, parseKey, toKey, type DateKey } from './dates';
import { describe, repeatDays, unit, type Freq, type Repeat } from './repeat';

export type TodoRecurrence =
	| { mode: 'calendar'; from: DateKey; until: DateKey; rule: Repeat }
	| { mode: 'completion'; freq: Freq; every: number };

export interface TodoFields {
	title: string;
	date: DateKey | null;
	eventId: string | null;
	dueDate: DateKey | null;
	assigneeId: string | null;
	recurrence?: TodoRecurrence | null;
	/** People who take turns on a repeating task (instead of one assignee). */
	rotation?: TodoRotation | null;
}

/**
 * A pool of people who take turns. `owed` = how many times each still has to do it
 * in this round (missing = 1). Doing it lowers your count, also below zero when you
 * stand in for someone. When the counts add up to zero, everyone gets one more:
 * whoever did it twice skips the next round, whoever skipped it is in twice.
 */
export interface TodoRotation {
	members: string[];
	owed: Record<string, number>;
}

export interface Todo extends TodoFields {
	id: string;
	completed: boolean;
	completedOn?: DateKey | null;
	nextId?: string | null;
	/** Who did a completed task that has a rotation. */
	doneBy?: string | null;
}

/** The current round for the pool's active members: counts refilled when they add up to zero. */
export function rotationOwed(rotation: TodoRotation, active: readonly string[]): Record<string, number> {
	const ids = rotation.members.filter((id, i) => active.includes(id) && rotation.members.indexOf(id) === i);
	const owed = Object.fromEntries(ids.map((id) => [id, rotation.owed[id] ?? 1]));
	if (!ids.length) return owed;
	const total = ids.reduce((sum, id) => sum + owed[id], 0);
	const refills = total > 0 ? 0 : Math.floor(-total / ids.length) + 1;
	for (const id of ids) owed[id] += refills;
	return owed;
}

/** Who is still due in this round and how many times, most first. */
export function rotationTurns(rotation: TodoRotation, active: readonly string[]): { id: string; times: number }[] {
	const owed = rotationOwed(rotation, active);
	return rotation.members
		.filter((id) => owed[id] > 0)
		.map((id) => ({ id, times: owed[id] }))
		.filter((turn, i, all) => all.findIndex((other) => other.id === turn.id) === i)
		.sort((a, b) => b.times - a.times);
}

/** The pool after `doneBy` did the task. Someone outside the pool changes nothing. */
export function rotationAfter(rotation: TodoRotation, doneBy: string | null | undefined, active: readonly string[]): TodoRotation {
	const owed = rotationOwed(rotation, active);
	if (doneBy && doneBy in owed) {
		owed[doneBy] -= 1;
		Object.assign(owed, rotationOwed({ members: Object.keys(owed), owed }, Object.keys(owed)));
	}
	return { members: rotation.members, owed };
}

/** A pool with different people: those who stay keep their counts, new ones are due once. */
export function editRotation(rotation: TodoRotation | null | undefined, members: string[]): TodoRotation {
	const owed: Record<string, number> = {};
	for (const id of members) if (rotation && id in rotation.owed) owed[id] = rotation.owed[id];
	return { members, owed };
}

export function firstTodoDate(rule: Repeat, from: DateKey, until: DateKey, start: DateKey): DateKey | undefined {
	return repeatDays(rule, from, until, start, until, 1)[0];
}

function afterInterval(day: DateKey, freq: Freq, every: number): DateKey {
	if (freq === 'day' || freq === 'week') return addDays(day, every * (freq === 'week' ? 7 : 1));

	// If the target month is shorter, use its last day (e.g. February 29 + 2 years).
	const date = parseKey(day);
	const month = date.getMonth() + every * (freq === 'year' ? 12 : 1);
	const last = new Date(date.getFullYear(), month + 1, 0);
	last.setDate(Math.min(date.getDate(), last.getDate()));
	return toKey(last);
}

export function nextTodoFields(
	todo: Todo,
	completedOn: DateKey,
	doneBy?: string | null,
	active: readonly string[] = []
): TodoFields | undefined {
	const recurrence = todo.recurrence;
	if (!recurrence) return;

	let dueDate: DateKey | undefined;
	if (recurrence.mode === 'completion') {
		dueDate = afterInterval(completedOn, recurrence.freq, recurrence.every);
	} else {
		const past = todo.dueDate && todo.dueDate > completedOn ? todo.dueDate : completedOn;
		if (past >= recurrence.until) return;
		dueDate = firstTodoDate(recurrence.rule, recurrence.from, recurrence.until, addDays(past, 1));
	}
	if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;

	let date = null;
	if (todo.date) {
		const offset = todo.dueDate ? daysBetween(todo.dueDate, todo.date) : 0;
		date = offset <= daysBetween(dueDate, OPEN_END) ? addDays(dueDate, offset) : dueDate;
	}
	const fields: TodoFields = { title: todo.title, date, eventId: null, dueDate, assigneeId: todo.assigneeId, recurrence };
	if (todo.rotation) fields.rotation = rotationAfter(todo.rotation, doneBy, active);
	return fields;
}

export function describeTodoRepeat(recurrence: TodoRecurrence): string {
	if (recurrence.mode === 'calendar') return describe(recurrence.rule, recurrence.from);
	const { freq, every } = recurrence;
	return `Za ${every} ${unit(freq, every)} po dokončení`;
}
