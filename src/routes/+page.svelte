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
		toKey,
		weekdayIndex,
		type DateKey
	} from '#lib/dates.js';
	import AvailabilityBar from '#lib/components/AvailabilityBar.svelte';
	import DayPanel from '#lib/components/DayPanel.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { mark } from '#lib/perf.js';
	import { onMount } from 'svelte';

	onMount(() => mark('plán zobrazen'));

	const today = todayKey();

	let start = $state(today);
	let end = $state(addDays(today, 62));
	let selected = $state<DateKey | null>(null);
	let desktop = $state(false);
	let sentinel = $state<HTMLElement>();
	// Heights of the sticky bars (they grow with the phone's text size). Border-box sizes,
	// not offsetHeight: rem-based heights are fractional and rounding leaves a gap. Each bar
	// still tucks 1px under the one above (lower z-index), so subpixel snapping can't open a seam.
	let navBox = $state<ResizeObserverSize[]>();
	let monthBox = $state<ResizeObserverSize[]>();
	let weekBox = $state<ResizeObserverSize[]>();
	const navH = $derived(navBox?.[0]?.blockSize ?? 0);
	const monthH = $derived(monthBox?.[0]?.blockSize ?? 0);
	const weekH = $derived(weekBox?.[0]?.blockSize ?? 0);

	$effect(() => {
		const mq = matchMedia('(min-width: 1024px)');
		desktop = mq.matches;
		const on = (e: MediaQueryListEvent) => (desktop = e.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	// Which days the timeline shows. One choice at a time: two independent toggles would
	// leave people guessing whether "both" means AND or OR.
	type Filter = 'all' | 'weekends' | 'events';
	const filters: { value: Filter; label: string }[] = [
		{ value: 'all', label: 'Vše' },
		{ value: 'weekends', label: 'Víkendy' },
		{ value: 'events', label: 'Akce' }
	];
	let filter = $state<Filter>('all');

	function shown(key: DateKey) {
		if (filter === 'weekends') return isWeekend(key) || !!holiday(key);
		if (filter === 'events') return data.eventsOn(key).length > 0;
		return true;
	}

	// Events can be sparse, so with that filter on, scrolling alone loads only a year ahead;
	// past that a button asks for more instead of loading empty months forever.
	let limit = $state(addDays(today, 365));
	const autoload = $derived(filter !== 'events' || end < limit);

	// Infinite scroll forward. Re-observing after each load fires again if the sentinel is
	// still in view (a filter can leave a loaded month with nothing to show).
	$effect(() => {
		if (!sentinel || !autoload) return;
		void end;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) end = addDays(end, 31);
			},
			{ rootMargin: '800px 0px' }
		);
		io.observe(sentinel);
		return () => io.disconnect();
	});

	type Week = { key: string; mon: DateKey; label: string; days: DateKey[] };
	type Month = { key: string; ym: string; label: string; weeks: Week[] };

	// Months wrap their weeks and weeks wrap their days, so a sticky heading is pushed up
	// (under the bar above) when its group scrolls out, instead of the next one sliding over it.
	// Months and weeks with no shown day are left out.
	const months = $derived.by(() => {
		const out: Month[] = [];
		for (let k = start; k <= end; k = addDays(k, 1)) {
			if (!shown(k)) continue;
			const d = parseKey(k);
			let month = out.at(-1);
			if (month?.ym !== k.slice(0, 7)) {
				month = {
					key: 'm' + k,
					ym: k.slice(0, 7),
					label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
					weeks: []
				};
				out.push(month);
			}
			// A new month repeats the week heading, so a jump to the 1st lines up under both bars.
			const mon = startOfWeek(k);
			let week = month.weeks.at(-1);
			if (week?.mon !== mon) {
				week = {
					key: 'w' + k,
					mon,
					label: `Týden ${isoWeek(mon)} · ${formatDayMonth(mon)} – ${formatDayMonth(addDays(mon, 6))}`,
					days: []
				};
				month.weeks.push(week);
			}
			week.days.push(k);
		}
		return out;
	});

	// The month heading casts a shadow while a week heading is part-way under it. It also
	// draws a 1px line above itself: the edge against the month being pushed out (in flow it
	// lands on the previous day's border).
	let shadowMonth = $state<string | null>(null);
	let frame = 0;
	function onscroll() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			if (!jumping) findTopDay();
			let found: string | null = null;
			for (const w of document.querySelectorAll<HTMLElement>('[data-week]')) {
				const r = w.getBoundingClientRect();
				if (r.top > innerHeight / 2) break;
				const m = w.closest<HTMLElement>('[data-month]')!;
				const mb = m.firstElementChild!.getBoundingClientRect().bottom;
				// Stuck weeks tuck 1px under the month, so only more than that counts.
				if (r.top < mb - 1.5 && r.bottom > mb + 0.5) {
					found = m.dataset.month!;
					break;
				}
			}
			shadowMonth = found;
		});
	}

	// Each jump covers a range: the week buttons their week, the months their month.
	const jumps = $derived.by(() => {
		const nextMonday = addDays(startOfWeek(today), 7);
		const list = [
			{ label: 'Dnes', key: today, until: nextMonday },
			{ label: 'Příští týden', key: nextMonday, until: addDays(nextMonday, 7) },
			{ label: 'Za 2 týdny', key: addDays(nextMonday, 7), until: addDays(nextMonday, 14) }
		];
		const t = parseKey(today);
		for (let i = 1; i <= 4; i++) {
			const m = new Date(t.getFullYear(), t.getMonth() + i, 1);
			const label = MONTHS[m.getMonth()] + (m.getFullYear() !== t.getFullYear() ? ` ${m.getFullYear()}` : '');
			const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
			list.push({ label, key: toKey(m), until: toKey(next) });
		}
		return list;
	});

	// The day at the top of the timeline (just under the sticky headings). Rows are in date
	// order, so a binary search finds the first one still showing below the headings.
	let topDay = $state<DateKey>(today);
	function findTopDay() {
		const rows = document.querySelectorAll<HTMLElement>('[id^="d-"]');
		if (!rows.length) return;
		const line = parseFloat(getComputedStyle(rows[0]).scrollMarginTop) || 0;
		let lo = 0;
		let hi = rows.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (rows[mid].getBoundingClientRect().bottom > line + 1) hi = mid;
			else lo = mid + 1;
		}
		topDay = rows[lo].id.slice(2);
	}

	// While a jump scrolls smoothly, its button stays lit instead of flicking through the
	// ones it passes.
	let jumping = $state<DateKey | null>(null);
	let jumpTimer = 0;
	function endJump() {
		clearTimeout(jumpTimer);
		jumping = null;
		findTopDay();
	}

	// Of the jumps whose range holds the top day, the one starting latest (a click on
	// "Listopad" lights "Listopad", not "Dnes", even when the 1st is in this week).
	const activeJump = $derived.by(() => {
		if (jumping) return jumping;
		let best: DateKey | null = null;
		for (const j of jumps) if (j.key <= topDay && topDay < j.until && (!best || j.key > best)) best = j.key;
		return best;
	});

	// Keep the lit button in view in the phone's sideways-scrolling bar.
	let jumpBar = $state<HTMLElement>();
	$effect(() => {
		const key = activeJump;
		if (!jumpBar || !key) return;
		const btn = jumpBar.querySelector<HTMLElement>(`[data-jump="${key}"]`);
		if (!btn) return;
		const pad = 16;
		const left = btn.offsetLeft - pad;
		const right = btn.offsetLeft + btn.offsetWidth + pad - jumpBar.clientWidth;
		if (jumpBar.scrollLeft > left) jumpBar.scrollTo({ left, behavior: 'smooth' });
		else if (jumpBar.scrollLeft < right) jumpBar.scrollTo({ left: right, behavior: 'smooth' });
	});

	// Loading more days or changing the filter moves rows without a scroll event.
	$effect(() => {
		void months;
		tick().then(findTopDay);
	});

	async function jump(key: DateKey) {
		if (key < start) start = key;
		if (key > addDays(end, -21)) end = addDays(key, 45);
		await tick();
		// The day itself may be filtered out: go to the next shown one.
		const target = months
			.flatMap((m) => m.weeks.flatMap((w) => w.days))
			.find((k) => k >= key);
		const el = target ? document.getElementById('d-' + target) : sentinel;
		jumping = key;
		clearTimeout(jumpTimer);
		// Browsers without `scrollend` (or a scroll that doesn't move) end the jump on a timer.
		jumpTimer = window.setTimeout(endJump, 1200);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

<svelte:window {onkeydown} {onscroll} onscrollend={() => jumping && endJump()} />

{#snippet dayRow(key: DateKey)}
	{@const av = data.availability(key)}
	{@const evs = data.eventsOn(key)}
	{@const hol = holiday(key)}
	{@const wd = weekdayIndex(key)}
	{@const red = wd >= 5 || !!hol}
	<!-- The whole row opens the day; the date is the keyboard/screen-reader button. Member
	     segments are not toggles here (too easy to hit while scrolling): that is in the day panel. -->
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
			aria-label="{DOW_LONG[wd]} {formatDayMonth(key)}: může {av.available.length} z {av.total}. Otevřít den."
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
							{#if ev.time}<span class="shrink-0 text-[0.8125rem] font-bold whitespace-nowrap">{ev.time}</span>{/if}
							<span class="line-clamp-2 text-sm leading-snug"
								><span class="font-semibold">{ev.title}</span
								>{#if ev.place}<span class="font-normal">{` · ${ev.place}`}</span>{/if}</span
							>
						</span>
					{/each}
				</span>
				<!-- Phone: the count sits above the bar so the bar gets the full width -->
				<span
					class="shrink-0 text-right text-[1.1875rem] leading-tight font-bold whitespace-nowrap lg:hidden {countClass(
						av.available.length,
						av.total
					)}"
				>
					{av.available.length}<span class="text-xs font-semibold text-faint"
						>/{av.total}</span
					>
				</span>
			</span>
			<AvailabilityBar availability={av} />
		</span>

		<span
			class="hidden w-[4.375rem] shrink-0 text-right text-xl font-bold whitespace-nowrap lg:block {countClass(
				av.available.length,
				av.total
			)}"
		>
			{av.available.length}<span class="text-[0.8125rem] font-semibold text-faint"
				>&nbsp;/{av.total}</span
			>
		</span>
	</div>
{/snippet}

