import { data } from './data.svelte';
import { formatShort } from './dates';
import { toasts } from './toast.svelte';
import { rotationTurns, type Todo, type TodoRotation } from './todo';
import { whoDid } from './who-did.svelte';

export async function toggleTodo(todo: Todo, completed: boolean): Promise<boolean> {
	const nextId = completed ? undefined : todo.nextId ?? undefined;
	if (nextId) {
		const next = data.todos.find((item) => item.id === nextId);
		if (!next || next.completed) {
			toasts.error('Další výskyt už byl dokončen nebo smazán.');
			return false;
		}
		const due = next.dueDate ? ` s termínem ${formatShort(next.dueDate)}` : '';
		if (!confirm(`Znovu otevřít úkol „${todo.title}“? Příští úkol${due} se smaže.`)) return false;
	}
	let doneBy: string | null = null;
	if (completed && todo.rotation) {
		doneBy = await whoDid.ask(todo);
		if (!doneBy) return false;
	}
	try {
		if (!await data.setTodoCompleted(todo.id, completed, nextId, doneBy)) {
			toasts.error('Úkol mezitím někdo změnil. Zkuste to znovu.');
			return false;
		}
		toasts.show(completed ? 'Úkol dokončen' : 'Úkol znovu otevřen');
		return true;
	} catch {
		toasts.error('Stav úkolu se nepodařilo změnit.');
		return false;
	}
}

/** "Na řadě: Jan 2×, Petr" for a pool that takes turns. */
export function turnsText(rotation: TodoRotation): string {
	const turns = rotationTurns(rotation, data.members.map((member) => member.id));
	if (!turns.length) return 'Nikdo ze střídání není v jednotce';
	return 'Na řadě: ' + turns
		.map(({ id, times }) => (data.labels.get(id) ?? '') + (times > 1 ? ` ${times}×` : ''))
		.join(', ');
}

/** Name of a member, also an archived one; '' when unknown. */
export function memberName(id: string | null | undefined): string {
	if (!id) return '';
	return data.allMembers.find((member) => member.id === id)?.name ?? 'Bývalý člen';
}
