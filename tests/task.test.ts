import { describe, it, expect } from "vitest";
import {
	spawn,
	JoinHandle,
	JoinSet,
	JoinError,
	yieldNow,
	joinAll,
	tryJoinAll,
} from "../src/task";

describe("JoinError", () => {
	it("has name set to JoinError", () => {
		const err = new JoinError("test");
		expect(err.name).toBe("JoinError");
	});

	it("defaults cancelled to false", () => {
		const err = new JoinError("test");
		expect(err.cancelled).toBe(false);
	});

	it("sets cancelled when provided", () => {
		const err = new JoinError("test", { cancelled: true });
		expect(err.cancelled).toBe(true);
	});

	it("preserves cause", () => {
		const cause = new Error("root");
		const err = new JoinError("wrapper", { cause });
		expect(err.cause).toBe(cause);
	});

	it("is an instance of Error", () => {
		const err = new JoinError("test");
		expect(err).toBeInstanceOf(Error);
	});
});

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

	it("wraps task errors in JoinError", async () => {
		const handle = spawn(async () => {
			throw new Error("boom");
		});
		const err = await handle.then(null, (e) => e);
		expect(err).toBeInstanceOf(JoinError);
		expect(err.message).toBe("Task failed");
		expect(err.cancelled).toBe(false);
		expect(err.cause).toBeInstanceOf(Error);
		expect((err.cause as Error).message).toBe("boom");
	});

	it("wraps abort + error in JoinError with cancelled=true", async () => {
		const handle = spawn(async (signal) => {
			await new Promise<void>((resolve, reject) => {
				if (signal.aborted) {
					reject(new Error("aborted"));
					return;
				}
				const timer = setTimeout(resolve, 10000);
				signal.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("aborted"));
				});
			});
			return 1;
		});
		// Let the task body start before aborting
		await new Promise((r) => setTimeout(r, 10));
		handle.abort();
		const err = await handle.then(null, (e) => e);
		expect(err).toBeInstanceOf(JoinError);
		expect(err.cancelled).toBe(true);
	});

	it("abort after completion still resolves", async () => {
		const handle = spawn(async () => 42);
		const result = await handle;
		handle.abort();
		expect(result).toBe(42);
	});

	it("passes AbortSignal to the task function", async () => {
		let receivedSignal: AbortSignal | null = null;
		await spawn(async (signal) => {
			receivedSignal = signal;
		});
		expect(receivedSignal).toBeInstanceOf(AbortSignal);
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

	it("isFinished is true after rejection", async () => {
		const handle = spawn(async () => {
			throw new Error("fail");
		});
		await handle.then(null, () => {});
		// Allow microtask for the completion tracker to run
		await Promise.resolve();
		expect(handle.isFinished()).toBe(true);
	});

	it("signal is accessible", () => {
		const handle = spawn(async () => 1);
		expect(handle.signal).toBeInstanceOf(AbortSignal);
	});

	it("signal is aborted after abort() call", () => {
		const handle = spawn(async () => {
			await new Promise((r) => setTimeout(r, 1000));
			return 1;
		});
		expect(handle.signal.aborted).toBe(false);
		handle.abort();
		expect(handle.signal.aborted).toBe(true);
	});

	it("then chains like a Promise", async () => {
		const handle = spawn(async () => 10);
		const doubled = await handle.then((v) => v * 2);
		expect(doubled).toBe(20);
	});

	it("then catches rejections", async () => {
		const handle = spawn(async () => {
			throw new Error("fail");
		});
		const caught = await handle.then(null, (e) => (e as JoinError).message);
		expect(caught).toBe("Task failed");
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
				if (signal.aborted) {
					reject(new Error("aborted"));
					return;
				}
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
				if (signal.aborted) {
					reject(new Error("aborted"));
					return;
				}
				const timer = setTimeout(resolve, 10000);
				signal.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("aborted"));
				});
			});
			return 2;
		});
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

	it("spawn returns a JoinHandle", () => {
		const set = new JoinSet<number>();
		const handle = set.spawn(async () => 1);
		expect(handle).toBeInstanceOf(JoinHandle);
	});

	it("joinNext throws when a task fails", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => {
			throw new Error("task error");
		});
		await expect(set.joinNext()).rejects.toThrow();
	});

	it("joinNext returns results even when called before tasks settle", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => {
			await new Promise((r) => setTimeout(r, 20));
			return 99;
		});
		const result = await set.joinNext();
		expect(result).toBe(99);
	});

	it("size is 0 after all tasks joined", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => 1);
		set.spawn(async () => 2);
		await set.joinNext();
		await set.joinNext();
		expect(set.size).toBe(0);
	});

	it("[Symbol.dispose] aborts all tasks", async () => {
		const set = new JoinSet<number>();
		const handle = set.spawn(async (signal) => {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(resolve, 10000);
				signal.addEventListener("abort", () => {
					clearTimeout(timer);
					reject(new Error("aborted"));
				});
			});
			return 1;
		});
		set[Symbol.dispose]();
		expect(handle.signal.aborted).toBe(true);
	});

	it("handles mixed success and failure tasks via joinNext", async () => {
		const set = new JoinSet<number>();
		set.spawn(async () => 1);
		set.spawn(async () => {
			throw new Error("fail");
		});
		set.spawn(async () => 3);

		// Let tasks settle
		await new Promise((r) => setTimeout(r, 10));

		const results: number[] = [];
		const errors: unknown[] = [];
		for (let i = 0; i < 3; i++) {
			try {
				const val = await set.joinNext();
				if (val !== null) results.push(val);
			} catch (e) {
				errors.push(e);
			}
		}
		expect(results.sort()).toEqual([1, 3]);
		expect(errors).toHaveLength(1);
	});
});

