<script lang="ts">
	import { data, type DayAvailability, type Member } from '#lib/data.svelte.js';

	let {
		availability,
		size = 'md',
		ontoggle
	}: {
		availability: DayAvailability;
		size?: 'sm' | 'md' | 'lg';
		/** Makes each segment a button (e.g. flip that member's availability). */
		ontoggle?: (member: Member) => void;
	} = $props();

	function onclick(e: MouseEvent, m: Member) {
		e.stopPropagation();
		ontoggle?.(m);
	}

	const total = $derived(availability.available.length + availability.away.length);
	const height = $derived(size === 'sm' ? 'h-6' : size === 'lg' ? 'h-8' : 'h-7');
	const text = $derived(
		size === 'sm' ? 'text-[0.625rem]' : size === 'lg' ? 'text-xs' : 'text-[0.6875rem]'
	);
	// Equal columns as wide as the longest name (in `ch`, so they grow with the phone's
	// text size); when the row is full they wrap into another row instead of squeezing.
	// Works for 3 members as well as 30.
	const longest = $derived(Math.max(3, ...[...data.labels.values()].map((l) => l.length)));
	const cols = $derived(
		`grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(${longest}ch + 0.5rem)), 1fr))`
	);
</script>

{#snippet segment(m: Member, away: boolean, title: string)}
	<span
		class="flex min-w-0 items-center justify-center overflow-hidden rounded-[5px] px-1 whitespace-nowrap {height} {away
			? 'bg-off font-semibold text-muted'
			: 'font-bold text-white'}"
		style={away ? undefined : `background: ${m.color}`}
		{title}
	>
		<span class="truncate">{data.shortName(m)}</span>
	</span>
{/snippet}

{#snippet item(m: Member, away: boolean, title: string)}
	{#if ontoggle}
		<!-- Transparent padding makes the tap target 2.75rem tall without growing the bar. -->
		<button
			type="button"
			class="-my-2 flex min-w-0 flex-col py-2"
			aria-label="{m.name}: {away ? 'nemůže. Přepnout na může.' : 'může. Přepnout na nemůže.'}"
			onclick={(e) => onclick(e, m)}
		>
			{@render segment(m, away, title)}
		</button>
	{:else}
		{@render segment(m, away, title)}
	{/if}
{/snippet}

{#if total === 0}
	<span class="text-sm text-faint"
		>{availability.inactive.length ? 'Nikdo není k dispozici' : 'Zatím žádní členové'}</span
	>
{:else}
	<span
		class="grid gap-[3px] {text}"
		style={cols}
		role={ontoggle ? 'group' : 'img'}
		aria-label="Může {availability.available.length} z {total}"
	>
		{#each availability.available as m (m.id)}
			{@render item(m, false, `${m.name} – může`)}
		{/each}
		{#each availability.away as { member: m, absence } (m.id)}
			{@render item(m, true, `${m.name} – nepřítomen${absence.note ? ` (${absence.note})` : ''}`)}
		{/each}
	</span>
{/if}
