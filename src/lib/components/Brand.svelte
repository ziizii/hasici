<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import Icon from './Icon.svelte';

	let { large = false }: { large?: boolean } = $props();
</script>

<div class="flex items-center gap-3 {large ? 'flex-col text-center' : ''}">
	<div
		class="flex items-center justify-center bg-accent text-white {large
			? 'size-16 rounded-2xl'
			: 'size-10 rounded-[10px]'}"
	>
		<Icon name="flame" size={large ? 36 : 24} />
	</div>
	<div class="flex flex-col">
		{#if access.unitName}
			<span class="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{access.unitName}</span>
		{/if}
		<span class="tracking-tight leading-none font-bold {large ? 'text-[2rem]' : 'text-[1.375rem]'}"
			>Dostupnost jednotky</span
		>
	</div>
</div>
