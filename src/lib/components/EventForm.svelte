<script lang="ts">
	import { data, MAX_REPEATS, type Event } from '#lib/data.svelte.js';
	import { addDays, daysBetween, DOW_ON, formatShort, weekdayIndex, type DateKey } from '#lib/dates.js';

	type Draft = Omit<Event, 'id' | 'series'>;
	/** `until`: repeat weekly up to this day. `following`: apply to later events of the repeat too. */
	export type SaveOptions = { until?: DateKey; following?: boolean };

	let {
		date,
		initial,
		showDate = false,
		showNote = false,
		saveLabel = 'Uložit akci',
		repeatable = false,
		inSeries = false,
		onsave,
		oncancel
	}: {
		date: DateKey;
		initial?: Partial<Draft>;
		showDate?: boolean;
		showNote?: boolean;
		saveLabel?: string;
		/** Offer "repeat every week" (new events). */
		repeatable?: boolean;
		/** The edited event is part of a weekly repeat. */
		inSeries?: boolean;
		onsave: (draft: Draft, opts: SaveOptions) => Promise<void> | void;
		oncancel?: () => void;
	} = $props();

	// The form keeps its own copy; the parent re-mounts it (via {#key}) for a new day.
	// svelte-ignore state_referenced_locally
	let title = $state(initial?.title ?? '');
	// svelte-ignore state_referenced_locally
	let day = $state(initial?.date ?? date);
	// svelte-ignore state_referenced_locally
	// New events default to 09:00; '––' clears the time.
	let hour = $state(initial ? (initial.time?.slice(0, 2) ?? '') : '09');
	// svelte-ignore state_referenced_locally
	let minute = $state(initial?.time?.slice(3, 5) ?? '00');
	const time = $derived(hour ? `${hour}:${minute}` : '');

	// Selects instead of <input type="time">, which may show AM/PM depending on the phone.
	const pad = (n: number) => String(n).padStart(2, '0');
	const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
	// svelte-ignore state_referenced_locally
	const MINUTES = [
		...new Set([...Array.from({ length: 12 }, (_, i) => pad(i * 5)), minute])
	].sort();
	// svelte-ignore state_referenced_locally
	let place = $state(initial?.place ?? data.places[0] ?? '');
	// svelte-ignore state_referenced_locally
	let note = $state(initial?.note ?? '');
	let busy = $state(false);

	let repeat = $state(false);
	// svelte-ignore state_referenced_locally
	let until = $state(addDays(date, 7 * 12));
	const lastDay = $derived(addDays(date, 7 * (MAX_REPEATS - 1)));
	const count = $derived(until >= date ? Math.min(Math.floor(daysBetween(date, until) / 7) + 1, MAX_REPEATS) : 0);
	let following = $state(true);

	const uid = Math.random().toString(36).slice(2, 8);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		busy = true;
		try {
			await onsave(
				{ title, date: showDate ? day : date, time, place, note },
				{ until: repeatable && repeat ? until : undefined, following: inSeries && following }
			);
			if (!initial) {
				title = '';
				note = '';
				repeat = false;
			}
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
	<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
		Název
		<input
			bind:value={title}
			required
			maxlength="120"
			placeholder="např. Kondiční jízdy"
			class="h-12 rounded-xl border-2 border-ink bg-surface px-3 text-base font-normal text-ink"
		/>
	</label>
	{#if showDate}
		<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
			Datum
			<input
				type="date"
				bind:value={day}
				required
				class="h-12 rounded-xl border border-field bg-surface px-3 text-base text-ink"
			/>
		</label>
	{/if}
	<div class="grid grid-cols-2 gap-2.5">
		<fieldset class="flex min-w-0 flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
			<legend class="mb-1.5">Sraz</legend>
			<div class="flex min-w-0 items-center gap-1">
				<select
					bind:value={hour}
					aria-label="Hodina"
					class="h-12 min-w-0 flex-1 rounded-xl border border-field bg-surface px-2 text-base text-ink"
				>
					<option value="">––</option>
					{#each HOURS as h (h)}<option value={h}>{h}</option>{/each}
				</select>
				<span aria-hidden="true" class="text-ink">:</span>
				<select
					bind:value={minute}
					aria-label="Minuta"
					disabled={!hour}
					class="h-12 min-w-0 flex-1 rounded-xl border border-field bg-surface px-2 text-base text-ink disabled:opacity-50"
				>
					{#each MINUTES as m (m)}<option value={m}>{m}</option>{/each}
				</select>
			</div>
		</fieldset>
		<label class="flex min-w-0 flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
			Místo
			<input
				bind:value={place}
				list="places-{uid}"
				maxlength="120"
				class="h-12 min-w-0 rounded-xl border border-field bg-surface px-3 text-base text-ink"
			/>
			<datalist id="places-{uid}">
				{#each data.places as p (p)}<option value={p}></option>{/each}
			</datalist>
		</label>
	</div>
	{#if showNote}
		<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
			Poznámka
			<textarea
				bind:value={note}
				maxlength="1000"
				rows="3"
				class="rounded-xl border border-field bg-surface px-3 py-2 text-base font-normal text-ink"
			></textarea>
		</label>
	{/if}
	{#if repeatable}
		<label class="flex min-h-11 items-center gap-3 text-base font-semibold">
			<input type="checkbox" bind:checked={repeat} class="size-6 shrink-0 accent-accent" />
			Opakovat každý týden {DOW_ON[weekdayIndex(date)]}
		</label>
		{#if repeat}
			<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
				Opakovat do
				<input
					type="date"
					bind:value={until}
					required
					min={date}
					max={lastDay}
					class="h-12 rounded-xl border border-field bg-surface px-3 text-base text-ink"
				/>
				<span class="text-sm font-normal text-muted">
					{count === 1 ? '1 akce' : count < 5 ? `${count} akce` : `${count} akcí`}, poslední
					{formatShort(addDays(date, 7 * Math.max(count - 1, 0)))}
				</span>
			</label>
		{/if}
	{/if}
	{#if inSeries}
		<label class="flex min-h-11 items-center gap-3 text-base font-semibold">
			<input type="checkbox" bind:checked={following} class="size-6 shrink-0 accent-accent" />
			Změnit i všechny další opakování
		</label>
	{/if}
	<div class="flex gap-2">
		{#if oncancel}
			<button
				type="button"
				class="min-h-[3.25rem] flex-1 rounded-xl border border-field font-bold"
				onclick={oncancel}>Zrušit</button
			>
		{/if}
		<button
			type="submit"
			disabled={busy}
			class="min-h-[3.25rem] flex-[2] rounded-xl bg-accent text-[1.0625rem] font-bold text-white disabled:opacity-60"
			>{busy ? 'Ukládám…' : saveLabel}</button
		>
	</div>
</form>
