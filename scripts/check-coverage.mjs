import { appendFile, readFile } from 'node:fs/promises';

const suites = [
	{ label: 'Unit', directory: 'unit', minimum: { lines: 95, branches: 90 } },
	{ label: 'E2E (Chromium)', directory: 'e2e', minimum: { lines: 95, branches: 85 } }
];
const metrics = ['lines', 'branches', 'functions', 'statements'];
const summary = [
	'## Code coverage',
	'',
	'| Suite | Lines | Branches | Functions | Statements | Minimum lines / branches |',
	'| --- | ---: | ---: | ---: | ---: | ---: |'
];
const errors = [];

for (const { label, directory, minimum } of suites) {
	try {
		const report = JSON.parse(await readFile(`coverage/${directory}/coverage-summary.json`, 'utf8'));
		if (Object.keys(report).length < 2) throw new Error('No source files in the report.');

		const values = metrics.map((name) => {
			const { covered, total } = report.total[name];
			if (!Number.isInteger(covered) || !Number.isInteger(total) || total <= 0 || covered < 0 || covered > total) {
				throw new Error(`Invalid ${name} count.`);
			}

			const percent = 100 * covered / total;
			if (minimum[name] !== undefined && percent < minimum[name]) {
				errors.push(`${label} ${name} coverage is ${percent.toFixed(2)}% (${covered}/${total}), below the ${minimum[name]}% minimum.`);
			}
			return `${percent.toFixed(2)}% (${covered}/${total})`;
		});
		summary.push(`| ${label} | ${values.join(' | ')} | ${minimum.lines}% / ${minimum.branches}% |`);
	} catch (error) {
		errors.push(`Cannot read ${label} coverage. ${error.message}`);
	}
}

if (errors.length) {
	summary.push('', ...errors.map((error) => `- ${error}`));
	process.exitCode = 1;
}
const report = summary.join('\n') + '\n';
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
