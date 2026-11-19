import { todayKey, type DateKey } from './dates.js';

/**
 * Today's date that moves on at midnight. An app left open overnight (often on the home
 * screen) would otherwise keep treating yesterday as today. Phones pause timers in the
 * background, so it is also re-checked when the app comes back.
 */
class Clock {
	/** Today in Prague, as 'YYYY-MM-DD'. */
	today = $state<DateKey>(todayKey());

	#check = () => {
		const now = todayKey();
		if (now !== this.today) this.today = now;
	};

	/** Starts watching the clock; returns the cleanup. */
	watch(): () => void {
		this.#check();
		const timer = setInterval(this.#check, 60_000);
		const events = ['focus', 'pageshow'] as const;
		document.addEventListener('visibilitychange', this.#check);
		for (const e of events) window.addEventListener(e, this.#check);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', this.#check);
			for (const e of events) window.removeEventListener(e, this.#check);
		};
	}
}

export const clock = new Clock();
