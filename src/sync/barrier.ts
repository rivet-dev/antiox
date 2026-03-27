import { Deque } from "../internal/deque";

export class BarrierWaitResult {
	#leader: boolean;

	constructor(leader: boolean) {
		this.#leader = leader;
	}

	isLeader(): boolean {
		return this.#leader;
	}
}

interface Waiter {
	resolve: (result: BarrierWaitResult) => void;
}

// Reusable barrier: n tasks synchronize, then the barrier resets for the next generation.
// The last task to arrive is the leader.
export class Barrier {
	#n: number;
	#count = 0;
	#generation = 0;
	#waiters: Deque<Waiter> = new Deque();

	constructor(n: number) {
		if (n < 1) throw new RangeError("Barrier size must be >= 1");
		this.#n = n;
	}

	wait(): Promise<BarrierWaitResult> {
		this.#count++;

		if (this.#count === this.#n) {
			const result = new BarrierWaitResult(true);

			while (!this.#waiters.isEmpty()) {
				this.#waiters.shift()!.resolve(new BarrierWaitResult(false));
			}

			this.#count = 0;
			this.#generation++;

			return Promise.resolve(result);
		}

		return new Promise<BarrierWaitResult>((resolve) => {
			this.#waiters.push({ resolve });
		});
	}
}
