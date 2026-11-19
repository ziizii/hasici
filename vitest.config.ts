import { defineConfig, mergeConfig } from 'vitest/config';
import appConfig from './vite.config.ts';

export default mergeConfig(appConfig, defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		env: { TZ: 'Europe/Prague' },
		coverage: {
			provider: 'v8',
			include: ['src/lib/{colors,dates,repeat,todo}.ts'],
			reporter: ['text', 'html', 'json-summary', 'lcovonly'],
			reportsDirectory: 'coverage/unit'
		}
	}
}));
