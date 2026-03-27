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
});
