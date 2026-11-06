<script lang="ts">
	import { data } from '#lib/data.svelte.js';
	import { todayKey, type DateKey } from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';
	import EventForm, { type SaveOptions } from './EventForm.svelte';
	import Icon from './Icon.svelte';

	/** "Naplánovat akci": a new event on any date, without scrolling the plan there first. */
	let { onclose, onsaved }: { onclose: () => void; onsaved: (day: DateKey) => void } = $props();

	async function create(draft: Parameters<typeof data.addEvent>[0], { repeat, until }: SaveOptions) {
		try {
			if (repeat) await data.addSeries(draft, until, repeat);
			else await data.addEvent(draft);
			toasts.show(repeat ? 'Opakovaná akce uložena' : 'Akce uložena');
			onsaved(draft.date);
		} catch (e) {
			console.error(e);
			toasts.error();
		}
	}
</script>

<div class="flex flex-col gap-4">
	<header class="flex items-start justify-between gap-2">
		<h2 class="tracking-tight text-[1.75rem] leading-none font-bold">Nová akce</h2>
		<button
			type="button"
			aria-label="Zavřít"
			class="-mt-1 -mr-2 flex size-11 items-center justify-center rounded-full"
			onclick={onclose}
		>
			<Icon name="x" size={22} stroke={2.2} />
		</button>
	</header>
	<EventForm date={todayKey()} pickDate repeatable onsave={create} />
</div>
