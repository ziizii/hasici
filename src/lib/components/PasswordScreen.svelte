<script lang="ts">
	import { access } from '#lib/access.svelte.js';
	import Brand from './Brand.svelte';
	import Icon from './Icon.svelte';

	/** 'setup' = first visitor chooses the password, 'unlock' = enter it. */
	let { mode }: { mode: 'setup' | 'unlock' } = $props();

	let password = $state('');
	let confirm = $state('');
	let show = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		if (mode === 'setup') {
			if (password.trim().length < 4) return (error = 'Heslo musí mít aspoň 4 znaky.');
			if (password !== confirm) return (error = 'Hesla se neshodují.');
		}
		busy = true;
		try {
			if (mode === 'setup') await access.setup(password);
			else {
				const result = await access.unlock(password);
				if (!result.ok)
					error = result.wait
						? `Moc pokusů. Zkuste to znovu za ${result.wait} s.`
						: 'Špatné heslo. Zkuste to znovu.';
			}
		} catch (err) {
			console.error(err);
			error = 'Nepodařilo se to uložit. Zkontrolujte připojení.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto flex min-h-dvh max-w-sm flex-col px-6">
	<div class="flex flex-1 flex-col justify-center gap-7 py-10">
		<Brand large />

		<form class="flex flex-col gap-3.5" onsubmit={submit}>
			{#if mode === 'setup'}
				<div class="flex flex-col gap-1">
					<h1 class="text-lg font-bold">Vítejte! Nastavte heslo jednotky</h1>
					<p class="text-[0.9375rem] leading-snug text-muted">
						Jste tu první. Heslo budou zadávat členové, kteří nemají odkaz. Změnit ho jde později
						v sekci Jednotka.
					</p>
				</div>
			{/if}

			<label for="pw" class="text-[1.0625rem] font-bold">
				{mode === 'setup' ? 'Nové heslo' : 'Heslo jednotky'}
			</label>
			<div class="relative">
				<input
					id="pw"
					type={show ? 'text' : 'password'}
					bind:value={password}
					autocomplete={mode === 'setup' ? 'new-password' : 'current-password'}
					required
					class="h-14 w-full rounded-xl border-2 border-ink bg-surface pr-14 pl-3.5 text-xl tracking-wider"
				/>
				<button
					type="button"
					class="absolute top-1.5 right-1.5 flex size-11 items-center justify-center rounded-[10px] text-muted"
					aria-label={show ? 'Skrýt heslo' : 'Zobrazit heslo'}
					onclick={() => (show = !show)}
				>
					<Icon name="eye" size={22} />
				</button>
			</div>

			{#if mode === 'setup'}
				<label for="pw2" class="text-[0.9375rem] font-semibold text-ink-2">Heslo znovu</label>
				<input
					id="pw2"
					type={show ? 'text' : 'password'}
					bind:value={confirm}
					autocomplete="new-password"
					required
					class="h-14 w-full rounded-xl border border-field bg-surface px-3.5 text-xl tracking-wider"
				/>
			{/if}

			{#if error}
				<p class="rounded-lg bg-warn-bg px-3 py-2 text-[0.9375rem] font-semibold text-warn-ink" role="alert">
					{error}
				</p>
			{/if}

			<button
				type="submit"
				disabled={busy}
				class="flex min-h-14 items-center justify-center rounded-[14px] bg-accent text-lg font-bold text-white disabled:opacity-60"
			>
				{busy ? 'Moment…' : mode === 'setup' ? 'Uložit heslo a pokračovat' : 'Vstoupit'}
			</button>

			{#if mode === 'unlock'}
				<p class="text-center text-[0.9375rem] leading-snug text-muted">
					Heslo vám dá velitel. Když otevřete odkaz ze skupiny jednotky, heslo nepotřebujete.
				</p>
			{/if}
		</form>
	</div>
	<p class="mb-8 text-center text-sm text-faint">Na tomto zařízení si přístup zapamatujeme.</p>
</div>
