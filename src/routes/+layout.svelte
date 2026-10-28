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

	let { children }: { children: Snippet } = $props();

	let demo = $state(false);
	/** Desktop header height (0 when hidden); pages stick things below it via --header-h. */
	let headerH = $state(0);

	onMount(() => {
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

	// A new version was deployed: reload to get it, but not while someone is typing
	// (then right after they leave the field or switch away from the tab).
	$effect(() => {
		if (!updated.current) return;
		const go = () => {
			if (!document.activeElement?.matches('input, textarea, select')) location.reload();
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
	<div class="flex min-h-dvh items-center justify-center text-muted">Načítám…</div>
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
	<div class="flex min-h-dvh items-center justify-center text-muted">Načítám…</div>
{:else if needsPick}
	<MemberPicker />
{:else}
	<div class="flex min-h-dvh flex-col" style="--header-h: {headerH}px">
		<!-- Desktop header -->
		<header
			bind:offsetHeight={headerH}
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
