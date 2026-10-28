<script lang="ts">
	import { data, type Event } from '#lib/data.svelte.js';
	import type { DateKey } from '#lib/dates.js';

	type Draft = Omit<Event, 'id'>;

	let {
		date,
		initial,
		showDate = false,
		showNote = false,
		saveLabel = 'Uložit akci',
		onsave,
		oncancel
	}: {
		date: DateKey;
		initial?: Partial<Draft>;
		showDate?: boolean;
		showNote?: boolean;
		saveLabel?: string;
		onsave: (draft: Draft) => Promise<void> | void;
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

	const uid = Math.random().toString(36).slice(2, 8);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		busy = true;
		try {
			await onsave({ title, date: showDate ? day : date, time, place, note });
			if (!initial) {
				title = '';
				note = '';
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
