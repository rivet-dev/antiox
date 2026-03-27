import { describe, it, expect } from "vitest";
import {
	channel,
	SendError,
	TryRecvError,
} from "../../src/sync/priority_channel";

describe("channel", () => {
	it("messages received in priority order (highest first)", async () => {
		const [tx, rx] = channel<number>();
		tx.send(1);
		tx.send(5);
		tx.send(3);

		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(3);
		expect(await rx.recv()).toBe(1);
	});

	it("custom comparator (min-heap)", async () => {
		const [tx, rx] = channel<number>((a, b) => {
			if (a < b) return 1;
			if (a > b) return -1;
			return 0;
		});
		tx.send(10);
		tx.send(2);
		tx.send(7);

		expect(await rx.recv()).toBe(2);
		expect(await rx.recv()).toBe(7);
		expect(await rx.recv()).toBe(10);
	});

	it("multi-producer via clone", async () => {
		const [tx1, rx] = channel<number>();
		const tx2 = tx1.clone();

		tx1.send(3);
		tx2.send(5);
		tx1.send(1);

		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(3);
		expect(await rx.recv()).toBe(1);
	});

	it("disconnection: sender close -> recv returns null after drain", async () => {
		const [tx, rx] = channel<number>();
		tx.send(10);
		tx.send(20);
		tx.close();

		expect(await rx.recv()).toBe(20);
		expect(await rx.recv()).toBe(10);
		expect(await rx.recv()).toBeNull();
	});

	it("tryRecv success and errors", () => {
		const [tx, rx] = channel<number>();

		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("empty");
		}

		tx.send(42);
		expect(rx.tryRecv()).toBe(42);

		tx.close();
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("disconnected");
		}
	});

	it("async iterator works", async () => {
		const [tx, rx] = channel<number>();
		tx.send(1);
		tx.send(3);
		tx.send(2);
		tx.close();

		const results: number[] = [];
		for await (const value of rx) {
			results.push(value);
		}
		expect(results).toEqual([3, 2, 1]);
	});
});

describe("SendError", () => {
	it("preserves the rejected value", () => {
		const [tx, rx] = channel<string>();
		rx.close();

		try {
			tx.send("important-data");
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<string>).value).toBe("important-data");
			expect((e as SendError<string>).name).toBe("SendError");
		}
	});

	it("thrown when sending on a dropped sender", () => {
		const [tx] = channel<number>();
		tx.close();

		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("thrown when sending after receiver close", () => {
		const [tx, rx] = channel<number>();
		rx.close();

		expect(() => tx.send(1)).toThrow(SendError);
	});
});

