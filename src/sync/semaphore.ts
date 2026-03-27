import { Deque } from "../internal/deque";

export class AcquireError extends Error {
	constructor(message = "Semaphore closed") {
		super(message);
		this.name = "AcquireError";
	}
}

interface Waiter {
	n: number;
	resolve: (permit: SemaphorePermit) => void;
	reject: (err: AcquireError) => void;
}

export class Semaphore {
	#permits: number;
	#closed = false;
	#waiters: Deque<Waiter> = new Deque();

	constructor(permits: number) {
		if (permits < 0) throw new RangeError("Permit count must be >= 0");
		this.#permits = permits;
	}

	acquire(): Promise<SemaphorePermit> {
		return this.acquireMany(1);
	}

	acquireMany(n: number): Promise<SemaphorePermit> {
		if (n < 1) throw new RangeError("Must acquire at least 1 permit");
		if (this.#closed) return Promise.reject(new AcquireError());

		if (this.#waiters.isEmpty() && this.#permits >= n) {
			this.#permits -= n;
			return Promise.resolve(new SemaphorePermit(this, n));
		}

		return new Promise<SemaphorePermit>((resolve, reject) => {
			this.#waiters.push({ n, resolve, reject });
		});
	}

	tryAcquire(): SemaphorePermit {
		return this.tryAcquireMany(1);
	}

	tryAcquireMany(n: number): SemaphorePermit {
		if (n < 1) throw new RangeError("Must acquire at least 1 permit");
		if (this.#closed) throw new AcquireError();
		if (this.#permits < n) throw new AcquireError("Insufficient permits");
		this.#permits -= n;
		return new SemaphorePermit(this, n);
	}

	availablePermits(): number {
		return this.#permits;
	}

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		const err = new AcquireError();
		while (!this.#waiters.isEmpty()) {
			this.#waiters.shift()!.reject(err);
		}
	}

	isClosed(): boolean {
		return this.#closed;
	}

	_release(n: number): void {
		this.#permits += n;
		this.#drain();
	}

	#drain(): void {
		while (!this.#waiters.isEmpty()) {
			const head = this.#waiters.shift()!;
			if (this.#closed) {
				head.reject(new AcquireError());
				continue;
			}
			if (this.#permits >= head.n) {
				this.#permits -= head.n;
				head.resolve(new SemaphorePermit(this, head.n));
			} else {
				// Re-queue at front: deque has no unshift, so rebuild with head first.
				const old = this.#waiters;
				this.#waiters = new Deque();
				this.#waiters.push(head);
				while (!old.isEmpty()) {
					this.#waiters.push(old.shift()!);
				}
				break;
			}
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

export class SemaphorePermit {
	#semaphore: Semaphore | null;
	#n: number;

	constructor(semaphore: Semaphore, n: number) {
		this.#semaphore = semaphore;
		this.#n = n;
	}

	release(): void {
		if (this.#semaphore === null) return;
		this.#semaphore._release(this.#n);
		this.#semaphore = null;
	}

	[Symbol.dispose](): void {
		this.release();
	}
}
