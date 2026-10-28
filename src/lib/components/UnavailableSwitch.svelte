<script lang="ts">
	import { data, type Member } from '#lib/data.svelte.js';
	import { formatShort } from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';

	/** `self`: worded for the current user ("Nejsem…") rather than about someone else. */
	let { member, self = false }: { member: Member; self?: boolean } = $props();

	const open = $derived(data.openAbsence(member.id));
	let busy = $state(false);

	async function toggle() {
		busy = true;
		try {
			await data.setUnavailable(member.id, !open);
		} catch (e) {
			console.error(e);
			toasts.error();
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={!!open}
	disabled={busy}
	onclick={toggle}
	class="flex min-h-11 w-full items-center gap-3 text-left disabled:opacity-60"
>
	<span class="flex min-w-0 flex-1 flex-col">
		<span class="font-bold">{self ? 'Nejsem k dispozici' : 'Není k dispozici'}</span>
		<span class="text-[0.9375rem] leading-snug text-muted">
			{open ? `Od ${formatShort(open.from)}, dokud to nevypnete` : 'Do odvolání, např. nemoc nebo zranění'}
		</span>
	</span>
	<span
		aria-hidden="true"
		class="flex h-8 w-[3.25rem] shrink-0 items-center rounded-full p-1 transition-colors {open
			? 'justify-end bg-warn'
			: 'justify-start bg-field'}"
	>
		<span class="size-6 rounded-full bg-white shadow-sm"></span>
	</span>
</button>
