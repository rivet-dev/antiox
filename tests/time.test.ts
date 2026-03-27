import { describe, it, expect } from "vitest";
import { sleep, timeout, timeoutAt, interval, TimeoutError } from "../src/time";

describe("sleep", () => {
	it("resolves after duration", async () => {
		const start = Date.now();
		await sleep(50);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(50);
	});

	it("with AbortSignal cancellation", async () => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 10);
		await expect(sleep(1000, controller.signal)).rejects.toThrow();
	});

	it("with already-aborted signal rejects immediately", async () => {
		const controller = new AbortController();
		controller.abort();
		const start = Date.now();
		await expect(sleep(1000, controller.signal)).rejects.toThrow();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
	});
});

describe("timeout", () => {
	it("resolves if promise finishes in time", async () => {
		const result = await timeout(200, Promise.resolve(42));
		expect(result).toBe(42);
	});

	it("throws TimeoutError if too slow", async () => {
		const slow = new Promise<number>((resolve) =>
			setTimeout(() => resolve(1), 500),
		);
		await expect(timeout(20, slow)).rejects.toThrow(TimeoutError);
	});

	it("propagates rejection from inner promise", async () => {
		const failing = Promise.reject(new Error("boom"));
		await expect(timeout(200, failing)).rejects.toThrow("boom");
	});
});

describe("interval", () => {
	it("yields 0, 1, 2 then break", async () => {
		const ticks: number[] = [];
		for await (const tick of interval(10)) {
			ticks.push(tick);
			if (tick >= 2) break;
		}
		expect(ticks).toEqual([0, 1, 2]);
	});

	it("first yield is immediate (tick 0)", async () => {
		const start = Date.now();
		for await (const tick of interval(50)) {
			const elapsed = Date.now() - start;
			expect(tick).toBe(0);
			expect(elapsed).toBeLessThan(30);
			break;
		}
	});
});

describe("timeoutAt", () => {
	it("resolves if promise finishes before deadline", async () => {
		const deadline = Date.now() + 200;
		const result = await timeoutAt(deadline, Promise.resolve(42));
		expect(result).toBe(42);
	});

	it("throws TimeoutError if deadline passes", async () => {
		const deadline = Date.now() + 10;
		const slow = new Promise<number>((resolve) =>
			setTimeout(() => resolve(1), 500),
		);
		await expect(timeoutAt(deadline, slow)).rejects.toThrow(TimeoutError);
	});
});
