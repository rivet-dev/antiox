import { describe, it, expect } from "vitest";
import { spawn, JoinHandle, JoinSet, JoinError, yieldNow, joinAll, tryJoinAll } from "../src/task";

describe("spawn", () => {
	it("returns a JoinHandle", () => {
		const handle = spawn(async () => 42);
		expect(handle).toBeInstanceOf(JoinHandle);
	});

	it("resolves with the return value", async () => {
		const result = await spawn(async () => "hello");
		expect(result).toBe("hello");
	});

	it("defers execution to next microtask", async () => {
		let ran = false;
		const handle = spawn(async () => {
			ran = true;
		});
		expect(ran).toBe(false);
		await handle;
		expect(ran).toBe(true);
	});
});

describe("JoinHandle", () => {
	it("abort fires signal and rejects with JoinError", async () => {
		const handle = spawn(async (signal) => {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			return 42;
		});
		handle.abort();
		await expect(handle).rejects.toThrow(JoinError);
		const err = await handle.then(null, (e) => e);
		expect(err.cancelled).toBe(true);
	});

	it("isFinished tracks state", async () => {
		const handle = spawn(async () => 1);
		expect(handle.isFinished()).toBe(false);
		await handle;
		expect(handle.isFinished()).toBe(true);
	});

	it("signal is accessible", () => {
		const handle = spawn(async () => 1);
		expect(handle.signal).toBeInstanceOf(AbortSignal);
	});
});

describe("JoinSet", () => {
	it("spawn and joinNext", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => 1);
		set.spawn(async () => 2);

		const results: number[] = [];
		let next = await set.joinNext();
		while (next !== null) {
			results.push(next);
			next = await set.joinNext();
		}
		expect(results.sort()).toEqual([1, 2]);
	});

	it("joinNext returns null when empty", async () => {
		const set = new JoinSet<number>();
		expect(await set.joinNext()).toBeNull();
	});

	it("size tracks pending tasks", async () => {
		const set = new JoinSet<number>();
		expect(set.size).toBe(0);
		// Use delays so tasks don't settle immediately
		set.spawn(async () => {
			await new Promise((r) => setTimeout(r, 100));
			return 1;
		});
		expect(set.size).toBe(1);
		set.spawn(async () => {
			await new Promise((r) => setTimeout(r, 200));
			return 2;
		});
		expect(set.size).toBe(2);
		await set.joinNext();
		expect(set.size).toBe(1);
	});

	it("abortAll cancels all tasks", async () => {
		const set = new JoinSet<number>();
		set.spawn(async (signal) => {
			await new Promise<void>((resolve, reject) => {
				if (signal.aborted) { reject(new Error("aborted")); return; }
				const timer = setTimeout(resolve, 10000);
				signal.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("aborted"));
				});
			});
			return 1;
		});
		set.spawn(async (signal) => {
			await new Promise<void>((resolve, reject) => {
				if (signal.aborted) { reject(new Error("aborted")); return; }
				const timer = setTimeout(resolve, 10000);
				signal.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("aborted"));
				});
			});
			return 2;
		});
		// Let the deferred spawns start
		await new Promise((r) => setTimeout(r, 10));
		set.abortAll();
		await expect(set.joinNext()).rejects.toThrow(JoinError);
	});

	it("async iterator yields in completion order", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => 1);
		set.spawn(async () => 2);
		set.spawn(async () => 3);

		const results: number[] = [];
		for await (const result of set) {
			results.push(result);
		}
		expect(results.sort()).toEqual([1, 2, 3]);
	});
});

describe("yieldNow", () => {
	it("defers execution", async () => {
		let order: number[] = [];
		const p = (async () => {
			order.push(1);
			await yieldNow();
			order.push(3);
		})();
		order.push(2);
		await p;
		expect(order).toEqual([1, 2, 3]);
	});
});

describe("joinAll", () => {
	it("returns all results in order", async () => {
		const handles = [
			spawn(async () => 1),
			spawn(async () => 2),
			spawn(async () => 3),
		];
		const results = await joinAll(handles);
		expect(results).toEqual([1, 2, 3]);
	});

	it("waits for all tasks even if some finish early", async () => {
		const handles = [
			spawn(async () => {
				return "fast";
			}),
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 30));
				return "slow";
			}),
		];
		const results = await joinAll(handles);
		expect(results).toEqual(["fast", "slow"]);
	});
});

describe("tryJoinAll", () => {
	it("returns all results on success", async () => {
		const handles = [
			spawn(async () => 10),
			spawn(async () => 20),
			spawn(async () => 30),
		];
		const results = await tryJoinAll(handles);
		expect(results).toEqual([10, 20, 30]);
	});

	it("cancels remaining on first failure", async () => {
		let secondFinished = false;
		const handles = [
			spawn(async () => {
				throw new Error("boom");
			}),
			spawn(async (signal) => {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(() => {
						secondFinished = true;
						resolve();
					}, 50);
					signal.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(new Error("aborted"));
					});
				});
				return 2;
			}),
		];

		await expect(tryJoinAll(handles)).rejects.toThrow();
		await new Promise((r) => setTimeout(r, 10));
		expect(secondFinished).toBe(false);
	});

	it("the error from the failed task is thrown", async () => {
		const handles = [
			spawn(async () => 1),
			spawn(async () => {
				throw new Error("task failed");
			}),
		];

		await expect(tryJoinAll(handles)).rejects.toThrow(JoinError);
	});
});
