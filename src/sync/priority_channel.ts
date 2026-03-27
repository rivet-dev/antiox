import { BinaryHeap } from "../collections/binary_heap";

export class SendError<T> extends Error {
	readonly value: T;
	constructor(value: T) {
		super("Priority channel closed");
		this.name = "SendError";
		this.value = value;
	}
}

export class TryRecvError extends Error {
	readonly kind: "empty" | "disconnected";
	constructor(kind: "empty" | "disconnected") {
		super(kind === "empty" ? "Channel empty" : "Channel disconnected");
		this.name = "TryRecvError";
		this.kind = kind;
	}
}

interface RecvWaiter<T> {
	resolve: (value: T | null) => void;
}

interface PriorityChannelState<T> {
	heap: BinaryHeap<T>;
	closed: boolean;
	senderCount: number;
	recvWaiters: Array<RecvWaiter<T>>;
}

export function channel<T>(
	compare?: (a: T, b: T) => number,
): [Sender<T>, Receiver<T>] {
	const state: PriorityChannelState<T> = {
		heap: new BinaryHeap(compare),
		closed: false,
		senderCount: 1,
		recvWaiters: [],
	};
	return [new Sender(state), new Receiver(state)];
}

export class Sender<T> {
	#state: PriorityChannelState<T>;
	#dropped = false;

	/** @internal */
	constructor(state: PriorityChannelState<T>) {
		this.#state = state;
	}

	send(value: T): void {
		if (this.#dropped) throw new SendError(value);
		if (this.#state.closed) throw new SendError(value);

		// Add to heap first so the waiter always gets the highest-priority item.
		if (this.#state.recvWaiters.length > 0) {
			this.#state.heap.push(value);
			const best = this.#state.heap.pop() as T;
			this.#state.recvWaiters.shift()!.resolve(best);
			return;
		}

		this.#state.heap.push(value);
	}

	isClosed(): boolean {
		return this.#state.closed;
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
		if (this.#state.senderCount === 0 && this.#state.heap.isEmpty()) {
			for (const waiter of this.#state.recvWaiters) {
				waiter.resolve(null);
			}
			this.#state.recvWaiters.length = 0;
		}
	}

	[Symbol.dispose](): void {
		this.close();
	}
}

export class Receiver<T> {
	#state: PriorityChannelState<T>;
	#closed = false;

	/** @internal */
	constructor(state: PriorityChannelState<T>) {
		this.#state = state;
	}

	async recv(): Promise<T | null> {
		const s = this.#state;

		if (!s.heap.isEmpty()) {
			return s.heap.pop() as T;
		}

		if (s.senderCount === 0) return null;
		if (this.#closed) return null;

		return new Promise<T | null>((resolve) => {
			s.recvWaiters.push({ resolve });
		});
	}

	tryRecv(): T {
		if (!this.#state.heap.isEmpty()) {
			return this.#state.heap.pop() as T;
		}
		if (this.#state.senderCount === 0) throw new TryRecvError("disconnected");
		throw new TryRecvError("empty");
	}

	close(): void {
		if (this.#closed) return;
		this.#closed = true;
		this.#state.closed = true;
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
