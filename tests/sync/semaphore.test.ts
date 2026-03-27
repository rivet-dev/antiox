import { describe, it, expect } from "vitest";
import { Semaphore, SemaphorePermit, AcquireError } from "../../src/sync/semaphore";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Semaphore", () => {
	it("acquire/release basic cycle", async () => {
		const sem = new Semaphore(1);
		expect(sem.availablePermits()).toBe(1);

		const permit = await sem.acquire();
		expect(sem.availablePermits()).toBe(0);

		permit.release();
		expect(sem.availablePermits()).toBe(1);
	});

	it("blocks when no permits, unblocks on release", async () => {
		const sem = new Semaphore(1);
		const permit1 = await sem.acquire();

		let acquired = false;
		const waiter = sem.acquire().then((p) => {
			acquired = true;
			return p;
		});

		await delay(20);
		expect(acquired).toBe(false);

		permit1.release();
		const permit2 = await waiter;
		expect(acquired).toBe(true);
		permit2.release();
	});

	it("acquireMany acquires multiple permits", async () => {
		const sem = new Semaphore(5);
		const permit = await sem.acquireMany(3);
		expect(sem.availablePermits()).toBe(2);

		permit.release();
		expect(sem.availablePermits()).toBe(5);
	});

	it("tryAcquire succeeds when permits available", () => {
		const sem = new Semaphore(1);
		const permit = sem.tryAcquire();
		expect(sem.availablePermits()).toBe(0);
		permit.release();
	});

	it("tryAcquire throws when no permits available", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();

		expect(() => sem.tryAcquire()).toThrow(AcquireError);
		permit.release();
	});

	it("tryAcquireMany succeeds when enough permits available", () => {
		const sem = new Semaphore(3);
		const permit = sem.tryAcquireMany(2);
		expect(sem.availablePermits()).toBe(1);
		permit.release();
	});

	it("tryAcquireMany throws when insufficient permits", () => {
		const sem = new Semaphore(2);
		expect(() => sem.tryAcquireMany(3)).toThrow(AcquireError);
	});

	it("availablePermits accuracy after acquire/release", async () => {
		const sem = new Semaphore(3);
		expect(sem.availablePermits()).toBe(3);

		const p1 = await sem.acquire();
		expect(sem.availablePermits()).toBe(2);

		const p2 = await sem.acquireMany(2);
		expect(sem.availablePermits()).toBe(0);

		p1.release();
		expect(sem.availablePermits()).toBe(1);

		p2.release();
		expect(sem.availablePermits()).toBe(3);
	});

	it("close() wakes waiters with AcquireError", async () => {
		const sem = new Semaphore(0);

		const waiter = sem.acquire();
		sem.close();

		await expect(waiter).rejects.toThrow(AcquireError);
	});

	it("close() causes future acquires to reject", async () => {
		const sem = new Semaphore(1);
		sem.close();

		await expect(sem.acquire()).rejects.toThrow(AcquireError);
	});

	it("isClosed()", () => {
		const sem = new Semaphore(1);
		expect(sem.isClosed()).toBe(false);

		sem.close();
		expect(sem.isClosed()).toBe(true);
	});

	it("Symbol.dispose releases permit", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();
		expect(sem.availablePermits()).toBe(0);

		permit[Symbol.dispose]();
		expect(sem.availablePermits()).toBe(1);
	});

	it("negative initial permits throws RangeError", () => {
		expect(() => new Semaphore(-1)).toThrow(RangeError);
	});

	it("zero initial permits blocks acquire", async () => {
		const sem = new Semaphore(0);
		let acquired = false;

		sem.acquire().then(() => {
			acquired = true;
		});

		await delay(20);
		expect(acquired).toBe(false);
		expect(sem.availablePermits()).toBe(0);
	});

	it("acquireMany with n < 1 throws RangeError synchronously", () => {
		const sem = new Semaphore(5);
		expect(() => sem.acquireMany(0)).toThrow(RangeError);
		expect(() => sem.tryAcquireMany(0)).toThrow(RangeError);
	});

	it("double release on same permit is a no-op", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();
		permit.release();
		expect(sem.availablePermits()).toBe(1);

		permit.release();
		expect(sem.availablePermits()).toBe(1);
	});

	it("close is idempotent", () => {
		const sem = new Semaphore(1);
		sem.close();
		sem.close();
		expect(sem.isClosed()).toBe(true);
	});

	it("tryAcquire on closed semaphore throws AcquireError", () => {
		const sem = new Semaphore(5);
		sem.close();
		expect(() => sem.tryAcquire()).toThrow(AcquireError);
	});

	it("tryAcquireMany on closed semaphore throws AcquireError", () => {
		const sem = new Semaphore(5);
		sem.close();
		expect(() => sem.tryAcquireMany(2)).toThrow(AcquireError);
	});

	it("Symbol.dispose on semaphore closes it", () => {
		const sem = new Semaphore(1);
		sem[Symbol.dispose]();
		expect(sem.isClosed()).toBe(true);
	});

	it("release after close returns permits but new acquires still fail", async () => {
		const sem = new Semaphore(1);
		const permit = await sem.acquire();
		sem.close();
		permit.release();
		expect(sem.availablePermits()).toBe(1);
		await expect(sem.acquire()).rejects.toThrow(AcquireError);
	});

	it("FIFO fairness: head-of-line blocks later waiters", async () => {
		const sem = new Semaphore(3);
		const p1 = await sem.acquireMany(3);
		expect(sem.availablePermits()).toBe(0);

		const order: number[] = [];
		const w1 = sem.acquireMany(3).then((p) => {
			order.push(1);
			return p;
		});
		const w2 = sem.acquire().then((p) => {
			order.push(2);
			return p;
		});

		// Release 1 permit - not enough for w1 (needs 3), so w2 (needs 1) is also blocked
		p1.release();
		await delay(10);

		// w1 should get satisfied first since it has 3 permits now
		const permit1 = await w1;
		permit1.release();

		const permit2 = await w2;
		permit2.release();

		expect(order).toEqual([1, 2]);
	});

	it("multiple waiters drained in FIFO order on release", async () => {
		const sem = new Semaphore(0);
		const order: number[] = [];

		const w1 = sem.acquire().then((p) => {
			order.push(1);
			return p;
		});
		const w2 = sem.acquire().then((p) => {
			order.push(2);
			return p;
		});
		const w3 = sem.acquire().then((p) => {
			order.push(3);
			return p;
		});

		sem._release(3);

		const [p1, p2, p3] = await Promise.all([w1, w2, w3]);
		expect(order).toEqual([1, 2, 3]);
		p1.release();
		p2.release();
		p3.release();
	});

	it("acquireMany queues behind existing waiters even if permits available", async () => {
		const sem = new Semaphore(2);
		const p1 = await sem.acquireMany(2);

		const order: number[] = [];
		const w1 = sem.acquireMany(2).then((p) => {
			order.push(1);
			return p;
		});
		const w2 = sem.acquire().then((p) => {
			order.push(2);
			return p;
		});

		await delay(10);
		expect(order).toEqual([]);

		p1.release();
		const r1 = await w1;
		r1.release();
		const r2 = await w2;
		r2.release();

		expect(order).toEqual([1, 2]);
	});

	it("close rejects multiple waiting acquires", async () => {
		const sem = new Semaphore(0);

		const w1 = sem.acquire();
		const w2 = sem.acquire();
		const w3 = sem.acquireMany(3);

		sem.close();

		await expect(w1).rejects.toThrow(AcquireError);
		await expect(w2).rejects.toThrow(AcquireError);
		await expect(w3).rejects.toThrow(AcquireError);
	});

	it("tryAcquireMany with n < 1 throws RangeError", () => {
		const sem = new Semaphore(5);
		expect(() => sem.tryAcquireMany(0)).toThrow(RangeError);
		expect(() => sem.tryAcquireMany(-1)).toThrow(RangeError);
	});

	it("release drains partially: stops when head cannot be satisfied", async () => {
		const sem = new Semaphore(0);

		const order: number[] = [];
		const w1 = sem.acquire().then((p) => {
			order.push(1);
			return p;
		});
		const w2 = sem.acquireMany(5).then((p) => {
			order.push(2);
			return p;
		});

		sem._release(1);
		const p1 = await w1;
		await delay(10);

		// w2 needs 5 permits but only 0 remain
		expect(order).toEqual([1]);
		expect(sem.availablePermits()).toBe(0);

		sem._release(5);
		const p2 = await w2;
		expect(order).toEqual([1, 2]);
		p1.release();
		p2.release();
	});
});
