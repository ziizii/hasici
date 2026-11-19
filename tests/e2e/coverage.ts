import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { browserCoverageReport, coverageEnabled } from '../../scripts/e2e-coverage.mjs';

const options = { resetOnNavigation: false };

export async function startPageCoverage(page: Page) {
	if (!coverageEnabled) return;
	await page.coverage.startJSCoverage(options);

	const collect = async () => {
		const scripts = await page.coverage.stopJSCoverage();
		const app = scripts
			.filter(({ url }) => url.startsWith('http://127.0.0.1:4173/_app/immutable/') && url.endsWith('.js'))
			.map((entry) => ({
				...entry,
				// Resolve the external source map next to the original Vite output on disk.
				url: pathToFileURL(resolve('.svelte-kit/output/client', '.' + new URL(entry.url).pathname)).href
			}));
		if (app.length) await browserCoverageReport().add(app);
	};

	// A full page load drops the counts of the page it replaces, even with
	// resetOnNavigation off. Save them before every load the test starts.
	// (Reloads the app starts itself, e.g. after a new version, still lose them.)
	for (const method of ['goto', 'reload'] as const) {
		const navigate = page[method].bind(page) as (...args: unknown[]) => Promise<unknown>;
		Object.assign(page, {
			[method]: async (...args: unknown[]) => {
				await collect();
				await page.coverage.startJSCoverage(options);
				return navigate(...args);
			}
		});
	}

	return collect;
}
