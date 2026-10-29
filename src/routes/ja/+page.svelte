<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import { initials } from '#lib/colors.js';
	import {
		covers,
		data,
		groupAbsences,
		isSwitch,
		occurrences,
		type Absence
	} from '#lib/data.svelte.js';
	import {
		addDays,
		formatLong,
		formatRange,
		formatShort,
		OPEN_END,
		pluralDays,
		rangeLength,
		todayKey,
		weekdayIndex
	} from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';
	import { describe, isEmpty, type Repeat } from '#lib/repeat.js';
	import Icon from '#lib/components/Icon.svelte';
	import RepeatPicker from '#lib/components/RepeatPicker.svelte';
	import UnavailableSwitch from '#lib/components/UnavailableSwitch.svelte';

	const today = todayKey();
	const me = $derived(data.member(access.memberId));

	const mine = $derived(
		data.absences
			.filter((a) => a.memberId === access.memberId)
			.sort((a, b) => a.from.localeCompare(b.from))
	);
	// The open-ended one is shown as the switch, not in the list.
	// Back-to-back days (e.g. tapped one by one on the timeline) show as one range.
	const upcoming = $derived(groupAbsences(mine.filter((a) => a.to >= today && !isSwitch(a))));
	const past = $derived(mine.filter((a) => a.to < today).reverse().slice(0, 10));

	let showForm = $state(false);
	let showPast = $state(false);

	// --- form ---
	type Quick = 'today' | 'tomorrow' | 'weekend' | 'custom';
	let quick = $state<Quick>('custom');
	let from = $state(today);
	let to = $state('');
	let note = $state('');
	/** Repeating on the rule's days from `from`; null = every day in the range. */
	let repeat = $state<Repeat | null>(null);
	let busy = $state(false);
	// "Do" ends a single absence; when it starts repeating, the same field is "Opakovat do".
	let wasRepeating = false;
	$effect(() => {
		if (!!repeat !== wasRepeating) to = '';
		wasRepeating = !!repeat;
	});
	const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());
	const reasons = ['Dovolená', 'Práce / směna', 'Mimo obec', 'Nemoc'];

	function pickQuick(q: Quick) {
		quick = q;
		if (q === 'today') [from, to] = [today, ''];
		if (q === 'tomorrow') [from, to] = [addDays(today, 1), ''];
		if (q === 'weekend') {
			const wd = weekdayIndex(today);
			const sat = wd === 6 ? addDays(today, -1) : addDays(today, 5 - wd);
			[from, to] = [wd === 6 ? today : sat, addDays(sat, 1)];
		}
	}

	// Repeating without an end date lasts until it is deleted.
	const end = $derived(to && to >= from ? to : repeat ? OPEN_END : from);
	const summary = $derived(
		repeat
			? `${describe(repeat, from)}, ${end === OPEN_END ? `od ${formatShort(from)} do odvolání` : formatRange(from, end)}`
			: end === from
				? formatLong(from)
				: `${formatLong(from)} až ${formatLong(end)} (${pluralDays(rangeLength(from, end))})`
	);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!access.memberId || !from || (repeat && isEmpty(repeat))) return;
		busy = true;
		try {
			await data.addAbsence(access.memberId, from, end, note, repeat ?? undefined);
			showForm = false;
			note = '';
			to = '';
			repeat = null;
			quick = 'custom';
			toasts.show('Nepřítomnost uložena');
		} catch (err) {
			console.error(err);
			toasts.error();
		} finally {
			busy = false;
		}
	}

	/** Deletes a row, i.e. every absence merged into it. */
	async function remove(parts: Absence[]) {
		try {
			await Promise.all(parts.map((a) => data.deleteAbsence(a.id)));
			toasts.show('Nepřítomnost smazána', {
				actionLabel: 'Vrátit zpět',
				action: () =>
					Promise.all(parts.map((a) => data.restoreAbsence(a))).catch(() => toasts.error())
			});
		} catch (err) {
			console.error(err);
			toasts.error();
		}
	}

	async function toggleException(a: Absence, day: string) {
		await data.setException(a, day, !a.except.includes(day)).catch(() => toasts.error());
	}

	function clashes(a: Absence) {
		return data.events.filter((e) => e.date >= today && covers(a, e.date)).slice(0, 3);
	}
