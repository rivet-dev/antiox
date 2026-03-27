export class CancellationToken {
	#controller: AbortController;
	#children: Set<CancellationToken> = new Set();
	#parent: CancellationToken | null = null;

	constructor() {
		this.#controller = new AbortController();
	}

	cancel(): void {
		if (this.#controller.signal.aborted) return;
		this.#controller.abort();

		for (const child of this.#children) {
			child.cancel();
		}
	}

	isCancelled(): boolean {
		return this.#controller.signal.aborted;
	}

	cancelled(): Promise<void> {
		if (this.#controller.signal.aborted) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			this.#controller.signal.addEventListener("abort", () => resolve(), { once: true });
		});
	}

	child(): CancellationToken {
		const child = new CancellationToken();
		child.#parent = this;
		this.#children.add(child);

		if (this.#controller.signal.aborted) {
			child.cancel();
		}

		return child;
	}

	#detach(): void {
		if (this.#parent !== null) {
			this.#parent.#children.delete(this);
			this.#parent = null;
		}
	}

	[Symbol.dispose](): void {
		this.cancel();
		this.#detach();
	}
}
