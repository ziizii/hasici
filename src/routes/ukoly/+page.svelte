<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { data } from '#lib/data.svelte.js';
	import { formatShort, OPEN_END, todayKey } from '#lib/dates.js';
	import { isEmpty, normalize, WEEKLY, type Freq, type Repeat } from '#lib/repeat.js';
	import { describeTodoRepeat, firstTodoDate, type Todo, type TodoFields } from '#lib/todo.js';
	import { toggleTodo } from '#lib/todo-actions.js';
	import { toasts } from '#lib/toast.svelte.js';
	import Icon from '#lib/components/Icon.svelte';
	import RepeatPicker from '#lib/components/RepeatPicker.svelte';

	const eventId = $derived(page.url.searchParams.get('akce') || '');
	const requestedDate = $derived(page.url.searchParams.get('den') ?? '');
	const date = $derived(!eventId && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : '');
	const scopedEvent = $derived(eventId ? data.event(eventId) : undefined);
	const canCreateHere = $derived(!eventId || (scopedEvent && scopedEvent.date >= todayKey()));
	const statuses = [
		{ value: false, label: 'Otevřené' },
		{ value: true, label: 'Hotové' }
	];

	let completed = $state(false);
	let editing = $state<string | null>(null);
	let original = $state<Todo>();
	let busy = $state(false);
	let title = $state('');
	let titleInput = $state<HTMLInputElement>();
	let addButton = $state<HTMLButtonElement>();
	let taskHeading = $state<HTMLHeadingElement>();
	let formTrigger: HTMLElement | undefined;

	async function closeForm() {
		editing = null;
		await tick();
		const target = formTrigger?.isConnected ? formTrigger : addButton ?? taskHeading;
		target?.focus();
		formTrigger = undefined;
	}
	let target = $state<'none' | 'date' | 'event'>('none');
	let linkedDate = $state('');
	let linkedEvent = $state('');
	let originalEventId = $state('');
	let dueDate = $state('');
	let assignee = $state('');
	let repeatMode = $state<'none' | 'calendar' | 'completion'>('none');
	let calendarRule = $state<Repeat | null>(null);
	let repeatUntil = $state('');
	let interval = $state<number | undefined>(1);
	let intervalUnit = $state<Freq>('year');

	const calendarFrom = $derived(
		original?.recurrence?.mode === 'calendar' && dueDate === original.dueDate
			? original.recurrence.from
			: dueDate
	);
	const firstDueDate = $derived(
		repeatMode === 'calendar' && calendarRule && dueDate && !isEmpty(calendarRule)
			? firstTodoDate(calendarRule, calendarFrom, repeatUntil || OPEN_END, dueDate)
			: undefined
	);
	const validInterval = $derived(interval !== undefined && Number.isInteger(interval) && interval >= 1 && interval <= 99);

	const button = 'flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold disabled:opacity-50';
	const eventsLoaded = $derived(data.loaded.events && data.loaded.series);
	const eventOptions = $derived.by(() => {
		const selected = linkedEvent ? data.event(linkedEvent) : undefined;
		const today = todayKey();
		const events = data.events.filter((event) => event.date >= today);
		return selected && (selected.id === originalEventId || selected.date >= today) &&
			!events.some((event) => event.id === selected.id)
			? [selected, ...events]
			: events;
	});
	const scopedTodos = $derived(
		eventId ? data.todos.filter((todo) => todo.eventId === eventId) : date ? data.todosOn(date) : data.todos
	);
	const visible = $derived(
		scopedTodos
			.filter((todo) => todo.completed === completed)
			.sort((a, b) =>
				(a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
				a.title.localeCompare(b.title, 'cs'))
	);

	async function openForm(trigger: HTMLElement, todo?: Todo) {
		if (!todo && eventId && (!scopedEvent || scopedEvent.date < todayKey())) return;
		formTrigger = trigger;
		editing = todo?.id ?? '';
		original = todo;
		originalEventId = todo?.eventId ?? '';
		title = todo?.title ?? '';
		linkedDate = todo ? todo.date ?? '' : date;
		linkedEvent = todo ? todo.eventId ?? '' : eventId;
		target = linkedEvent ? 'event' : linkedDate ? 'date' : 'none';
		dueDate = todo?.dueDate ?? '';
		assignee = todo?.assigneeId ?? '';
		const recurrence = todo?.completed ? null : todo?.recurrence;
		repeatMode = recurrence?.mode ?? 'none';
		calendarRule = recurrence?.mode === 'calendar' ? recurrence.rule : null;
		repeatUntil = recurrence?.mode === 'calendar' && recurrence.until !== OPEN_END ? recurrence.until : '';
		interval = recurrence?.mode === 'completion' ? recurrence.every : 1;
		intervalUnit = recurrence?.mode === 'completion' ? recurrence.freq : 'year';
		await tick();
		titleInput?.focus();
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || editing === null || !title.trim() ||
			(target === 'date' && !linkedDate) || (target === 'event' && !linkedEvent)) return;
		if (target === 'event' && linkedEvent !== originalEventId) {
			const activity = data.event(linkedEvent);
			if (!activity || activity.date < todayKey()) {
				linkedEvent = '';
				toasts.error('Vyberte akci, která se koná dnes nebo později.');
				return;
			}
		}
		if ((repeatMode === 'calendar' && !firstDueDate) || (repeatMode === 'completion' && !validInterval)) return;
		const fields: TodoFields = {
			title: title.trim(),
			date: target === 'date' ? linkedDate : null,
			eventId: target === 'event' ? linkedEvent : null,
			dueDate: firstDueDate ?? (dueDate || null),
			assigneeId: assignee || null
		};
		if (repeatMode === 'calendar' && calendarRule) {
			fields.recurrence = {
				mode: 'calendar',
				from: calendarFrom,
				until: repeatUntil || OPEN_END,
				rule: normalize(calendarRule, calendarFrom) ?? WEEKLY
			};
		} else if (repeatMode === 'completion' && interval !== undefined) {
			fields.recurrence = { mode: 'completion', freq: intervalUnit, every: interval };
		} else if (original?.recurrence && !original.completed) {
			fields.recurrence = null;
		}
		busy = true;
		try {
			if (editing) await data.updateTodo(editing, fields, original?.completed ?? false);
			else {
				await data.addTodo(fields);
				completed = false;
			}
			busy = false;
			await closeForm();
		} catch {
			toasts.error('Úkol se nepodařilo uložit. Zkuste to znovu.');
		} finally {
			busy = false;
		}
	}

	async function removeTodo() {
		if (busy || !editing) return;
		const todo = data.todos.find((item) => item.id === editing);
		if (!todo) return;
		const consequence = todo.recurrence && !todo.completed ? ' Tím skončí i jeho opakování.' : '';
		if (!confirm(`Opravdu smazat úkol „${todo.title}“?${consequence}`)) return;
		busy = true;
		try {
			await data.deleteTodo(todo.id);
			busy = false;
			await closeForm();
			toasts.show('Úkol smazán');
		} catch {
			toasts.error('Úkol se nepodařilo smazat.');
		} finally {
			busy = false;
		}
	}

	async function toggle(todo: Todo, trigger: HTMLElement) {
		if (busy) return;
		busy = true;
		try {
			await toggleTodo(todo, !todo.completed);
		} finally {
			busy = false;
			await tick();
			if (document.activeElement === document.body) {
				if (trigger.isConnected) trigger.focus();
				else taskHeading?.focus();
			}
		}
	}