describe("yieldNow", () => {
	it("defers execution", async () => {
		const order: number[] = [];
		const p = (async () => {
			order.push(1);
			await yieldNow();
			order.push(3);
		})();
		order.push(2);
		await p;
		expect(order).toEqual([1, 2, 3]);
	});

	it("returns a promise", () => {
		const result = yieldNow();
		expect(result).toBeInstanceOf(Promise);
	});

	it("resolves to undefined", async () => {
		const result = await yieldNow();
		expect(result).toBeUndefined();
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

	it("returns empty array for empty input", async () => {
		const results = await joinAll([]);
		expect(results).toEqual([]);
	});

	it("throws on first failed result during unwrap", async () => {
		const handles = [
			spawn(async () => 1),
			spawn(async () => {
				throw new Error("fail");
			}),
			spawn(async () => 3),
		];
		await expect(joinAll(handles)).rejects.toThrow(JoinError);
	});

	it("preserves order with varying delays", async () => {
		const handles = [
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 30));
				return "a";
			}),
			spawn(async () => {
				return "b";
			}),
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 10));
				return "c";
			}),
		];
		const results = await joinAll(handles);
		expect(results).toEqual(["a", "b", "c"]);
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

	it("returns empty array for empty input", async () => {
		const results = await tryJoinAll([]);
		expect(results).toEqual([]);
	});

	it("aborts all handles on failure, not just remaining", async () => {
		const aborted: boolean[] = [];
		const handles = [
			spawn(async (signal) => {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(resolve, 100);
					signal.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(new Error("aborted"));
					});
				});
				return 1;
			}),
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 5));
				throw new Error("fail");
			}),
			spawn(async (signal) => {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(resolve, 100);
					signal.addEventListener("abort", () => {
						clearTimeout(timer);
						reject(new Error("aborted"));
					});
				});
				return 3;
			}),
		];

		await expect(tryJoinAll(handles)).rejects.toThrow();
		for (const h of handles) {
			aborted.push(h.signal.aborted);
		}
		expect(aborted[0]).toBe(true);
		expect(aborted[2]).toBe(true);
	});

	it("preserves order on success", async () => {
		const handles = [
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 20));
				return "a";
			}),
			spawn(async () => "b"),
			spawn(async () => {
				await new Promise((r) => setTimeout(r, 10));
				return "c";
			}),
		];
		const results = await tryJoinAll(handles);
		expect(results).toEqual(["a", "b", "c"]);
	});

	it("only the first error is thrown when multiple tasks fail", async () => {
		const handles = [
			spawn(async () => {
				throw new Error("first");
			}),
			spawn(async () => {
				throw new Error("second");
			}),
		];

		try {
			await tryJoinAll(handles);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(JoinError);
			expect((e as JoinError).cause).toBeInstanceOf(Error);
			expect(((e as JoinError).cause as Error).message).toBe("first");
		}
	});
});
