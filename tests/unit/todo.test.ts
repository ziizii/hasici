import { describe, expect, it } from 'vitest';
import { describeTodoRepeat, firstTodoDate, nextTodoFields, type Todo, type TodoRecurrence } from '../../src/lib/todo';

const task: Todo = {
	id: 'test', title: 'Výměna oleje', completed: false,
	date: null, dueDate: null, eventId: null, assigneeId: null
};

const calendar: TodoRecurrence = {
	mode: 'calendar', from: '2027-01-01', until: '2027-01-15', rule: { freq: 'day', every: 2 }
};

describe('task recurrence', () => {
	it('skips overdue slots without shifting the calendar anchor', () => {
		expect(firstTodoDate(calendar.rule, calendar.from, calendar.until, '2027-01-04')).toBe('2027-01-05');
		expect(nextTodoFields({ ...task, recurrence: calendar, dueDate: '2027-01-03' }, '2027-01-10')?.dueDate)
			.toBe('2027-01-11');
		expect(nextTodoFields({ ...task, recurrence: calendar, dueDate: '2027-01-11' }, '2027-01-05')?.dueDate)
			.toBe('2027-01-13');
		expect(nextTodoFields({ ...task, recurrence: calendar, dueDate: '2027-01-13' }, '2027-01-14')?.dueDate)
			.toBe('2027-01-15');
		expect(nextTodoFields({ ...task, recurrence: calendar, dueDate: '2027-01-15' }, '2027-01-15'))
			.toBeUndefined();
		expect(nextTodoFields(task, '2027-01-15')).toBeUndefined();
	});

	it.each([
		['day', '2027-03-27', '2027-03-29'],
		['week', '2027-03-27', '2027-04-10'],
		['month', '2027-12-31', '2028-02-29'],
		['year', '2028-02-29', '2030-02-28']
	] as const)('computes a two-%s interval from completion day', (freq, completedOn, expected) => {
		const recurrence = { mode: 'completion', freq, every: 2 } as const;
		expect(nextTodoFields({ ...task, recurrence, dueDate: '2027-01-01' }, completedOn)?.dueDate).toBe(expected);
	});

	it('preserves assignment and the relative day while clearing the activity link on the successor', () => {
		const recurrence = { mode: 'completion', freq: 'week', every: 1 } as const;
		const assigned = {
			...task, recurrence, date: '2027-01-04', dueDate: '2027-01-06', eventId: 'training', assigneeId: 'member'
		};
		expect(nextTodoFields(assigned, '2027-01-09')).toEqual({
			title: task.title, recurrence, date: '2027-01-14', dueDate: '2027-01-16',
			eventId: null, assigneeId: 'member'
		});
		expect(nextTodoFields({ ...assigned, dueDate: null }, '2027-01-09')?.date).toBe('2027-01-16');
		expect(describeTodoRepeat(recurrence)).toBe('Za 1 týden po dokončení');
		expect(describeTodoRepeat(calendar)).toBe('každé 2 dny');
	});

	it('stops at the supported date boundary and keeps a successor whose assigned offset overflows', () => {
		const recurrence = { mode: 'completion', freq: 'day', every: 1 } as const;
		expect(nextTodoFields({ ...task, recurrence }, '9999-12-31')).toBeUndefined();
		expect(nextTodoFields({ ...task, recurrence, dueDate: '9999-12-25', date: '9999-12-28' }, '9999-12-30'))
			.toMatchObject({ date: '9999-12-31', dueDate: '9999-12-31' });
	});
});
