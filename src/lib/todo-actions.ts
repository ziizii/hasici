import { data } from './data.svelte';
import { formatShort } from './dates';
import { toasts } from './toast.svelte';
import type { Todo } from './todo';

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
	try {
		if (!await data.setTodoCompleted(todo.id, completed, nextId)) {
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
