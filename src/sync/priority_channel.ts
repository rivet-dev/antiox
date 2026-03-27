import { BinaryHeap } from "../collections/binary_heap";

// ============================================================================
// Errors
// ============================================================================

/** Thrown when sending on a closed priority channel. */
export class SendError<T> extends Error {
	readonly value: T;
	constructor(value: T) {
		super("Priority channel closed");
		this.name = "SendError";
		this.value = value;
	}
}

/** Thrown by tryRecv when no message is available or channel is disconnected. */
export class TryRecvError extends Error {
	readonly kind: "empty" | "disconnected";
	constructor(kind: "empty" | "disconnected") {
		super(kind === "empty" ? "Channel empty" : "Channel disconnected");
		this.name = "TryRecvError";
		this.kind = kind;
	}
}

// ============================================================================
// Internal state
// ============================================================================

interface RecvWaiter<T> {
	resolve: (value: T | null) => void;
}

interface PriorityChannelState<T> {
	heap: BinaryHeap<T>;
	closed: boolean;
	senderCount: number;
	recvWaiters: Array<RecvWaiter<T>>;
}

// ============================================================================
// Priority channel
// ============================================================================

/**
 * Create a priority channel. Messages are received in priority order
 * (highest priority first, determined by the comparator).
 *
 * Unlike a regular mpsc channel, this is unbounded and priority-ordered.
 *
 * @param compare - Comparator function. Positive return means `a` has higher
 *   priority. Defaults to max-ordering for numbers/strings.
 */
export function priorityChannel<T>(
	compare?: (a: T, b: T) => number,
): [PrioritySender<T>, PriorityReceiver<T>] {
	const state: PriorityChannelState<T> = {
		heap: new BinaryHeap(compare),
		closed: false,
		senderCount: 1,
		recvWaiters: [],
	};
	return [new PrioritySender(state), new PriorityReceiver(state)];
}

/** Sending half of a priority channel. */
export class PrioritySender<T> {
	#state: PriorityChannelState<T>;
	#dropped = false;

	/** @internal */
	constructor(state: PriorityChannelState<T>) {
		this.#state = state;
	}

	/** Send a value. Never blocks. Throws `SendError` if receiver closed. */
	send(value: T): void {
		if (this.#dropped) throw new SendError(value);
		if (this.#state.closed) throw new SendError(value);

		// If a receiver is waiting, we need to add to heap and give best.
		if (this.#state.recvWaiters.length > 0) {
			this.#state.heap.push(value);
			const best = this.#state.heap.pop() as T;
			this.#state.recvWaiters.shift()!.resolve(best);
			return;
		}

		this.#state.heap.push(value);
	}

	/** Check if the receiver has been closed. */
	isClosed(): boolean {
		return this.#state.closed;
	}

	/** Clone this sender. */
	clone(): PrioritySender<T> {
		if (this.#dropped) throw new Error("Cannot clone a dropped PrioritySender");
		this.#state.senderCount++;
		return new PrioritySender(this.#state);
	}

	/** Drop this sender. When all senders drop, receiver gets null. */
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

/** Receiving half of a priority channel. Messages arrive in priority order. */
export class PriorityReceiver<T> {
	#state: PriorityChannelState<T>;
	#closed = false;

	/** @internal */
	constructor(state: PriorityChannelState<T>) {
		this.#state = state;
	}

	/**
	 * Receive the highest-priority value.
	 * Returns null when all senders dropped and heap is empty.
	 */
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

	/**
	 * Try to receive without waiting.
	 * Throws TryRecvError if empty or disconnected.
	 */
	tryRecv(): T {
		if (!this.#state.heap.isEmpty()) {
			return this.#state.heap.pop() as T;
		}
		if (this.#state.senderCount === 0) throw new TryRecvError("disconnected");
		throw new TryRecvError("empty");
	}

	/** Close the receiver. */
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
