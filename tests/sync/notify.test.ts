import { describe, it, expect } from "vitest";
import { Notify } from "../../src/sync/notify";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Notify", () => {
	it("notifyOne wakes one waiter", async () => {
		const notify = new Notify();
		let woken = false;

		const waiter = notify.notified().then(() => {
			woken = true;
		});

		expect(woken).toBe(false);
		notify.notifyOne();
		await waiter;
		expect(woken).toBe(true);
	});

	it("notifyWaiters wakes all current waiters", async () => {
		const notify = new Notify();
		const results: number[] = [];

		const w1 = notify.notified().then(() => results.push(1));
		const w2 = notify.notified().then(() => results.push(2));
		const w3 = notify.notified().then(() => results.push(3));

		notify.notifyWaiters();
		await Promise.all([w1, w2, w3]);

		expect(results).toHaveLength(3);
		expect(results).toContain(1);
		expect(results).toContain(2);
		expect(results).toContain(3);
	});

	it("stored permit: notifyOne before notified() resolves immediately", async () => {
		const notify = new Notify();

		notify.notifyOne();

		let resolved = false;
		const p = notify.notified().then(() => {
			resolved = true;
		});

		await p;
		expect(resolved).toBe(true);
	});

	it("multiple sequential cycles work", async () => {
		const notify = new Notify();

		for (let i = 0; i < 3; i++) {
			let woken = false;
			const waiter = notify.notified().then(() => {
				woken = true;
			});

			notify.notifyOne();
			await waiter;
			expect(woken).toBe(true);
		}
	});

	it("notifyWaiters does not store a permit", async () => {
		const notify = new Notify();

		notify.notifyWaiters();

		let resolved = false;
		notify.notified().then(() => {
			resolved = true;
		});

		await delay(20);
		expect(resolved).toBe(false);
	});

	it("notifyOne with multiple waiters only wakes the first (FIFO)", async () => {
		const notify = new Notify();
		const order: number[] = [];

		const w1 = notify.notified().then(() => order.push(1));
		const w2 = notify.notified().then(() => order.push(2));

		notify.notifyOne();
		await w1;
		await delay(10);

		expect(order).toEqual([1]);
	});

	it("permit is consumed by first notified() caller", async () => {
		const notify = new Notify();
		notify.notifyOne();

		await notify.notified();

		let resolved = false;
		notify.notified().then(() => {
			resolved = true;
		});

		await delay(20);
		expect(resolved).toBe(false);
	});

	it("multiple notifyOne calls only store one permit", async () => {
		const notify = new Notify();
		notify.notifyOne();
		notify.notifyOne();
		notify.notifyOne();

		await notify.notified();

		let resolved = false;
		notify.notified().then(() => {
			resolved = true;
		});

		await delay(20);
		expect(resolved).toBe(false);
	});

	it("Symbol.dispose wakes all waiters", async () => {
		const notify = new Notify();
		const results: number[] = [];

		const w1 = notify.notified().then(() => results.push(1));
		const w2 = notify.notified().then(() => results.push(2));

		notify[Symbol.dispose]();
		await Promise.all([w1, w2]);

		expect(results).toEqual([1, 2]);
	});

	it("FIFO ordering: waiters woken in registration order", async () => {
		const notify = new Notify();
		const order: number[] = [];

		notify.notified().then(() => order.push(1));
		notify.notified().then(() => order.push(2));
		notify.notified().then(() => order.push(3));

		notify.notifyOne();
		await delay(5);
		notify.notifyOne();
		await delay(5);
		notify.notifyOne();
		await delay(5);

		expect(order).toEqual([1, 2, 3]);
	});

	it("notifyWaiters with zero waiters is a no-op", () => {
		const notify = new Notify();
		notify.notifyWaiters();
	});

	it("notifyOne after notifyWaiters still works", async () => {
		const notify = new Notify();

		const w1 = notify.notified();
		notify.notifyWaiters();
		await w1;

		const w2 = notify.notified();
		notify.notifyOne();
		await w2;
	});

	it("interleaved notify and notified calls", async () => {
		const notify = new Notify();

		notify.notifyOne();
		await notify.notified();

		const w = notify.notified();
		notify.notifyOne();
		await w;

		notify.notifyOne();
		await notify.notified();
	});

	it("notifyWaiters does not affect subsequent waiters", async () => {
		const notify = new Notify();
		const order: number[] = [];

		const w1 = notify.notified().then(() => order.push(1));
		notify.notifyWaiters();
		await w1;

		let laterResolved = false;
		notify.notified().then(() => {
			laterResolved = true;
		});

		await delay(20);
		expect(laterResolved).toBe(false);
		expect(order).toEqual([1]);
	});
});
