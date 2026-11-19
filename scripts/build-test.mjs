import { readFile, writeFile } from 'node:fs/promises';
import { createBuilder } from 'vite';

const outputDir = '.output/test-hosting';

// Isolate the test build from production Firebase settings and deployable files.
process.env.HASICI_BUILD_DIR = outputDir;
process.env.VITE_USE_EMULATORS = '1';
process.env.VITE_EMULATOR_AUTH_PORT = '9099';
process.env.VITE_EMULATOR_FIRESTORE_PORT = '8080';

const builder = await createBuilder();
await builder.buildApp();

const config = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
config.hosting.public = outputDir;
config.emulators.hosting = { host: '127.0.0.1', port: 4173 };
await writeFile(new URL('../.firebase-test.json', import.meta.url), JSON.stringify(config, null, '\t') + '\n');
