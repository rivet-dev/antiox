import { Deque } from "../internal/deque";

export class SendError<T> extends Error {
	readonly value: T;
	constructor(value: T) {
		super("Channel closed");
		this.name = "SendError";
		this.value = value;
	}
}

export type TrySendErrorKind = "full" | "closed";

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

function wakeRecvWaitersWithNull<T>(state: ChannelState<T>): void {
	while (!state.recvWaiters.isEmpty()) {
		state.recvWaiters.shift()!.resolve(null);
	}
}

function wakeSendWaitersWithError<T>(state: ChannelState<T>): void {
	while (!state.sendWaiters.isEmpty()) {
		const waiter = state.sendWaiters.shift()!;
		waiter.reject(new SendError(waiter.value));
	}
}

function wakeClosedWaiters<T>(state: ChannelState<T>): void {
	while (!state.closedWaiters.isEmpty()) {
		state.closedWaiters.shift()!.resolve();
	}
}

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

export class Sender<T> {
	#state: ChannelState<T>;
	#dropped = false;

	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	async send(value: T): Promise<void> {
		const s = this.#state;
		if (this.#dropped) throw new SendError(value);
		if (s.closed) throw new SendError(value);

		if (!s.recvWaiters.isEmpty()) {
			s.recvWaiters.shift()!.resolve(value);
			return;
		}

		if (s.buffer.length < s.capacity) {
			s.buffer.push(value);
			return;
		}

		return new Promise<void>((resolve, reject) => {
			s.sendWaiters.push({ value, resolve, reject });
		});
	}

	trySend(value: T): void {
		const s = this.#state;
		if (this.#dropped || s.closed) throw new TrySendError("closed", value);

		if (!s.recvWaiters.isEmpty()) {
			s.recvWaiters.shift()!.resolve(value);
			return;
		}

		if (s.buffer.length >= s.capacity) throw new TrySendError("full", value);
		s.buffer.push(value);
	}

	closed(): Promise<void> {
		const s = this.#state;
		if (s.closed) return Promise.resolve();
		return new Promise<void>((resolve) => {
			s.closedWaiters.push({ resolve });
		});
	}

	isClosed(): boolean {
		return this.#state.closed;
	}

	capacity(): number {
		return this.#state.capacity - this.#state.buffer.length;
	}

	clone(): Sender<T> {
		if (this.#dropped) throw new Error("Cannot clone a dropped Sender");
		this.#state.senderCount++;
		return new Sender(this.#state);
	}

	close(): void {
		if (this.#dropped) return;
		this.#dropped = true;
		this.#state.senderCount--;
		if (this.#state.senderCount === 0 && this.#state.buffer.isEmpty()) {
			wakeRecvWaitersWithNull(this.#state);
		}
	}

	async reserve(): Promise<OwnedPermit<T>> {
		const s = this.#state;
		if (this.#dropped) throw new SendError(undefined as T);
		if (s.closed) throw new SendError(undefined as T);

		if (!s.recvWaiters.isEmpty() || s.buffer.length < s.capacity) {
			return new OwnedPermit(s);
		}

		await new Promise<void>((resolve, reject) => {
			s.sendWaiters.push({ value: undefined as T, resolve, reject });
		});

		return new OwnedPermit(s);
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

export class OwnedPermit<T> {
	#state: ChannelState<T> | null;

	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	send(value: T): void {
		if (this.#state === null) throw new Error("OwnedPermit already used");
		const s = this.#state;
		this.#state = null;

		if (s.closed) throw new SendError(value);

		if (!s.recvWaiters.isEmpty()) {
			s.recvWaiters.shift()!.resolve(value);
			return;
		}

		s.buffer.push(value);
	}

	[Symbol.dispose](): void {
		this.#state = null;
	}
}

export class Receiver<T> {
	#state: ChannelState<T>;
	#closed = false;

	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	async recv(): Promise<T | null> {
		const s = this.#state;

		if (!s.buffer.isEmpty()) {
			const value = s.buffer.shift() as T;
			drainOneSendWaiter(s);
			return value;
		}

		if (s.senderCount === 0) return null;
		if (this.#closed) return null;

		return new Promise<T | null>((resolve) => {
			s.recvWaiters.push({ resolve });
		});
	}

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

export function channel<T>(capacity: number): [Sender<T>, Receiver<T>] {
	if (capacity < 1) throw new RangeError("Channel capacity must be >= 1");
	const state = createState<T>(capacity);
	return [new Sender(state), new Receiver(state)];
}

export class UnboundedSender<T> {
	#state: ChannelState<T>;
	#dropped = false;

	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

	send(value: T): void {
		if (this.#dropped) throw new SendError(value);
		if (this.#state.closed) throw new SendError(value);

		if (!this.#state.recvWaiters.isEmpty()) {
			this.#state.recvWaiters.shift()!.resolve(value);
			return;
		}

		this.#state.buffer.push(value);
	}

	closed(): Promise<void> {
		if (this.#state.closed) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.#state.closedWaiters.push({ resolve });
		});
	}

	isClosed(): boolean {
		return this.#state.closed;
	}

	clone(): UnboundedSender<T> {
		if (this.#dropped) throw new Error("Cannot clone a dropped UnboundedSender");
		this.#state.senderCount++;
		return new UnboundedSender(this.#state);
	}

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

export class UnboundedReceiver<T> {
	#state: ChannelState<T>;
	#closed = false;

	constructor(state: ChannelState<T>) {
		this.#state = state;
	}

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

	tryRecv(): T {
		const s = this.#state;

		if (!s.buffer.isEmpty()) {
			return s.buffer.shift() as T;
		}

		if (s.senderCount === 0) throw new TryRecvError("disconnected");
		throw new TryRecvError("empty");
	}

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

export function unboundedChannel<T>(): [UnboundedSender<T>, UnboundedReceiver<T>] {
	const state = createState<T>(-1);
	return [new UnboundedSender(state), new UnboundedReceiver(state)];
}
