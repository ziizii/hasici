<script lang="ts">
	import { data } from '#lib/data.svelte.js';
	import {
		addDays,
		DOW_ABBR,
		DOW_LONG,
		formatDayMonth,
		holiday,
		MONTHS,
		parseKey,
		weekdayIndex,
		type DateKey
	} from '#lib/dates.js';

	/**
	 * Month grid: weekdays as columns, weeks as rows, one block per month. Each day is a
	 * circle whose ring fills with the share of members who can come (full circle = all);
	 * a day with an event has a filled red circle. Shows the months that hold `start`…`end`.
	 */
	let {
		start,
		end,
		today,
		selected,
		onselect
	}: {
		start: DateKey;
		end: DateKey;
		today: DateKey;
		selected: DateKey | null;
		onselect: (day: DateKey) => void;
	} = $props();

	type Month = { ym: string; label: string; weeks: (DateKey | null)[][] };

	const months = $derived.by(() => {
		const out: Month[] = [];
		for (let first = start.slice(0, 8) + '01'; first <= end; ) {
			const d = parseKey(first);
			const weeks: (DateKey | null)[][] = [];
			let week: (DateKey | null)[] = Array(weekdayIndex(first)).fill(null);
			let k = first;
			for (; k.slice(0, 7) === first.slice(0, 7); k = addDays(k, 1)) {
				week.push(k);
				if (week.length === 7) {
					weeks.push(week);
					week = [];
				}
			}
			if (week.length) weeks.push([...week, ...Array(7 - week.length).fill(null)]);
			out.push({ ym: first.slice(0, 7), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, weeks });
			first = k;
		}
		return out;
	});

	// Height of a month's sticky heading, so a jump to a week lands just below it.
	let headBox = $state<ResizeObserverSize[]>();
	const headH = $derived(headBox?.[0]?.blockSize ?? 0);

	function ringColor(n: number, total: number) {
		const r = n / total;
		return r >= 0.8 ? 'var(--color-good)' : r >= 0.6 ? 'var(--color-ink-2)' : 'var(--color-warn)';
	}
</script>

{#snippet day(key: DateKey)}
	{@const av = data.availability(key)}
	{@const evs = data.eventsOn(key)}
	{@const hol = holiday(key)}
	{@const wd = weekdayIndex(key)}
	{@const pct = av.total ? (av.available.length / av.total) * 100 : 0}
	<button
		type="button"
		id="c-{key}"
		aria-label="{DOW_LONG[wd]} {formatDayMonth(key)}{key === today ? ', dnes' : ''}{hol
			? `, ${hol}`
			: ''}: může {av.available.length} z {av.total}{evs.length
			? `. Akce: ${evs.map((e) => e.title).join(', ')}`
			: ''}"
		aria-current={key === today ? 'date' : undefined}
		class="flex min-h-[3.25rem] min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 lg:min-h-[6.5rem] {key ===
		selected
			? 'bg-ink/10'
			: 'hover:bg-ink/5'} {key === today ? 'ring-2 ring-ink ring-inset' : ''} {key < today
			? 'opacity-60'
			: ''}"
		onclick={() => onselect(key)}
	>
		<span class="relative flex aspect-square w-full max-w-11 shrink-0 items-center justify-center">
			<svg viewBox="0 0 40 40" class="absolute inset-0 size-full -rotate-90" aria-hidden="true">
				<circle cx="20" cy="20" r="18" fill="none" stroke-width="3.5" style="stroke: var(--color-off)" />
				{#if pct > 0}
					<circle
						cx="20"
						cy="20"
						r="18"
						fill="none"
						stroke-width="3.5"
						pathLength="100"
						stroke-dasharray="{pct} 100"
						style="stroke: {ringColor(av.available.length, av.total)}"
					/>
				{/if}
			</svg>
			<span
				class="absolute inset-[14%] flex items-center justify-center rounded-full text-[0.9375rem] font-bold {evs.length
					? 'bg-accent text-white'
					: wd >= 5 || hol
						? 'text-accent-dark'
						: ''}">{parseKey(key).getDate()}</span
			>
		</span>
		<!-- Wide screens have room for the count and the events' names. -->
		<span class="hidden text-xs font-semibold text-muted lg:block"
			>{av.available.length}/{av.total}</span
		>
		{#each evs.slice(0, 2) as ev (ev.id)}
			<span
				class="hidden w-full truncate rounded-md bg-event px-1 text-left text-xs font-semibold text-event-ink lg:block"
				>{ev.time ? `${ev.time} ` : ''}{ev.title}</span
			>
		{/each}
		{#if evs.length > 2}
			<span class="hidden text-xs text-muted lg:block">+{evs.length - 2}</span>
		{/if}
	</button>
{/snippet}

<div style="--stick-calrow: calc(var(--stick-month) + {headH}px)">
	{#each months as m (m.ym)}
		<div id="cm-{m.ym}" style="scroll-margin-top: var(--stick-month)" class="pb-3">
			<div
				bind:borderBoxSize={headBox}
				style="top: var(--stick-month)"
				class="sticky z-[6] border-b border-line-soft bg-ground px-4 pt-[1.125rem] shadow-[0_-1px_0_var(--color-line)] lg:bg-surface lg:px-5"
			>
				<h2 class="pb-1.5 tracking-tight text-2xl font-bold lg:text-[1.625rem]">{m.label}</h2>
				<div class="grid grid-cols-7 gap-0.5 pb-1.5 text-center text-xs font-bold tracking-[0.06em] uppercase" aria-hidden="true">
					{#each DOW_ABBR as d, i (d)}
						<span class={i >= 5 ? 'text-accent-dark' : 'text-muted'}>{d}</span>
					{/each}
				</div>
			</div>
			{#each m.weeks as week (week.find(Boolean))}
				<div
					data-top={week.find(Boolean)}
					data-end={week.findLast(Boolean)}
					style="scroll-margin-top: var(--stick-calrow)"
					class="grid grid-cols-7 gap-0.5 px-2 pt-1 lg:px-3"
				>
					{#each week as key, i (key ?? `e${i}`)}
						{#if key}{@render day(key)}{:else}<span></span>{/if}
					{/each}
				</div>
			{/each}
		</div>
	{/each}
</div>
