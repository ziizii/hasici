import { MCR } from 'monocart-coverage-reports';

export const coverageEnabled = process.env.HASICI_COVERAGE === '1';

export function browserCoverageReport() {
	return MCR({
		name: 'Browser coverage',
		outputDir: 'coverage/e2e',
		sourceFilter: (sourcePath) => sourcePath.startsWith('src/') && /\.(?:ts|svelte)$/.test(sourcePath),
		reports: ['html', 'json-summary', 'lcovonly', 'text-summary'],
		logging: 'error'
	});
}
