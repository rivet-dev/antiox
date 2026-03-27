import { Semaphore } from "./sync/semaphore";
import { unboundedChannel } from "./sync/mpsc";
import { sleep as timeSleep, TimeoutError } from "./time";

// ============================================================================
// Transform
// ============================================================================

/** Apply a synchronous transform to each element. */
export async function* map<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => U,
): AsyncIterable<U> {
	for await (const item of source) {
		yield fn(item);
	}
}

/** Apply an async transform to each element. Named `andThen` to avoid JS thenable conflicts. */
export async function* andThen<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => Promise<U>,
): AsyncIterable<U> {
	for await (const item of source) {
		yield await fn(item);
	}
}

/** Filter and map in one pass. Items where fn returns null/undefined are skipped. */
export async function* filterMap<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => U | null | undefined,
): AsyncIterable<U> {
	for await (const item of source) {
		const result = fn(item);
		if (result != null) {
			yield result;
		}
	}
}

/** Flatten nested async iterables into a single stream. */
export async function* flatten<T>(
	source: AsyncIterable<AsyncIterable<T>>,
): AsyncIterable<T> {
	for await (const inner of source) {
		yield* inner;
	}
}

// ============================================================================
// Filter
// ============================================================================

/** Keep only elements matching the predicate. */
export async function* filter<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => boolean,
): AsyncIterable<T> {
	for await (const item of source) {
		if (fn(item)) {
			yield item;
		}
	}
}

/** Yield the first n elements. */
export async function* take<T>(
	source: AsyncIterable<T>,
	n: number,
): AsyncIterable<T> {
	let count = 0;
	for await (const item of source) {
		if (count >= n) return;
		yield item;
		count++;
	}
}

/** Skip the first n elements. */
export async function* skip<T>(
	source: AsyncIterable<T>,
	n: number,
): AsyncIterable<T> {
	let count = 0;
	for await (const item of source) {
		if (count < n) {
			count++;
			continue;
		}
		yield item;
	}
}

/** Yield elements while the predicate returns true, then stop. */
export async function* takeWhile<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => boolean,
): AsyncIterable<T> {
	for await (const item of source) {
		if (!fn(item)) return;
		yield item;
	}
}

/** Skip elements while the predicate returns true, then yield the rest. */
export async function* skipWhile<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => boolean,
): AsyncIterable<T> {
	let skipping = true;
	for await (const item of source) {
		if (skipping) {
			if (fn(item)) continue;
			skipping = false;
		}
		yield item;
	}
}

// ============================================================================
// Concurrency
// ============================================================================

/**
 * Run up to `concurrency` promises concurrently, yielding results in
 * completion order. The source must yield promises.
 */
export function bufferUnordered<T>(
	source: AsyncIterable<PromiseLike<T>>,
	concurrency: number,
): AsyncIterable<T> {
	const [tx, rx] = unboundedChannel<{ ok: true; value: T } | { ok: false; error: unknown }>();
	const sem = new Semaphore(concurrency);

	let sourceExhausted = false;
	let inFlight = 0;

	const drainSource = async () => {
		try {
			for await (const promise of source) {
				const permit = await sem.acquire();
				inFlight++;
				Promise.resolve(promise).then(
					(value: T) => {
						permit.release();
						inFlight--;
						tx.send({ ok: true, value });
						if (sourceExhausted && inFlight === 0) tx.close();
					},
					(error: unknown) => {
						permit.release();
						inFlight--;
						tx.send({ ok: false, error });
						if (sourceExhausted && inFlight === 0) tx.close();
					},
				);
			}
		} finally {
			sourceExhausted = true;
			if (inFlight === 0) tx.close();
		}
	};

	void drainSource();

	return (async function* () {
		for await (const result of rx) {
			if (result.ok) {
				yield result.value;
			} else {
				throw result.error;
			}
		}
	})();
}

/**
 * Run up to `concurrency` promises concurrently, yielding results in
 * source order. The source must yield promises.
 */
export function buffered<T>(
	source: AsyncIterable<PromiseLike<T>>,
	concurrency: number,
): AsyncIterable<T> {
	const [tx, rx] = unboundedChannel<{ index: number; ok: true; value: T } | { index: number; ok: false; error: unknown }>();
	const sem = new Semaphore(concurrency);

	let sourceExhausted = false;
	let inFlight = 0;
	let nextIndex = 0;

	const drainSource = async () => {
		try {
			for await (const promise of source) {
				const permit = await sem.acquire();
				const idx = nextIndex++;
				inFlight++;
				Promise.resolve(promise).then(
					(value: T) => {
						permit.release();
						inFlight--;
						tx.send({ index: idx, ok: true, value });
						if (sourceExhausted && inFlight === 0) tx.close();
					},
					(error: unknown) => {
						permit.release();
						inFlight--;
						tx.send({ index: idx, ok: false, error });
						if (sourceExhausted && inFlight === 0) tx.close();
					},
				);
			}
		} finally {
			sourceExhausted = true;
			if (inFlight === 0) tx.close();
		}
	};

	void drainSource();

	return (async function* () {
		const pending = new Map<number, { ok: true; value: T } | { ok: false; error: unknown }>();
		let emitIndex = 0;

		for await (const result of rx) {
			pending.set(result.index, result);

			while (pending.has(emitIndex)) {
				const item = pending.get(emitIndex)!;
				pending.delete(emitIndex);
				emitIndex++;
				if (item.ok) {
					yield item.value;
				} else {
					throw item.error;
				}
			}
		}
	})();
}

