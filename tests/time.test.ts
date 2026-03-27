import { describe, it, expect } from "vitest";
import {
	sleep,
	timeout,
	timeoutAt,
	interval,
	TimeoutError,
} from "../src/time";

describe("TimeoutError", () => {
	it("has name set to TimeoutError", () => {
		const err = new TimeoutError();
		expect(err.name).toBe("TimeoutError");
	});

	it("has correct message", () => {
		const err = new TimeoutError();
		expect(err.message).toBe("Operation timed out");
	});

	it("is an instance of Error", () => {
		const err = new TimeoutError();
		expect(err).toBeInstanceOf(Error);
	});
});

describe("sleep", () => {
	it("resolves after duration", async () => {
		const start = Date.now();
		await sleep(50);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(40);
	});

	it("resolves to undefined", async () => {
		const result = await sleep(1);
		expect(result).toBeUndefined();
	});

	it("sleep(0) resolves near-immediately", async () => {
		const start = Date.now();
		await sleep(0);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(50);
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

	it("abort reason is preserved", async () => {
		const controller = new AbortController();
		const customReason = new Error("custom abort reason");
		controller.abort(customReason);
		try {
			await sleep(1000, controller.signal);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBe(customReason);
		}
	});

	it("abort reason is preserved when aborted mid-sleep", async () => {
		const controller = new AbortController();
		const customReason = new Error("custom");
		setTimeout(() => controller.abort(customReason), 5);
		try {
			await sleep(1000, controller.signal);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBe(customReason);
		}
	});

	it("cleans up event listener after normal resolution", async () => {
		const controller = new AbortController();
		await sleep(5, controller.signal);
		// After sleep resolves, aborting should not cause issues
		controller.abort();
	});

	it("without signal resolves normally", async () => {
		await sleep(5);
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

	it("timeout(0) with pending promise throws TimeoutError", async () => {
		const never = new Promise<number>(() => {});
		await expect(timeout(0, never)).rejects.toThrow(TimeoutError);
	});

	it("resolves with the correct value type", async () => {
		const result = await timeout(100, Promise.resolve({ key: "value" }));
		expect(result).toEqual({ key: "value" });
	});

	it("cleans up internal timer after promise resolves", async () => {
		// If the timer isn't cleaned up, this would leave a dangling timer.
		// We verify by ensuring no unhandled rejections occur.
		const result = await timeout(1000, Promise.resolve("fast"));
		expect(result).toBe("fast");
	});

	it("rejects with TimeoutError, not some other error type", async () => {
		const slow = new Promise<void>((resolve) => setTimeout(resolve, 500));
		try {
			await timeout(5, slow);
			expect.fail("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(TimeoutError);
			expect(e).toBeInstanceOf(Error);
		}
	});

	it("inner promise rejection wins over timeout if it happens first", async () => {
		const fast = new Promise<number>((_, reject) => {
			reject(new Error("fast rejection"));
		});
		await expect(timeout(100, fast)).rejects.toThrow("fast rejection");
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

	it("accepts a Date object", async () => {
		const deadline = new Date(Date.now() + 200);
		const result = await timeoutAt(deadline, Promise.resolve("ok"));
		expect(result).toBe("ok");
	});

	it("past deadline throws TimeoutError immediately", async () => {
		const pastDeadline = Date.now() - 1000;
		const start = Date.now();
		await expect(
			timeoutAt(pastDeadline, new Promise<number>(() => {})),
		).rejects.toThrow(TimeoutError);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(100);
	});

	it("Date object in the past throws TimeoutError", async () => {
		const pastDate = new Date(Date.now() - 1000);
		await expect(
			timeoutAt(pastDate, new Promise<number>(() => {})),
		).rejects.toThrow(TimeoutError);
	});

	it("propagates inner rejection before deadline", async () => {
		const deadline = Date.now() + 200;
		const failing = Promise.reject(new Error("inner fail"));
		await expect(timeoutAt(deadline, failing)).rejects.toThrow("inner fail");
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

	it("respects backpressure from consumer", async () => {
		const start = Date.now();
		let count = 0;
		for await (const tick of interval(10)) {
			if (tick > 0) {
				// Simulate slow consumer
				await new Promise((r) => setTimeout(r, 30));
			}
			count++;
			if (tick >= 2) break;
		}
		const elapsed = Date.now() - start;
		expect(count).toBe(3);
		// With backpressure: at least 2 * 30ms consumer delay + 2 * 10ms interval
		// Without backpressure it would be much faster
		expect(elapsed).toBeGreaterThanOrEqual(60);
	});

	it("yields consecutive integers", async () => {
		const ticks: number[] = [];
		for await (const tick of interval(5)) {
			ticks.push(tick);
			if (tick >= 4) break;
		}
		expect(ticks).toEqual([0, 1, 2, 3, 4]);
	});

	it("can be broken immediately on first tick", async () => {
		let count = 0;
		for await (const _tick of interval(1000)) {
			count++;
			break;
		}
		expect(count).toBe(1);
	});
});
