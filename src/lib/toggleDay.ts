import { data, type Member } from './data.svelte';
import { formatShort, type DateKey } from './dates';
import { toasts } from './toast.svelte';

/** Tapping a member in a day's bar flips their availability for that day (with undo). */
export async function toggleMemberDay(m: Member, day: DateKey) {
	const absence = data.absenceOn(m.id, day);
	const when = formatShort(day);
	const undoFailed = () => toasts.error();
	try {
		if (absence) {
			await data.markAvailable(m.id, day);
			toasts.show(`${m.name} může ${when}`, {
				actionLabel: 'Vrátit zpět',
				action: () => data.markAway(m.id, day, absence.note).catch(undoFailed)
			});
		} else {
			await data.markAway(m.id, day);
			toasts.show(`${m.name} nemůže ${when}`, {
				actionLabel: 'Vrátit zpět',
				action: () => data.markAvailable(m.id, day).catch(undoFailed)
			});
		}
	} catch (e) {
		console.error(e);
		toasts.error();
	}
}