</script>

<div class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-7 pb-8">
	<header class="flex flex-col gap-2">
		<h1 class="font-display text-[2rem] leading-none font-bold">Moje nepřítomnost</h1>
		{#if me}
			<div class="flex flex-wrap items-center gap-2 text-base">
				<span
					class="flex size-7 items-center justify-center rounded-[7px] text-xs font-bold text-white"
					style="background: {me.color}">{initials(me.name)}</span
				>
				<span class="font-semibold">{me.name}</span>
				<span class="text-faint" aria-hidden="true">·</span>
				<button type="button" class="min-h-11 font-semibold text-accent" onclick={() => access.setMember(null)}
					>Nejsem to já</button
				>
			</div>
		{/if}
	</header>

	{#if me}
		<div class="rounded-2xl border border-line bg-surface px-4 py-2">
			<UnavailableSwitch member={me} self />
		</div>
	{/if}

	{#if !showForm}
		<button
			type="button"
			class="flex min-h-14 items-center justify-center gap-2.5 rounded-[14px] bg-accent text-lg font-bold text-white"
			onclick={() => (showForm = true)}
		>
			<Icon name="plus" size={22} stroke={2.5} /> Naplánovat nepřítomnost
		</button>
	{:else}
		<form class="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4" onsubmit={save}>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-bold">Nahlásit nepřítomnost</h2>
				<button
					type="button"
					aria-label="Zavřít"
					class="-mr-2 flex size-11 items-center justify-center"
					onclick={() => (showForm = false)}><Icon name="x" size={22} /></button
				>
			</div>

			<fieldset class="flex flex-col gap-2.5">
				<legend class="mb-2.5 font-bold">Kdy?</legend>
				<div class="flex flex-wrap gap-2">
					{#each [['today', 'Dnes'], ['tomorrow', 'Zítra'], ['weekend', 'Víkend'], ['custom', 'Vybrat datum']] as [q, label] (q)}
						<button
							type="button"
							aria-pressed={quick === q}
							class="min-h-11 rounded-full px-4 font-semibold {quick === q
								? 'bg-ink text-white'
								: 'border border-field bg-surface'}"
							onclick={() => pickQuick(q as Quick)}>{label}</button
						>
					{/each}
				</div>
				<div class="grid grid-cols-2 gap-2.5">
					<label class="flex min-w-0 flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
						Od
						<input
							type="date"
							bind:value={from}
							required
							onchange={() => (quick = 'custom')}
							class="h-[3.25rem] min-w-0 rounded-xl border-2 border-ink bg-surface px-3 text-base text-ink"
						/>
					</label>
					{#if !repeat}
						<label class="flex min-w-0 flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
							<span>Do <span class="font-normal text-faint">(nepovinné)</span></span>
							<input
								type="date"
								bind:value={to}
								min={from}
								onchange={() => (quick = 'custom')}
								class="h-[3.25rem] min-w-0 rounded-xl border border-field bg-surface px-3 text-base text-ink"
							/>
						</label>
					{/if}
				</div>
			</fieldset>

			<div class="flex flex-col gap-3">
				<RepeatPicker date={from || today} bind:value={repeat} bind:until={to} />
			</div>

			<fieldset class="flex flex-col gap-2.5">
				<legend class="mb-2.5 font-bold">Důvod <span class="font-normal text-faint">(nepovinné)</span></legend>
				<div class="flex flex-wrap gap-2">
					{#each reasons as r (r)}
						<button
							type="button"
							aria-pressed={note === r}
							class="min-h-11 rounded-full px-4 font-semibold {note === r
								? 'bg-ink text-white'
								: 'border border-field bg-surface'}"
							onclick={() => (note = note === r ? '' : r)}>{r}</button
						>
					{/each}
				</div>
				<label>
					<span class="sr-only">Poznámka</span>
					<input
						bind:value={note}
						maxlength="200"
						placeholder="Poznámka, např. noční směna"
						class="h-[3.25rem] w-full rounded-xl border border-field bg-surface px-3 text-base"
					/>
				</label>
			</fieldset>

			<p class="flex gap-2.5 rounded-xl border border-line px-3.5 py-3 leading-snug">
				<Icon name="calendar" class="mt-0.5 text-muted" />
				<span>Nebudete k dispozici: <strong>{summary}</strong></span>
			</p>

			<button
				type="submit"
				disabled={busy}
				class="min-h-14 rounded-[14px] bg-accent text-lg font-bold text-white disabled:opacity-60"
				>{busy ? 'Ukládám…' : 'Uložit'}</button
			>
		</form>
	{/if}

	<h2 class="mt-1 text-[0.8125rem] font-bold tracking-[0.08em] text-muted uppercase">
		Nadcházející ({upcoming.length})
	</h2>

	{#if upcoming.length === 0}
		<p class="text-muted">Nemáte zapsanou žádnou nepřítomnost.</p>
	{/if}

	<ul class="flex flex-col gap-2.5">
		{#each upcoming as { absence: a, parts } (a.id)}
			{@const evs = clashes(a)}
			<li class="flex gap-2 rounded-[14px] border border-line bg-surface py-3.5 pr-2 pl-4">
				<div class="flex flex-1 flex-col gap-1">
					{#if a.repeat}
						<span class="text-lg font-bold">{cap(describe(a.repeat, a.from))}</span>
						<span class="text-[0.9375rem] text-muted"
							>{a.to === OPEN_END ? `od ${formatShort(a.from)} do odvolání` : formatRange(a.from, a.to)}</span
						>
					{:else}
						<span class="text-lg font-bold">{formatRange(a.from, a.to)}</span>
						<span class="text-[0.9375rem] text-muted">{pluralDays(rangeLength(a.from, a.to))}</span>
					{/if}
					{#if a.repeat}
						<span class="mt-1.5 text-[0.9375rem] text-ink-2">Výjimka? Klepněte na den, kdy můžete:</span>
						<span class="flex flex-wrap gap-1.5">
							{#each occurrences(a, today, 6) as day (day)}
								{@const free = a.except.includes(day)}
								<button
									type="button"
									aria-pressed={free}
									aria-label="{formatShort(day)}: {free ? 'můžu' : 'nemůžu'}"
									class="flex min-h-11 items-center gap-1 rounded-full px-3 text-[0.9375rem] font-semibold {free
										? 'bg-good-bg text-good'
										: 'border border-field bg-surface text-ink-2'}"
									onclick={() => toggleException(a, day)}
								>
									{#if free}<Icon name="check" size={16} stroke={2.6} />{/if}
									{formatShort(day)}
								</button>
							{/each}
						</span>
					{/if}
					{#if a.note}
						<span>{a.note}</span>
					{/if}
					{#each evs as ev (ev.id)}
						<a
							href="/akce/{ev.id}"
							class="mt-1.5 flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5 text-sm text-warn-ink"
						>
							<Icon name="calendar" size={16} /> Překrývá se s akcí {ev.title}
						</a>
					{/each}
				</div>
				<button
					type="button"
					aria-label="Smazat nepřítomnost {formatRange(a.from, a.to)}"
					class="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted"
					onclick={() => remove(parts)}
				>
					<Icon name="trash" size={22} />
				</button>
			</li>
		{/each}
	</ul>

	{#if past.length}
		<button
			type="button"
			class="flex min-h-12 items-center justify-between px-1 font-semibold text-muted"
			aria-expanded={showPast}
			onclick={() => (showPast = !showPast)}
		>
			Proběhlé nepřítomnosti
			<Icon name={showPast ? 'chevronUp' : 'chevronDown'} />
		</button>
		{#if showPast}
			<ul class="flex flex-col gap-1.5">
				{#each past as a (a.id)}
					<li class="flex justify-between gap-3 rounded-xl bg-surface px-4 py-2.5 text-[0.9375rem] text-ink-2">
						<span>{formatRange(a.from, a.to)}</span>
						<span class="text-muted">{a.note}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
