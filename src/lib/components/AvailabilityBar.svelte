<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import { contrastText } from '#lib/colors.js';
	import { data, type DayAvailability, type Member } from '#lib/data.svelte.js';

	let {
		availability,
		size = 'md',
		ontoggle
	}: {
		availability: DayAvailability;
		size?: 'sm' | 'md' | 'lg';
		/** Makes each segment a button (e.g. flip that member's availability). */
		ontoggle?: (member: Member) => void | Promise<void>;
	} = $props();

	let group = $state<HTMLElement>();

	async function onclick(e: MouseEvent, m: Member) {
		e.stopPropagation();
		const restore = document.activeElement === e.currentTarget;
		await ontoggle?.(m);
		if (restore && document.activeElement === document.body) {
			group?.querySelector<HTMLElement>(`[data-member-id="${CSS.escape(m.id)}"]`)?.focus();
		}
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
		`grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(${longest}ch + 1.5rem)), 1fr))`
	);
</script>

{#snippet segment(m: Member, away: boolean, title: string)}
	<span
		class="flex min-w-0 items-center justify-center overflow-hidden rounded-[5px] gap-0.5 px-1 whitespace-nowrap {height} {away
			? 'bg-off font-semibold text-muted'
			: 'font-bold'}"
		style:background-color={away ? undefined : m.color}
		style:color={away ? undefined : contrastText(m.color)}
		{title}
	>
		{#if away}<Icon name="x" size={12} class="shrink-0" />{/if}
		<span class="truncate" aria-hidden={ontoggle ? undefined : true}>{data.shortName(m)}</span>
		{#if !ontoggle}<span class="sr-only">{m.name}: {away ? 'nemůže' : 'může'}</span>{/if}
	</span>
{/snippet}

{#snippet item(m: Member, away: boolean, title: string)}
	{#if ontoggle}
		<button
			type="button"
			class="flex min-h-11 min-w-0 flex-col justify-center"
			data-member-id={m.id}
			aria-label="{data.shortName(m)}{data.shortName(m) === m.name ? '' : ` (${m.name})`}: {away ? 'nemůže. Přepnout na může.' : 'může. Přepnout na nemůže.'}"
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
		bind:this={group}
		class="grid gap-[3px] {text}"
		style={cols}
		role="group"
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
