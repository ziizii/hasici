import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/lib/dates';
import {
	describe as describeRule, isEmpty, KIND_ANY, KIND_WEEKEND, KIND_WORKDAY, lastDay,
	matches, nextAfter, normalize, repeatDays, WEEKLY, type Repeat
} from '../../src/lib/repeat';

describe('calendar recurrence', () => {
	it('starts a legacy weekly repeat on its anchor weekday and clips both ends', () => {
		expect(repeatDays(undefined, '2027-03-24', '2027-04-14', '2027-03-01', '2027-04-20'))
			.toEqual(['2027-03-24', '2027-03-31', '2027-04-07', '2027-04-14']);
		expect(repeatDays(undefined, '2027-03-24', '2027-04-14', '2027-03-25', '2027-04-13', 1))
			.toEqual(['2027-03-31']);
	});

	it('skips century non-leap years even when the next or last occurrence is decades away', () => {
		const leapDay: Repeat = { freq: 'year', every: 16 };
		expect(nextAfter(leapDay, '2084-02-29', '2116-02-29', '2084-02-29')).toBe('2116-02-29');
		expect(nextAfter(leapDay, '2084-02-29', '2116-02-29', '2116-02-29')).toBeUndefined();
		expect(lastDay(leapDay, '2084-02-29', '2116-02-28')).toBe('2084-02-29');
		expect(lastDay(leapDay, '2084-02-29', '2084-02-28')).toBeUndefined();
	});

	it('starts in the active week and sorts and deduplicates selected dates', () => {
		const pattern: Repeat = { freq: 'week', every: 2, weekdays: [4, 0, 0] };
		expect(repeatDays(pattern, '2026-12-30', '2027-01-31', '2026-12-28', '2027-01-15'))
			.toEqual(['2027-01-01', '2027-01-11', '2027-01-15']);
		expect(repeatDays({ freq: 'month', every: 2, days: [31, 5, 5] },
			'2027-01-31', '2027-07-05', '2027-02-01', '2027-07-31'))
			.toEqual(['2027-03-05', '2027-03-31', '2027-05-05', '2027-05-31', '2027-07-05']);
	});

	it('uses the same dates for range expansion and single-day matching', () => {
		const start = '2027-01-29';
		const end = '2028-05-01';
		const rules: Repeat[] = [
			{ freq: 'day', every: 2 },
			WEEKLY,
			{ freq: 'week', every: 3, weekdays: [1, 4] },
			{ freq: 'month', every: 2 },
			{ freq: 'month', every: 1, days: [1, 30, 31] },
			{ freq: 'month', every: 1, nth: 5, kind: 4 },
			{ freq: 'month', every: 1, nth: -1, kind: KIND_ANY },
			{ freq: 'month', every: 2, nth: 1, kind: KIND_WEEKEND },
			{ freq: 'year', every: 1, months: [2, 7] },
			{ freq: 'year', every: 1, months: [2, 3], nth: -1, kind: KIND_WORKDAY }
		];
		for (const rule of rules) {
			const expected = [];
			for (let day = start; day <= end; day = addDays(day, 1)) {
				if (matches(rule, start, day)) expected.push(day);
			}
			expect(repeatDays(rule, start, end, start, end), describeRule(rule, start)).toEqual(expected);
		}
	});

	it('finds the last workday and skips missing fifth weekdays', () => {
		expect(repeatDays({ freq: 'month', every: 1, nth: -1, kind: KIND_WORKDAY },
			'2027-01-01', '2027-03-31', '2027-01-01', '2027-03-31'))
			.toEqual(['2027-01-29', '2027-02-26', '2027-03-31']);
		expect(repeatDays({ freq: 'month', every: 1, nth: 5, kind: 3 },
			'2027-01-01', '2027-05-31', '2027-01-01', '2027-05-31'))
			.toEqual(['2027-04-29']);
	});

	it('distinguishes empty selections from default fields and normalizes stored rules', () => {
		const anchor = '2027-01-29';
		const empty: Repeat = { freq: 'year', every: 1, months: [] };
		expect(isEmpty(empty)).toBe(true);
		expect(lastDay(empty, anchor, '2028-01-29')).toBeUndefined();
		expect(repeatDays(empty, anchor, '2028-01-29', anchor, '2028-01-29')).toEqual([]);
		expect(repeatDays(WEEKLY, anchor, '2028-01-29', anchor, '2028-01-29', 0)).toEqual([]);
		expect(normalize({ freq: 'week', every: 1, weekdays: [4, 4] }, anchor)).toBeUndefined();
		expect(normalize({ freq: 'month', every: 101, nth: -1, days: [1] }, anchor))
			.toEqual({ freq: 'month', every: 99, nth: -1, kind: KIND_ANY });
		expect(normalize({ freq: 'year', every: 0, months: [12, 2, 12] }, anchor))
			.toEqual({ freq: 'year', every: 1, months: [2, 12] });
	});
});
