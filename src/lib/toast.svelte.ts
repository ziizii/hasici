export interface Toast {
	id: number;
	text: string;
	actionLabel?: string;
	action?: () => void;
}

class Toasts {
	current = $state<Toast | null>(null);
	#timer: ReturnType<typeof setTimeout> | null = null;
	#seq = 0;

	show(text: string, opts: { actionLabel?: string; action?: () => void; ms?: number } = {}) {
		if (this.#timer) clearTimeout(this.#timer);
		this.current = { id: ++this.#seq, text, actionLabel: opts.actionLabel, action: opts.action };
		this.#timer = setTimeout(() => (this.current = null), opts.ms ?? 6000);
	}

	error(text = 'Něco se nepovedlo. Zkuste to prosím znovu.') {
		this.show(text, { ms: 5000 });
	}

	dismiss() {
		if (this.#timer) clearTimeout(this.#timer);
		this.current = null;
	}
}

export const toasts = new Toasts();
