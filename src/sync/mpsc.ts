// ============================================================================
// Errors
// ============================================================================

/** Thrown when sending on a channel whose receiver has been closed. */
export class SendError<T> extends Error {
	readonly value: T;
	constructor(value: T) {
		super("Channel closed");
		this.name = "SendError";
		this.value = value;
	}
}

export type TrySendErrorKind = "full" | "closed";

/** Thrown by `trySend` when the send cannot complete immediately. */
export class TrySendError<T> extends Error {
	readonly kind: TrySendErrorKind;
	readonly value: T;
	constructor(kind: TrySendErrorKind, value: T) {
		super(kind === "full" ? "Channel full" : "Channel closed");
		this.name = "TrySendError";
		this.kind = kind;
		this.value = value;
	}
}

export type TryRecvErrorKind = "empty" | "disconnected";

/** Thrown by `tryRecv` when the receive cannot complete immediately. */
export class TryRecvError extends Error {
	readonly kind: TryRecvErrorKind;
	constructor(kind: TryRecvErrorKind) {
		super(
			kind === "empty" ? "Channel empty" : "Channel disconnected",
		);
		this.name = "TryRecvError";
		this.kind = kind;
	}
}

// ============================================================================
// Internal shared state
// ============================================================================

/** Simple ring buffer for O(1) push/shift. */
class Deque<T> {
	#buf: (T | undefined)[];
	#head = 0;
	#len = 0;

	constructor(capacity: number) {
		this.#buf = new Array(Math.max(capacity, 4));
	}

	get length(): number {
		return this.#len;
	}

	isEmpty(): boolean {
		return this.#len === 0;
	}

