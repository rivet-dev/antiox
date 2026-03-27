export class RecvError extends Error {
	constructor() {
		super("Channel closed without sending a value");
		this.name = "RecvError";
	}
}

export class SendError<T> extends Error {
	readonly value: T;

	constructor(value: T) {
		super("Failed to send: receiver is closed");
		this.name = "SendError";
		this.value = value;
	}
}

interface SharedState<T> {
	value: T | undefined;
	sent: boolean;
	senderClosed: boolean;
	receiverClosed: boolean;
	resolve: ((value: T) => void) | undefined;
	reject: ((error: RecvError) => void) | undefined;
	closedResolve: (() => void) | undefined;
}

export function oneshot<T>(): [OneshotSender<T>, OneshotReceiver<T>] {
	const state: SharedState<T> = {
		value: undefined,
		sent: false,
		senderClosed: false,
		receiverClosed: false,
		resolve: undefined,
		reject: undefined,
		closedResolve: undefined,
	};

	return [new OneshotSender(state), new OneshotReceiver(state)];
}

export class OneshotSender<T> {
	#state: SharedState<T>;
	#dropped = false;

	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	send(value: T): void {
		if (this.#dropped) {
			throw new SendError(value);
		}
		if (this.#state.sent) {
			throw new SendError(value);
		}
		if (this.#state.receiverClosed) {
			throw new SendError(value);
		}

		this.#state.value = value;
		this.#state.sent = true;
		this.#state.senderClosed = true;

		if (this.#state.resolve) {
			this.#state.resolve(value);
			this.#state.resolve = undefined;
			this.#state.reject = undefined;
		}
	}

	isClosed(): boolean {
		return this.#state.receiverClosed;
	}

	closed(): Promise<void> {
		if (this.#state.receiverClosed) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.#state.closedResolve = resolve;
		});
	}

	[Symbol.dispose](): void {
		if (this.#dropped) {
			return;
		}
		this.#dropped = true;
		this.#state.senderClosed = true;

		if (!this.#state.sent && this.#state.reject) {
			this.#state.reject(new RecvError());
			this.#state.resolve = undefined;
			this.#state.reject = undefined;
		}
	}
}

export class OneshotReceiver<T> implements PromiseLike<T> {
	#state: SharedState<T>;
	#promise: Promise<T> | undefined;
	#dropped = false;

	constructor(state: SharedState<T>) {
		this.#state = state;
	}

	#getPromise(): Promise<T> {
		if (!this.#promise) {
			if (this.#state.sent) {
				this.#promise = Promise.resolve(this.#state.value as T);
			} else if (this.#state.senderClosed) {
				this.#promise = Promise.reject(new RecvError());
			} else {
				this.#promise = new Promise<T>((resolve, reject) => {
					this.#state.resolve = resolve;
					this.#state.reject = reject;
				});
			}
		}
		return this.#promise;
	}

	then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined,
	): Promise<TResult1 | TResult2> {
		return this.#getPromise().then(onfulfilled, onrejected);
	}

	tryRecv(): T {
		if (this.#state.sent) {
			return this.#state.value as T;
		}
		throw new RecvError();
	}

	close(): void {
		if (this.#state.receiverClosed) {
			return;
		}
		this.#state.receiverClosed = true;

		if (this.#state.closedResolve) {
			this.#state.closedResolve();
			this.#state.closedResolve = undefined;
		}
	}

	[Symbol.dispose](): void {
		if (this.#dropped) {
			return;
		}
		this.#dropped = true;
		this.close();
	}
}
