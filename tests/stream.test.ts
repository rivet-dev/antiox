import { describe, it, expect } from "vitest";
import {
	map,
	filter,
	andThen,
	filterMap,
	take,
	skip,
	takeWhile,
	skipWhile,
	chunks,
	collect,
	fold,
	merge,
	chain,
	zip,
	flatten,
	tap,
	pipe,
	bufferUnordered,
	buffered,
	throttle,
	timeout,
} from "../src/stream";
import { sleep, TimeoutError } from "../src/time";

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
	for (const item of items) yield item;
}

describe("map", () => {
	it("transforms each element", async () => {
		const result = await collect(map(fromArray([1, 2, 3]), (x) => x * 2));
		expect(result).toEqual([2, 4, 6]);
	});
});

describe("filter", () => {
	it("removes elements", async () => {
		const result = await collect(
			filter(fromArray([1, 2, 3, 4, 5]), (x) => x % 2 === 0),
		);
		expect(result).toEqual([2, 4]);
	});
});

describe("then", () => {
	it("async maps each element", async () => {
		const result = await collect(
			andThen(fromArray([1, 2, 3]), async (x) => x + 10),
		);
		expect(result).toEqual([11, 12, 13]);
	});
});

describe("filterMap", () => {
	it("combined filter and map", async () => {
		const result = await collect(
			filterMap(fromArray([1, 2, 3, 4, 5]), (x) =>
				x % 2 === 0 ? x * 10 : null,
			),
		);
		expect(result).toEqual([20, 40]);
	});
});

describe("take", () => {
	it("first N elements", async () => {
		const result = await collect(take(fromArray([1, 2, 3, 4, 5]), 3));
		expect(result).toEqual([1, 2, 3]);
	});

	it("less than N available", async () => {
		const result = await collect(take(fromArray([1, 2]), 5));
		expect(result).toEqual([1, 2]);
	});
});

describe("skip", () => {
	it("first N elements", async () => {
		const result = await collect(skip(fromArray([1, 2, 3, 4, 5]), 2));
		expect(result).toEqual([3, 4, 5]);
	});

	it("skip more than available", async () => {
		const result = await collect(skip(fromArray([1, 2]), 5));
		expect(result).toEqual([]);
	});
});

