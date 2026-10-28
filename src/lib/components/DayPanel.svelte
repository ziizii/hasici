<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import { data } from '#lib/data.svelte.js';
	import { formatLong, holiday, type DateKey } from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';
	import { toggleMemberDay } from '#lib/toggleDay.js';
	import AvailabilityBar from './AvailabilityBar.svelte';
	import EventForm, { type SaveOptions } from './EventForm.svelte';
	import Icon from './Icon.svelte';

	let { day, onclose }: { day: DateKey; onclose: () => void } = $props();

	const avail = $derived(data.availability(day));
	const total = $derived(data.members.length);
	const events = $derived(data.eventsOn(day));
	const myAbsence = $derived(access.memberId ? data.absenceOn(access.memberId, day) : undefined);
	const title = $derived(formatLong(day).replace(/^./, (c) => c.toUpperCase()));
	const hol = $derived(holiday(day));
	let busy = $state(false);

	async function toggleMe() {
		if (!access.memberId) return;
		busy = true;
		try {
			if (myAbsence) await data.markAvailable(access.memberId, day);
			else await data.markAway(access.memberId, day);
		} catch (e) {
			console.error(e);
			toasts.error();
		} finally {
			busy = false;
		}
	}

	async function create(draft: Parameters<typeof data.addEvent>[0], { repeat, until }: SaveOptions) {
		try {
			if (repeat) await data.addSeries(draft, until, repeat);
			else await data.addEvent(draft);
			toasts.show(repeat ? 'Opakovaná akce uložena' : 'Akce uložena');
		} catch (e) {
			console.error(e);
			toasts.error();
		}
	}
</script>

<div class="flex flex-col gap-4">
	<header class="flex items-start justify-between gap-2">
		<div class="flex flex-col gap-0.5">
			<h2 class="font-display text-[1.75rem] leading-none font-bold">{title}</h2>
			{#if hol}<span class="text-sm font-semibold text-muted">Státní svátek · {hol}</span>{/if}
		</div>
		<button
			type="button"
			aria-label="Zavřít"
			class="-mt-1 -mr-2 flex size-11 items-center justify-center rounded-full"
			onclick={onclose}
		>
			<Icon name="x" size={22} stroke={2.2} />
		</button>
	</header>

	<section class="flex flex-col gap-2">
		<span class="text-[1.0625rem] font-bold">{avail.available.length} z {total} může</span>
		<AvailabilityBar availability={avail} size="lg" ontoggle={(m) => toggleMemberDay(m, day)} />
		{#if avail.away.length}
			<p class="text-[0.9375rem] leading-snug text-ink-2">
				<strong class="font-bold text-warn">Nemůže:</strong>
				{#each avail.away as { member, absence }, i (member.id)}
					{member.name}{absence.note ? ` (${absence.note})` : ''}{i < avail.away.length - 1
						? ', '
						: ''}
				{/each}
			</p>
		{/if}
		{#if access.memberId}
			<button
				type="button"
				disabled={busy}
				onclick={toggleMe}
				class="mt-1 flex min-h-11 items-center gap-2 self-start rounded-[10px] px-3 text-[0.9375rem] font-bold disabled:opacity-60 {myAbsence
					? 'bg-warn-bg text-warn-ink'
					: 'border border-field text-ink'}"
			>
				<Icon name={myAbsence ? 'check' : 'x'} size={18} stroke={2.4} />
				{myAbsence ? 'Máte nepřítomnost · přece jen můžu' : 'Tento den nemůžu'}
			</button>
		{/if}
	</section>

	{#if events.length}
		<section class="flex flex-col gap-2">
			{#each events as ev (ev.id)}
				<a
					href="/akce/{ev.id}"
					class="flex min-h-12 items-center gap-2.5 rounded-xl bg-event px-3 py-2.5 text-event-ink"
				>
					{#if ev.time}<span class="text-sm font-bold">{ev.time}</span>{/if}
					<span class="min-w-0 flex-1 text-[0.9375rem] leading-snug font-semibold">{ev.title}</span>
					<Icon name="chevronRight" size={18} />
				</a>
			{/each}
		</section>
	{/if}

	<section class="flex flex-col gap-3 border-t border-line-soft pt-3.5">
		<h3 class="text-[1.0625rem] font-bold">Nová akce v tento den</h3>
		{#key day}
			<EventForm date={day} repeatable onsave={create} />
		{/key}
	</section>
</div>
