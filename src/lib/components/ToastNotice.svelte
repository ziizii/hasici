<script lang="ts">
	import { tick } from 'svelte';
	import { toasts, type Toast } from '#lib/toast.svelte.js';

	let { inDialog = false }: { inDialog?: boolean } = $props();
	let box = $state<ResizeObserverSize[]>();

	$effect(() => {
		if (inDialog) return;
		const height = box?.[0]?.blockSize ?? 0;
		const root = document.documentElement;
		if (!height) return;
		root.style.setProperty('--toast-clearance', `${height + 16}px`);
		return () => root.style.removeProperty('--toast-clearance');
	});

	async function dismiss(notice: Toast, trigger: HTMLElement, undo = false) {
		const fallback = trigger.closest('dialog')?.querySelector<HTMLElement>('[data-panel-heading]')
			?? document.getElementById('main-content');
		if (undo) notice.action?.();
		toasts.dismiss(notice.id);
		await tick();
		if (document.activeElement === document.body) fallback?.focus();
	}
</script>

<div bind:borderBoxSize={box} class:app-toast={!inDialog} class:dialog-toast={inDialog} class="pointer-events-none">
	<div role="status" aria-atomic="true" class="sr-only">{toasts.current?.text ?? ''}</div>
	{#if toasts.current}
		{@const notice = toasts.current}
		<div class="pointer-events-auto flex flex-wrap items-center justify-between gap-x-3 rounded-xl bg-ink px-3 py-1.5 text-[0.9375rem] text-white shadow-lg">
			<span class="py-2.5" aria-hidden="true">{notice.text}</span>
			{#if notice.action}
				<button type="button" class="min-h-11 rounded-lg px-2 font-bold text-[#FFB4A8]"
					onclick={(event) => dismiss(notice, event.currentTarget, true)}>{notice.actionLabel}</button>
				<button type="button" class="min-h-11 rounded-lg px-2 font-semibold"
					onclick={(event) => dismiss(notice, event.currentTarget)}>Skrýt oznámení</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.app-toast {
		position: fixed;
		inset-inline: 1rem;
		bottom: calc(var(--bottom-nav-clearance) + 0.75rem);
		z-index: 35;
		max-width: 28rem;
		margin-inline: auto;
	}
	:global(html:has(dialog[open])) .app-toast {
		display: none;
	}
	.dialog-toast:has([aria-hidden]) {
		margin-top: 0.75rem;
	}
</style>
