/// <reference lib="webworker" />
// App shell cache: the app opens instantly (and offline) from here. Each deploy has its own
// cache, keyed by the git version; the new worker takes over at once and the page reloads
// on `controllerchange` (see +layout.svelte). Firebase traffic is cross-origin and untouched.
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `app-${version}`;
const SHELL = '/200.html';
// In dev there is no build output to cache, so the worker stays passive.
const enabled = immutable.length > 0;

self.addEventListener('install', (event) => {
	if (!enabled) return;
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// 'reload' skips the browser's HTTP cache so the shell matches this version.
			await cache.add(new Request(SHELL, { cache: 'reload' }));
			await cache.addAll([...immutable, ...assets].map((f) => '/' + f.path));
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (!enabled || request.method !== 'GET' || url.origin !== self.location.origin) return;
	if (url.pathname === '/_app/version.json' || url.pathname === '/service-worker.js') return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Every page of this single-page app is the same shell.
			const cached = await cache.match(request.mode === 'navigate' ? SHELL : request);
			return cached ?? fetch(request);
		})()
	);
});
