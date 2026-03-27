import { describe, it, expect } from "vitest";
import { Mutex, MutexGuard } from "../../src/sync/mutex";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Mutex", () => {
	it("lock/unlock basic flow", async () => {
		const mutex = new Mutex(42);
		const guard = await mutex.lock();
		expect(guard.value).toBe(42);
		guard.release();
	});

	it("second lock waits until first releases", async () => {
		const mutex = new Mutex(0);
		const guard1 = await mutex.lock();

		let secondAcquired = false;
		const waiter = mutex.lock().then((g) => {
			secondAcquired = true;
			return g;
		});

		await delay(20);
		expect(secondAcquired).toBe(false);

		guard1.release();
		const guard2 = await waiter;
		expect(secondAcquired).toBe(true);
		guard2.release();
	});

	it("tryLock succeeds when unlocked", () => {
		const mutex = new Mutex("hello");
		const guard = mutex.tryLock();
		expect(guard.value).toBe("hello");
		guard.release();
	});

	it("tryLock throws when locked", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();

		expect(() => mutex.tryLock()).toThrow();
		guard.release();
	});

	it("MutexGuard value get/set", async () => {
		const mutex = new Mutex(10);
		const guard = await mutex.lock();

		expect(guard.value).toBe(10);
		guard.value = 20;
		expect(guard.value).toBe(20);

		guard.release();

		const guard2 = await mutex.lock();
		expect(guard2.value).toBe(20);
		guard2.release();
	});

	it("Symbol.dispose releases lock", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();

		guard[Symbol.dispose]();

		const guard2 = mutex.tryLock();
		expect(guard2.value).toBe(0);
		guard2.release();
	});

	it("concurrent access is serialized", async () => {
		const mutex = new Mutex(0);
		const iterations = 50;

		const tasks = Array.from({ length: iterations }, async () => {
			const guard = await mutex.lock();
			const current = guard.value;
			await delay(1);
			guard.value = current + 1;
			guard.release();
		});

		await Promise.all(tasks);

		const guard = await mutex.lock();
		expect(guard.value).toBe(iterations);
		guard.release();
	});

	it("reading value after release throws", async () => {
		const mutex = new Mutex(42);
		const guard = await mutex.lock();
		guard.release();

		expect(() => guard.value).toThrow("MutexGuard has been released");
	});

	it("writing value after release throws", async () => {
		const mutex = new Mutex(42);
		const guard = await mutex.lock();
		guard.release();

		expect(() => {
			guard.value = 99;
		}).toThrow("MutexGuard has been released");
	});

	it("double release is a no-op", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();
		guard.release();
		guard.release();

		const guard2 = mutex.tryLock();
		expect(guard2.value).toBe(0);
		guard2.release();
	});

	it("Symbol.dispose after release is a no-op", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();
		guard.release();
		guard[Symbol.dispose]();

		const guard2 = mutex.tryLock();
		guard2.release();
	});

	it("tryLock succeeds immediately after release", async () => {
		const mutex = new Mutex(5);
		const guard = await mutex.lock();
		guard.release();

		const guard2 = mutex.tryLock();
		expect(guard2.value).toBe(5);
		guard2.release();
	});

	it("FIFO fairness: waiters are served in order", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();
		const order: number[] = [];

		const w1 = mutex.lock().then((g) => {
			order.push(1);
			g.release();
		});
		const w2 = mutex.lock().then((g) => {
			order.push(2);
			g.release();
		});
		const w3 = mutex.lock().then((g) => {
			order.push(3);
			g.release();
		});

		guard.release();
		await Promise.all([w1, w2, w3]);
		expect(order).toEqual([1, 2, 3]);
	});

	it("multiple waiters all eventually acquire the lock", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();
		const count = 10;
		const acquired: boolean[] = new Array(count).fill(false);

		const waiters = Array.from({ length: count }, (_, i) =>
			mutex.lock().then((g) => {
				acquired[i] = true;
				g.release();
			}),
		);

		guard.release();
		await Promise.all(waiters);

		expect(acquired.every(Boolean)).toBe(true);
	});

	it("lock hands off directly to next waiter without unlocking gap", async () => {
		const mutex = new Mutex(0);
		const guard = await mutex.lock();

		const waiterPromise = mutex.lock();

		// Release should hand off to waiter, so tryLock should still fail
		guard.release();

		// tryLock should throw because the lock was handed to the waiter
		expect(() => mutex.tryLock()).toThrow();

		const guard2 = await waiterPromise;
		guard2.release();
	});

	it("Mutex Symbol.dispose wakes a waiting task", async () => {
		const mutex = new Mutex(42);
		const guard = await mutex.lock();

		let acquired = false;
		const waiterPromise = mutex.lock().then((g) => {
			acquired = true;
			return g;
		});

		// Dispose the guard to release it
		guard[Symbol.dispose]();

		const guard2 = await waiterPromise;
		expect(acquired).toBe(true);
		guard2.release();
	});

	it("Mutex Symbol.dispose on unlocked mutex is a no-op", () => {
		const mutex = new Mutex(0);
		mutex[Symbol.dispose]();

		const guard = mutex.tryLock();
		expect(guard.value).toBe(0);
		guard.release();
	});

	it("mutex with undefined value", async () => {
		const mutex = new Mutex<number | undefined>(undefined);
		const guard = await mutex.lock();
		expect(guard.value).toBeUndefined();
		guard.value = 42;
		guard.release();

		const guard2 = await mutex.lock();
		expect(guard2.value).toBe(42);
		guard2.release();
	});

	it("mutex with null value", async () => {
		const mutex = new Mutex<null>(null);
		const guard = await mutex.lock();
		expect(guard.value).toBeNull();
		guard.release();
	});

	it("mutex with object value maintains reference", async () => {
		const obj = { a: 1, b: [2, 3] };
		const mutex = new Mutex(obj);
		const guard = await mutex.lock();
		guard.value.a = 99;
		guard.release();

		const guard2 = await mutex.lock();
		expect(guard2.value.a).toBe(99);
		expect(guard2.value).toBe(obj);
		guard2.release();
	});

	it("interleaved lock/tryLock", async () => {
		const mutex = new Mutex(0);

		const g1 = mutex.tryLock();
		expect(() => mutex.tryLock()).toThrow();
		g1.release();

		const g2 = await mutex.lock();
		expect(() => mutex.tryLock()).toThrow();
		g2.release();

		const g3 = mutex.tryLock();
		g3.release();
	});
});
