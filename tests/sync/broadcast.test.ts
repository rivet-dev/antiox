import { describe, it, expect } from "vitest";
import {
	broadcast,
	BroadcastSender,
	BroadcastReceiver,
	RecvError,
} from "../../src/sync/broadcast";

describe("broadcast", () => {
	it("all receivers get every message", async () => {
		const [tx, rx1] = broadcast<number>(16);
		const rx2 = tx.subscribe();

		tx.send(1);
		tx.send(2);

		expect(await rx1.recv()).toBe(1);
		expect(await rx1.recv()).toBe(2);
		expect(await rx2.recv()).toBe(1);
		expect(await rx2.recv()).toBe(2);
	});

	it("new subscriber starts from current position", async () => {
		const [tx, rx1] = broadcast<number>(16);
		tx.send(1);
		tx.send(2);

		const rx2 = tx.subscribe();
		tx.send(3);

		expect(await rx2.recv()).toBe(3);
		expect(await rx1.recv()).toBe(1);
		expect(await rx1.recv()).toBe(2);
		expect(await rx1.recv()).toBe(3);
	});

	it("slow receiver gets lagged error when buffer wraps", async () => {
		const [tx, rx] = broadcast<number>(2);

		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);

		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("lagged");
			expect((e as RecvError).lagged).toBeGreaterThan(0);
		}

		const val = await rx.recv();
		expect(val).toBe(3);
	});

	it("sender close -> receivers get closed RecvError", async () => {
		const [tx, rx] = broadcast<number>(16);
		tx.close();
		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("closed");
		}
	});

	it("sender close rejects pending recv", async () => {
		const [tx, rx] = broadcast<number>(16);
		const p = rx.recv();
		tx.close();
		await expect(p).rejects.toThrow(RecvError);
	});

	it("receiverCount() tracks correctly", () => {
		const [tx, rx1] = broadcast<number>(16);
		expect(tx.receiverCount()).toBe(1);

		const rx2 = tx.subscribe();
		expect(tx.receiverCount()).toBe(2);

		const rx3 = rx2.clone();
		expect(tx.receiverCount()).toBe(3);

		rx1.close();
		expect(tx.receiverCount()).toBe(2);

		rx2.close();
		rx3.close();
		expect(tx.receiverCount()).toBe(0);
	});

	it("async iterator works, stops on close", async () => {
		const [tx, rx] = broadcast<number>(16);

		tx.send(10);
		tx.send(20);
		tx.send(30);
		setTimeout(() => tx.close(), 10);

		const results: number[] = [];
		for await (const msg of rx) {
			results.push(msg);
		}
		expect(results).toEqual([10, 20, 30]);
	});

	it("async iterator propagates lagged error", async () => {
		const [tx, rx] = broadcast<number>(2);

		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);

		try {
			for await (const _msg of rx) {
			}
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("lagged");
		}
	});

	it("clone sender works", async () => {
		const [tx, rx] = broadcast<number>(16);
		const tx2 = tx.clone();

		tx.send(1);
		tx2.send(2);

		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBe(2);

		tx.close();
		tx2.send(3);
		expect(await rx.recv()).toBe(3);

		tx2.close();
		await expect(rx.recv()).rejects.toThrow(RecvError);
	});

	it("capacity must be at least 1", () => {
		expect(() => broadcast(0)).toThrow(RangeError);
		expect(() => broadcast(-1)).toThrow(RangeError);
	});

	it("send on closed channel throws", () => {
		const [tx] = broadcast<number>(16);
		tx.close();
		expect(() => tx.send(1)).toThrow("Broadcast channel is closed");
	});

	it("send returns number of waiting receivers notified", async () => {
		const [tx, rx1] = broadcast<number>(16);
		const rx2 = tx.subscribe();

		const p1 = rx1.recv();
		const p2 = rx2.recv();

		const notified = tx.send(42);
		expect(notified).toBe(2);
		expect(await p1).toBe(42);
		expect(await p2).toBe(42);
	});

	it("send returns 0 when no receivers are waiting", () => {
		const [tx] = broadcast<number>(16);
		tx.subscribe();
		expect(tx.send(1)).toBe(0);
	});

	it("tryRecv returns buffered message synchronously", () => {
		const [tx, rx] = broadcast<number>(16);
		tx.send(1);
		tx.send(2);
		expect(rx.tryRecv()).toBe(1);
		expect(rx.tryRecv()).toBe(2);
	});

	it("tryRecv throws when no message available", () => {
		const [_tx, rx] = broadcast<number>(16);
		expect(() => rx.tryRecv()).toThrow("No message available");
	});

	it("tryRecv throws lagged error with exact count", () => {
		const [tx, rx] = broadcast<number>(2);
		tx.send(1);
		tx.send(2);
		tx.send(3);

		try {
			rx.tryRecv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("lagged");
			expect((e as RecvError).lagged).toBe(1);
		}

		expect(rx.tryRecv()).toBe(2);
		expect(rx.tryRecv()).toBe(3);
	});

	it("tryRecv throws closed RecvError on closed channel", () => {
		const [tx, rx] = broadcast<number>(16);
		tx.close();
		try {
			rx.tryRecv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(RecvError);
			expect((e as RecvError).kind).toBe("closed");
		}
	});

	it("lagged error reports exact missed count", async () => {
		const [tx, rx] = broadcast<number>(2);
		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);
		tx.send(5);

		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect((e as RecvError).lagged).toBe(3);
		}
	});

	it("after lagged error, cursor advances to oldest available", async () => {
		const [tx, rx] = broadcast<number>(3);
		tx.send(1);
		tx.send(2);
		tx.send(3);
		tx.send(4);
		tx.send(5);

		try {
			await rx.recv();
		} catch {
			// lagged - expected
		}

		expect(await rx.recv()).toBe(3);
		expect(await rx.recv()).toBe(4);
		expect(await rx.recv()).toBe(5);
	});

	it("receiver clone shares cursor position", async () => {
		const [tx, rx] = broadcast<number>(16);
		tx.send(1);
		tx.send(2);
		expect(await rx.recv()).toBe(1);

		const rx2 = rx.clone();
		expect(await rx2.recv()).toBe(2);
		expect(await rx.recv()).toBe(2);
	});

	it("receiver close is idempotent", () => {
		const [tx, rx] = broadcast<number>(16);
		expect(tx.receiverCount()).toBe(1);
		rx.close();
		rx.close();
		expect(tx.receiverCount()).toBe(0);
	});

	it("sender close is idempotent", () => {
		const [tx] = broadcast<number>(16);
		tx.close();
		tx.close();
	});

	it("Symbol.dispose on sender closes channel", async () => {
		const [tx, rx] = broadcast<number>(16);
		tx[Symbol.dispose]();
		await expect(rx.recv()).rejects.toThrow(RecvError);
	});

	it("Symbol.dispose on receiver decrements count", () => {
		const [tx, rx] = broadcast<number>(16);
		expect(tx.receiverCount()).toBe(1);
		rx[Symbol.dispose]();
		expect(tx.receiverCount()).toBe(0);
	});

	it("multiple pending receivers all get notified on send", async () => {
		const [tx, rx1] = broadcast<number>(16);
		const rx2 = tx.subscribe();
		const rx3 = tx.subscribe();

		const p1 = rx1.recv();
		const p2 = rx2.recv();
		const p3 = rx3.recv();

		tx.send(99);

		expect(await p1).toBe(99);
		expect(await p2).toBe(99);
		expect(await p3).toBe(99);
	});

	it("multiple pending receivers all rejected on close", async () => {
		const [tx, rx1] = broadcast<number>(16);
		const rx2 = tx.subscribe();

		const p1 = rx1.recv();
		const p2 = rx2.recv();

		tx.close();

		await expect(p1).rejects.toThrow(RecvError);
		await expect(p2).rejects.toThrow(RecvError);
	});

	it("capacity 1 ring buffer works correctly", async () => {
		const [tx, rx] = broadcast<number>(1);

		tx.send(1);
		expect(await rx.recv()).toBe(1);

		tx.send(2);
		expect(await rx.recv()).toBe(2);
	});

	it("capacity 1 detects lag after 2 sends without recv", async () => {
		const [tx, rx] = broadcast<number>(1);
		tx.send(1);
		tx.send(2);

		try {
			await rx.recv();
			expect.unreachable("should have thrown");
		} catch (e) {
			expect((e as RecvError).kind).toBe("lagged");
			expect((e as RecvError).lagged).toBe(1);
		}

		expect(await rx.recv()).toBe(2);
	});

	it("subscribe after close still creates a receiver that sees closed", async () => {
		const [tx] = broadcast<number>(16);
		tx.close();
		const rx = tx.subscribe();
		await expect(rx.recv()).rejects.toThrow(RecvError);
	});

	it("RecvError message for lagged includes count", () => {
		const err = new RecvError("lagged", 5);
		expect(err.message).toContain("5");
		expect(err.name).toBe("RecvError");
	});

	it("RecvError message for closed", () => {
		const err = new RecvError("closed");
		expect(err.message).toContain("closed");
		expect(err.lagged).toBeUndefined();
	});

	it("recv resolves when message sent while waiting", async () => {
		const [tx, rx] = broadcast<number>(16);
		const p = rx.recv();
		tx.send(42);
		expect(await p).toBe(42);
	});

	it("send after one sender closed but another alive still works", async () => {
		const [tx1, rx] = broadcast<number>(16);
		const tx2 = tx1.clone();
		tx1.close();

		tx2.send(1);
		expect(await rx.recv()).toBe(1);

		tx2.close();
		await expect(rx.recv()).rejects.toThrow(RecvError);
	});
});
