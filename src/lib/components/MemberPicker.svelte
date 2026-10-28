<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import { initials } from '#lib/colors.js';
	import { data } from '#lib/data.svelte.js';
	import { toasts } from '#lib/toast.svelte.js';
	import Brand from './Brand.svelte';
	import Icon from './Icon.svelte';

	let adding = $state(false);
	let name = $state('');
	let busy = $state(false);

	const empty = $derived(data.loaded.members && data.members.length === 0);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		busy = true;
		try {
			const id = await data.addMember(name);
			name = '';
			adding = false;
			if (empty) access.setMember(id);
		} catch (err) {
			console.error(err);
			toasts.error();
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto flex min-h-dvh max-w-md flex-col">
	<header class="px-5 pt-8 pb-5">
		<Brand />
	</header>

	<section class="flex flex-1 flex-col gap-3.5 px-5 pb-8">
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-bold">Kdo jste?</h1>
			<p class="text-base leading-snug text-muted">
				{empty
					? 'Seznam členů je zatím prázdný. Začněte sami sebou.'
					: 'Vyberte se ze seznamu. Na tomto zařízení si vás zapamatujeme.'}
			</p>
		</div>

		{#if !data.loaded.members}
			<p class="text-muted">Načítám…</p>
		{:else if data.members.length}
			<ul class="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
				{#each data.members as m (m.id)}
					<li class="border-b border-line-soft last:border-b-0">
						<button
							type="button"
							class="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left"
							onclick={() => access.setMember(m.id)}
						>
							<span
								class="flex size-9 items-center justify-center rounded-[9px] text-sm font-bold text-white"
								style="background: {m.color}">{initials(m.name)}</span
							>
							<span class="flex-1 text-[1.0625rem] font-medium">{m.name}</span>
							<Icon name="chevronRight" class="text-faint" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if adding || empty}
			<form class="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3.5" onsubmit={add}>
				<label for="new-member" class="text-[0.9375rem] font-semibold text-ink-2">Jméno a příjmení</label>
				<input
					id="new-member"
					bind:value={name}
					required
					maxlength="60"
					autocomplete="name"
					class="h-12 rounded-xl border border-field px-3 text-[1.0625rem]"
				/>
				<button
					type="submit"
					disabled={busy}
					class="flex min-h-12 items-center justify-center rounded-xl bg-accent font-bold text-white disabled:opacity-60"
				>
					{empty ? 'Přidat a pokračovat' : 'Přidat člena'}
				</button>
			</form>
		{:else}
			<button
				type="button"
				class="flex min-h-11 items-center gap-1.5 self-start font-semibold text-accent"
				onclick={() => (adding = true)}
			>
				<Icon name="plus" size={18} stroke={2.5} />
				Nejsem v seznamu
			</button>
		{/if}
	</section>
</div>
