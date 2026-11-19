<script lang="ts">
	import { data } from '#lib/data.svelte.js';
	import { formatShort } from '#lib/dates.js';
	import { toggleTodo } from '#lib/todo-actions.js';
	import type { Todo } from '#lib/todo.js';
	import Icon from './Icon.svelte';

	let { title, heading = 'h2', href, empty, todos }: {
		title: string;
		heading?: 'h2' | 'h3';
		href: string;
		empty: string;
		todos: readonly Todo[];
	} = $props();

	const headingId = $props.id();
	let pending = $state<Record<string, boolean>>({});

	async function setCompleted(todo: Todo, checkbox: HTMLInputElement) {
		const completed = checkbox.checked;
		pending[todo.id] = completed;
		try {
			if (!await toggleTodo(todo, completed)) checkbox.checked = todo.completed;
		} finally {
			delete pending[todo.id];
		}
	}
</script>

<section aria-labelledby={headingId} class="rounded-2xl border border-line bg-surface px-4 pt-2 pb-3">
	<div class="flex flex-wrap items-center justify-between gap-x-3">
		<svelte:element this={heading} id={headingId} class="flex items-center gap-2 font-bold">
			<Icon name="list" size={18} class="text-muted" /> {title}
		</svelte:element>
		<a {href} class="inline-flex min-h-11 items-center text-sm font-semibold text-accent-dark">
			Spravovat úkoly
		</a>
	</div>
	{#if data.todosStatus === 'loading'}
		<p role="status" class="text-sm text-muted">Načítám úkoly…</p>
	{:else if data.todosStatus === 'error'}
		<p role="status" class="text-sm text-accent-dark">Úkoly se nepodařilo načíst.</p>
	{:else if !todos.length}
		<p class="text-sm text-muted">{empty}</p>
	{:else}
		<ul class="divide-y divide-line border-t border-line">
			{#each todos as todo (todo.id)}
				{@const completed = pending[todo.id] ?? todo.completed}
				{@const member = data.allMembers.find((member) => member.id === todo.assigneeId)}
				<li>
					<label class="flex min-h-12 items-center gap-3 py-2">
						<input type="checkbox" checked={completed} disabled={todo.id in pending}
							class="size-5 shrink-0 accent-accent-dark disabled:opacity-60"
							onchange={(event) => setCompleted(todo, event.currentTarget)} />
						<span class="min-w-0">
							<span class="block break-words font-semibold" class:line-through={completed} class:text-muted={completed}>{todo.title}</span>
							{#if todo.dueDate || todo.assigneeId}
								<span class="flex flex-wrap gap-x-3 text-sm text-muted">
									{#if todo.dueDate}<span>Termín {formatShort(todo.dueDate)}</span>{/if}
									{#if todo.assigneeId}<span>{member?.name ?? 'Bývalý člen'}</span>{/if}
								</span>
							{/if}
						</span>
					</label>
				</li>
			{/each}
		</ul>
	{/if}
</section>
