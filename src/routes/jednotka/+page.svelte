<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import { initials, PALETTE } from '#lib/colors.js';
	import { absenceWhen, data, isSwitch, type Member } from '#lib/data.svelte.js';
	import { formatShort, todayKey } from '#lib/dates.js';
	import { toasts } from '#lib/toast.svelte.js';
	import Icon from '#lib/components/Icon.svelte';
	import UnavailableSwitch from '#lib/components/UnavailableSwitch.svelte';

	const shareUrl = $derived(access.linkKey ? access.shareUrl() : null);

	// --- share link ---
	async function copyLink() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			toasts.show('Odkaz zkopírován');
		} catch {
			toasts.error('Kopírování se nepovedlo, označte odkaz ručně.');
		}
	}

	async function shareLink() {
		if (!shareUrl) return;
		if (navigator.share) {
			await navigator.share({ title: 'Dostupnost jednotky', url: shareUrl }).catch(() => {});
		} else copyLink();
	}

	async function rotate() {
		if (!confirm('Vytvořit nový odkaz? Starý odkaz přestane fungovat pro nová zařízení.')) return;
		try {
			await access.rotateLink();
			toasts.show('Nový odkaz je připraven');
		} catch (e) {
			console.error(e);
			toasts.error();
		}
	}

	// --- who's away ---
	const today = todayKey();
	const unavailable = $derived(
		data.members.flatMap((m) => {
			const a = data.openAbsence(m.id);
			return a ? [{ member: m, absence: a }] : [];
		})
	);
	const upcoming = $derived(
		data.absences
			.filter((a) => a.to >= today && !isSwitch(a))
			.flatMap((a) => {
				const member = data.member(a.memberId);
				return member ? [{ member, absence: a }] : [];
			})
			.sort((x, y) => x.absence.from.localeCompare(y.absence.from))
	);

	const upcomingEvents = $derived(data.events.filter((e) => e.date >= today));
	let showAllEvents = $state(false);

	async function backAvailable(m: Member) {
		await data.setUnavailable(m.id, false).catch(() => toasts.error());
	}

	// --- unit name ---
	let unitName = $state(access.unitName);
	$effect(() => {
		unitName = access.unitName;
	});

	async function saveUnitName() {
		if (unitName.trim() === access.unitName) return;
		await access.setUnitName(unitName).catch(() => toasts.error());
	}

	// --- password ---
	let pwOpen = $state(false);
	let pw = $state('');
	let pwBusy = $state(false);

	async function savePassword(e: SubmitEvent) {
		e.preventDefault();
		if (pw.trim().length < 4) return toasts.error('Heslo musí mít aspoň 4 znaky.');
		pwBusy = true;
		try {
			await access.changePassword(pw);
			pw = '';
			pwOpen = false;
			toasts.show('Heslo změněno');
		} catch (err) {
			console.error(err);
			toasts.error();
		} finally {
			pwBusy = false;
		}
	}

	// --- places ---
	let newPlace = $state('');

	async function addPlace(e: SubmitEvent) {
		e.preventDefault();
		const p = newPlace.trim();
		if (!p) return;
		if (data.defaultPlaces.includes(p)) return void (newPlace = '');
		try {
			await data.setDefaultPlaces([...data.defaultPlaces, p]);
			newPlace = '';
		} catch (err) {
			console.error(err);
			toasts.error();
		}
	}

	async function removePlace(p: string) {
		await data
			.setDefaultPlaces(data.defaultPlaces.filter((x) => x !== p))
			.catch(() => toasts.error());
	}

	// --- members ---
	let newName = $state('');
	let editing = $state<string | null>(null);
	let editName = $state('');

	async function addMember(e: SubmitEvent) {
		e.preventDefault();
		if (!newName.trim()) return;
		try {
			await data.addMember(newName);
			newName = '';
		} catch (err) {
			console.error(err);
			toasts.error();
		}
	}

	function startEdit(m: Member) {
		editing = m.id;
		editName = m.name;
	}

	async function saveName(m: Member) {
		const name = editName.trim();
		if (name && name !== m.name) await data.updateMember(m.id, { name }).catch(() => toasts.error());
	}

	async function setColor(m: Member, color: string) {
		await data.updateMember(m.id, { color }).catch(() => toasts.error());
	}

	let showArchived = $state(false);

	async function archiveMember(m: Member) {
		try {
			await data.archiveMember(m.id);
			editing = null;
			toasts.show(`${m.name} je v archivu`, {
				actionLabel: 'Vrátit zpět',
				action: () => data.restoreMember(m.id).catch(() => toasts.error())
			});
		} catch (err) {
			console.error(err);
			toasts.error();
		}
	}

	async function restoreMember(m: Member) {
		await data.restoreMember(m.id).catch(() => toasts.error());
	}

	async function deleteForever(m: Member) {
		if (!confirm(`Trvale smazat ${m.name} i s jeho nepřítomnostmi? Nejde to vrátit.`)) return;
		try {
			await data.deleteMember(m.id);
		} catch (err) {
			console.error(err);
			toasts.error();
		}
	}