describe("Sender", () => {
	it("isClosed() reflects receiver state", () => {
		const [tx, rx] = channel<number>();
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("clone() throws on a dropped sender", () => {
		const [tx] = channel<number>();
		tx.close();
		expect(() => tx.clone()).toThrow("Cannot clone a dropped Sender");
	});

	it("close() is idempotent", () => {
		const [tx] = channel<number>();
		tx.close();
		tx.close();
		tx.close();
	});

	it("Symbol.dispose calls close", async () => {
		const [tx, rx] = channel<number>();
		tx.send(1);
		tx[Symbol.dispose]();

		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("all cloned senders must close before recv returns null", async () => {
		const [tx1, rx] = channel<number>();
		const tx2 = tx1.clone();
		const tx3 = tx2.clone();

		tx1.close();
		tx2.close();

		tx3.send(42);
		expect(await rx.recv()).toBe(42);

		tx3.close();
		expect(await rx.recv()).toBeNull();
	});

	it("closing all senders resolves pending recv waiters with null", async () => {
		const [tx, rx] = channel<number>();

		const recvPromise = rx.recv();
		tx.close();

		expect(await recvPromise).toBeNull();
	});

	it("closing all senders with items in heap does not resolve waiters", async () => {
		const [tx, rx] = channel<number>();
		tx.send(99);

		const tx2 = tx.clone();
		tx.close();
		tx2.close();

		// Items remain in the heap; recv should still return them
		expect(await rx.recv()).toBe(99);
		expect(await rx.recv()).toBeNull();
	});
});

describe("Receiver", () => {
	it("close() is idempotent", () => {
		const [, rx] = channel<number>();
		rx.close();
		rx.close();
		rx.close();
	});

	it("Symbol.dispose calls close", () => {
		const [tx, rx] = channel<number>();
		rx[Symbol.dispose]();

		expect(tx.isClosed()).toBe(true);
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("recv returns null after receiver is closed", async () => {
		const [tx, rx] = channel<number>();
		tx.send(5);
		rx.close();

		// Items already in heap are still accessible
		expect(await rx.recv()).toBe(5);
		// But once drained, returns null instead of waiting
		expect(await rx.recv()).toBeNull();
	});

	it("tryRecv returns items from heap even if senders are gone", () => {
		const [tx, rx] = channel<number>();
		tx.send(10);
		tx.send(20);
		tx.close();

		expect(rx.tryRecv()).toBe(20);
		expect(rx.tryRecv()).toBe(10);
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
	});
});

describe("priority ordering edge cases", () => {
	it("single item", async () => {
		const [tx, rx] = channel<number>();
		tx.send(42);
		expect(await rx.recv()).toBe(42);
	});

	it("equal priority items are all returned", async () => {
		const [tx, rx] = channel<number>();
		tx.send(5);
		tx.send(5);
		tx.send(5);

		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(5);
	});

	it("string priorities use default comparator (lexicographic max)", async () => {
		const [tx, rx] = channel<string>();
		tx.send("apple");
		tx.send("cherry");
		tx.send("banana");

		expect(await rx.recv()).toBe("cherry");
		expect(await rx.recv()).toBe("banana");
		expect(await rx.recv()).toBe("apple");
	});

	it("custom comparator with objects", async () => {
		interface Task {
			priority: number;
			name: string;
		}
		const [tx, rx] = channel<Task>((a, b) => a.priority - b.priority);

		tx.send({ priority: 1, name: "low" });
		tx.send({ priority: 10, name: "high" });
		tx.send({ priority: 5, name: "mid" });

		expect((await rx.recv())!.name).toBe("high");
		expect((await rx.recv())!.name).toBe("mid");
		expect((await rx.recv())!.name).toBe("low");
	});

	it("negative numbers order correctly", async () => {
		const [tx, rx] = channel<number>();
		tx.send(-10);
		tx.send(-1);
		tx.send(-100);

		expect(await rx.recv()).toBe(-1);
		expect(await rx.recv()).toBe(-10);
		expect(await rx.recv()).toBe(-100);
	});
});

describe("waiter wakeup", () => {
	it("send wakes a waiting receiver with the sent value", async () => {
		const [tx, rx] = channel<number>();

		const recvPromise = rx.recv();
		tx.send(99);

		expect(await recvPromise).toBe(99);
	});

	it("send wakes with highest priority when heap has items", async () => {
		const [tx, rx] = channel<number>();

		// Pre-load heap
		tx.send(3);

		// Drain it
		expect(await rx.recv()).toBe(3);

		// Now recv waits
		const recvPromise = rx.recv();

		// Send a lower-priority item; receiver should still get it (only item)
		tx.send(1);
		expect(await recvPromise).toBe(1);
	});

	it("waiter gets highest priority when woken with existing heap items", async () => {
		const [tx, rx] = channel<number>();

		// Start waiting
		const recvPromise = rx.recv();

		// The send path pushes to heap then pops the best for the waiter.
		// With only one item, the waiter gets that item.
		tx.send(5);
		expect(await recvPromise).toBe(5);

		// Now let's verify: send two items while a waiter exists.
		// First send wakes the waiter, second goes to heap.
		const recvPromise2 = rx.recv();
		tx.send(2);
		// Waiter was resolved with 2
		expect(await recvPromise2).toBe(2);

		tx.send(10);
		expect(await rx.recv()).toBe(10);
	});

	it("multiple pending recvs are resolved in order", async () => {
		const [tx, rx] = channel<number>();

		const p1 = rx.recv();
		const p2 = rx.recv();
		const p3 = rx.recv();

		// Each send wakes the oldest waiter with the best available item
		tx.send(100);
		tx.send(200);
		tx.send(300);

		// Each waiter was resolved one at a time, each getting only the newly sent item
		expect(await p1).toBe(100);
		expect(await p2).toBe(200);
		expect(await p3).toBe(300);
	});
});

describe("async iterator edge cases", () => {
	it("terminates when sender drops mid-iteration", async () => {
		const [tx, rx] = channel<number>();

		const results: number[] = [];
		const iterDone = (async () => {
			for await (const v of rx) {
				results.push(v);
			}
		})();

		tx.send(1);
		tx.send(2);

		// Let microtasks flush so the iterator consumes both items.
		// Each send wakes the waiting recv individually, so order is arrival order.
		await new Promise((r) => setTimeout(r, 10));

		tx.close();
		await iterDone;

		expect(results).toEqual([1, 2]);
	});

	it("empty channel with immediate close yields nothing", async () => {
		const [tx, rx] = channel<number>();
		tx.close();

		const results: number[] = [];
		for await (const v of rx) {
			results.push(v);
		}
		expect(results).toEqual([]);
	});
});

describe("TryRecvError", () => {
	it("has correct name and kind for empty", () => {
		const err = new TryRecvError("empty");
		expect(err.name).toBe("TryRecvError");
		expect(err.kind).toBe("empty");
		expect(err.message).toBe("Channel empty");
	});

	it("has correct name and kind for disconnected", () => {
		const err = new TryRecvError("disconnected");
		expect(err.name).toBe("TryRecvError");
		expect(err.kind).toBe("disconnected");
		expect(err.message).toBe("Channel disconnected");
	});
});