	push(value: T): void {
		if (this.#len === this.#buf.length) {
			this.#grow();
		}
		const idx = (this.#head + this.#len) % this.#buf.length;
		this.#buf[idx] = value;
		this.#len++;
	}

	shift(): T | undefined {
		if (this.#len === 0) return undefined;
		const value = this.#buf[this.#head];
		this.#buf[this.#head] = undefined;
		this.#head = (this.#head + 1) % this.#buf.length;
		this.#len--;
		return value;
	}

	#grow(): void {
		const newBuf = new Array(this.#buf.length * 2);
		for (let i = 0; i < this.#len; i++) {
			newBuf[i] = this.#buf[(this.#head + i) % this.#buf.length];
		}
		this.#buf = newBuf;
		this.#head = 0;
	}
}

interface SendWaiter<T> {
	value: T;
	resolve: () => void;
	reject: (err: SendError<T>) => void;
}

interface RecvWaiter<T> {
	resolve: (value: T | null) => void;
}

interface ClosedWaiter {
	resolve: () => void;
}

interface ChannelState<T> {
	buffer: Deque<T>;
	capacity: number; // -1 for unbounded
	closed: boolean;
	senderCount: number;
	sendWaiters: Deque<SendWaiter<T>>;
	recvWaiters: Deque<RecvWaiter<T>>;
	closedWaiters: Deque<ClosedWaiter>;
}

function createState<T>(capacity: number): ChannelState<T> {
	return {
		buffer: new Deque(capacity === -1 ? 16 : capacity),
		capacity,
		closed: false,
		senderCount: 1,
		sendWaiters: new Deque(4),
		recvWaiters: new Deque(4),
		closedWaiters: new Deque(4),
	};
}

/** Wake all recv waiters with null (channel fully disconnected). */
function wakeRecvWaitersWithNull<T>(state: ChannelState<T>): void {
	while (!state.recvWaiters.isEmpty()) {
		state.recvWaiters.shift()!.resolve(null);
	}
}

/** Wake all send waiters with error (receiver closed). */
function wakeSendWaitersWithError<T>(state: ChannelState<T>): void {
	while (!state.sendWaiters.isEmpty()) {
		const waiter = state.sendWaiters.shift()!;
		waiter.reject(new SendError(waiter.value));
	}
}

/** Wake all closed() waiters. */
function wakeClosedWaiters<T>(state: ChannelState<T>): void {
	while (!state.closedWaiters.isEmpty()) {
		state.closedWaiters.shift()!.resolve();
	}
}

/** Try to move a value from sendWaiters into the buffer or directly to a recv waiter. */
function drainOneSendWaiter<T>(state: ChannelState<T>): void {
	if (state.sendWaiters.isEmpty()) return;
	const waiter = state.sendWaiters.shift()!;
	if (state.closed) {
		waiter.reject(new SendError(waiter.value));
		return;
	}
	state.buffer.push(waiter.value);
	waiter.resolve();
}

// ============================================================================
// Bounded channel
// ============================================================================

/** Sending half of a bounded MPSC channel. */
export class Sender<T> {
	#state: ChannelState<T>;
	#dropped = false;

	/** @internal */
	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	/**
	 * Send a value, waiting if the channel is at capacity.
	 * Throws `SendError` if the receiver has been closed.
	 */
	async send(value: T): Promise<void> {
		const s = this.#state;
		if (this.#dropped) throw new SendError(value);
		if (s.closed) throw new SendError(value);

		// If a receiver is waiting, deliver directly.
		if (!s.recvWaiters.isEmpty()) {
			s.recvWaiters.shift()!.resolve(value);
			return;
		}

		// If buffer has space, enqueue.
		if (s.buffer.length < s.capacity) {
			s.buffer.push(value);
			return;
		}

		// Buffer full. Park until space opens or receiver closes.
		return new Promise<void>((resolve, reject) => {
			s.sendWaiters.push({ value, resolve, reject });
		});
	}

	/**
	 * Try to send without waiting.
	 * Throws `TrySendError` with kind `"full"` if at capacity,
	 * or `"closed"` if the receiver has been closed.
	 */
	trySend(value: T): void {
		const s = this.#state;
		if (this.#dropped || s.closed) throw new TrySendError("closed", value);

		// Deliver directly to a waiting receiver.
		if (!s.recvWaiters.isEmpty()) {
			s.recvWaiters.shift()!.resolve(value);
			return;
		}

		if (s.buffer.length >= s.capacity) throw new TrySendError("full", value);
		s.buffer.push(value);
	}

	/** Returns a promise that resolves when the receiver is closed. */
	closed(): Promise<void> {
		const s = this.#state;
		if (s.closed) return Promise.resolve();
		return new Promise<void>((resolve) => {
			s.closedWaiters.push({ resolve });
		});
	}

	/** Check synchronously whether the receiver has been closed. */
	isClosed(): boolean {
		return this.#state.closed;
	}

	/** Remaining buffer capacity. */
	capacity(): number {
		return this.#state.capacity - this.#state.buffer.length;
	}

	/** Clone this sender. The new sender shares the same channel. */
	clone(): Sender<T> {
		if (this.#dropped) throw new Error("Cannot clone a dropped Sender");
		this.#state.senderCount++;
		return new Sender(this.#state);
	}

	/** Drop this sender. When all senders are dropped, the receiver sees null. */
	close(): void {
		if (this.#dropped) return;
		this.#dropped = true;
		this.#state.senderCount--;
		if (this.#state.senderCount === 0 && this.#state.buffer.isEmpty()) {
			wakeRecvWaitersWithNull(this.#state);
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

/** Receiving half of a bounded MPSC channel. */
export class Receiver<T> {
	#state: ChannelState<T>;
	#closed = false;

	/** @internal */
	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	/**
	 * Receive the next value.
	 * Returns `null` when all senders have been dropped and the buffer is drained.
	 */
	async recv(): Promise<T | null> {
		const s = this.#state;

		// Drain from buffer first.
		if (!s.buffer.isEmpty()) {
			const value = s.buffer.shift() as T;
			// Unblock a waiting sender now that there's space.
			drainOneSendWaiter(s);
			return value;
		}

		// Buffer empty. If all senders gone, we're done.
		if (s.senderCount === 0) return null;

		// If the receiver itself is closed and buffer is drained, done.
		if (this.#closed) return null;

		// Park until a value arrives or all senders drop.
		return new Promise<T | null>((resolve) => {
			s.recvWaiters.push({ resolve });
		});
	}

	/**
	 * Try to receive without waiting.
	 * Throws `TryRecvError` with kind `"empty"` if no messages are buffered,
	 * or `"disconnected"` if all senders have been dropped and buffer is drained.
	 */
	tryRecv(): T {
		const s = this.#state;

		if (!s.buffer.isEmpty()) {
			const value = s.buffer.shift() as T;
			drainOneSendWaiter(s);
			return value;
		}

		if (s.senderCount === 0) throw new TryRecvError("disconnected");
		throw new TryRecvError("empty");
	}

	/**
	 * Close the receiver. Prevents new sends but allows draining buffered messages.
	 */
	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#state.closed = true;
		wakeSendWaitersWithError(this.#state);
		wakeClosedWaiters(this.#state);
	}

	async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			const value = await this.recv();
			if (value === null) return;
			yield value;
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

/**
 * Create a bounded MPSC channel with the given capacity.
 *
 * ```typescript
 * const [tx, rx] = channel<string>(32);
 * await tx.send("hello");
 * const msg = await rx.recv(); // "hello"
 * ```
 */
export function channel<T>(capacity: number): [Sender<T>, Receiver<T>] {
	if (capacity < 1) throw new RangeError("Channel capacity must be >= 1");
	const state = createState<T>(capacity);
	return [new Sender(state), new Receiver(state)];
}

// ============================================================================
// Unbounded channel
// ============================================================================

/** Sending half of an unbounded MPSC channel. */
export class UnboundedSender<T> {
	#state: ChannelState<T>;
	#dropped = false;

	/** @internal */
	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	/**
	 * Send a value. Never blocks.
	 * Throws `SendError` if the receiver has been closed.
	 */
	send(value: T): void {
		if (this.#dropped) throw new SendError(value);
		if (this.#state.closed) throw new SendError(value);

		// Deliver directly to a waiting receiver.
		if (!this.#state.recvWaiters.isEmpty()) {
			this.#state.recvWaiters.shift()!.resolve(value);
			return;
		}

		this.#state.buffer.push(value);
	}

	/** Returns a promise that resolves when the receiver is closed. */
	closed(): Promise<void> {
		if (this.#state.closed) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.#state.closedWaiters.push({ resolve });
		});
	}

	/** Check synchronously whether the receiver has been closed. */
	isClosed(): boolean {
		return this.#state.closed;
	}

	/** Clone this sender. The new sender shares the same channel. */
	clone(): UnboundedSender<T> {
		if (this.#dropped) throw new Error("Cannot clone a dropped UnboundedSender");
		this.#state.senderCount++;
		return new UnboundedSender(this.#state);
	}

	/** Drop this sender. When all senders are dropped, the receiver sees null. */
	close(): void {
		if (this.#dropped) return;
		this.#dropped = true;
		this.#state.senderCount--;
		if (this.#state.senderCount === 0 && this.#state.buffer.isEmpty()) {
			wakeRecvWaitersWithNull(this.#state);
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

/** Receiving half of an unbounded MPSC channel. */
export class UnboundedReceiver<T> {
	#state: ChannelState<T>;
	#closed = false;

	/** @internal */
	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	/**
	 * Receive the next value.
	 * Returns `null` when all senders have been dropped and the buffer is drained.
	 */
	async recv(): Promise<T | null> {
		const s = this.#state;

		if (!s.buffer.isEmpty()) {
			return s.buffer.shift() as T;
		}

		if (s.senderCount === 0) return null;
		if (this.#closed) return null;

		return new Promise<T | null>((resolve) => {
			s.recvWaiters.push({ resolve });
		});
	}

	/**
	 * Try to receive without waiting.
	 * Throws `TryRecvError` with kind `"empty"` if no messages are buffered,
	 * or `"disconnected"` if all senders have been dropped and buffer is drained.
	 */
	tryRecv(): T {
		const s = this.#state;

		if (!s.buffer.isEmpty()) {
			return s.buffer.shift() as T;
		}

		if (s.senderCount === 0) throw new TryRecvError("disconnected");
		throw new TryRecvError("empty");
	}

	/** Close the receiver. Prevents new sends but allows draining buffered messages. */
	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#state.closed = true;
		wakeSendWaitersWithError(this.#state);
		wakeClosedWaiters(this.#state);
	}

	async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (true) {
			const value = await this.recv();
			if (value === null) return;
			yield value;
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

/**
 * Create an unbounded MPSC channel.
 *
 * ```typescript
 * const [tx, rx] = unboundedChannel<number>();
 * tx.send(42); // sync, never blocks
 * const msg = await rx.recv(); // 42
 * ```
 */
export function unboundedChannel<T>(): [UnboundedSender<T>, UnboundedReceiver<T>] {
	const state = createState<T>(-1);
	return [new UnboundedSender(state), new UnboundedReceiver(state)];
}
