<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { access } from '#lib/access.svelte.js';
	import { initials } from '#lib/colors.js';
	import { data } from '#lib/data.svelte.js';
	import { formatLong } from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';
	import AvailabilityBar from '#lib/components/AvailabilityBar.svelte';
	import EventForm from '#lib/components/EventForm.svelte';
	import Icon from '#lib/components/Icon.svelte';

	const ev = $derived(data.event(page.params.id ?? ''));
	const me = $derived(data.member(access.memberId));
	const avail = $derived(ev ? data.availability(ev.date) : null);
	const myAbsence = $derived(ev && me ? data.absenceOn(me.id, ev.date) : undefined);
	const total = $derived(data.members.length);

	let editing = $state(false);
	let busy = $state(false);

	async function cannotCome() {
		if (!ev || !me) return;
		busy = true;
		try {
			await data.markAway(me.id, ev.date);
		} catch (e) {
			console.error(e);
			toasts.error();
		} finally {
			busy = false;
		}
	}

	async function comeAfterAll() {
		if (!ev || !me) return;
		busy = true;
		try {
			await data.markAvailable(me.id, ev.date);
		} catch (e) {
			console.error(e);
			toasts.error();
		} finally {
			busy = false;
		}
	}

	async function saveReason(value: string) {
		if (myAbsence && value.trim() !== myAbsence.note) {
			await data.updateAbsenceNote(myAbsence.id, value).catch(() => toasts.error());
		}
	}

	async function remove() {
		if (!ev || !confirm(`Opravdu smazat akci „${ev.title}“?`)) return;
		try {
			await data.deleteEvent(ev.id);
			toasts.show('Akce smazána');
			goto('/');
		} catch (e) {
			console.error(e);
			toasts.error();
		}
	}
</script>

