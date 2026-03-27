import { Deque } from "../internal/deque";

type Waiter = (value: void) => void;

export class Notify {
	#waiters: Deque<Waiter> = new Deque();
	#permit = false;

	notifyOne(): void {
		const waiter = this.#waiters.shift();
		if (waiter !== undefined) {
			waiter();
		} else {
			this.#permit = true;
		}
	}

	notifyWaiters(): void {
		while (!this.#waiters.isEmpty()) {
			this.#waiters.shift()!();
		}
	}

	notified(): Promise<void> {
		if (this.#permit) {
			this.#permit = false;
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			this.#waiters.push(resolve);
		});
	}

	[Symbol.dispose](): void {
		this.notifyWaiters();
	}
}
