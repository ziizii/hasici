import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
	browserLocalPersistence,
	connectAuthEmulator,
	indexedDBLocalPersistence,
	initializeAuth,
	onAuthStateChanged,
	signInAnonymously,
	type User
} from 'firebase/auth';
import {
	connectFirestoreEmulator,
	initializeFirestore,
	memoryLocalCache,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
	apiKey: env.VITE_FIREBASE_API_KEY,
	authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
	projectId: env.VITE_FIREBASE_PROJECT_ID,
	appId: env.VITE_FIREBASE_APP_ID,
	messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET
};

/** `VITE_USE_EMULATORS=1 npm run dev` talks to `firebase emulators:start`. */
export const useEmulators = env.VITE_USE_EMULATORS === '1';

export const configMissing =
	!useEmulators && (!firebaseConfig.apiKey || !firebaseConfig.appId || !firebaseConfig.projectId);

// Placeholder keys keep the SDK from throwing when the real config is missing
// (the app then shows a setup message, or runs the dev-only ?demo mode).
export const app = initializeApp(
	useEmulators
		? { ...firebaseConfig, projectId: 'demo-hasici', apiKey: 'demo-key', appId: 'demo-app' }
		: configMissing
			? { ...firebaseConfig, projectId: 'missing', apiKey: 'missing', appId: 'missing' }
			: firebaseConfig
);
// App Check: Firestore and Auth then accept only requests from this site in a real
// browser (reCAPTCHA Enterprise, invisible), not scripts that guess passwords. Optional:
// on when VITE_FIREBASE_APPCHECK_KEY is set; enforce it in the Firebase console
// (App Check → APIs) once the metrics show the app's requests as verified.
// Must start before Auth and Firestore make their first request.
const appCheckKey = env.VITE_FIREBASE_APPCHECK_KEY;
if (appCheckKey && !useEmulators && !configMissing) {
	initializeAppCheck(app, {
		provider: new ReCaptchaEnterpriseProvider(appCheckKey),
		isTokenAutoRefreshEnabled: true
	});
}

// Not getAuth(): that also sets up popup/redirect sign-in, which makes Safari load Google's
// gapi script and a hidden auth iframe before anything else. iOS tracking protection can
// stall that iframe for many seconds. Only anonymous sign-in is used, so leave it out.
export const auth = initializeAuth(app, {
	persistence: [indexedDBLocalPersistence, browserLocalPersistence]
});

// Offline cache so the plan opens instantly on a phone with a weak signal.
// Long polling instead of the default WebChannel streaming, which Safari can take a long
// time to connect.
export const db = initializeFirestore(app, {
	experimentalForceLongPolling: true,
	localCache: useEmulators
		? memoryLocalCache()
		: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (useEmulators) {
	// Ports are overridable so a second emulator set (e.g. for tests) can run next to `make dev`.
	connectAuthEmulator(auth, `http://127.0.0.1:${env.VITE_EMULATOR_AUTH_PORT || 9099}`, {
		disableWarnings: true
	});
	connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_EMULATOR_FIRESTORE_PORT || 8080));
}

/**
 * Resolves with the signed-in (anonymous) user, signing in if needed; `created` tells
 * whether a new user was just made (`onCreate` runs before that network call).
 */
export function ensureUser(onCreate?: () => void): Promise<{ user: User; created: boolean }> {
	return new Promise((resolve, reject) => {
		const stop = onAuthStateChanged(
			auth,
			(user) => {
				stop();
				if (user) return resolve({ user, created: false });
				onCreate?.();
				signInAnonymously(auth).then((c) => resolve({ user: c.user, created: true }), reject);
			},
			reject
		);
	});
}
