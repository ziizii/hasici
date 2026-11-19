<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import { data } from '#lib/data.svelte.js';
	import { rotationOwed } from '#lib/todo.js';
	import { whoDid } from '#lib/who-did.svelte.js';

	let dialog = $state<HTMLDialogElement>();
	let opener: Element | null = null;

	const choices = $derived.by(() => {
		const todo = whoDid.todo;
		if (!todo?.rotation) return [];
		const owed = rotationOwed(todo.rotation, data.members.map((member) => member.id));
		return data.members
			.filter((member) => member.id in owed)
			.map((member) => ({ member, times: owed[member.id] }))
			.sort((a, b) =>
				Number(b.member.id === access.memberId) - Number(a.member.id === access.memberId) ||
				Math.max(b.times, 0) - Math.max(a.times, 0));
	});

	$effect(() => {
		if (!dialog) return;
		if (whoDid.todo && !dialog.open) {
			opener = document.activeElement;
			dialog.showModal();
		} else if (!whoDid.todo && dialog.open) {
			dialog.close();
			if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
		}
	});
</script>

<dialog bind:this={dialog} aria-labelledby="who-did-heading"
	oncancel={(event) => {
		event.preventDefault();
		whoDid.answer(null);
	}}
	class="m-auto w-[min(26rem,calc(100%-2rem))] max-h-[88dvh] overflow-y-auto rounded-2xl bg-surface p-5 text-ink backdrop:bg-ink/50">
	{#if whoDid.todo}
		<h2 id="who-did-heading" class="text-lg font-bold">Kdo to udělal?</h2>
		<p class="mb-3 break-words text-muted">{whoDid.todo.title}</p>
		<ul class="grid gap-2">
			{#each choices as { member, times } (member.id)}
				<li>
					<button type="button" onclick={() => whoDid.answer(member.id)}
						class="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 rounded-xl border border-field px-4 py-2 text-left font-semibold">
						<span>{member.name}{member.id === access.memberId ? ' (já)' : ''}</span>
						{#if times > 0}
							<span class="text-sm font-normal text-muted">na řadě{times > 1 ? ` ${times}×` : ''}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<div class="mt-4 flex justify-end">
			<button type="button" class="min-h-11 rounded-xl border border-field px-4 font-bold"
				onclick={() => whoDid.answer(null)}>Zrušit</button>
		</div>
	{/if}
</dialog>