<div class="mx-auto flex max-w-[90rem] flex-wrap items-start gap-6 lg:p-6">
	<!-- Left rail (desktop) -->
	<aside class="hidden w-56 shrink-0 flex-col gap-5 lg:sticky lg:top-[5.5rem] lg:flex">
		<section class="flex flex-col">
			<span class="mb-2 text-xs font-bold tracking-[0.08em] text-muted uppercase">Zobrazit</span>
			<div role="group" aria-label="Zobrazit dny" class="flex flex-col gap-1">
				{#each filters as f (f.value)}
					<button
						type="button"
						aria-pressed={filter === f.value}
						class="flex min-h-11 items-center rounded-[10px] px-3 text-left text-[0.9375rem] font-semibold {filter ===
						f.value
							? 'bg-ink text-white'
							: 'hover:bg-surface'}"
						onclick={() => (filter = f.value)}>{f.label}</button
					>
				{/each}
			</div>
		</section>
		<nav aria-label="Přeskočit na" class="flex flex-col gap-1">
			<span class="mb-1 text-xs font-bold tracking-[0.08em] text-muted uppercase">Přeskočit na</span>
			{#each jumps as j (j.key)}
				<button
					type="button"
					aria-current={activeJump === j.key || undefined}
					class="flex min-h-10 items-center rounded-[10px] px-3 text-left text-[0.9375rem] font-semibold {activeJump ===
					j.key
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
				{@const off = !!data.openAbsence(m.id)}
				<span class="flex min-h-[2.125rem] items-center gap-2.5 text-[0.9375rem] {off ? 'text-muted' : ''}">
					<span class="size-3.5 shrink-0 rounded {off ? 'bg-off' : ''}" style={off ? undefined : `background: ${m.color}`}
					></span>{m.name}{#if off}<span class="sr-only">, není k dispozici</span>{/if}
				</span>
			{/each}
		</section>
	</aside>

	<!-- Timeline -->
	<section
		aria-label="Časová osa"
		style="--stick-month: calc(var(--header-h, 0px) + {navH}px - 1px); --stick-week: calc(var(--stick-month) + {monthH}px - 1px); --stick-day: calc(var(--stick-week) + {weekH}px)"
		class="min-w-0 flex-[999_1_560px] lg:overflow-clip lg:rounded-2xl lg:border lg:border-line lg:bg-surface"
	>
		<!-- Phone header: only the jump buttons stay pinned, so big text still leaves room -->
		<div class="flex flex-col gap-1 bg-surface px-4 pt-5 pb-3 lg:hidden">
			<h1 class="font-display text-[2rem] leading-none font-bold">Plán</h1>
			<span class="text-[0.9375rem] text-muted">Klepnutím na den naplánujete akci.</span>
			<div role="group" aria-label="Zobrazit dny" class="mt-3 flex gap-1 rounded-full border border-field bg-ground p-1">
				{#each filters as f (f.value)}
					<button
						type="button"
						aria-pressed={filter === f.value}
						class="inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-[0.9375rem] font-semibold whitespace-nowrap {filter ===
						f.value
							? 'bg-ink text-white'
							: 'text-ink-2 hover:bg-surface'}"
						onclick={() => (filter = f.value)}>{f.label}</button
					>
				{/each}
			</div>
		</div>
		<!-- overscroll-x-contain: a swipe past the last button must not carry on into the page. -->
		<nav
			aria-label="Přeskočit na"
			bind:this={jumpBar}
			bind:borderBoxSize={navBox}
			style="top: var(--header-h, 0px)"
			class="sticky z-10 flex gap-2 overflow-x-auto overscroll-x-contain border-b border-line bg-surface px-4 py-2 lg:hidden"
		>
			{#each jumps as j (j.key)}
				<button
					type="button"
					data-jump={j.key}
					aria-current={activeJump === j.key || undefined}
					class="inline-flex min-h-10 shrink-0 items-center rounded-full border px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap {activeJump ===
					j.key
						? 'border-ink bg-ink text-white'
						: 'border-field bg-ground'}"
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

		{#each months as m (m.key)}
			<div data-month={m.key}>
				<div
					bind:borderBoxSize={monthBox}
					style="top: var(--stick-month)"
					class="sticky z-[6] bg-ground px-4 pt-[1.125rem] pb-1.5 font-display text-2xl font-bold transition-shadow lg:bg-surface lg:px-5 lg:text-[1.625rem] {shadowMonth ===
					m.key
						? 'shadow-[0_-1px_0_var(--color-line),0_0.125rem_0.5rem_rgb(0_0_0/0.12)]'
						: 'shadow-[0_-1px_0_var(--color-line)]'}"
				>
					{m.label}
				</div>
				{#each m.weeks as w (w.key)}
					<div>
						<div
							data-week
							bind:borderBoxSize={weekBox}
							style="top: var(--stick-week)"
							class="sticky z-[5] border-b border-line bg-ground px-4 pt-2.5 pb-1.5 text-xs font-bold tracking-[0.08em] text-muted uppercase lg:border-line-soft lg:bg-[#FAF9F6] lg:px-5"
						>
							{w.label}
						</div>
						{#each w.days as key (key)}
							{@render dayRow(key)}
						{/each}
					</div>
				{/each}
			</div>
		{/each}

		<div bind:this={sentinel} class="flex flex-col items-center gap-2 py-6 text-center text-sm text-faint">
			{#if autoload}
				Načítám další dny…
			{:else}
				{#if !months.length}<span>Na rok dopředu žádné akce.</span>{/if}
				<button
					type="button"
					class="flex min-h-11 items-center gap-1.5 rounded-full border border-field bg-ground px-4 text-[0.9375rem] font-semibold text-ink-2"
					onclick={() => (limit = addDays(end, 365))}>Hledat akce dál</button
				>
			{/if}
		</div>
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
