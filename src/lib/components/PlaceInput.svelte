<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * Free-text place with suggestions from `places` (a custom list: <datalist> is missing or
	 * awkward on some phones). The list is placed against the nearest `relative` ancestor,
	 * so the form row can let it be wider than the field.
	 */
	let {
		value = $bindable(''),
		places,
		labelledby
	}: { value: string; places: string[]; labelledby?: string } = $props();

	const uid = Math.random().toString(36).slice(2, 8);
	let open = $state(false);
	let active = $state(-1);
	let input: HTMLInputElement;

	/** Lower case without diacritics, so "zbroj" finds "Zbrojnice" and "nadrz" finds "Nádrž". */
	const fold = (s: string) =>
		s
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.trim();

	const matches = $derived.by(() => {
		const q = fold(value);
		// Empty or an exact saved place: offer them all, so another one is one tap away.
		if (!q || places.some((p) => fold(p) === q)) return places;
		const hits = places.filter((p) => fold(p).includes(q));
		return [...hits.filter((p) => fold(p).startsWith(q)), ...hits.filter((p) => !fold(p).startsWith(q))];
	});
	const shown = $derived(open && matches.length > 0);

	function pick(p: string) {
		value = p;
		open = false;
		active = -1;
	}

	/**
	 * Phones move focus out of the field before the click, which closes the list and lets the
	 * click land on whatever was under it. So a tap picks on touchend and cancels the rest,
	 * then leaves the field so the keyboard goes away.
	 */
	let touchY = 0;
	function tapped(e: TouchEvent, p: string) {
		if (!e.cancelable || Math.abs(e.changedTouches[0].clientY - touchY) > 10) return; // a scroll
		e.preventDefault();
		pick(p);
		input.blur();
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) return void (open = true);
			const n = matches.length;
			if (n) active = (active + (e.key === 'ArrowDown' ? 1 : n - 1 + (active < 0 ? 1 : 0))) % n;
		} else if (e.key === 'Enter' && shown && active >= 0) {
			e.preventDefault();
			pick(matches[active]);
		} else if (e.key === 'Escape' && shown) {
			e.preventDefault();
			open = false;
		}
	}
</script>

<div
	class="flex min-w-0 items-center rounded-xl border border-field bg-surface focus-within:outline-2 focus-within:outline-ink"
>
	<input
		bind:this={input}
		bind:value
		maxlength="120"
		autocomplete="off"
		role="combobox"
		aria-labelledby={labelledby}
		aria-autocomplete="list"
		aria-expanded={shown}
		aria-controls="places-{uid}"
		aria-activedescendant={shown && active >= 0 ? `places-${uid}-${active}` : undefined}
		class="h-12 min-w-0 flex-1 rounded-xl bg-transparent pl-3 outline-none text-base font-normal text-ink"
		onfocus={() => (open = true)}
		onblur={() => ((open = false), (active = -1))}
		oninput={() => ((open = true), (active = -1))}
		onclick={() => (open = true)}
		onkeydown={keydown}
	/>
	{#if value}
		<button
			type="button"
			aria-label="Smazat místo"
			class="flex size-11 shrink-0 items-center justify-center text-muted"
			onpointerdown={(e) => e.preventDefault()}
			onclick={() => ((value = ''), (open = true), input.focus())}><Icon name="x" size={18} /></button
		>
	{/if}
</div>
{#if shown}
	<ul
		id="places-{uid}"
		role="listbox"
		aria-label="Uložená místa"
		class="absolute inset-x-0 top-full z-20 mt-1 max-h-[17rem] overflow-y-auto rounded-xl border border-field bg-surface py-1 shadow-lg"
	>
		{#each matches as p, i (p)}
			<!-- Focus stays in the field; the field's keys drive the list. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="places-{uid}-{i}"
				role="option"
				aria-selected={i === active}
				class="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-base font-normal text-ink {i ===
				active
					? 'bg-off'
					: ''}"
				onpointerdown={(e) => e.preventDefault()}
				ontouchstart={(e) => (touchY = e.touches[0].clientY)}
				ontouchend={(e) => tapped(e, p)}
				onclick={() => pick(p)}
			>
				<Icon name="pin" size={18} class="shrink-0 text-faint" />
				<span class="min-w-0 break-words">{p}</span>
			</li>
		{/each}
	</ul>
{/if}
