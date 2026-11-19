import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	addDays, daysBetween, formatDayMonth, formatLong, formatRange, formatShort, holiday, isoWeek,
	isWeekend, OPEN_END, pluralDays, rangeLength, startOfWeek, todayKey
} from '../../src/lib/dates';

afterEach(() => vi.useRealTimers());

describe('calendar dates', () => {
	it('uses Prague midnight for today and omits the year only for dates in that year', () => {
		vi.useFakeTimers({ now: new Date('2026-12-31T23:30:00Z') });
		expect(todayKey()).toBe('2027-01-01');
		expect(formatShort('2027-01-01')).toBe('Pá 1. 1.');
		expect(formatShort('2026-12-31')).toBe('Čt 31. 12. 2026');
		expect(formatLong('2027-01-01')).toBe('pátek 1. 1. 2027');
		expect(formatDayMonth('2027-01-01')).toBe('1. 1.');
		expect(formatRange('2027-01-01', OPEN_END)).toBe('od Pá 1. 1.');
		expect(formatRange('2027-01-01', '2027-01-01')).toBe('Pá 1. 1.');
		expect(formatRange('2027-01-01', '2027-01-02')).toBe('Pá 1. 1. – So 2. 1.');
	});

	it('counts whole days across the spring clock change and keeps Monday-based ISO weeks', () => {
		expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
		expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2);
		expect(rangeLength('2027-03-27', '2027-03-29')).toBe(3);
		expect(isWeekend('2027-03-27')).toBe(true);
		expect(isWeekend('2027-03-29')).toBe(false);
		expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
		expect(isoWeek('2027-01-01')).toBe(53);
		expect(isoWeek('2027-01-04')).toBe(1);
		expect([1, 3, 5].map(pluralDays)).toEqual(['1 den', '3 dny', '5 dní']);
	});

	it('resolves both fixed and movable Czech holidays', () => {
		expect(holiday('2027-03-26')).toBe('Velký pátek');
		expect(holiday('2027-03-29')).toBe('Velikonoční pondělí');
		expect(holiday('2027-12-24')).toBe('Štědrý den');
		expect(holiday('2027-03-27')).toBeUndefined();
	});
});
