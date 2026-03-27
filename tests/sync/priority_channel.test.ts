import { describe, it, expect } from "vitest";
import {
	priorityChannel,
	PrioritySender,
	PriorityReceiver,
	TryRecvError,
} from "../../src/sync/priority_channel";

describe("priorityChannel", () => {
	it("messages received in priority order (highest first)", async () => {
		const [tx, rx] = priorityChannel<number>();
		tx.send(1);
		tx.send(5);
		tx.send(3);

		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(3);
		expect(await rx.recv()).toBe(1);
	});

	it("custom comparator (min-heap)", async () => {
		const [tx, rx] = priorityChannel<number>((a, b) => {
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
		const [tx1, rx] = priorityChannel<number>();
		const tx2 = tx1.clone();

		tx1.send(3);
		tx2.send(5);
		tx1.send(1);

		expect(await rx.recv()).toBe(5);
		expect(await rx.recv()).toBe(3);
		expect(await rx.recv()).toBe(1);
	});

	it("disconnection: sender close -> recv returns null after drain", async () => {
		const [tx, rx] = priorityChannel<number>();
		tx.send(10);
		tx.send(20);
		tx.close();

		expect(await rx.recv()).toBe(20);
		expect(await rx.recv()).toBe(10);
		expect(await rx.recv()).toBeNull();
	});

	it("tryRecv success and errors", () => {
		const [tx, rx] = priorityChannel<number>();

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
		const [tx, rx] = priorityChannel<number>();
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
