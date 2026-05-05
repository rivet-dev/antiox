import { Semaphore } from "./sync/semaphore";
import { unboundedChannel } from "./sync/mpsc";
import { sleep as timeSleep, TimeoutError } from "./time";

export function map<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => U,
): AsyncIterable<U> {
	return {
		[Symbol.asyncIterator]() {
			const iter = source[Symbol.asyncIterator]();
			return {
				async next() {
					const { done, value } = await iter.next();
					if (done) return { done: true, value: undefined } as IteratorReturnResult<undefined>;
					return { done: false, value: fn(value) };
				},
				async return(val?: any) {
					await iter.return?.(val);
					return { done: true as const, value: undefined };
				},
			};
		},
	};
}

/** Named `andThen` to avoid JS thenable conflicts with `then`. */
export async function* andThen<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => Promise<U>,
): AsyncIterable<U> {
	for await (const item of source) {
		yield await fn(item);
	}
}

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

export async function* flatten<T>(
	source: AsyncIterable<AsyncIterable<T>>,
): AsyncIterable<T> {
	for await (const inner of source) {
		yield* inner;
	}
}

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

export async function* takeWhile<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => boolean,
): AsyncIterable<T> {
	for await (const item of source) {
		if (!fn(item)) return;
		yield item;
	}
}

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

export function bufferUnordered<T>(
	source: AsyncIterable<PromiseLike<T>>,
	concurrency: number,
): AsyncIterable<T> {
	const [tx, rx] = unboundedChannel<{ ok: true; value: T } | { ok: false; error: unknown }>();
	const sem = new Semaphore(concurrency);

	let sourceExhausted = false;
	let inFlight = 0;

	const drainSource = async () => {
		const iter = source[Symbol.asyncIterator]();
		try {
			while (true) {
				const permit = await sem.acquire();
				const { done, value: promise } = await iter.next();
				if (done) {
					permit.release();
					break;
				}
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
		const iter = source[Symbol.asyncIterator]();
		try {
			while (true) {
				const permit = await sem.acquire();
				const { done, value: promise } = await iter.next();
				if (done) {
					permit.release();
					break;
				}
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

export async function* chain<T>(
	...sources: AsyncIterable<T>[]
): AsyncIterable<T> {
	for (const source of sources) {
		yield* source;
	}
}

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

export async function collect<T>(
	source: AsyncIterable<T>,
): Promise<T[]> {
	const result: T[] = [];
	for await (const item of source) {
		result.push(item);
	}
	return result;
}

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

export async function* inspect<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => void,
): AsyncIterable<T> {
	for await (const item of source) {
		fn(item);
		yield item;
	}
}

type StreamOp<I = any, O = any> = (source: AsyncIterable<I>) => AsyncIterable<O>;

// JS has no method chaining on iterables like Rust's StreamExt trait, and the
// TC39 pipe operator proposal (|>) is stuck at Stage 2. This helper fills the gap.
export function pipe<T>(source: AsyncIterable<T>, ...fns: StreamOp[]): AsyncIterable<any> {
	return fns.reduce((acc, fn) => fn(acc), source as AsyncIterable<any>);
}

export async function* enumerate<T>(source: AsyncIterable<T>): AsyncIterable<[number, T]> {
	let index = 0;
	for await (const item of source) {
		yield [index++, item];
	}
}

export async function* scan<T, U>(source: AsyncIterable<T>, init: U, fn: (acc: U, item: T) => U): AsyncIterable<U> {
	let acc = init;
	for await (const item of source) {
		acc = fn(acc, item);
		yield acc;
	}
}

export async function* flatMap<T, U>(source: AsyncIterable<T>, fn: (item: T) => AsyncIterable<U>): AsyncIterable<U> {
	for await (const item of source) {
		yield* fn(item);
	}
}

export async function* mapWhile<T, U>(source: AsyncIterable<T>, fn: (item: T) => U | null | undefined): AsyncIterable<U> {
	for await (const item of source) {
		const result = fn(item);
		if (result == null) return;
		yield result;
	}
}

export async function* takeUntil<T>(source: AsyncIterable<T>, signal: Promise<void>): AsyncIterable<T> {
	let stopped = false;
	signal.then(() => { stopped = true; });
	for await (const item of source) {
		if (stopped) return;
		yield item;
	}
}

export function chunksTimeout<T>(source: AsyncIterable<T>, maxSize: number, ms: number): AsyncIterable<T[]> {
	const [tx, rx] = unboundedChannel<T[]>();

	void (async () => {
		let chunk: T[] = [];
		let timer: ReturnType<typeof setTimeout> | null = null;

		const flush = () => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
			if (chunk.length > 0) {
				tx.send(chunk);
				chunk = [];
			}
		};

		try {
			for await (const item of source) {
				chunk.push(item);
				if (timer === null) {
					timer = setTimeout(flush, ms);
				}
				if (chunk.length >= maxSize) {
					flush();
				}
			}
			flush();
		} finally {
			tx.close();
		}
	})();

	return rx;
}

export function peekable<T>(source: AsyncIterable<T>): Peekable<T> {
	return new Peekable(source);
}

export class Peekable<T> {
	#iter: AsyncIterator<T>;
	#peeked: IteratorResult<T> | null = null;

	constructor(source: AsyncIterable<T>) {
		this.#iter = source[Symbol.asyncIterator]();
	}

	async peek(): Promise<T | undefined> {
		if (this.#peeked === null) {
			this.#peeked = await this.#iter.next();
		}
		return this.#peeked.done ? undefined : this.#peeked.value;
	}

	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		while (true) {
			let result: IteratorResult<T>;
			if (this.#peeked !== null) {
				result = this.#peeked;
				this.#peeked = null;
			} else {
				result = await this.#iter.next();
			}
			if (result.done) return;
			yield result.value;
		}
	}
}

export async function count<T>(source: AsyncIterable<T>): Promise<number> {
	let n = 0;
	for await (const _ of source) {
		n++;
	}
	return n;
}

export async function any<T>(source: AsyncIterable<T>, fn: (item: T) => boolean): Promise<boolean> {
	for await (const item of source) {
		if (fn(item)) return true;
	}
	return false;
}

export async function all<T>(source: AsyncIterable<T>, fn: (item: T) => boolean): Promise<boolean> {
	for await (const item of source) {
		if (!fn(item)) return false;
	}
	return true;
}

export async function forEach<T>(source: AsyncIterable<T>, fn: (item: T) => void): Promise<void> {
	for await (const item of source) {
		fn(item);
	}
}

export async function forEachConcurrent<T>(source: AsyncIterable<T>, limit: number, fn: (item: T) => Promise<void>): Promise<void> {
	const sem = new Semaphore(limit);
	const tasks: Promise<void>[] = [];
	for await (const item of source) {
		const permit = await sem.acquire();
		tasks.push(fn(item).finally(() => permit.release()));
	}
	await Promise.all(tasks);
}
