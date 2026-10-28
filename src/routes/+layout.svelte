<script lang="ts">
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { page, updated } from '$app/state';
	import { access } from '#lib/access.svelte.js';
	import { data } from '#lib/data.svelte.js';
	import { configMissing } from '#lib/firebase.js';
	import { initials } from '#lib/colors.js';
	import { toasts } from '#lib/toast.svelte.js';
	import Brand from '#lib/components/Brand.svelte';
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import MemberPicker from '#lib/components/MemberPicker.svelte';
	import PasswordScreen from '#lib/components/PasswordScreen.svelte';
	import favicon from '#lib/assets/favicon.svg';
	import { demoData, isDemo } from '#lib/demo.js';
	import { mark } from '#lib/perf.js';

	mark('aplikace spuštěna');

	let { children }: { children: Snippet } = $props();

	let demo = $state(false);
	/** Desktop header height (0 when hidden); pages stick things below it via --header-h. */
	let headerBox = $state<ResizeObserverSize[]>();
	const headerH = $derived(headerBox?.[0]?.blockSize ?? 0);

	onMount(() => {
		document.getElementById('boot')?.remove();
		// A page served from an old browser cache finds out at once, not on the next poll.
		void updated.check();
		const url = new URL(location.href);
		if (isDemo(url)) {
			demo = true;
			data.loadDemo(demoData(Number(url.searchParams.get('demo')) || 10));
			access.startDemo('m2');
		} else if (!configMissing) access.init(url);
	});

	$effect(() => {
		if (access.state === 'ready') data.start();
	});

	// A new version is out (version poll, or a new service worker took over): reload to
	// get it, but not while someone is typing (then right after they leave the field or
	// switch away from the tab).
	let newWorker = $state(false);
	onMount(() => {
		const sw = navigator.serviceWorker;
		if (!sw?.controller) return; // first visit: the worker just installed, nothing to swap
		const onChange = () => (newWorker = true);
		sw.addEventListener('controllerchange', onChange);
		return () => sw.removeEventListener('controllerchange', onChange);
	});

	$effect(() => {
		if (!updated.current && !newWorker) return;
		// Served by the service worker: reloading now would give the cached old version.
		// Fetch the new worker instead; its takeover sets `newWorker` and we reload then.
		if (!newWorker && navigator.serviceWorker?.controller) {
			void navigator.serviceWorker.getRegistration().then((r) => r?.update());
			return;
		}
		const go = () => {
			if (document.activeElement?.matches('input, textarea, select')) return;
			// At most one automatic reload a minute, in case an old page is briefly served.
			try {
				const last = Number(sessionStorage.getItem('hasici.reloadedAt'));
				if (Date.now() - last < 60_000) return;
				sessionStorage.setItem('hasici.reloadedAt', String(Date.now()));
			} catch {
				// no sessionStorage: reload anyway
			}
			location.reload();
		};
		const later = () => setTimeout(go);
		go();
		document.addEventListener('focusout', later);
		document.addEventListener('visibilitychange', go);
		return () => {
			document.removeEventListener('focusout', later);
			document.removeEventListener('visibilitychange', go);
		};
	});

	const me = $derived(data.member(access.memberId));
	const needsPick = $derived(access.state === 'ready' && data.loaded.members && !me);

	const nav: { href: string; label: string; icon: IconName }[] = [
		{ href: '/ja', label: 'Já', icon: 'user' },
		{ href: '/', label: 'Plán', icon: 'calendar' },
		{ href: '/jednotka', label: 'Jednotka', icon: 'users' }
	];

	function isActive(href: string) {
		const p = page.url.pathname;
		return href === '/' ? p === '/' || p.startsWith('/akce') : p.startsWith(href);
	}
</script>