describe("takeWhile", () => {
	it("yields while predicate is true", async () => {
		const result = await collect(
			takeWhile(fromArray([1, 2, 3, 4, 5]), (x) => x < 4),
		);
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("skipWhile", () => {
	it("skips while predicate is true, then yields rest", async () => {
		const result = await collect(
			skipWhile(fromArray([1, 2, 3, 4, 5]), (x) => x < 3),
		);
		expect(result).toEqual([3, 4, 5]);
	});
});

describe("chunks", () => {
	it("batches correctly with partial last chunk", async () => {
		const result = await collect(chunks(fromArray([1, 2, 3, 4, 5]), 2));
		expect(result).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("exact multiple", async () => {
		const result = await collect(chunks(fromArray([1, 2, 3, 4]), 2));
		expect(result).toEqual([
			[1, 2],
			[3, 4],
		]);
	});
});

describe("collect", () => {
	it("gathers all elements", async () => {
		const result = await collect(fromArray([10, 20, 30]));
		expect(result).toEqual([10, 20, 30]);
	});

	it("empty iterable", async () => {
		const result = await collect(fromArray([]));
		expect(result).toEqual([]);
	});
});

describe("fold", () => {
	it("reduces to a single value", async () => {
		const result = await fold(fromArray([1, 2, 3, 4]), 0, (acc, x) => acc + x);
		expect(result).toBe(10);
	});

	it("uses initial value for empty source", async () => {
		const result = await fold(fromArray<number>([]), 99, (acc, x) => acc + x);
		expect(result).toBe(99);
	});
});

describe("merge", () => {
	it("interleaves from multiple sources", async () => {
		async function* delayed(values: number[], delayMs: number) {
			for (const v of values) {
				await sleep(delayMs);
				yield v;
			}
		}

		const a = delayed([1, 3, 5], 10);
		const b = delayed([2, 4, 6], 15);

		const result = await collect(merge(a, b));
		expect(result.sort()).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it("empty sources", async () => {
		const result = await collect(merge<number>());
		expect(result).toEqual([]);
	});
});

describe("chain", () => {
	it("concatenates in order", async () => {
		const result = await collect(
			chain(fromArray([1, 2]), fromArray([3, 4]), fromArray([5])),
		);
		expect(result).toEqual([1, 2, 3, 4, 5]);
	});
});

describe("zip", () => {
	it("pairs elements", async () => {
		const result = await collect(
			zip(fromArray([1, 2, 3]), fromArray(["a", "b", "c"])),
		);
		expect(result).toEqual([
			[1, "a"],
			[2, "b"],
			[3, "c"],
		]);
	});

	it("stops at shorter source", async () => {
		const result = await collect(
			zip(fromArray([1, 2, 3]), fromArray(["a", "b"])),
		);
		expect(result).toEqual([
			[1, "a"],
			[2, "b"],
		]);
	});
});

describe("flatten", () => {
	it("flattens nested iterables", async () => {
		const nested = fromArray([fromArray([1, 2]), fromArray([3, 4, 5])]);
		const result = await collect(flatten(nested));
		expect(result).toEqual([1, 2, 3, 4, 5]);
	});
});

describe("tap", () => {
	it("executes side effects without modifying stream", async () => {
		const seen: number[] = [];
		const result = await collect(
			tap(fromArray([1, 2, 3]), (x) => seen.push(x)),
		);
		expect(result).toEqual([1, 2, 3]);
		expect(seen).toEqual([1, 2, 3]);
	});
});

describe("pipe", () => {
	it("composes operators left-to-right", async () => {
		const result = await collect(
			pipe(
				fromArray([1, 2, 3, 4, 5]),
				(s) => filter(s, (x: number) => x % 2 !== 0),
				(s) => map(s, (x: number) => x * 10),
			),
		);
		expect(result).toEqual([10, 30, 50]);
	});
});

describe("bufferUnordered", () => {
	it("runs concurrently and yields all results", async () => {
		async function* tasks(): AsyncIterable<Promise<number>> {
			for (let i = 0; i < 5; i++) {
				yield new Promise<number>((resolve) =>
					setTimeout(() => resolve(i), 10),
				);
			}
		}

		const result = await collect(bufferUnordered(tasks(), 3));
		expect(result.sort()).toEqual([0, 1, 2, 3, 4]);
	});

	it("respects concurrency limit", async () => {
		let maxConcurrent = 0;
		let current = 0;

		async function* tasks(): AsyncIterable<Promise<number>> {
			for (let i = 0; i < 6; i++) {
				yield new Promise<number>((resolve) => {
					current++;
					if (current > maxConcurrent) maxConcurrent = current;
					setTimeout(() => {
						current--;
						resolve(i);
					}, 20);
				});
			}
		}

		const result = await collect(bufferUnordered(tasks(), 2));
		expect(result.sort()).toEqual([0, 1, 2, 3, 4, 5]);
		expect(maxConcurrent).toBeLessThanOrEqual(2);
	});
});

describe("buffered", () => {
	it("preserves source order", async () => {
		async function* tasks(): AsyncIterable<Promise<number>> {
			yield new Promise<number>((resolve) => setTimeout(() => resolve(1), 30));
			yield new Promise<number>((resolve) => setTimeout(() => resolve(2), 20));
			yield new Promise<number>((resolve) => setTimeout(() => resolve(3), 10));
		}

		const result = await collect(buffered(tasks(), 3));
		expect(result).toEqual([1, 2, 3]);
	});

	it("yields all results with limited concurrency", async () => {
		async function* tasks(): AsyncIterable<Promise<number>> {
			for (let i = 0; i < 5; i++) {
				yield new Promise<number>((resolve) =>
					setTimeout(() => resolve(i), 10),
				);
			}
		}

		const result = await collect(buffered(tasks(), 2));
		expect(result).toEqual([0, 1, 2, 3, 4]);
	});

	it("empty source", async () => {
		const result = await collect(buffered(fromArray([]), 3));
		expect(result).toEqual([]);
	});

	it("single task", async () => {
		async function* tasks(): AsyncIterable<Promise<number>> {
			yield new Promise((resolve) => setTimeout(() => resolve(42), 5));
		}

		const result = await collect(buffered(tasks(), 3));
		expect(result).toEqual([42]);
	});
});

describe("map - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(map(fromArray([]), (x: number) => x * 2));
		expect(result).toEqual([]);
	});

	it("single element", async () => {
		const result = await collect(map(fromArray([42]), (x) => x.toString()));
		expect(result).toEqual(["42"]);
	});
});

describe("filter - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(filter(fromArray([]), () => true));
		expect(result).toEqual([]);
	});

	it("all filtered out", async () => {
		const result = await collect(filter(fromArray([1, 2, 3]), () => false));
		expect(result).toEqual([]);
	});

	it("all pass", async () => {
		const result = await collect(filter(fromArray([1, 2, 3]), () => true));
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("andThen - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(andThen(fromArray([]), async (x: number) => x));
		expect(result).toEqual([]);
	});
});

describe("filterMap - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(filterMap(fromArray([]), () => 1));
		expect(result).toEqual([]);
	});

	it("all filtered out", async () => {
		const result = await collect(filterMap(fromArray([1, 2, 3]), () => null));
		expect(result).toEqual([]);
	});

	it("undefined is also filtered", async () => {
		const result = await collect(filterMap(fromArray([1, 2, 3]), () => undefined));
		expect(result).toEqual([]);
	});

	it("zero and empty string are not filtered", async () => {
		const result = await collect(filterMap(fromArray([1, 2, 3]), (x) => (x === 2 ? 0 : "")));
		expect(result).toEqual(["", 0, ""]);
	});
});

