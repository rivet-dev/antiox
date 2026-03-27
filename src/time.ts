/**
 * Time utilities mirroring tokio::time.
 *
 * Provides sleep, timeout, and interval primitives for async TypeScript code.
 *
 * @module
 */

/** Thrown when an operation exceeds its time limit. */
export class TimeoutError extends Error {
	constructor() {
		super("Operation timed out");
		this.name = "TimeoutError";
	}
}

/**
 * Return a promise that resolves after `ms` milliseconds.
 *
 * If an `AbortSignal` is provided and it fires before the timer elapses,
 * the returned promise rejects with an `AbortError` and the timer is cleaned up.
 *
 * @param ms - Duration in milliseconds.
 * @param signal - Optional abort signal for cancellation.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
			return;
		}

		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);

		let onAbort: (() => void) | undefined;

		function cleanup() {
			if (onAbort && signal) {
				signal.removeEventListener("abort", onAbort);
			}
		}

		if (signal) {
			onAbort = () => {
				clearTimeout(timer);
				reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
			};
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

/**
 * Race a promise against a timeout.
 *
 * If the timeout elapses before the promise settles, the returned promise
 * rejects with {@link TimeoutError}.
 *
 * @param ms - Timeout duration in milliseconds.
 * @param promise - The promise to race against the timeout.
 * @returns The resolved value of the original promise.
 * @throws {TimeoutError} If the timeout elapses first.
 */
export async function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
	const controller = new AbortController();

	const timer = sleep(ms, controller.signal).then(() => {
		throw new TimeoutError();
	});

	try {
		const result = await Promise.race([promise, timer]);
		return result as T;
	} finally {
		controller.abort();
	}
}

/**
 * Race a promise against an absolute deadline.
 *
 * Like {@link timeout} but takes a `Date` or epoch milliseconds instead of a
 * relative duration.
 *
 * @param deadline - Absolute time as Date or epoch ms.
 * @param promise - The promise to race against the deadline.
 * @throws {TimeoutError} If the deadline passes first.
 */
export async function timeoutAt<T>(
	deadline: Date | number,
	promise: Promise<T>,
): Promise<T> {
	const ms = (typeof deadline === "number" ? deadline : deadline.getTime()) - Date.now();
	return timeout(Math.max(ms, 0), promise);
}

/**
 * Create an async iterable that yields incrementing tick counts with backpressure.
 *
 * Unlike `setInterval`, the next tick does not start until the consumer has
 * processed the previous one. This provides natural backpressure.
 *
 * @param ms - Duration between ticks in milliseconds.
 * @returns An async iterable yielding 0, 1, 2, ...
 *
 * @example
 * ```ts
 * for await (const tick of interval(1000)) {
 *   console.log(`Tick ${tick}`);
 *   if (tick >= 4) break;
 * }
 * ```
 */
export async function* interval(ms: number): AsyncIterable<number> {
	let tick = 0;
	while (true) {
		if (tick > 0) {
			await sleep(ms);
		}
		yield tick++;
	}
}
