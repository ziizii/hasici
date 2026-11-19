import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { browserCoverageReport } from './e2e-coverage.mjs';

await rm('coverage/e2e', { recursive: true, force: true });
execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'test:emulators'], {
	env: { ...process.env, HASICI_COVERAGE: '1' },
	stdio: 'inherit'
});
await browserCoverageReport().generate();
