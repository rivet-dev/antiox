import { describe, it, expect } from "vitest";
import { OnceCell } from "../../src/sync/once_cell";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("OnceCell", () => {
	it("get() returns undefined before init", () => {
		const cell = new OnceCell<number>();
		expect(cell.get()).toBeUndefined();
	});

	it("set() initializes, get() returns value", () => {
		const cell = new OnceCell<number>();
		const ok = cell.set(42);
		expect(ok).toBe(true);
		expect(cell.get()).toBe(42);
	});

	it("set() returns false on second call", () => {
		const cell = new OnceCell<string>();
		cell.set("first");
		const ok = cell.set("second");
		expect(ok).toBe(false);
		expect(cell.get()).toBe("first");
	});

	it("isInitialized() tracks state", () => {
		const cell = new OnceCell<number>();
		expect(cell.isInitialized()).toBe(false);
		cell.set(1);
		expect(cell.isInitialized()).toBe(true);
	});

	it("getOrInit() initializes with fn", async () => {
		const cell = new OnceCell<number>();
		const value = await cell.getOrInit(async () => 99);
		expect(value).toBe(99);
		expect(cell.get()).toBe(99);
	});

	it("getOrInit() concurrent: two calls, only one fn runs, both get same result", async () => {
		const cell = new OnceCell<number>();
		let callCount = 0;

		const init = async () => {
			callCount++;
			await delay(20);
			return 77;
		};

		const [a, b] = await Promise.all([
			cell.getOrInit(init),
			cell.getOrInit(init),
		]);

		expect(callCount).toBe(1);
		expect(a).toBe(77);
		expect(b).toBe(77);
	});

	it("getOrTryInit(): if fn throws, cell stays unset, can retry", async () => {
		const cell = new OnceCell<number>();
		let attempt = 0;

		await expect(
			cell.getOrTryInit(async () => {
				attempt++;
				throw new Error("fail");
			}),
		).rejects.toThrow("fail");

		expect(cell.isInitialized()).toBe(false);
		expect(attempt).toBe(1);

		const value = await cell.getOrTryInit(async () => 123);
		expect(value).toBe(123);
		expect(cell.isInitialized()).toBe(true);
	});

	it("getOrInit() returns cached value on second call", async () => {
		const cell = new OnceCell<number>();
		let callCount = 0;

		await cell.getOrInit(async () => {
			callCount++;
			return 10;
		});

		const second = await cell.getOrInit(async () => {
			callCount++;
			return 20;
		});

		expect(callCount).toBe(1);
		expect(second).toBe(10);
	});

	it("getOrInit() on a cell set via set() does not run fn", async () => {
		const cell = new OnceCell<number>();
		cell.set(42);

		let called = false;
		const value = await cell.getOrInit(async () => {
			called = true;
			return 99;
		});

		expect(called).toBe(false);
		expect(value).toBe(42);
	});

	it("set() returns false when cell is in initializing state", async () => {
		const cell = new OnceCell<number>();
		let resolveInit!: (v: number) => void;

		const initPromise = cell.getOrInit(
			() => new Promise<number>((resolve) => { resolveInit = resolve; }),
		);

		// Cell is now in "initializing" state
		const setResult = cell.set(999);
		expect(setResult).toBe(false);

		resolveInit(42);
		const value = await initPromise;
		expect(value).toBe(42);
		expect(cell.get()).toBe(42);
	});

	it("concurrent getOrInit() where init fails: all waiters get the error", async () => {
		const cell = new OnceCell<number>();

		const results = await Promise.allSettled([
			cell.getOrInit(async () => {
				await delay(10);
				throw new Error("init-failed");
			}),
			cell.getOrInit(async () => 99),
			cell.getOrInit(async () => 100),
		]);

		for (const r of results) {
			expect(r.status).toBe("rejected");
			if (r.status === "rejected") {
				expect((r.reason as Error).message).toBe("init-failed");
			}
		}

		expect(cell.isInitialized()).toBe(false);
	});

	it("after concurrent init failure, next call can succeed", async () => {
		const cell = new OnceCell<number>();

		await expect(
			cell.getOrInit(async () => {
				throw new Error("oops");
			}),
		).rejects.toThrow("oops");

		const value = await cell.getOrInit(async () => 42);
		expect(value).toBe(42);
		expect(cell.isInitialized()).toBe(true);
	});

	it("get() returns undefined while initialization is in progress", async () => {
		const cell = new OnceCell<number>();
		let resolveInit!: (v: number) => void;

		const initPromise = cell.getOrInit(
			() => new Promise<number>((resolve) => { resolveInit = resolve; }),
		);

		expect(cell.get()).toBeUndefined();
		expect(cell.isInitialized()).toBe(false);

		resolveInit(5);
		await initPromise;

		expect(cell.get()).toBe(5);
		expect(cell.isInitialized()).toBe(true);
	});

	it("stores falsy values correctly", async () => {
		const zeroCell = new OnceCell<number>();
		zeroCell.set(0);
		expect(zeroCell.get()).toBe(0);
		expect(zeroCell.isInitialized()).toBe(true);

		const emptyCell = new OnceCell<string>();
		emptyCell.set("");
		expect(emptyCell.get()).toBe("");
		expect(emptyCell.isInitialized()).toBe(true);

		const falseCell = new OnceCell<boolean>();
		falseCell.set(false);
		expect(falseCell.get()).toBe(false);
		expect(falseCell.isInitialized()).toBe(true);
	});

	it("many concurrent callers all get the same value", async () => {
		const cell = new OnceCell<number>();
		let callCount = 0;

		const promises = Array.from({ length: 50 }, () =>
			cell.getOrInit(async () => {
				callCount++;
				await delay(10);
				return 777;
			}),
		);

		const results = await Promise.all(promises);
		expect(callCount).toBe(1);
		for (const r of results) {
			expect(r).toBe(777);
		}
	});
});