</script>

<svelte:head>
	<title>{scopedEvent ? `Úkoly – ${scopedEvent.title}` : 'Úkoly'} | Dostupnost jednotky</title>
</svelte:head>

<section class="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-6 md:py-8">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 tabindex="-1" bind:this={taskHeading} class="text-[1.875rem] font-bold tracking-tight">Úkoly</h1>
			{#if eventId || date}
				<p class="break-words text-muted">{eventId ? scopedEvent?.title ?? 'Úkoly k akci' : formatShort(date)}</p>
				<a href="/ukoly" class="inline-flex min-h-11 items-center font-semibold text-accent-dark">Všechny úkoly</a>
			{/if}
		</div>
		{#if editing === null && canCreateHere}
			<button type="button" class="{button} bg-accent text-white"
				disabled={busy || data.todosStatus !== 'ready'} bind:this={addButton} onclick={(event) => openForm(event.currentTarget)}>
				<Icon name="plus" size={19} /> Nový úkol
			</button>
		{/if}
	</header>

	{#if scopedEvent && !canCreateHere}
		<p class="text-sm text-muted">Nové úkoly lze přiřadit k akcím ode dneška.</p>
	{/if}

	{#if editing !== null}
		<form onsubmit={save} aria-labelledby="todo-form-heading"
			class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
			<h2 id="todo-form-heading" class="text-lg font-bold">{editing ? 'Upravit úkol' : 'Nový úkol'}</h2>
			<fieldset disabled={busy} class="grid min-w-0 items-start gap-4 sm:grid-cols-2">
				<label class="todo-label sm:col-span-2">
					Název
					<input class="todo-field" bind:this={titleInput} bind:value={title} required maxlength="120" />
				</label>
				<label class="todo-label {target === 'none' ? 'sm:col-span-2' : ''}">
					Přiřadit k
					<select class="todo-field" bind:value={target}>
						<option value="none">Bez přiřazení</option>
						<option value="date">Dni</option>
						<option value="event">Akci</option>
					</select>
				</label>
				{#if target === 'date'}
					<label class="todo-label">
						Den
						<input type="date" class="todo-field" bind:value={linkedDate} required />
					</label>
				{:else if target === 'event'}
					<label class="todo-label">
						Akce
						<select class="todo-field" bind:value={linkedEvent} required>
							<option value="">{eventsLoaded ? 'Vyberte akci' : 'Načítám akce…'}</option>
							{#each eventOptions as event (event.id)}
								<option value={event.id}>{formatShort(event.date)} {event.time} · {event.title}</option>
							{/each}
							{#if linkedEvent && linkedEvent === originalEventId && !data.event(linkedEvent)}
								<option value={linkedEvent}>{eventsLoaded ? 'Nedostupná akce' : 'Načítám akci…'}</option>
							{/if}
						</select>
					</label>
				{/if}
				<label class="todo-label">
					Termín dokončení
					<input type="date" class="todo-field" bind:value={dueDate} required={repeatMode === 'calendar'}
						readonly={original?.completed && original.recurrence?.mode === 'calendar'} />
				</label>
				<label class="todo-label">
					Řešitel
					<select class="todo-field" bind:value={assignee}>
						<option value="">Nepřiřazeno</option>
						{#each data.members as member (member.id)}
							<option value={member.id}>{member.name}</option>
						{/each}
						{#if assignee && !data.member(assignee)}
							<option value={assignee}>{data.allMembers.find((member) => member.id === assignee)?.name ?? 'Bývalý člen'}</option>
						{/if}
					</select>
				</label>
				{#if !original?.completed}
					<label class="todo-label sm:col-span-2">
						Opakování úkolu
						<select class="todo-field" bind:value={repeatMode}>
							<option value="none">Neopakovat</option>
							<option value="calendar">Podle kalendáře</option>
							<option value="completion">Po dokončení</option>
						</select>
					</label>
					{#if repeatMode === 'calendar'}
						{#if dueDate}
							<div class="flex min-w-0 flex-col gap-3 sm:col-span-2">
								<RepeatPicker date={calendarFrom} initial={calendarRule} bind:value={calendarRule}
									bind:until={repeatUntil} allowNone={false} previewFrom={dueDate} previewLimit={1} />
							</div>
						{:else}
							<p class="text-sm text-muted sm:col-span-2">Vyplňte termín, od kterého se má úkol opakovat.</p>
						{/if}
					{:else if repeatMode === 'completion'}
						<label class="todo-label">
							Za jak dlouho po dokončení
							<input type="number" class="todo-field" bind:value={interval} inputmode="numeric"
								min="1" max="99" required />
						</label>
						<label class="todo-label">
							Jednotka
							<select class="todo-field" bind:value={intervalUnit}>
								<option value="day">Dny</option>
								<option value="week">Týdny</option>
								<option value="month">Měsíce</option>
								<option value="year">Roky</option>
							</select>
						</label>
					{/if}
				{/if}
			</fieldset>
			<div class="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
				{#if editing}
					<button type="button" class="{button} mr-auto text-accent-dark"
						disabled={busy} onclick={removeTodo}>
						<Icon name="trash" size={18} /> Smazat úkol
					</button>
				{/if}
				<button type="button" class="{button} border border-field text-ink" disabled={busy} onclick={closeForm}>Zrušit</button>
				<button type="submit" class="{button} bg-accent text-white"
					disabled={busy || !title.trim() || (repeatMode === 'calendar' && !firstDueDate) ||
						(repeatMode === 'completion' && !validInterval)}>Uložit úkol</button>
			</div>
		</form>
	{/if}

	<div role="group" aria-label="Stav úkolů" class="flex max-w-full flex-wrap gap-1 self-start rounded-xl border border-line bg-surface p-1">
		{#each statuses as status (status.label)}
			<button type="button" class="{button} {completed === status.value ? 'bg-ink text-white' : 'text-muted'}"
				aria-pressed={completed === status.value} onclick={() => (completed = status.value)}>
				{status.label}
			</button>
		{/each}
	</div>

	{#if data.todosStatus === 'error'}
		<p role="status" class="text-accent-dark">Úkoly se nepodařilo načíst. Zkouším to znovu…</p>
	{:else if data.todosStatus === 'loading'}
		<p role="status" class="text-muted">Načítám úkoly…</p>
	{:else if !visible.length}
		<p class="rounded-2xl border border-line bg-surface p-4 text-muted">
			{completed ? 'Žádné hotové úkoly.' : 'Žádné otevřené úkoly.'}
		</p>
	{:else}
		<ul class="grid gap-2" aria-label="Seznam úkolů">
			{#each visible as todo (todo.id)}
				{@const event = todo.eventId ? data.event(todo.eventId) : undefined}
				{@const member = data.allMembers.find((member) => member.id === todo.assigneeId)}
				<li class="flex items-start gap-2 rounded-2xl border border-line bg-surface p-2 sm:gap-3">
					<button type="button" class="grid size-11 shrink-0 place-items-center rounded-xl"
						aria-label={todo.completed ? `Znovu otevřít: ${todo.title}` : `Dokončit: ${todo.title}`}
						disabled={busy || editing === todo.id} onclick={(event) => toggle(todo, event.currentTarget)}>
						<span class="grid size-6 place-items-center rounded-md border-2 {todo.completed ? 'border-ink bg-ink text-white' : 'border-muted'}">
							{#if todo.completed}<Icon name="check" size={16} />{/if}
						</span>
					</button>
					<div class="min-w-0 flex-1 py-2">
						<p class="break-words font-bold {todo.completed ? 'text-muted line-through' : ''}">{todo.title}</p>
						<div class="flex flex-wrap gap-x-4 gap-y-1 break-words text-sm text-muted">
							{#if event}
								<a class="text-accent-dark underline" href="/akce/{encodeURIComponent(event.id)}">{event.title} · {formatShort(event.date)}</a>
							{:else if todo.eventId && eventsLoaded}
								<span>Nedostupná akce</span>
							{:else if todo.date}
								<span>Den {formatShort(todo.date)}</span>
							{/if}
							{#if todo.dueDate}
								<span class={!todo.completed && todo.dueDate < todayKey() ? 'font-bold text-accent-dark' : ''}>
									Termín {formatShort(todo.dueDate)}
								</span>
							{/if}
							{#if todo.assigneeId}<span>{member?.name ?? 'Bývalý člen'}</span>{/if}
							{#if todo.completedOn}<span>Hotovo {formatShort(todo.completedOn)}</span>{/if}
							{#if !todo.completed && todo.recurrence}<span>{describeTodoRepeat(todo.recurrence)}</span>{/if}
						</div>
					</div>
					<button type="button" class="grid size-11 shrink-0 place-items-center rounded-xl text-muted"
						aria-label={`Upravit: ${todo.title}`} disabled={busy || editing !== null} onclick={(event) => openForm(event.currentTarget, todo)}>
						<Icon name="pencil" size={18} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.todo-label {
		display: grid;
		min-width: 0;
		gap: 0.375rem;
		color: var(--color-ink-2);
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.todo-field {
		appearance: none;
		width: 100%;
		min-width: 0;
		height: 3.25rem;
		min-height: 3.25rem;
		border: 1px solid var(--color-field);
		border-radius: 0.75rem;
		background-color: var(--color-surface);
		padding: 0 0.75rem;
		color: var(--color-ink);
		font-size: 1rem;
		font-weight: 400;
	}

	.todo-field:focus-visible {
		border-color: var(--color-accent-dark);
		outline: 2px solid var(--color-accent-dark);
		outline-offset: 1px;
	}

	select.todo-field {
		padding-right: 2.5rem;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 8 5 5 5-5' stroke='%235a5650' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-position: right 0.75rem center;
		background-repeat: no-repeat;
		background-size: 1.125rem;
		text-overflow: ellipsis;
	}

	input[type='date'].todo-field::-webkit-date-and-time-value {
		text-align: left;
	}
</style>