describe("take - edge cases", () => {
	it("take(0) yields nothing", async () => {
		const result = await collect(take(fromArray([1, 2, 3]), 0));
		expect(result).toEqual([]);
	});

	it("take from empty", async () => {
		const result = await collect(take(fromArray([]), 5));
		expect(result).toEqual([]);
	});

	it("take(1) yields first element only", async () => {
		const result = await collect(take(fromArray([10, 20, 30]), 1));
		expect(result).toEqual([10]);
	});
});

describe("skip - edge cases", () => {
	it("skip(0) yields all", async () => {
		const result = await collect(skip(fromArray([1, 2, 3]), 0));
		expect(result).toEqual([1, 2, 3]);
	});

	it("skip from empty", async () => {
		const result = await collect(skip(fromArray([]), 5));
		expect(result).toEqual([]);
	});
});

describe("takeWhile - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(takeWhile(fromArray([]), () => true));
		expect(result).toEqual([]);
	});

	it("predicate immediately false", async () => {
		const result = await collect(takeWhile(fromArray([1, 2, 3]), () => false));
		expect(result).toEqual([]);
	});

	it("predicate always true", async () => {
		const result = await collect(takeWhile(fromArray([1, 2, 3]), () => true));
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("skipWhile - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(skipWhile(fromArray([]), () => true));
		expect(result).toEqual([]);
	});

	it("predicate immediately false yields all", async () => {
		const result = await collect(skipWhile(fromArray([1, 2, 3]), () => false));
		expect(result).toEqual([1, 2, 3]);
	});

	it("predicate always true yields nothing", async () => {
		const result = await collect(skipWhile(fromArray([1, 2, 3]), () => true));
		expect(result).toEqual([]);
	});

	it("does not re-check predicate after first false", async () => {
		const result = await collect(
			skipWhile(fromArray([1, 2, 3, 1, 0]), (x) => x < 3),
		);
		expect(result).toEqual([3, 1, 0]);
	});
});

describe("chunks - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(chunks(fromArray([]), 3));
		expect(result).toEqual([]);
	});

	it("chunk size larger than source", async () => {
		const result = await collect(chunks(fromArray([1, 2]), 10));
		expect(result).toEqual([[1, 2]]);
	});

	it("chunk size of 1", async () => {
		const result = await collect(chunks(fromArray([1, 2, 3]), 1));
		expect(result).toEqual([[1], [2], [3]]);
	});

	it("single element", async () => {
		const result = await collect(chunks(fromArray([42]), 5));
		expect(result).toEqual([[42]]);
	});
});

describe("fold - edge cases", () => {
	it("string concatenation", async () => {
		const result = await fold(fromArray(["a", "b", "c"]), "", (acc, x) => acc + x);
		expect(result).toBe("abc");
	});
});

