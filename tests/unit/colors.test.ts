import { expect, it } from 'vitest';
import { contrastText, eventColor, EVENT_COLORS, initials, nextColor, PALETTE, shortNames } from '../../src/lib/colors';

it('picks readable text on dark, light, and shorthand custom colors', () => {
	expect(contrastText('#111111')).toBe('#fff');
	expect(contrastText('#feFEFE')).toBe('#000');
	expect(contrastText('#abc')).toBe('#000');
	expect(contrastText('unknown')).toBe('#000');
});

it('picks an unused member color first and cycles activity colors', () => {
	expect(nextColor([PALETTE[0].toLowerCase()])).toBe(PALETTE[1]);
	expect(eventColor(EVENT_COLORS.length + 1)).toBe(EVENT_COLORS[1]);
});

it('prefers nicknames and disambiguates members with the same first name', () => {
	expect(shortNames([
		{ id: 'a', name: 'Petr Novák' },
		{ id: 'b', name: 'Petr Dvořák' },
		{ id: 'c', name: 'Jana Pátá', nickname: 'Janča' }
	])).toEqual(new Map([['a', 'Petr N.'], ['b', 'Petr D.'], ['c', 'Janča']]));
	expect(initials('Petr Karel Novák')).toBe('PN');
	expect(initials('Petr')).toBe('PE');
	expect(initials('')).toBe('?');
});
