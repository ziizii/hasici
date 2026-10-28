import { execSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/** The git commit is the app version; open tabs reload when it changes (see +layout.svelte). */
function gitVersion(): string {
	try {
		return execSync('git rev-parse HEAD').toString().trim();
	} catch {
		return 'dev';
	}
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Single page app: Firebase Hosting serves 200.html for every route.
			adapter: adapter({ fallback: '200.html' }),
			version: { name: gitVersion(), pollInterval: 60_000 },
			// One JS file instead of chunks fetched in 3 rounds (layout -> page -> deps).
			output: { bundleStrategy: 'single' }
		})
	]
});
