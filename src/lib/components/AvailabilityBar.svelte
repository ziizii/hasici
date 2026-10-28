<script lang="ts">
	import { firstName, initials } from '#lib/colors.js';
	import type { DayAvailability } from '#lib/data.svelte.js';

	let {
		availability,
		size = 'md',
		names = false
	}: {
		availability: DayAvailability;
		size?: 'sm' | 'md' | 'lg';
		/** Show first names on wide screens instead of initials. */
		names?: boolean;
	} = $props();

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

{#if total === 0}
	<span class="text-sm text-faint">Zatím žádní členové</span>
{:else}
	<span
		class="grid gap-[3px] {cols}"
		role="img"
		aria-label="Může {availability.available.length} z {total}"
	>
		{#each availability.available as m (m.id)}
			<span
				class="flex min-w-0 items-center justify-center overflow-hidden rounded-[5px] px-0.5 font-bold whitespace-nowrap text-white {height}"
				style="background: {m.color}"
				title="{m.name} – může"
			>
				{#if names}
					<span class="hidden truncate md:inline">{firstName(m.name)}</span>
					<span class="md:hidden">{initials(m.name)}</span>
				{:else}
					{initials(m.name)}
				{/if}
			</span>
		{/each}
		{#each availability.away as { member: m, absence } (m.id)}
			<span
				class="flex min-w-0 items-center justify-center overflow-hidden rounded-[5px] bg-off px-0.5 font-semibold whitespace-nowrap text-muted {height}"
				title="{m.name} – nepřítomen{absence.note ? ` (${absence.note})` : ''}"
			>
				{#if names}
					<span class="hidden truncate md:inline">{firstName(m.name)}</span>
					<span class="md:hidden">{initials(m.name)}</span>
				{:else}
					{initials(m.name)}
				{/if}
			</span>
		{/each}
	</span>
{/if}
