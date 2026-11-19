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
}

export interface Todo extends TodoFields {
	id: string;
	completed: boolean;
	completedOn?: DateKey | null;
	nextId?: string | null;
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

export function nextTodoFields(todo: Todo, completedOn: DateKey): TodoFields | undefined {
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
	return { title: todo.title, date, eventId: null, dueDate, assigneeId: todo.assigneeId, recurrence };
}

export function describeTodoRepeat(recurrence: TodoRecurrence): string {
	if (recurrence.mode === 'calendar') return describe(recurrence.rule, recurrence.from);
	const { freq, every } = recurrence;
	return `Za ${every} ${unit(freq, every)} po dokončení`;
}
