import type { Todo } from './todo';

/** "Kdo to udělal?" before completing a task whose pool takes turns. */
class WhoDid {
	todo = $state<Todo | null>(null);
	#resolve: ((memberId: string | null) => void) | null = null;

	/** The chosen member, or null when cancelled. */
	ask(todo: Todo): Promise<string | null> {
		this.#resolve?.(null);
		this.todo = todo;
		return new Promise((resolve) => (this.#resolve = resolve));
	}

	answer(memberId: string | null) {
		const resolve = this.#resolve;
		this.#resolve = null;
		this.todo = null;
		resolve?.(memberId);
	}
}

export const whoDid = new WhoDid();
