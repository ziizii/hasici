<script lang="ts">
	import { PALETTE } from '#lib/colors.js';
	import Icon from '#lib/components/Icon.svelte';

	/** The palette plus a last square for any custom colour (stored as uppercase #RRGGBB). */
	let { value, onpick }: { value: string; onpick: (color: string) => void } = $props();

	const current = $derived(value.toUpperCase());
	const custom = $derived(!PALETTE.includes(current));
</script>

<div class="flex flex-wrap gap-1.5">
	{#each PALETTE as c (c)}
		<button
			type="button"
			aria-label="Barva {c}"
			aria-pressed={current === c}
			class="flex size-11 items-center justify-center rounded-lg text-white"
			style="background: {c}"
			onclick={() => onpick(c)}
		>
			{#if current === c}<Icon name="check" size={18} stroke={3} />{/if}
		</button>
	{/each}
	<label
		class="relative flex size-11 cursor-pointer items-center justify-center rounded-lg text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
		style="background: {custom ? value : 'conic-gradient(#d33, #e90, #dc3, #3a4, #29c, #63c, #c3a, #d33)'}"
	>
		{#if custom}<Icon name="check" size={18} stroke={3} />{:else}<Icon name="plus" size={18} stroke={3} />{/if}
		<input
			type="color"
			aria-label="Vlastní barva"
			{value}
			class="absolute inset-0 size-full cursor-pointer opacity-0"
			onchange={(e) => onpick(e.currentTarget.value.toUpperCase())}
		/>
	</label>
</div>
