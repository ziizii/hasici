// Startup timings (ms since navigation start), shown on /jednotka and in the console as
// `hasiciPerf`, so slow starts on a real phone can be diagnosed.

const marks: [string, number][] = [];

export function mark(name: string) {
	if (!marks.some(([n]) => n === name)) marks.push([name, Math.round(performance.now())]);
}

export function perfReport(): [string, number][] {
	const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	const base: [string, number][] = nav
		? [
				['HTML staženo', Math.round(nav.responseEnd)],
				['DOM připraven', Math.round(nav.domContentLoadedEventEnd)]
			]
		: [];
	return [...base, ...marks].sort((a, b) => a[1] - b[1]);
}

if (typeof window !== 'undefined') Object.assign(window, { hasiciPerf: () => console.table(perfReport()) });
