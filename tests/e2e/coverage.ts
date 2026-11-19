import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { browserCoverageReport, coverageEnabled } from '../../scripts/e2e-coverage.mjs';

export async function startPageCoverage(page: Page) {
	if (!coverageEnabled) return;
	await page.coverage.startJSCoverage({ resetOnNavigation: false });

	return async () => {
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
}
