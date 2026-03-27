// ============================================================================
// Errors
// ============================================================================

/** Error returned when awaiting a JoinHandle for a task that was aborted or threw. */
export class JoinError extends Error {
	/** True if the task was cancelled via `abort()`. */
	readonly cancelled: boolean;

	constructor(
		message: string,
		options?: { cancelled?: boolean; cause?: unknown },
	) {
		super(message, { cause: options?.cause });
		this.name = "JoinError";
		this.cancelled = options?.cancelled ?? false;
	}
}

// ============================================================================
// JoinHandle
// ============================================================================

/**
 * Handle to a spawned task. Implements `PromiseLike` so it can be awaited directly.
 *
 * ```typescript
 * const handle = spawn(async (signal) => {
 *   return 42;
 * });
 * const result = await handle; // 42
 * ```
 */
export class JoinHandle<T> implements PromiseLike<T> {
	readonly #promise: Promise<T>;
	readonly #controller: AbortController;
	#finished = false;

	/** The AbortSignal passed to the spawned function. */
	get signal(): AbortSignal {
		return this.#controller.signal;
	}

	/** @internal */
	constructor(promise: Promise<T>, controller: AbortController) {
		this.#promise = promise;
		this.#controller = controller;

		// Track completion.
		this.#promise.then(
			() => {
				this.#finished = true;
			},
			() => {
				this.#finished = true;
			},
		);
	}

	then<TResult1 = T, TResult2 = never>(
		onfulfilled?:
			| ((value: T) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?:
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| null,
	): Promise<TResult1 | TResult2> {
		return this.#promise.then(onfulfilled, onrejected);
	}

	/** Request cancellation. Fires the AbortSignal passed to the task. */
	abort(): void {
		this.#controller.abort();
	}

	/** Check if the task has finished (resolved or rejected). */
	isFinished(): boolean {
		return this.#finished;
	}
}

// ============================================================================
// JoinSet
// ============================================================================

/**
 * A collection of spawned tasks. Manages multiple JoinHandles and allows
 * awaiting tasks in completion order.
 *
 * ```typescript
 * const set = new JoinSet<number>();
 * set.spawn(async () => 1);
 * set.spawn(async () => 2);
 *
 * while (set.size > 0) {
 *   const result = await set.joinNext();
 *   console.log(result);
 * }
 * ```
 */
export class JoinSet<T> {
	#handles = new Set<JoinHandle<T>>();
	#settled: Array<{ handle: JoinHandle<T>; result: PromiseSettledResult<T> }> =
		[];
	#joinWaiters: Array<{
		resolve: (
			entry: { handle: JoinHandle<T>; result: PromiseSettledResult<T> } | null,
		) => void;
	}> = [];

	/** Number of tasks in the set (not yet joined). */
	get size(): number {
		return this.#handles.size;
	}

	/** Spawn a new task and add it to the set. */
	spawn(fn: (signal: AbortSignal) => Promise<T>): JoinHandle<T> {
		const handle = spawn(fn);
		this.#handles.add(handle);

		// When the task settles, record it and wake a joinNext waiter if any.
		handle.then(
			(value) => {
				this.#onSettled(handle, { status: "fulfilled", value });
			},
			(reason) => {
				this.#onSettled(handle, { status: "rejected", reason });
			},
		);

		return handle;
	}

	#onSettled(
		handle: JoinHandle<T>,
		result: PromiseSettledResult<T>,
	): void {
		if (!this.#handles.has(handle)) return;
		this.#handles.delete(handle);

		// If someone is waiting in joinNext, deliver directly.
		if (this.#joinWaiters.length > 0) {
			const waiter = this.#joinWaiters.shift()!;
			waiter.resolve({ handle, result });
			return;
		}

		// Otherwise queue for the next joinNext call.
		this.#settled.push({ handle, result });
	}

	/**
	 * Wait for the next task to complete.
	 * Returns `null` when the set is empty.
	 * Rejects with `JoinError` if the completed task threw.
	 */
	async joinNext(): Promise<T | null> {
		// Return from settled queue.
		if (this.#settled.length > 0) {
			const entry = this.#settled.shift()!;
			return unwrapSettledResult(entry.result);
		}

		// No more tasks.
		if (this.#handles.size === 0) return null;

		// Wait for next completion.
		const entry = await new Promise<{
			handle: JoinHandle<T>;
			result: PromiseSettledResult<T>;
		} | null>((resolve) => {
			this.#joinWaiters.push({ resolve });
		});

		if (entry === null) return null;
		return unwrapSettledResult(entry.result);
	}

	/** Abort all tasks in the set. */
	abortAll(): void {
		for (const handle of this.#handles) {
			handle.abort();
		}
	}

	async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		while (this.#handles.size > 0 || this.#settled.length > 0) {
			const value = await this.joinNext();
			if (value === null) return;
			yield value;
		}
	}

	[Symbol.dispose](): void {
		this.abortAll();
	}
}

function unwrapSettledResult<T>(result: PromiseSettledResult<T>): T {
	if (result.status === "fulfilled") return result.value;
	throw result.reason;
}

// ============================================================================
// spawn / yieldNow
// ============================================================================

/**
 * Spawn a concurrent task. The function receives an AbortSignal for
 * cooperative cancellation.
 *
 * The task begins executing on the next microtask, not synchronously.
 * This matches Tokio's behavior where `spawn` returns immediately.
 *
 * ```typescript
 * const handle = spawn(async (signal) => {
 *   const res = await fetch(url, { signal });
 *   return res.json();
 * });
 * const data = await handle;
 * ```
 */
export function spawn<T>(
	fn: (signal: AbortSignal) => Promise<T>,
): JoinHandle<T> {
	const controller = new AbortController();

	// Defer execution so the handle is returned before the task body runs.
	const promise = Promise.resolve()
		.then(() => fn(controller.signal))
		.then(
			(value) => {
				if (controller.signal.aborted) {
					throw new JoinError("Task was aborted", { cancelled: true });
				}
				return value;
			},
			(err) => {
				if (controller.signal.aborted) {
					throw new JoinError("Task was aborted", {
						cancelled: true,
						cause: err,
					});
				}
				throw new JoinError("Task failed", { cause: err });
			},
		);

	return new JoinHandle(promise, controller);
}

/**
 * Yield control back to the event loop. Other pending microtasks
 * and macrotasks get a chance to run.
 *
 * Uses `setTimeout(0)` to yield to the macrotask queue, matching
 * Tokio's `yield_now()` which yields to the scheduler.
 */
export function yieldNow(): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