</script>

<div class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-7 pb-8">
	<h1 class="font-display text-[2rem] leading-none font-bold">Jednotka</h1>

	<label class="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 font-bold">
		Název jednotky
		<input
			bind:value={unitName}
			maxlength="60"
			placeholder="např. SDH Lhota"
			onblur={saveUnitName}
			onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
			class="h-12 rounded-xl border border-field px-3 text-base font-normal text-ink"
		/>
	</label>

	<!-- Who's away -->
	<section class="flex flex-col rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-[1.0625rem] font-bold">Nedostupní ({unavailable.length})</h2>
		{#if unavailable.length === 0}
			<p class="text-[0.9375rem] text-muted">Nikdo není nedostupný do odvolání.</p>
		{/if}
		<ul class="flex flex-col">
			{#each unavailable as { member: m, absence: a } (m.id)}
				<li class="flex min-h-[3.25rem] flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-1">
					<span
						class="flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white"
						style="background: {m.color}">{initials(m.name)}</span
					>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="font-medium">{m.name}</span>
						<span class="text-[0.9375rem] text-muted">od {formatShort(a.from)}{a.note ? ` · ${a.note}` : ''}</span>
					</span>
					<button
						type="button"
						class="min-h-11 rounded-[10px] border border-field px-3 font-bold"
						onclick={() => backAvailable(m)}>Je zpět</button
					>
				</li>
			{/each}
		</ul>

		<h2 class="mt-4 mb-2 text-[1.0625rem] font-bold">Nadcházející nepřítomnosti ({upcoming.length})</h2>
		{#if upcoming.length === 0}
			<p class="text-[0.9375rem] text-muted">Nikdo nemá zapsanou nepřítomnost.</p>
		{/if}
		<ul class="flex flex-col">
			{#each upcoming as { member: m, absence: a } (a.id)}
				<li class="flex min-h-[3.25rem] items-center gap-3 border-t border-line-soft py-1.5">
					<span
						class="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
						style="background: {m.color}">{initials(m.name)}</span
					>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="font-medium">{m.name}</span>
						<span class="text-[0.9375rem] text-muted"
							>{absenceWhen(a, today)}{a.note ? ` · ${a.note}` : ''}</span
						>
					</span>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Upcoming events -->
	<section class="flex flex-col rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-[1.0625rem] font-bold">Nadcházející akce ({upcomingEvents.length})</h2>
		{#if upcomingEvents.length === 0}
			<p class="text-[0.9375rem] text-muted">Žádná akce není naplánovaná.</p>
		{/if}
		<ul class="flex flex-col">
			{#each showAllEvents ? upcomingEvents : upcomingEvents.slice(0, 10) as ev (ev.id)}
				{@const av = data.availability(ev.date)}
				<li class="border-t border-line-soft">
					<a href="/akce/{ev.id}" class="flex min-h-[3.25rem] items-center gap-3 py-1.5">
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="font-medium">{ev.title}</span>
							<span class="text-[0.9375rem] text-muted"
								>{formatShort(ev.date)}{ev.time ? ` · ${ev.time}` : ''}{ev.place
									? ` · ${ev.place}`
									: ''}</span
							>
						</span>
						<span class="shrink-0 font-bold whitespace-nowrap"
							>{av.available.length}<span class="text-sm font-semibold text-faint"
								>/{data.members.length}</span
							></span
						>
						<Icon name="chevronRight" size={18} class="shrink-0 text-faint" />
					</a>
				</li>
			{/each}
		</ul>
		{#if upcomingEvents.length > 10}
			<button
				type="button"
				aria-expanded={showAllEvents}
				class="flex min-h-11 items-center justify-between border-t border-line-soft pt-2 font-semibold text-muted"
				onclick={() => (showAllEvents = !showAllEvents)}
			>
				{showAllEvents ? 'Zobrazit méně' : `Zobrazit všechny (${upcomingEvents.length})`}
				<Icon name={showAllEvents ? 'chevronUp' : 'chevronDown'} />
			</button>
		{/if}
	</section>

	<!-- Access -->
	<section class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
		<h2 class="text-[1.0625rem] font-bold">Odkaz pro členy</h2>
		<p class="text-[0.9375rem] leading-snug text-muted">
			Pošlete ho do skupiny jednotky. Kdo má odkaz, vstoupí bez hesla.
		</p>
		<label class="block">
			<span class="sr-only">Odkaz</span>
			<input
				readonly
				value={shareUrl ?? 'Načítám…'}
				onfocus={(e) => e.currentTarget.select()}
				class="h-12 w-full rounded-xl border border-field bg-ground px-3 text-[0.9375rem] text-ink-2"
			/>
		</label>
		<div class="grid grid-cols-2 gap-2">
			<button
				type="button"
				class="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-bold text-white"
				onclick={copyLink}><Icon name="copy" /> Kopírovat</button
			>
			<button
				type="button"
				class="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-field font-bold"
				onclick={shareLink}><Icon name="share" /> Sdílet</button
			>
		</div>
		<button
			type="button"
			class="flex min-h-11 items-center gap-2 self-start text-[0.9375rem] font-semibold text-accent-dark"
			onclick={rotate}><Icon name="refresh" size={18} /> Vytvořit nový odkaz</button
		>

		<div class="flex flex-col gap-3 border-t border-line-soft pt-3">
			<div class="flex items-center justify-between gap-3">
				<div class="flex flex-col">
					<span class="font-bold">Heslo pro přístup bez odkazu</span>
					<span class="text-[0.9375rem] tracking-[0.1em] text-muted">••••••••</span>
				</div>
				{#if !pwOpen}
					<button
						type="button"
						class="min-h-11 rounded-[10px] border border-field px-3 font-bold"
						onclick={() => (pwOpen = true)}>Změnit</button
					>
				{/if}
			</div>
			{#if pwOpen}
				<form class="flex flex-col gap-2" onsubmit={savePassword}>
					<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
						Nové heslo
						<input
							type="text"
							bind:value={pw}
							autocomplete="off"
							minlength="4"
							required
							class="h-12 rounded-xl border-2 border-ink px-3 text-base text-ink"
						/>
					</label>
					<div class="flex gap-2">
						<button
							type="button"
							class="min-h-12 flex-1 rounded-xl border border-field font-bold"
							onclick={() => ((pwOpen = false), (pw = ''))}>Zrušit</button
						>
						<button
							type="submit"
							disabled={pwBusy}
							class="min-h-12 flex-[2] rounded-xl bg-ink font-bold text-white disabled:opacity-60"
							>Uložit heslo</button
						>
					</div>
				</form>
			{/if}
		</div>
	</section>

	<!-- Members -->
	<section class="flex flex-col rounded-2xl border border-line bg-surface p-4">
		<h2 class="mb-2 text-[1.0625rem] font-bold">Členové ({data.members.length})</h2>
		<ul class="flex flex-col">
			{#each data.members as m (m.id)}
				<li class="border-t border-line-soft">
					{#if editing === m.id}
						<div class="flex flex-col gap-3 py-3">
							<label class="flex flex-col gap-1.5 text-[0.9375rem] font-semibold text-ink-2">
								Jméno
								<input
									bind:value={editName}
									maxlength="60"
									onblur={() => saveName(m)}
									onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
									class="h-12 rounded-xl border border-field px-3 text-base text-ink"
								/>
							</label>
							<div class="flex flex-col gap-1.5">
								<span class="text-[0.9375rem] font-semibold text-ink-2">Barva</span>
								<div class="flex flex-wrap gap-1.5">
									{#each PALETTE as c (c)}
										<button
											type="button"
											aria-label="Barva {c}"
											aria-pressed={m.color.toUpperCase() === c}
											class="flex size-10 items-center justify-center rounded-lg text-white"
											style="background: {c}"
											onclick={() => setColor(m, c)}
										>
											{#if m.color.toUpperCase() === c}<Icon name="check" size={18} stroke={3} />{/if}
										</button>
									{/each}
								</div>
							</div>
							<UnavailableSwitch member={m} self={m.id === access.memberId} />
							<div class="flex items-center justify-between">
								<button
									type="button"
									class="flex min-h-11 items-center gap-1.5 font-semibold text-accent-dark"
									onclick={() => archiveMember(m)}><Icon name="archive" size={18} /> Archivovat</button
								>
								<button
									type="button"
									class="min-h-11 rounded-[10px] bg-ink px-4 font-bold text-white"
									onclick={() => (editing = null)}>Hotovo</button
								>
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="flex min-h-[3.25rem] w-full items-center gap-3 text-left"
							onclick={() => startEdit(m)}
						>
							<span
								class="flex size-8 items-center justify-center rounded-lg text-xs font-bold text-white"
								style="background: {m.color}">{initials(m.name)}</span
							>
							<span class="flex-1 font-medium">{m.name}</span>
							{#if data.openAbsence(m.id)}
								<span class="rounded-full bg-warn-bg px-2 py-0.5 text-sm font-semibold text-warn-ink"
									>nedostupný</span
								>
							{/if}
							{#if m.id === access.memberId}<span class="text-sm text-muted">vy</span>{/if}
							<Icon name="pencil" size={18} class="text-faint" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		<form class="flex gap-2 border-t border-line-soft pt-3" onsubmit={addMember}>
			<label class="flex-1">
				<span class="sr-only">Jméno nového člena</span>
				<input
					bind:value={newName}
					maxlength="60"
					placeholder="Jméno nového člena"
					class="h-12 w-full rounded-xl border border-field px-3 text-base"
				/>
			</label>
			<button
				type="submit"
				class="flex min-h-12 items-center gap-1.5 rounded-xl bg-accent px-4 font-bold text-white"
				><Icon name="plus" size={18} stroke={2.5} /> Přidat</button
			>
		</form>

		{#if data.archived.length}
			<button
				type="button"
				aria-expanded={showArchived}
				class="mt-3 flex min-h-11 items-center justify-between border-t border-line-soft pt-3 font-semibold text-muted"
				onclick={() => (showArchived = !showArchived)}
			>
				Archiv ({data.archived.length})
				<Icon name={showArchived ? 'chevronUp' : 'chevronDown'} />
			</button>
			{#if showArchived}
				<ul class="flex flex-col">
					{#each data.archived as m (m.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft py-2">
							<span class="min-w-0 flex-1 text-ink-2">{m.name}</span>
							<button
								type="button"
								class="min-h-11 rounded-[10px] border border-field px-3 font-bold"
								onclick={() => restoreMember(m)}>Obnovit</button
							>
							<button
								type="button"
								aria-label="Trvale smazat {m.name}"
								class="flex size-11 items-center justify-center text-accent-dark"
								onclick={() => deleteForever(m)}><Icon name="trash" size={20} /></button
							>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<!-- Places -->
	<section class="flex flex-col rounded-2xl border border-line bg-surface p-4">
		<h2 class="text-[1.0625rem] font-bold">Místa akcí</h2>
		<p class="mb-2 text-[0.9375rem] leading-snug text-muted">Nabídnou se při zakládání akce, první je předvyplněné.</p>
		<ul class="flex flex-col">
			{#each data.defaultPlaces as p (p)}
				<li class="flex min-h-[3.25rem] items-center gap-3 border-t border-line-soft">
					<Icon name="pin" size={18} class="text-faint" />
					<span class="min-w-0 flex-1 font-medium">{p}</span>
					<button
						type="button"
						aria-label="Odebrat {p}"
						class="flex size-11 items-center justify-center text-muted"
						onclick={() => removePlace(p)}><Icon name="x" size={20} /></button
					>
				</li>
			{/each}
		</ul>
		<form class="flex gap-2 border-t border-line-soft pt-3" onsubmit={addPlace}>
			<label class="flex-1">
				<span class="sr-only">Nové místo</span>
				<input
					bind:value={newPlace}
					maxlength="120"
					placeholder="např. Zbrojnice"
					class="h-12 w-full rounded-xl border border-field px-3 text-base"
				/>
			</label>
			<button
				type="submit"
				class="flex min-h-12 items-center gap-1.5 rounded-xl bg-accent px-4 font-bold text-white"
				><Icon name="plus" size={18} stroke={2.5} /> Přidat</button
			>
		</form>
	</section>

	<button
		type="button"
		class="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-field font-semibold"
		onclick={() => access.setMember(null)}
	>
		<Icon name="user" size={18} /> Změnit, kdo jsem na tomto zařízení
	</button>
</div>
