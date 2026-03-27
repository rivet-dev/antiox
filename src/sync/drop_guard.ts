export class DropGuard {
	#fn: (() => void) | null;

	constructor(fn: () => void) {
		this.#fn = fn;
	}

	disarm(): void {
		this.#fn = null;
	}

	[Symbol.dispose](): void {
		if (this.#fn !== null) {
			this.#fn();
			this.#fn = null;
		}
	}
}