{#snippet loading(text: string)}
	<div class="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center text-muted">
		<span class="size-8 animate-spin rounded-full border-[0.1875rem] border-line border-t-accent"></span>
		<span class="text-[1.0625rem]" aria-live="polite">{text}</span>
	</div>
{/snippet}

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if configMissing && !demo}
	<div class="mx-auto max-w-md p-6">
		<h1 class="mb-2 text-xl font-bold">Chybí konfigurace Firebase</h1>
		<p class="text-muted">
			Zkopírujte <code>.env.example</code> do <code>.env</code> a doplňte hodnoty z
			<code>firebase apps:sdkconfig web</code>.
		</p>
	</div>
{:else if access.state === 'loading'}
	{@render loading(access.step)}
{:else if access.state === 'error'}
	<div class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6 text-center">
		<p class="text-lg font-semibold">{access.error}</p>
		<button
			class="min-h-12 rounded-xl bg-accent font-bold text-white"
			onclick={() => location.reload()}>Zkusit znovu</button
		>
	</div>
{:else if access.state === 'setup'}
	<PasswordScreen mode="setup" />
{:else if access.state === 'locked'}
	<PasswordScreen mode="unlock" />
{:else if !data.loaded.members}
	{@render loading('Načítám členy jednotky…')}
{:else if needsPick}
	<MemberPicker />
{:else}
	<!-- Clips sideways overflow here as well as on html/body: the installed iPhone app
	     ignores the root's overflow for panning. -->
	<div class="flex min-h-dvh flex-col overflow-x-clip" style="--header-h: {headerH}px">
		<!-- Desktop header -->
		<header
			bind:borderBoxSize={headerBox}
			class="sticky top-0 z-20 hidden border-b border-line bg-surface md:block"
		>
			<div class="mx-auto flex max-w-[90rem] items-center gap-7 px-6 py-3">
				<Brand />
				<nav aria-label="Hlavní navigace" class="flex flex-1 gap-1">
					{#each nav as item (item.href)}
						<a
							href={item.href}
							aria-current={isActive(item.href) ? 'page' : undefined}
							class="flex min-h-11 items-center rounded-[10px] px-3.5 text-base {isActive(item.href)
								? 'bg-[#EDE9E2] font-bold text-ink'
								: 'font-semibold text-[#4A4741]'}"
						>
							{item.label === 'Já' ? 'Moje nepřítomnost' : item.label}
						</a>
					{/each}
				</nav>
				{#if me}
					<a href="/ja" class="flex items-center gap-2 text-[0.9375rem] text-muted">
						<span
							class="flex size-7 items-center justify-center rounded-[7px] text-xs font-bold text-white"
							style="background: {me.color}">{initials(me.name)}</span
						>
						{me.name}
					</a>
				{/if}
			</div>
		</header>

		<main class="flex-1 pb-[5.25rem] md:pb-0">
			{@render children()}
		</main>

		<!-- Mobile bottom navigation -->
		<nav
			aria-label="Hlavní navigace"
			class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-line bg-surface pb-[max(8px,env(safe-area-inset-bottom))] md:hidden"
		>
			{#each nav as item (item.href)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					class="flex h-[4.25rem] flex-col items-center justify-center gap-0.5 text-[0.8125rem] {isActive(item.href)
						? 'font-bold text-accent'
						: 'font-semibold text-muted'}"
				>
					<Icon name={item.icon} size={24} />
					{item.label}
				</a>
			{/each}
		</nav>
	</div>
{/if}

{#if toasts.current}
	{@const t = toasts.current}
	<div
		role="status"
		class="fixed inset-x-4 bottom-[6rem] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink py-1.5 pr-1.5 pl-4 text-[0.9375rem] text-white shadow-lg md:bottom-6"
	>
		<span class="py-2.5">{t.text}</span>
		{#if t.action}
			<button
				class="min-h-11 rounded-lg px-3.5 font-bold text-[#FFB4A8]"
				onclick={() => {
					t.action?.();
					toasts.dismiss();
				}}>{t.actionLabel}</button
			>
		{/if}
	</div>
{/if}
