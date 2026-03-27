type State<T> =
	| { kind: "empty" }
	| { kind: "initializing"; waiters: Array<{ resolve: (value: T) => void; reject: (err: unknown) => void }> }
	| { kind: "ready"; value: T };

export class OnceCell<T> {
	#state: State<T> = { kind: "empty" };

	get(): T | undefined {
		if (this.#state.kind === "ready") {
			return this.#state.value;
		}
		return undefined;
	}

	async getOrInit(fn: () => Promise<T>): Promise<T> {
		if (this.#state.kind === "ready") {
			return this.#state.value;
		}

		if (this.#state.kind === "initializing") {
			return new Promise<T>((resolve, reject) => {
				(this.#state as Extract<State<T>, { kind: "initializing" }>).waiters.push({ resolve, reject });
			});
		}

		const waiters: Array<{ resolve: (value: T) => void; reject: (err: unknown) => void }> = [];
		this.#state = { kind: "initializing", waiters };

		try {
			const value = await fn();
			this.#state = { kind: "ready", value };
			for (const w of waiters) {
				w.resolve(value);
			}
			return value;
		} catch (err) {
			this.#state = { kind: "empty" };
			for (const w of waiters) {
				w.reject(err);
			}
			throw err;
		}
	}

	getOrTryInit(fn: () => Promise<T>): Promise<T> {
		return this.getOrInit(fn);
	}

	set(value: T): boolean {
		if (this.#state.kind !== "empty") {
			return false;
		}
		this.#state = { kind: "ready", value };
		return true;
	}

	isInitialized(): boolean {
		return this.#state.kind === "ready";
	}
}
