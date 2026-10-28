<script lang="ts">
	import { tick } from 'svelte';
	import { data } from '#lib/data.svelte.js';
	import {
		addDays,
		DOW_LONG,
		DOW_SHORT,
		formatDayMonth,
		holiday,
		isoWeek,
		isWeekend,
		MONTHS,
		parseKey,
		startOfWeek,
		todayKey,
		weekdayIndex,
		type DateKey
	} from '#lib/dates.js';
	import AvailabilityBar from '#lib/components/AvailabilityBar.svelte';
	import DayPanel from '#lib/components/DayPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { toggleMemberDay } from '#lib/toggleDay.js';

	const today = todayKey();

	let start = $state(today);
	let end = $state(addDays(today, 62));
	let selected = $state<DateKey | null>(null);
	let desktop = $state(false);
	let sentinel = $state<HTMLElement>();
	// Heights of the sticky bars (they grow with the phone's text size).
	let navH = $state(0);
	let monthH = $state(0);
	let weekH = $state(0);

	$effect(() => {
		const mq = matchMedia('(min-width: 1024px)');
		desktop = mq.matches;
		const on = (e: MediaQueryListEvent) => (desktop = e.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	// Infinite scroll forward.
	$effect(() => {
		if (!sentinel) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) end = addDays(end, 31);
			},
			{ rootMargin: '800px 0px' }
		);
		io.observe(sentinel);
		return () => io.disconnect();
	});

	type Row =
		| { kind: 'month'; key: string; label: string }
		| { kind: 'week'; key: string; label: string }
		| { kind: 'day'; key: DateKey };

	const rows = $derived.by(() => {
		const out: Row[] = [];
		for (let k = start; k <= end; k = addDays(k, 1)) {
			const d = parseKey(k);
			if (k === start || d.getDate() === 1) {
				out.push({ kind: 'month', key: 'm' + k, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
			}
			if (k === start || weekdayIndex(k) === 0) {
				const mon = startOfWeek(k);
				out.push({
					kind: 'week',
					key: 'w' + k,
					label: `Týden ${isoWeek(mon)} · ${formatDayMonth(mon)} – ${formatDayMonth(addDays(mon, 6))}`
				});
			}
			out.push({ kind: 'day', key: k });
		}
		return out;
	});

	const jumps = $derived.by(() => {
		const nextMonday = addDays(startOfWeek(today), 7);
		const list = [
			{ label: 'Dnes', key: today },
			{ label: 'Příští týden', key: nextMonday },
			{ label: 'Za 2 týdny', key: addDays(nextMonday, 7) }
		];
		const t = parseKey(today);
		for (let i = 1; i <= 4; i++) {
			const m = new Date(t.getFullYear(), t.getMonth() + i, 1);
			const label = MONTHS[m.getMonth()] + (m.getFullYear() !== t.getFullYear() ? ` ${m.getFullYear()}` : '');
			list.push({ label, key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01` });
		}
		return list;
	});

	async function jump(key: DateKey) {
		if (key < start) start = key;
		if (key > addDays(end, -21)) end = addDays(key, 45);
		await tick();
		document.getElementById('d-' + key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function countClass(n: number, total: number) {
		if (!total) return 'text-muted';
		const r = n / total;
		return r >= 0.8 ? 'text-good' : r >= 0.6 ? 'text-ink-2' : 'text-warn';
	}

	function rowBg(key: DateKey) {
		if (key === selected) return 'bg-surface ring-2 ring-ink ring-inset';
		if (key === today) return 'bg-surface';
		return isWeekend(key) || holiday(key) ? 'bg-weekend lg:bg-ground' : 'bg-ground lg:bg-surface';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && selected && !desktop) selected = null;
	}
</script>

<svelte:window {onkeydown} />

<div class="mx-auto flex max-w-[90rem] flex-wrap items-start gap-6 lg:p-6">
	<!-- Left rail (desktop) -->
	<aside class="hidden w-56 shrink-0 flex-col gap-5 lg:sticky lg:top-[5.5rem] lg:flex">
		<nav aria-label="Přeskočit na" class="flex flex-col gap-1">
			<span class="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">Přeskočit na</span>
			{#each jumps as j, i (j.key)}
				<button
					type="button"
					class="flex min-h-10 items-center rounded-[10px] px-3 text-left text-[0.9375rem] font-semibold {i === 0
						? 'bg-ink text-white'
						: 'hover:bg-surface'}"
					onclick={() => jump(j.key)}>{j.label}</button
				>
			{/each}
		</nav>
		<section class="flex flex-col gap-0.5">
			<span class="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase"
				>Členové ({data.members.length})</span
			>
			{#each data.members as m (m.id)}
				<span class="flex min-h-[2.125rem] items-center gap-2.5 text-[0.9375rem]">
					<span class="size-3.5 shrink-0 rounded" style="background: {m.color}"></span>{m.name}
				</span>
			{/each}
		</section>
	</aside>

	<!-- Timeline -->
	<section
		aria-label="Časová osa"
		style="--stick-month: calc(var(--header-h, 0px) + {navH}px); --stick-week: calc(var(--stick-month) + {monthH}px); --stick-day: calc(var(--stick-week) + {weekH}px)"
		class="min-w-0 flex-[999_1_560px] lg:overflow-clip lg:rounded-2xl lg:border lg:border-line lg:bg-surface"
	>
		<!-- Phone header: only the jump buttons stay pinned, so big text still leaves room -->
		<div class="flex flex-col gap-1 bg-surface px-4 pt-5 pb-3 lg:hidden">
			<h1 class="font-display text-[2rem] leading-none font-bold">Plán</h1>
			<span class="text-[0.9375rem] text-muted">Klepnutím na den naplánujete akci.</span>
		</div>
		<nav
			aria-label="Přeskočit na"
			bind:offsetHeight={navH}
			style="top: var(--header-h, 0px)"
			class="sticky z-10 flex gap-2 overflow-x-auto border-b border-line bg-surface px-4 py-2 lg:hidden"
		>
			{#each jumps as j, i (j.key)}
				<button
					type="button"
					class="inline-flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap {i ===
					0
						? 'bg-ink text-white'
						: 'border border-field bg-ground'}"
					onclick={() => jump(j.key)}>{j.label}</button
				>
			{/each}
		</nav>
		<div
			class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-line-soft px-4 py-2 text-[0.8125rem] text-muted lg:border-line lg:px-5 lg:py-3.5 lg:text-sm"
		>
			<span class="flex items-center gap-1.5"><span class="size-3.5 rounded bg-[#1F4E8C]"></span>může</span>
			<span class="flex items-center gap-1.5"><span class="size-3.5 rounded bg-off"></span>nepřítomen</span>
			<span class="hidden lg:inline">· Klepněte na den a naplánujte akci.</span>
		</div>

		<div class="flex justify-center border-b border-line-soft py-1.5">
			<button
				type="button"
				class="flex min-h-10 items-center gap-1.5 px-3 text-sm font-semibold text-muted"
				onclick={() => (start = addDays(start, -14))}
			>
				<Icon name="chevronUp" size={16} /> Zobrazit dřívější dny
			</button>
		</div>

		{#each rows as row (row.key)}
			{#if row.kind === 'month'}
				<div
					bind:offsetHeight={monthH}
					style="top: var(--stick-month)"
					class="sticky z-[6] bg-ground px-4 pt-[1.125rem] pb-1.5 font-display text-2xl font-bold lg:bg-surface lg:px-5 lg:text-[1.625rem]"
				>
					{row.label}
				</div>
			{:else if row.kind === 'week'}
				<div
					bind:offsetHeight={weekH}
					style="top: var(--stick-week)"
					class="sticky z-[5] border-b border-line bg-ground px-4 pt-2.5 pb-1.5 text-xs font-bold tracking-[0.08em] text-muted uppercase lg:border-line-soft lg:bg-[#FAF9F6] lg:px-5"
				>
					{row.label}
				</div>
			{:else}
				{@const key = row.key}
				{@const av = data.availability(key)}
				{@const evs = data.eventsOn(key)}
				{@const hol = holiday(key)}
				{@const wd = weekdayIndex(key)}
				{@const red = wd >= 5 || !!hol}
				<!-- The whole row opens the day; the date is the keyboard/screen-reader button and
				     the member segments are their own buttons. -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					id="d-{key}"
					style="scroll-margin-top: var(--stick-day)"
					class="flex w-full cursor-pointer items-center gap-2.5 border-b border-[#E7E2DA] px-4 py-2.5 text-left lg:gap-4 lg:border-line-soft lg:px-5 {rowBg(
						key
					)}"
					onclick={() => (selected = key)}
				>
					<button
						type="button"
						aria-label="{DOW_LONG[wd]} {formatDayMonth(key)}: může {av.available.length} z {data.members
							.length}. Otevřít den."
						class="flex min-h-11 w-10 shrink-0 flex-col items-center lg:w-[6.25rem] lg:flex-row lg:gap-2">
						<span
							class="text-xs font-bold tracking-[0.06em] lg:order-2 lg:text-sm lg:font-semibold lg:tracking-normal lg:normal-case {red
								? 'text-accent-dark'
								: 'text-muted lg:text-ink-2'}"
						>
							<span class="lg:hidden">{DOW_SHORT[wd]}</span><span class="hidden lg:inline"
								>{DOW_LONG[wd]}</span
							>
						</span>
						{#if key === today}
							<span
								class="mt-0.5 flex size-[2.125rem] items-center justify-center rounded-full bg-accent font-display text-[1.3125rem] font-bold text-white lg:order-1 lg:mt-0 lg:size-[2.375rem] lg:text-[1.375rem]"
								>{parseKey(key).getDate()}</span
							>
						{:else}
							<span
								class="font-display text-[1.625rem] leading-[1.1] font-bold lg:order-1 lg:w-[2.375rem] lg:text-center lg:text-[1.75rem]"
								>{parseKey(key).getDate()}</span
							>
						{/if}
					</button>

					<span class="flex min-w-0 flex-1 flex-col gap-1.5">
						<span class="flex items-start gap-2">
							<span class="flex min-w-0 flex-1 flex-col gap-1.5">
								{#if key === today || hol}
									<span class="text-[0.8125rem] font-semibold text-muted"
										>{[key === today ? 'Dnes' : '', hol ?? ''].filter(Boolean).join(' · ')}</span
									>
								{/if}
								{#each evs as ev (ev.id)}
									<span
										class="flex max-w-full items-center gap-2 self-start rounded-lg bg-event px-2.5 py-1 text-event-ink"
									>
										{#if ev.time}<span class="text-[0.8125rem] font-bold">{ev.time}</span>{/if}
										<span class="line-clamp-2 text-sm leading-snug font-semibold">{ev.title}</span>
									</span>
								{/each}
							</span>
							<!-- Phone: the count sits above the bar so the bar gets the full width -->
							<span
								class="shrink-0 text-right text-[1.1875rem] leading-tight font-bold whitespace-nowrap lg:hidden {countClass(
									av.available.length,
									data.members.length
								)}"
							>
								{av.available.length}<span class="text-xs font-semibold text-faint"
									>/{data.members.length}</span
								>
							</span>
						</span>
						<AvailabilityBar availability={av} ontoggle={(m) => toggleMemberDay(m, key)} />
					</span>

					<span
						class="hidden w-[4.375rem] shrink-0 text-right text-xl font-bold whitespace-nowrap lg:block {countClass(
							av.available.length,
							data.members.length
						)}"
					>
						{av.available.length}<span class="text-[0.8125rem] font-semibold text-faint"
							>&nbsp;/{data.members.length}</span
						>
					</span>
				</div>
			{/if}
		{/each}

		<div bind:this={sentinel} class="py-6 text-center text-sm text-faint">Načítám další dny…</div>
	</section>

	<!-- Right panel (desktop) -->
	{#if desktop}
		<aside
			aria-label="Vybraný den"
			class="sticky top-[5.5rem] max-h-[calc(100dvh-112px)] w-[22.5rem] shrink-0 overflow-y-auto rounded-2xl border border-line bg-surface p-5"
		>
			{#if selected}
				<DayPanel day={selected} onclose={() => (selected = null)} />
			{:else}
				<div class="flex flex-col gap-2 text-muted">
					<Icon name="calendar" size={28} />
					<p class="text-[0.9375rem] leading-snug">
						Klepněte na den v časové ose: uvidíte, kdo může, a můžete tam rovnou naplánovat akci.
					</p>
				</div>
			{/if}
		</aside>
	{/if}
</div>

<!-- Bottom sheet (mobile) -->
{#if selected && !desktop}
	<div class="fixed inset-0 z-40">
		<button
			type="button"
			aria-label="Zavřít"
			class="absolute inset-0 bg-ink/50"
			onclick={() => (selected = null)}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Vybraný den"
			class="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[20px] bg-surface px-5 pt-2.5 pb-[max(24px,env(safe-area-inset-bottom))]"
		>
			<div class="mx-auto mb-2 h-[5px] w-11 rounded-full bg-field" aria-hidden="true"></div>
			<DayPanel day={selected} onclose={() => (selected = null)} />
		</div>
	</div>
{/if}