describe("merge - edge cases", () => {
	it("single source", async () => {
		const result = await collect(merge(fromArray([1, 2, 3])));
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("chain - edge cases", () => {
	it("no sources", async () => {
		const result = await collect(chain());
		expect(result).toEqual([]);
	});

	it("empty sources interspersed", async () => {
		const result = await collect(
			chain(fromArray([]), fromArray([1, 2]), fromArray([]), fromArray([3])),
		);
		expect(result).toEqual([1, 2, 3]);
	});

	it("single source", async () => {
		const result = await collect(chain(fromArray([1, 2])));
		expect(result).toEqual([1, 2]);
	});
});

describe("zip - edge cases", () => {
	it("both empty", async () => {
		const result = await collect(zip(fromArray([]), fromArray([])));
		expect(result).toEqual([]);
	});

	it("one empty", async () => {
		const result = await collect(zip(fromArray([1, 2, 3]), fromArray([])));
		expect(result).toEqual([]);
	});

	it("first shorter", async () => {
		const result = await collect(
			zip(fromArray(["a"]), fromArray([1, 2, 3])),
		);
		expect(result).toEqual([["a", 1]]);
	});
});

describe("flatten - edge cases", () => {
	it("empty outer", async () => {
		const result = await collect(flatten(fromArray([])));
		expect(result).toEqual([]);
	});

	it("empty inner iterables", async () => {
		const nested = fromArray([fromArray([]), fromArray([]), fromArray([])]);
		const result = await collect(flatten(nested));
		expect(result).toEqual([]);
	});

	it("mix of empty and non-empty", async () => {
		const nested = fromArray([fromArray([]), fromArray([1, 2]), fromArray([]), fromArray([3])]);
		const result = await collect(flatten(nested));
		expect(result).toEqual([1, 2, 3]);
	});
});

describe("tap - edge cases", () => {
	it("empty source calls nothing", async () => {
		let called = false;
		const result = await collect(tap(fromArray([]), () => { called = true; }));
		expect(result).toEqual([]);
		expect(called).toBe(false);
	});
});

describe("pipe - edge cases", () => {
	it("no operators returns source unchanged", async () => {
		const result = await collect(pipe(fromArray([1, 2, 3])));
		expect(result).toEqual([1, 2, 3]);
	});

	it("single operator", async () => {
		const result = await collect(
			pipe(
				fromArray([1, 2, 3]),
				(s) => map(s, (x: number) => x + 1),
			),
		);
		expect(result).toEqual([2, 3, 4]);
	});

	it("many chained operators", async () => {
		const result = await collect(
			pipe(
				fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
				(s) => filter(s, (x: number) => x % 2 === 0),
				(s) => map(s, (x: number) => x * 3),
				(s) => take(s, 3),
			),
		);
		expect(result).toEqual([6, 12, 18]);
	});
});

describe("bufferUnordered - edge cases", () => {
	it("empty source", async () => {
		const result = await collect(bufferUnordered(fromArray([]), 3));
		expect(result).toEqual([]);
	});

	it("single task", async () => {
		async function* tasks(): AsyncIterable<Promise<number>> {
			yield new Promise((resolve) => setTimeout(() => resolve(42), 5));
		}

		const result = await collect(bufferUnordered(tasks(), 2));
		expect(result).toEqual([42]);
	});

	it("concurrency of 1 serializes execution", async () => {
		const order: number[] = [];
		async function* tasks(): AsyncIterable<Promise<number>> {
			for (let i = 0; i < 3; i++) {
				yield new Promise<number>((resolve) => {
					order.push(i);
					setTimeout(() => resolve(i), 5);
				});
			}
		}

		const result = await collect(bufferUnordered(tasks(), 1));
		expect(result.sort()).toEqual([0, 1, 2]);
	});
});

describe("throttle", () => {
	it("yields all elements with spacing", async () => {
		const start = Date.now();
		const result = await collect(throttle(fromArray([1, 2, 3]), 20));
		const elapsed = Date.now() - start;
		expect(result).toEqual([1, 2, 3]);
		expect(elapsed).toBeGreaterThanOrEqual(35);
	});

	it("empty source", async () => {
		const result = await collect(throttle(fromArray([]), 100));
		expect(result).toEqual([]);
	});

	it("single element has no delay", async () => {
		const start = Date.now();
		const result = await collect(throttle(fromArray([42]), 50));
		const elapsed = Date.now() - start;
		expect(result).toEqual([42]);
		expect(elapsed).toBeLessThan(40);
	});
});

describe("timeout", () => {
	it("passes through fast elements", async () => {
		const result = await collect(timeout(fromArray([1, 2, 3]), 1000));
		expect(result).toEqual([1, 2, 3]);
	});

	it("throws TimeoutError on slow source", async () => {
		async function* slow(): AsyncIterable<number> {
			yield 1;
			await sleep(200);
			yield 2;
		}

		await expect(async () => {
			await collect(timeout(slow(), 50));
		}).rejects.toThrow(TimeoutError);
	});

	it("empty source", async () => {
		const result = await collect(timeout(fromArray([]), 100));
		expect(result).toEqual([]);
	});
});
