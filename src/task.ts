export class JoinError extends Error {
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

export class JoinHandle<T> implements PromiseLike<T> {
	readonly #promise: Promise<T>;
	readonly #controller: AbortController;
	#finished = false;

	get signal(): AbortSignal {
		return this.#controller.signal;
	}

	constructor(promise: Promise<T>, controller: AbortController) {
		this.#promise = promise;
		this.#controller = controller;

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

	abort(): void {
		this.#controller.abort();
	}

	isFinished(): boolean {
		return this.#finished;
	}
}

export class JoinSet<T> {
	#handles = new Set<JoinHandle<T>>();
	#settled: Array<{ handle: JoinHandle<T>; result: PromiseSettledResult<T> }> =
		[];
	#joinWaiters: Array<{
		resolve: (
			entry: { handle: JoinHandle<T>; result: PromiseSettledResult<T> } | null,
		) => void;
	}> = [];

	get size(): number {
		return this.#handles.size;
	}

	spawn(fn: (signal: AbortSignal) => Promise<T>): JoinHandle<T> {
		const handle = spawn(fn);
		this.#handles.add(handle);

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

		if (this.#joinWaiters.length > 0) {
			const waiter = this.#joinWaiters.shift()!;
			waiter.resolve({ handle, result });
			return;
		}

		this.#settled.push({ handle, result });
	}

	async joinNext(): Promise<T | null> {
		if (this.#settled.length > 0) {
			const entry = this.#settled.shift()!;
			return unwrapSettledResult(entry.result);
		}

		if (this.#handles.size === 0) return null;

		const entry = await new Promise<{
			handle: JoinHandle<T>;
			result: PromiseSettledResult<T>;
		} | null>((resolve) => {
			this.#joinWaiters.push({ resolve });
		});

		if (entry === null) return null;
		return unwrapSettledResult(entry.result);
	}

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

export function spawn<T>(
	fn: (signal: AbortSignal) => Promise<T>,
): JoinHandle<T> {
	const controller = new AbortController();

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

export function yieldNow(): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function joinAll<T>(
	handles: JoinHandle<T>[],
): Promise<T[]> {
	const results = await Promise.allSettled(handles.map((h) => h.then((v) => v)));
	return results.map((r) => {
		if (r.status === "fulfilled") return r.value;
		throw r.reason;
	});
}

export async function tryJoinAll<T>(
	handles: JoinHandle<T>[],
): Promise<T[]> {
	const results: T[] = new Array(handles.length);
	let firstError: unknown = undefined;
	let hasError = false;

	const wrapped = handles.map((handle, i) =>
		handle.then(
			(value) => {
				results[i] = value;
			},
			(err) => {
				if (!hasError) {
					hasError = true;
					firstError = err;
					for (const h of handles) {
						h.abort();
					}
				}
			},
		),
	);

	await Promise.all(wrapped);

	if (hasError) {
		throw firstError;
	}

	return results;
}
