<script lang="ts">
	import { data, type Event } from '#lib/data.svelte.js';
	import { type DateKey } from '#lib/dates.js';
	import { isEmpty, type Repeat } from '#lib/repeat.js';
	import RepeatPicker from './RepeatPicker.svelte';

	type Draft = Omit<Event, 'id' | 'series'>;
	/**
	 * `repeat`: how it repeats, until `until` (none = until cancelled); when editing, null = stop
	 * repeating and undefined = leave the repeat as it is. `following`: apply to later events of the repeat too.
	 */
	export type SaveOptions = { repeat?: Repeat | null; until?: DateKey; following?: boolean };

	let {
		date,
		initial,
		showDate = false,
		showNote = false,
		saveLabel = 'Uložit akci',
		repeatable = false,
		inSeries = false,
		editRepeat,
		onsave,
		oncancel
	}: {
		date: DateKey;
		initial?: Partial<Draft>;
		showDate?: boolean;
		showNote?: boolean;
		saveLabel?: string;
		/** Offer repeating (new events). */
		repeatable?: boolean;
		/** The edited event is part of a repeat. */
		inSeries?: boolean;
		/** Editing: the current repeat (null = none), offered for change. */
		editRepeat?: { repeat: Repeat | null; until: DateKey };
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

	// svelte-ignore state_referenced_locally
	let repeat = $state<Repeat | null>(editRepeat?.repeat ?? null);
	// svelte-ignore state_referenced_locally
	let until = $state(editRepeat?.until ?? '');
	/** Bumped to reset the repeat picker after saving. */
	let saved = $state(0);
	// Just this date by default: moving one meeting must not move all later ones.
	let following = $state(false);

	/** The repeat can be set: new events, a one-off being edited, or "this and all later". */
	const showRepeat = $derived(repeatable || (!!editRepeat && (!inSeries || following)));

	const uid = Math.random().toString(36).slice(2, 8);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim() || (showRepeat && repeat && isEmpty(repeat))) return;
		busy = true;
		try {
			await onsave(
				{ title, date: showDate ? day : date, time, place, note },
				{
					repeat: !showRepeat ? undefined : repeatable ? repeat || undefined : repeat,
					until: showRepeat && repeat && until ? until : undefined,
					following: inSeries && following
				}
			);
			if (!initial) {
				title = '';
				note = '';
				repeat = null;
				until = '';
				saved++;
			}
		} finally {
			busy = false;
		}
	}
</script>

<form class="flex flex-col gap-3" onsubmit={submit}>
	{#if inSeries}
		<fieldset class="flex flex-col">
			<legend class="mb-1 text-[0.9375rem] font-semibold text-ink-2">Co změnit</legend>
			<label class="flex min-h-11 items-center gap-3 text-base">
				<input type="radio" bind:group={following} value={false} class="size-6 shrink-0 accent-accent" />
				Jen tento termín
			</label>
			<label class="flex min-h-11 items-center gap-3 text-base">
				<input type="radio" bind:group={following} value={true} class="size-6 shrink-0 accent-accent" />
				Tento i všechny další
			</label>
		</fieldset>
	{/if}
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
	{#if showRepeat}
		{#key saved}
			<RepeatPicker
				date={showDate && day ? day : date}
				initial={editRepeat?.repeat ?? null}
				bind:value={repeat}
				bind:until
			/>
		{/key}
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
