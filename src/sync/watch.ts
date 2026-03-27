export class SendError<T> extends Error {
	readonly value: T;

	constructor(value: T) {
		super("Failed to send: all receivers are closed");
		this.name = "SendError";
		this.value = value;
	}
}

export class RecvError extends Error {
	constructor() {
		super("Watch channel closed");
		this.name = "RecvError";
	}
}

interface Waiter {
	resolve: () => void;
	reject: (error: RecvError) => void;
}

interface SharedState<T> {
	value: T;
	version: number;
	senderClosed: boolean;
	receiverCount: number;
	waiters: Set<Waiter>;
}

export function watch<T>(initial: T): [WatchSender<T>, WatchReceiver<T>] {
	const state: SharedState<T> = {
		value: initial,
		version: 1,
		senderClosed: false,
		receiverCount: 1,
		waiters: new Set(),
	};

	return [new WatchSender(state), new WatchReceiver(state, state.version)];
}

export class WatchSender<T> {
	#state: SharedState<T>;
	#closed = false;

	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	send(value: T): void {
		if (this.#closed) {
			throw new SendError(value);
		}
		if (this.#state.receiverCount === 0) {
			throw new SendError(value);
		}

		this.#state.value = value;
		this.#state.version++;

		for (const waiter of this.#state.waiters) {
			waiter.resolve();
		}
		this.#state.waiters.clear();
	}

	sendIfModified(modify: (current: T) => boolean): boolean {
		if (this.#closed) return false;
		if (this.#state.receiverCount === 0) return false;

		if (!modify(this.#state.value)) return false;

		this.#state.version++;
		for (const waiter of this.#state.waiters) {
			waiter.resolve();
		}
		this.#state.waiters.clear();
		return true;
	}

	borrow(): T {
		return this.#state.value;
	}

	subscribe(): WatchReceiver<T> {
		this.#state.receiverCount++;
		return new WatchReceiver(this.#state, this.#state.version);
	}

	isClosed(): boolean {
		return this.#state.receiverCount === 0;
	}

	close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#state.senderClosed = true;

		for (const waiter of this.#state.waiters) {
			waiter.reject(new RecvError());
		}
		this.#state.waiters.clear();
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

export class WatchReceiver<T> {
	#state: SharedState<T>;
	#lastSeenVersion: number;
	#closed = false;

	constructor(state: SharedState<T>, initialVersion: number) {
		this.#state = state;
		this.#lastSeenVersion = initialVersion;
	}

	borrow(): T {
		return this.#state.value;
	}

	borrowAndUpdate(): T {
		this.#lastSeenVersion = this.#state.version;
		return this.#state.value;
	}

	changed(): Promise<void> {
		if (this.#state.senderClosed) {
			return Promise.reject(new RecvError());
		}
		if (this.#state.version !== this.#lastSeenVersion) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const waiter: Waiter = { resolve, reject };
			this.#state.waiters.add(waiter);
		});
	}

	clone(): WatchReceiver<T> {
		this.#state.receiverCount++;
		return new WatchReceiver(this.#state, this.#lastSeenVersion);
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
}
