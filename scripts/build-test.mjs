// Force the browser build to use local Firebase, even with a production .env.
import { build } from 'vite';

process.env.VITE_USE_EMULATORS = '1';
process.env.VITE_EMULATOR_AUTH_PORT = '9099';
process.env.VITE_EMULATOR_FIRESTORE_PORT = '8080';

await build();