<div class="mx-auto flex max-w-xl flex-col">
	<header class="flex items-center justify-between px-3 pt-4">
		<a href="/" class="flex min-h-11 items-center gap-0.5 px-2 text-base font-semibold">
			<Icon name="chevronLeft" size={24} /> Plán
		</a>
		{#if ev && !editing}
			<button
				type="button"
				class="flex min-h-11 items-center px-3 font-bold text-accent"
				onclick={() => (editing = true)}>Upravit</button
			>
		{/if}
	</header>

	{#if !data.loaded.events}
		<p class="px-5 py-6 text-muted">Načítám…</p>
	{:else if !ev}
		<div class="flex flex-col gap-3 px-5 py-6">
			<p class="text-lg font-semibold">Akce už neexistuje.</p>
			<a href="/" class="font-semibold text-accent">Zpět na plán</a>
		</div>
	{:else if editing}
		<section class="flex flex-col gap-4 px-5 pt-2 pb-6">
			<h1 class="font-display text-[1.75rem] font-bold">Upravit akci</h1>
			<EventForm
				date={ev.date}
				initial={ev}
				showDate
				showNote
				saveLabel="Uložit změny"
				oncancel={() => (editing = false)}
				onsave={async (d) => {
					try {
						await data.updateEvent(ev.id, d);
						editing = false;
					} catch (e) {
						console.error(e);
						toasts.error();
					}
				}}
			/>
			<button
				type="button"
				class="flex min-h-11 items-center gap-2 self-start font-semibold text-accent-dark"
				onclick={remove}
			>
				<Icon name="trash" size={18} /> Smazat akci
			</button>
		</section>
	{:else}
		<section class="flex flex-col gap-2.5 px-5 pt-1.5 pb-4">
			<h1 class="font-display text-[1.875rem] leading-[1.05] font-bold">{ev.title}</h1>
			<div class="flex flex-col gap-1.5 text-base text-ink-2">
				<span class="flex items-center gap-2"
					><Icon name="calendar" size={18} class="text-muted" />{formatLong(ev.date).replace(
						/^./,
						(c) => c.toUpperCase()
					)}</span
				>
				{#if ev.time}
					<span class="flex items-center gap-2"
						><Icon name="clock" size={18} class="text-muted" />Sraz v {ev.time}</span
					>
				{/if}
				{#if ev.place}
					<span class="flex items-center gap-2"><Icon name="pin" size={18} class="text-muted" />{ev.place}</span>
				{/if}
			</div>
			{#if ev.note}
				<p class="text-[0.9375rem] leading-snug whitespace-pre-line text-ink-2">{ev.note}</p>
			{/if}
		</section>

		<div class="flex flex-col gap-3.5 px-5 pb-8">
			{#if me}
				{#if !myAbsence}
					<div class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
						<div class="flex items-center gap-2.5">
							<span
								class="flex size-8 items-center justify-center rounded-lg text-[0.8125rem] font-bold text-white"
								style="background: {me.color}">{initials(me.name)}</span
							>
							<div class="flex flex-col">
								<span class="font-bold text-[#17402A]">Počítáme s vámi</span>
								<span class="text-sm text-muted">{me.name}</span>
							</div>
						</div>
						<button
							type="button"
							disabled={busy}
							onclick={cannotCome}
							class="flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl border-2 border-accent-dark text-[1.0625rem] font-bold text-accent-dark disabled:opacity-60"
						>
							<Icon name="x" size={20} stroke={2.4} /> Nemůžu přijít
						</button>
					</div>
				{:else}
					<div class="flex flex-col gap-3 rounded-2xl border border-[#F0D2B0] bg-warn-bg p-4">
						<div class="flex items-center gap-2.5">
							<span
								class="flex size-8 items-center justify-center rounded-lg bg-off text-[0.8125rem] font-bold text-muted"
								>{initials(me.name)}</span
							>
							<div class="flex flex-col">
								<span class="font-bold text-warn-ink">Na tuto akci nepřijdete</span>
								<span class="text-sm text-muted">Tento den máte zapsanou nepřítomnost.</span>
							</div>
						</div>
						<label class="block">
							<span class="sr-only">Důvod</span>
							<input
								value={myAbsence.note}
								onblur={(e) => saveReason(e.currentTarget.value)}
								placeholder="Důvod (nepovinné)"
								maxlength="200"
								class="h-12 w-full rounded-xl border border-field bg-surface px-3 text-base"
							/>
						</label>
						<button
							type="button"
							disabled={busy}
							onclick={comeAfterAll}
							class="flex min-h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-ink text-[1.0625rem] font-bold text-white disabled:opacity-60"
						>
							<Icon name="check" size={20} stroke={2.4} /> Přece jen přijdu
						</button>
					</div>
				{/if}
			{/if}

			{#if avail}
				<div class="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
					<span class="font-bold">{avail.available.length} z {total} přijde</span>
					<AvailabilityBar availability={avail} />
					<div class="flex flex-wrap gap-1.5 pt-1">
						{#each avail.available as m (m.id)}
							<span class="rounded-lg px-2 py-1 text-sm font-semibold text-white" style="background: {m.color}"
								>{m.name}</span
							>
						{/each}
					</div>
				</div>

				{#if avail.away.length}
					<section class="flex flex-col rounded-2xl border border-line bg-surface p-4">
						<h2 class="mb-1.5 text-[0.9375rem] font-bold tracking-[0.06em] text-warn uppercase">
							Nepřijdou ({avail.away.length})
						</h2>
						{#each avail.away as { member, absence } (member.id)}
							<div class="flex items-center gap-2.5 border-t border-line-soft py-2.5">
								<span
									class="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-off text-xs font-bold text-muted"
									>{initials(member.name)}</span
								>
								<div class="flex min-w-0 flex-col">
									<span class="font-semibold">{member.name}</span>
									{#if absence.note}<span class="text-sm text-muted">{absence.note}</span>{/if}
								</div>
							</div>
						{/each}
					</section>
				{/if}
			{/if}
		</div>
	{/if}
</div>
