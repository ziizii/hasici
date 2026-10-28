<script lang="ts">
	import { firstName, initials } from '#lib/colors.js';
	import type { DayAvailability, Member } from '#lib/data.svelte.js';

	let {
		availability,
		size = 'md',
		names = false,
		ontoggle
	}: {
		availability: DayAvailability;
		size?: 'sm' | 'md' | 'lg';
		/** Show first names on wide screens instead of initials. */
		names?: boolean;
		/** Makes each segment a button (e.g. flip that member's availability). */
		ontoggle?: (member: Member) => void;
	} = $props();

	function onclick(e: MouseEvent, m: Member) {
		e.stopPropagation();
		ontoggle?.(m);
	}

	const total = $derived(availability.available.length + availability.away.length);
	const height = $derived(
		size === 'sm' ? 'h-6 text-[0.625rem]' : size === 'lg' ? 'h-8 text-xs' : 'h-7 text-[0.6875rem]'
	);
	// Segments never get narrower than their label needs (sizes are in rem, so
	// they grow with the phone's text size); when the row is full they wrap into
	// another row instead of squeezing. Works for 3 members as well as 30.
	const cols = $derived(
		names
			? 'grid-cols-[repeat(auto-fit,minmax(1.5rem,1fr))] md:grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))]'
			: size === 'lg'
				? 'grid-cols-[repeat(auto-fit,minmax(1.75rem,1fr))]'
				: 'grid-cols-[repeat(auto-fit,minmax(1.5rem,1fr))]'
	);
</script>

{#snippet segment(m: Member, away: boolean, title: string)}
	<span
		class="flex min-w-0 items-center justify-center overflow-hidden rounded-[5px] px-0.5 whitespace-nowrap {height} {away
			? 'bg-off font-semibold text-muted'
			: 'font-bold text-white'}"
		style={away ? undefined : `background: ${m.color}`}
		{title}
	>
		{#if names}
			<span class="hidden truncate md:inline">{firstName(m.name)}</span>
			<span class="md:hidden">{initials(m.name)}</span>
		{:else}
			{initials(m.name)}
		{/if}
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
	<span class="text-sm text-faint">Zatím žádní členové</span>
{:else}
	<span
		class="grid gap-[3px] {cols}"
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
