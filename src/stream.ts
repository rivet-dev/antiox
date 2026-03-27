import { Semaphore } from "./sync/semaphore";
import { unboundedChannel } from "./sync/mpsc";
import { sleep as timeSleep, TimeoutError } from "./time";

export async function* map<T, U>(
	source: AsyncIterable<T>,
	fn: (item: T) => U,
): AsyncIterable<U> {
	for await (const item of source) {
		yield fn(item);
	}
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

export async function* tap<T>(
	source: AsyncIterable<T>,
	fn: (item: T) => void,
): AsyncIterable<T> {
	for await (const item of source) {
		fn(item);
		yield item;
	}
}

type StreamOp<I = any, O = any> = (source: AsyncIterable<I>) => AsyncIterable<O>;

export function pipe<T>(source: AsyncIterable<T>, ...fns: StreamOp[]): AsyncIterable<any> {
	return fns.reduce((acc, fn) => fn(acc), source as AsyncIterable<any>);
}
