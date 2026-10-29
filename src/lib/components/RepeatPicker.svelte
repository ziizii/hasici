<script lang="ts">
	import { DOW_ABBR, formatShort, OPEN_END, parseKey, weekdayIndex, type DateKey } from '#lib/dates.js';
	import {
		describe,
		isEmpty,
		KIND_NAMES,
		MONTHS_ABBR,
		NTH_NAMES,
		normalize,
		quickRepeats,
		repeatDays,
		unit,
		type Freq,
		type Repeat
	} from '#lib/repeat.js';

	/**
	 * `value`: the chosen rule, null = no repeat. `until`: '' = until cancelled.
	 * `initial`: the rule to start from when editing (null = no repeat).
	 */
	let {
		date,
		value = $bindable(null),
		until = $bindable(''),
		initial = null
	}: {
		date: DateKey;
		value?: Repeat | null;
		until?: string;
		initial?: Repeat | null;
	} = $props();

	const quick = $derived(quickRepeats(date));

	// svelte-ignore state_referenced_locally
	const start = { date, initial, quick };
	const same = (a: Repeat, b: Repeat) =>
		JSON.stringify(normalize(a, start.date) ?? null) === JSON.stringify(normalize(b, start.date) ?? null);
	const quickIndex = start.initial ? start.quick.findIndex((q) => same(q, start.initial!)) : -1;

	let choice = $state<'none' | 'custom' | number>(
		!start.initial ? 'none' : quickIndex >= 0 ? quickIndex : 'custom'
	);

	// The custom rule, starting from the event's day like Apple's editor (or the rule being edited).
	const d0 = parseKey(start.date);
	const r0: Partial<Repeat> = start.initial ?? {};
	let freq = $state<Freq>(r0.freq ?? 'week');
	let every = $state(r0.every ?? 1);
	let weekdays = $state(r0.weekdays ?? [weekdayIndex(start.date)]);
	let monthNth = $state(r0.freq === 'month' && !!r0.nth);
	let days = $state(r0.days ?? [d0.getDate()]);
	let nth = $state(r0.nth ?? Math.ceil(d0.getDate() / 7));
	let kind = $state(r0.kind ?? weekdayIndex(start.date));
	let months = $state(r0.months ?? [d0.getMonth() + 1]);
	let yearNth = $state(r0.freq === 'year' && !!r0.nth);

	const custom = $derived.by((): Repeat => {
		const n = Math.max(1, Math.min(99, Math.round(every) || 1));
		switch (freq) {
			case 'day':
				return { freq, every: n };
			case 'week':
				return { freq, every: n, weekdays };
			case 'month':
				return monthNth ? { freq, every: n, nth, kind } : { freq, every: n, days };
			case 'year':
				return yearNth ? { freq, every: n, months, nth, kind } : { freq, every: n, months };
		}
	});

	$effect(() => {
		value = choice === 'none' ? null : choice === 'custom' ? custom : quick[choice];
	});

	const empty = $derived(!!value && isEmpty(value));
	const preview = $derived(
		value && !empty ? repeatDays(value, date, until || OPEN_END, date, until || OPEN_END, 4) : []
	);

	const toggle = (list: number[], x: number) =>
		list.includes(x) ? list.filter((y) => y !== x) : [...list, x];

	const FREQS: [Freq, string][] = [
		['day', 'Denně'],
		['week', 'Týdně'],
		['month', 'Měsíčně'],
		['year', 'Ročně']
	];
	/** "Čt 29. 10.", with the year when it isn't this event's year. */
	const dayText = (k: DateKey) => formatShort(k) + (k.slice(0, 4) === date.slice(0, 4) ? '' : ` ${k.slice(0, 4)}`);
	const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

	const cell = (on: boolean) =>
		`flex min-h-11 items-center justify-center rounded-lg border text-base font-semibold ${
			on ? 'border-accent bg-accent text-white' : 'border-field bg-surface text-ink'
		}`;
	const select = 'h-12 min-w-0 rounded-xl border border-field bg-surface px-2 text-base text-ink';
</script>

