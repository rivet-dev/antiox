import { describe, it, expect } from "vitest";
import { RwLock, RwLockReadGuard, RwLockWriteGuard } from "../../src/sync/rwlock";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RwLock", () => {
	it("multiple concurrent readers", async () => {
		const lock = new RwLock(42);

		const r1 = await lock.read();
		const r2 = await lock.read();
		const r3 = await lock.read();

		expect(r1.value).toBe(42);
		expect(r2.value).toBe(42);
		expect(r3.value).toBe(42);

		r1.release();
		r2.release();
		r3.release();
	});

	it("writer blocks until readers release", async () => {
		const lock = new RwLock(0);

		const r1 = await lock.read();
		const r2 = await lock.read();

		let writerAcquired = false;
		const writerPromise = lock.write().then((w) => {
			writerAcquired = true;
			return w;
		});

		await delay(20);
		expect(writerAcquired).toBe(false);

		r1.release();
		await delay(10);
		expect(writerAcquired).toBe(false);

		r2.release();
		const writer = await writerPromise;
		expect(writerAcquired).toBe(true);
		writer.release();
	});

	it("readers wait when writer holds lock", async () => {
		const lock = new RwLock(0);

		const writer = await lock.write();

		let readerAcquired = false;
		const readerPromise = lock.read().then((r) => {
			readerAcquired = true;
			return r;
		});

		await delay(20);
		expect(readerAcquired).toBe(false);

		writer.release();
		const reader = await readerPromise;
		expect(readerAcquired).toBe(true);
		reader.release();
	});

	it("tryRead succeeds when no writer", () => {
		const lock = new RwLock("data");
		const r = lock.tryRead();
		expect(r.value).toBe("data");
		r.release();
	});

	it("tryRead throws when writer is active", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		expect(() => lock.tryRead()).toThrow();
		writer.release();
	});

	it("tryWrite succeeds when no readers or writers", () => {
		const lock = new RwLock(0);
		const w = lock.tryWrite();
		expect(w.value).toBe(0);
		w.release();
	});

	it("tryWrite throws when readers are active", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();

		expect(() => lock.tryWrite()).toThrow();
		reader.release();
	});

	it("tryWrite throws when writer is active", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		expect(() => lock.tryWrite()).toThrow();
		writer.release();
	});

	it("guard value access and mutation", async () => {
		const lock = new RwLock(100);

		const reader = await lock.read();
		expect(reader.value).toBe(100);
		reader.release();

		const writer = await lock.write();
		expect(writer.value).toBe(100);
		writer.value = 200;
		expect(writer.value).toBe(200);
		writer.release();

		const reader2 = await lock.read();
		expect(reader2.value).toBe(200);
		reader2.release();
	});

	it("Symbol.dispose releases read guard", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();

		reader[Symbol.dispose]();

		const writer = lock.tryWrite();
		writer.release();
	});

	it("Symbol.dispose releases write guard", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		writer[Symbol.dispose]();

		const reader = lock.tryRead();
		reader.release();
	});

	it("read guard value access after release throws", async () => {
		const lock = new RwLock(42);
		const reader = await lock.read();
		reader.release();

		expect(() => reader.value).toThrow("RwLockReadGuard has been released");
	});

	it("write guard value get after release throws", async () => {
		const lock = new RwLock(42);
		const writer = await lock.write();
		writer.release();

		expect(() => writer.value).toThrow("RwLockWriteGuard has been released");
	});

	it("write guard value set after release throws", async () => {
		const lock = new RwLock(42);
		const writer = await lock.write();
		writer.release();

		expect(() => {
			writer.value = 99;
		}).toThrow("RwLockWriteGuard has been released");
	});

	it("double release of read guard is a no-op", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();
		reader.release();
		reader.release();

		const writer = lock.tryWrite();
		writer.release();
	});

	it("double release of write guard is a no-op", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();
		writer.release();
		writer.release();

		const reader = lock.tryRead();
		reader.release();
	});

	it("writer-preferring: new readers wait when a writer is waiting", async () => {
		const lock = new RwLock(0);
		const r1 = await lock.read();

		// A writer is now waiting
		let writerAcquired = false;
		const writerPromise = lock.write().then((w) => {
			writerAcquired = true;
			return w;
		});

		// New reader should also wait because a writer is waiting
		let readerAcquired = false;
		const readerPromise = lock.read().then((r) => {
			readerAcquired = true;
			return r;
		});

		await delay(20);
		expect(writerAcquired).toBe(false);
		expect(readerAcquired).toBe(false);

		r1.release();

		// Writer should get priority over the new reader
		const writer = await writerPromise;
		expect(writerAcquired).toBe(true);
		expect(readerAcquired).toBe(false);

		writer.release();
		const reader = await readerPromise;
		expect(readerAcquired).toBe(true);
		reader.release();
	});

	it("tryRead throws when a writer is waiting (not just active)", async () => {
		const lock = new RwLock(0);
		const r1 = await lock.read();

		// A writer is now waiting
		const writerPromise = lock.write();

		expect(() => lock.tryRead()).toThrow("RwLock is held or has a waiting writer");

		r1.release();
		const writer = await writerPromise;
		writer.release();
	});

	it("all waiting readers are woken when writer releases and no writers waiting", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();

		const readersAcquired: boolean[] = [false, false, false];
		const readerPromises = readersAcquired.map((_, i) =>
			lock.read().then((r) => {
				readersAcquired[i] = true;
				return r;
			}),
		);

		await delay(20);
		expect(readersAcquired.every((a) => a === false)).toBe(true);

		writer.release();
		const readers = await Promise.all(readerPromises);
		expect(readersAcquired.every((a) => a === true)).toBe(true);

		readers.forEach((r) => r.release());
	});

	it("multiple queued writers are served one at a time", async () => {
		const lock = new RwLock(0);
		const w1 = await lock.write();
		const order: number[] = [];

		const wp2 = lock.write().then((w) => {
			order.push(2);
			w.value = 2;
			w.release();
		});
		const wp3 = lock.write().then((w) => {
			order.push(3);
			w.value = 3;
			w.release();
		});

		w1.value = 1;
		w1.release();

		await Promise.all([wp2, wp3]);
		expect(order).toEqual([2, 3]);

		const r = lock.tryRead();
		expect(r.value).toBe(3);
		r.release();
	});

	it("concurrent read-write workload serializes writes correctly", async () => {
		const lock = new RwLock(0);
		const iterations = 20;

		const writers = Array.from({ length: iterations }, async (_, i) => {
			const w = await lock.write();
			const current = w.value;
			await delay(1);
			w.value = current + 1;
			w.release();
		});

		await Promise.all(writers);

		const r = await lock.read();
		expect(r.value).toBe(iterations);
		r.release();
	});

	it("tryRead allows multiple concurrent tryRead calls", () => {
		const lock = new RwLock(42);
		const r1 = lock.tryRead();
		const r2 = lock.tryRead();
		const r3 = lock.tryRead();

		expect(r1.value).toBe(42);
		expect(r2.value).toBe(42);
		expect(r3.value).toBe(42);

		r1.release();
		r2.release();
		r3.release();
	});

	it("tryWrite fails while tryRead guards are held", () => {
		const lock = new RwLock(0);
		const r1 = lock.tryRead();

		expect(() => lock.tryWrite()).toThrow("RwLock is held");

		r1.release();
		const w = lock.tryWrite();
		w.release();
	});

	it("read guard Symbol.dispose after release is a no-op", async () => {
		const lock = new RwLock(0);
		const reader = await lock.read();
		reader.release();
		reader[Symbol.dispose]();

		const w = lock.tryWrite();
		w.release();
	});

	it("write guard Symbol.dispose after release is a no-op", async () => {
		const lock = new RwLock(0);
		const writer = await lock.write();
		writer.release();
		writer[Symbol.dispose]();

		const r = lock.tryRead();
		r.release();
	});

	it("readers resume after writer-then-readers-then-writer pattern", async () => {
		const lock = new RwLock(0);

		// Phase 1: write
		const w1 = await lock.write();
		w1.value = 1;
		w1.release();

		// Phase 2: multiple reads
		const r1 = await lock.read();
		const r2 = await lock.read();
		expect(r1.value).toBe(1);
		expect(r2.value).toBe(1);
		r1.release();
		r2.release();

		// Phase 3: write again
		const w2 = await lock.write();
		w2.value = 2;
		w2.release();

		// Phase 4: read again
		const r3 = await lock.read();
		expect(r3.value).toBe(2);
		r3.release();
	});

	it("RwLock with object value", async () => {
		const obj = { x: 1 };
		const lock = new RwLock(obj);

		const w = await lock.write();
		w.value.x = 42;
		w.release();

		const r = await lock.read();
		expect(r.value.x).toBe(42);
		expect(r.value).toBe(obj);
		r.release();
	});
});