// ============================================================================
// Combine
// ============================================================================

/** Interleave elements from multiple sources in completion order. */
export function merge<T>(
	...sources: AsyncIterable<T>[]
): AsyncIterable<T> {
	const [tx, rx] = unboundedChannel<T>();
	let remaining = sources.length;

	if (remaining === 0) {
		tx.close();
		return rx;
	}

	for (const source of sources) {
		void (async () => {
			try {
				for await (const item of source) {
					try {
						tx.send(item);
					} catch {
						return;
					}
				}
			} finally {
				remaining--;
				if (remaining === 0) tx.close();
			}
		})();
	}

	return rx;
}

/** Concatenate sources sequentially. */
export async function* chain<T>(
	...sources: AsyncIterable<T>[]
): AsyncIterable<T> {
	for (const source of sources) {
		yield* source;
	}
}

/** Pair elements from two sources. Stops when either is exhausted. */
export async function* zip<T, U>(
	a: AsyncIterable<T>,
	b: AsyncIterable<U>,
): AsyncIterable<[T, U]> {
	const iterA = a[Symbol.asyncIterator]();
	const iterB = b[Symbol.asyncIterator]();

	try {
		while (true) {
			const [resultA, resultB] = await Promise.all([
				iterA.next(),
				iterB.next(),
			]);
			if (resultA.done || resultB.done) return;
			yield [resultA.value, resultB.value];
		}
	} finally {
		await iterA.return?.();
		await iterB.return?.();
	}
}

// ============================================================================
// Batch
// ============================================================================

/** Group elements into arrays of the given size. The last chunk may be smaller. */
export async function* chunks<T>(
	source: AsyncIterable<T>,
	size: number,
): AsyncIterable<T[]> {
	let chunk: T[] = [];
	for await (const item of source) {
		chunk.push(item);
		if (chunk.length >= size) {
			yield chunk;
			chunk = [];
		}
	}
	if (chunk.length > 0) {
		yield chunk;
	}
}

// ============================================================================
// Rate
// ============================================================================

/** Rate-limit: yield at most one element per `ms` milliseconds. */
export async function* throttle<T>(
	source: AsyncIterable<T>,
	ms: number,
): AsyncIterable<T> {
	let lastYield = 0;
	for await (const item of source) {
		const now = Date.now();
		const elapsed = now - lastYield;
		if (elapsed < ms) {
			await timeSleep(ms - elapsed);
		}
		lastYield = Date.now();
		yield item;
	}
}

/** Per-item timeout: throw TimeoutError if the source takes longer than `ms` to yield. */
export async function* timeout<T>(
	source: AsyncIterable<T>,
	ms: number,
): AsyncIterable<T> {
	const iter = source[Symbol.asyncIterator]();
	try {
		while (true) {
			const result = await Promise.race([
				iter.next(),
				timeSleep(ms).then(() => {
					throw new TimeoutError();
				}),
			]);
			if (result.done) return;
			yield result.value;
		}
	} finally {
		await iter.return?.();
	}
}

// ============================================================================
// Consume
// ============================================================================

/** Collect all elements into an array. */
export async function collect<T>(
	source: AsyncIterable<T>,
): Promise<T[]> {
	const result: T[] = [];
	for await (const item of source) {
		result.push(item);
	}
	return result;
}

/** Reduce elements to a single value. */
export async function fold<T, U>(
	source: AsyncIterable<T>,
	init: U,
	fn: (acc: U, item: T) => U,
): Promise<U> {
	let acc = init;
	for await (const item of source) {
		acc = fn(acc, item);
	}
	return acc;
}

// ============================================================================
// Debug
// ============================================================================

/** Execute a side effect for each element without modifying the stream. */
export async function* tap<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => void,
): AsyncIterable<T> {
	for await (const item of source) {
		fn(item);
		yield item;
	}
}

// ============================================================================
// Composition
// ============================================================================

type StreamOp<I = any, O = any> = (source: AsyncIterable<I>) => AsyncIterable<O>;

/** Compose multiple stream operators left-to-right. */
export function pipe<T>(source: AsyncIterable<T>, ...fns: StreamOp[]): AsyncIterable<any> {
	return fns.reduce((acc, fn) => fn(acc), source as AsyncIterable<any>);
}