{#snippet nthPicker()}
	<div class="flex gap-2">
		<select bind:value={nth} aria-label="Kolikátý" class="{select} flex-1">
			{#each NTH_NAMES as [n, name] (n)}<option value={n}>{name}</option>{/each}
		</select>
		<select bind:value={kind} aria-label="Den" class="{select} flex-1">
			{#each KIND_NAMES as name, k (k)}<option value={k}>{name}</option>{/each}
		</select>
	</div>
{/snippet}

<fieldset class="flex flex-col gap-1">
	<legend class="mb-1 text-[0.9375rem] font-semibold text-ink-2">Opakování</legend>
	<label class="flex min-h-11 items-center gap-3 text-base">
		<input type="radio" bind:group={choice} value="none" class="size-6 shrink-0 accent-accent" />
		Neopakovat
	</label>
	{#each quick as r, i (i)}
		<label class="flex min-h-11 items-center gap-3 text-base">
			<input type="radio" bind:group={choice} value={i} class="size-6 shrink-0 accent-accent" />
			Opakovat {describe(r, date)}
		</label>
	{/each}
	<label class="flex min-h-11 items-center gap-3 text-base">
		<input type="radio" bind:group={choice} value="custom" class="size-6 shrink-0 accent-accent" />
		Vlastní
	</label>
</fieldset>

{#if choice === 'custom'}
	<div class="flex flex-col gap-3 rounded-2xl border border-line bg-ground p-3">
		<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
			Frekvence
			<select bind:value={freq} class={select}>
				{#each FREQS as [f, name] (f)}<option value={f}>{name}</option>{/each}
			</select>
		</label>
		<label class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base">
			Jednou za
			<span class="flex items-center gap-2.5 whitespace-nowrap">
				<input
					type="number"
					inputmode="numeric"
					min="1"
					max="99"
					bind:value={every}
					class="h-12 w-[4.5rem] rounded-xl border border-field bg-surface px-3 text-base"
				/>
				{unit(freq, Math.round(every) || 1)}
			</span>
		</label>

		{#if freq === 'week'}
			<div class="grid grid-cols-7 gap-1" role="group" aria-label="Dny v týdnu">
				{#each DOW_ABBR as name, w (w)}
					<button
						type="button"
						aria-pressed={weekdays.includes(w)}
						class={cell(weekdays.includes(w))}
						onclick={() => (weekdays = toggle(weekdays, w))}>{name}</button
					>
				{/each}
			</div>
		{:else if freq === 'month'}
			<div class="flex flex-col">
				<label class="flex min-h-11 items-center gap-3 text-base">
					<input type="radio" bind:group={monthNth} value={false} class="size-6 shrink-0 accent-accent" />
					Ve dny v měsíci
				</label>
				<label class="flex min-h-11 items-center gap-3 text-base">
					<input type="radio" bind:group={monthNth} value={true} class="size-6 shrink-0 accent-accent" />
					V určitý den v týdnu
				</label>
			</div>
			{#if monthNth}
				{@render nthPicker()}
			{:else}
				<div class="grid grid-cols-7 gap-1" role="group" aria-label="Dny v měsíci">
					{#each { length: 31 }, i (i)}
						<button
							type="button"
							aria-pressed={days.includes(i + 1)}
							class={cell(days.includes(i + 1))}
							onclick={() => (days = toggle(days, i + 1))}>{i + 1}</button
						>
					{/each}
				</div>
			{/if}
		{:else if freq === 'year'}
			<div class="grid grid-cols-4 gap-1" role="group" aria-label="Měsíce">
				{#each MONTHS_ABBR as name, i (i)}
					<button
						type="button"
						aria-pressed={months.includes(i + 1)}
						class={cell(months.includes(i + 1))}
						onclick={() => (months = toggle(months, i + 1))}>{name}</button
					>
				{/each}
			</div>
			<label class="flex min-h-11 items-center gap-3 text-base">
				<input type="checkbox" bind:checked={yearNth} class="size-6 shrink-0 accent-accent" />
				V určitý den v týdnu
			</label>
			{#if yearNth}{@render nthPicker()}{/if}
		{/if}
	</div>
{/if}

{#if value}
	<p class="text-[0.9375rem] leading-snug text-ink-2" aria-live="polite">
		{#if empty}
			<span class="font-semibold text-accent-dark">Vyberte aspoň jeden den.</span>
		{:else}
			{cap(describe(value, date))}{#if choice === 'custom' && freq === 'month' && !monthNth && days.some((x) => x > 28)}{' '}(měsíce bez toho dne se přeskočí){/if}.
			{#if preview.length}
				<br /><span class="text-muted">Nejbližší: {preview.map(dayText).join(', ')}{preview.length === 4 ? ' …' : ''}</span>
			{:else}
				<br /><span class="font-semibold text-accent-dark">Do zvoleného konce už nevychází žádný den.</span>
			{/if}
		{/if}
	</p>
	<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
		<span>Opakovat do <span class="font-normal text-faint">(prázdné = do odvolání)</span></span>
		<input
			type="date"
			bind:value={until}
			min={date}
			class="h-12 rounded-xl border border-field bg-surface px-3 text-base text-ink"
		/>
	</label>
{/if}
