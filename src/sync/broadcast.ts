export class RecvError extends Error {
	readonly kind: "lagged" | "closed";
	readonly lagged?: number;

	constructor(kind: "lagged" | "closed", lagged?: number) {
		if (kind === "lagged") {
			super(`Receiver lagged behind by ${lagged} messages`);
			this.lagged = lagged;
		} else {
			super("Broadcast channel closed");
		}
		this.name = "RecvError";
		this.kind = kind;
	}
}

interface Waiter<T> {
	resolve: (value: T) => void;
	reject: (error: RecvError) => void;
}

interface SharedState<T> {
	buffer: (T | undefined)[];
	capacity: number;
	writePos: number;
	senderCount: number;
	receiverCount: number;
	closed: boolean;
	waiters: Map<number, Set<Waiter<T>>>;
}

export function broadcast<T>(capacity: number): [BroadcastSender<T>, BroadcastReceiver<T>] {
	if (capacity < 1) {
		throw new RangeError("Broadcast channel capacity must be at least 1");
	}

	const state: SharedState<T> = {
		buffer: new Array(capacity),
		capacity,
		writePos: 0,
		senderCount: 1,
		receiverCount: 1,
		closed: false,
		waiters: new Map(),
	};

	return [new BroadcastSender(state), new BroadcastReceiver(state, state.writePos)];
}

export class BroadcastSender<T> {
	#state: SharedState<T>;
	#closed = false;

	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	send(value: T): number {
		if (this.#closed || this.#state.closed) {
			throw new Error("Broadcast channel is closed");
		}

		const pos = this.#state.writePos;
		const slot = pos % this.#state.capacity;
		this.#state.buffer[slot] = value;
		this.#state.writePos++;

		const waiters = this.#state.waiters.get(pos);
		let notified = 0;
		if (waiters) {
			for (const waiter of waiters) {
				waiter.resolve(value);
				notified++;
			}
			this.#state.waiters.delete(pos);
		}

		return notified;
	}

	subscribe(): BroadcastReceiver<T> {
		this.#state.receiverCount++;
		return new BroadcastReceiver(this.#state, this.#state.writePos);
	}

	receiverCount(): number {
		return this.#state.receiverCount;
	}

	clone(): BroadcastSender<T> {
		this.#state.senderCount++;
		return new BroadcastSender(this.#state);
	}

	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#state.senderCount--;

		if (this.#state.senderCount === 0) {
			this.#state.closed = true;

			for (const [, waiters] of this.#state.waiters) {
				for (const waiter of waiters) {
					waiter.reject(new RecvError("closed"));
				}
			}
			this.#state.waiters.clear();
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

export class BroadcastReceiver<T> {
	#state: SharedState<T>;
	#cursor: number;
	#closed = false;

	constructor(state: SharedState<T>, cursor: number) {
		this.#state = state;
		this.#cursor = cursor;
	}

	recv(): Promise<T> {
		if (this.#cursor < this.#state.writePos - this.#state.capacity) {
			const missed = this.#state.writePos - this.#state.capacity - this.#cursor;
			this.#cursor = this.#state.writePos - this.#state.capacity;
			return Promise.reject(new RecvError("lagged", missed));
		}

		if (this.#cursor < this.#state.writePos) {
			const slot = this.#cursor % this.#state.capacity;
			const value = this.#state.buffer[slot] as T;
			this.#cursor++;
			return Promise.resolve(value);
		}

		if (this.#state.closed) {
			return Promise.reject(new RecvError("closed"));
		}

		return new Promise<T>((resolve, reject) => {
			const waiter: Waiter<T> = {
				resolve: (value: T) => {
					this.#cursor++;
					resolve(value);
				},
				reject,
			};

			let set = this.#state.waiters.get(this.#cursor);
			if (!set) {
				set = new Set();
				this.#state.waiters.set(this.#cursor, set);
			}
			set.add(waiter);
		});
	}

	tryRecv(): T {
		if (this.#cursor < this.#state.writePos - this.#state.capacity) {
			const missed = this.#state.writePos - this.#state.capacity - this.#cursor;
			this.#cursor = this.#state.writePos - this.#state.capacity;
			throw new RecvError("lagged", missed);
		}

		if (this.#cursor < this.#state.writePos) {
			const slot = this.#cursor % this.#state.capacity;
			const value = this.#state.buffer[slot] as T;
			this.#cursor++;
			return value;
		}

		if (this.#state.closed) {
			throw new RecvError("closed");
		}

		throw new Error("No message available");
	}

	clone(): BroadcastReceiver<T> {
		this.#state.receiverCount++;
		return new BroadcastReceiver(this.#state, this.#cursor);
	}

	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#state.receiverCount--;
	}

	[Symbol.dispose](): void {
		this.close();
	}

	async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			try {
				yield await this.recv();
			} catch (err) {
				if (err instanceof RecvError && err.kind === "closed") {
					return;
				}
				throw err;
			}
		}
	}
}
