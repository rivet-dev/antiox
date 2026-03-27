import { describe, it, expect } from "vitest";
import {
	channel,
	unboundedChannel,
	Sender,
	Receiver,
	SendError,
	TrySendError,
	TryRecvError,
} from "../../src/sync/mpsc";

describe("bounded channel", () => {
	it("send and recv basic flow", async () => {
		const [tx, rx] = channel<string>(8);
		await tx.send("hello");
		expect(await rx.recv()).toBe("hello");
	});

	it("backpressure blocks send when full", async () => {
		const [tx, rx] = channel<number>(1);
		await tx.send(1);

		let sent = false;
		const sendPromise = tx.send(2).then(() => {
			sent = true;
		});

		await new Promise((r) => setTimeout(r, 10));
		expect(sent).toBe(false);

		expect(await rx.recv()).toBe(1);
		await sendPromise;
		expect(sent).toBe(true);
		expect(await rx.recv()).toBe(2);
	});

	it("trySend succeeds when space available", () => {
		const [tx, _rx] = channel<number>(2);
		tx.trySend(1);
		tx.trySend(2);
		expect(tx.capacity()).toBe(0);
	});

	it("trySend throws full when at capacity", () => {
		const [tx, _rx] = channel<number>(1);
		tx.trySend(1);
		expect(() => tx.trySend(2)).toThrow(TrySendError);
		try {
			tx.trySend(2);
		} catch (e) {
			expect((e as TrySendError<number>).kind).toBe("full");
			expect((e as TrySendError<number>).value).toBe(2);
		}
	});

	it("tryRecv succeeds when data available", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(42);
		expect(rx.tryRecv()).toBe(42);
	});

	it("tryRecv throws empty when no data", () => {
		const [_tx, rx] = channel<number>(8);
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("empty");
		}
	});

	it("multi-producer via clone", async () => {
		const [tx, rx] = channel<string>(8);
		const tx2 = tx.clone();
		await tx.send("from-1");
		await tx2.send("from-2");
		const results = [await rx.recv(), await rx.recv()];
		expect(results.sort()).toEqual(["from-1", "from-2"]);
	});

	it("disconnection: all senders drop -> recv returns null", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		tx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("disconnection: cloned senders all must drop", async () => {
		const [tx, rx] = channel<number>(8);
		const tx2 = tx.clone();
		tx.close();
		await tx2.send(1);
		tx2.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("receiver close -> senders get SendError", async () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		await expect(tx.send(1)).rejects.toThrow(SendError);
	});

	it("receiver close -> trySend throws closed", () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		expect(() => tx.trySend(1)).toThrow(TrySendError);
		try {
			tx.trySend(1);
		} catch (e) {
			expect((e as TrySendError<number>).kind).toBe("closed");
		}
	});

	it("async iterator drains then terminates", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		await tx.send(2);
		await tx.send(3);
		tx.close();

		const results: number[] = [];
		for await (const v of rx) {
			results.push(v);
		}
		expect(results).toEqual([1, 2, 3]);
	});

	it("capacity tracks correctly", async () => {
		const [tx, rx] = channel<number>(4);
		expect(tx.capacity()).toBe(4);
		await tx.send(1);
		expect(tx.capacity()).toBe(3);
		await tx.send(2);
		expect(tx.capacity()).toBe(2);
		await rx.recv();
		expect(tx.capacity()).toBe(3);
	});

	it("isClosed reflects receiver state", () => {
		const [tx, rx] = channel<number>(8);
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("closed() resolves when receiver closes", async () => {
		const [tx, rx] = channel<number>(8);
		let resolved = false;
		void tx.closed().then(() => {
			resolved = true;
		});
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(false);
		rx.close();
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(true);
	});

	it("channel(0) throws RangeError", () => {
		expect(() => channel(0)).toThrow(RangeError);
	});

	it("channel with negative capacity throws RangeError", () => {
		expect(() => channel(-1)).toThrow(RangeError);
	});

	it("send on dropped sender throws SendError", async () => {
		const [tx, _rx] = channel<number>(8);
		tx.close();
		await expect(tx.send(1)).rejects.toThrow(SendError);
	});

	it("trySend on dropped sender throws closed", () => {
		const [tx, _rx] = channel<number>(8);
		tx.close();
		try {
			tx.trySend(1);
		} catch (e) {
			expect(e).toBeInstanceOf(TrySendError);
			expect((e as TrySendError<number>).kind).toBe("closed");
		}
	});

	it("tryRecv returns buffered data after receiver close", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		await tx.send(2);
		rx.close();
		expect(rx.tryRecv()).toBe(1);
		expect(rx.tryRecv()).toBe(2);
	});

	it("tryRecv throws disconnected when all senders dropped and buffer empty", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		tx.close();
		rx.tryRecv();
		try {
			rx.tryRecv();
		} catch (e) {
			expect(e).toBeInstanceOf(TryRecvError);
			expect((e as TryRecvError).kind).toBe("disconnected");
		}
	});

	it("FIFO ordering is preserved", async () => {
		const [tx, rx] = channel<number>(8);
		for (let i = 0; i < 8; i++) {
			await tx.send(i);
		}
		for (let i = 0; i < 8; i++) {
			expect(await rx.recv()).toBe(i);
		}
	});

	it("waiting recv resolves null when all cloned senders drop", async () => {
		const [tx, rx] = channel<number>(8);
		const tx2 = tx.clone();
		const recvPromise = rx.recv();
		tx.close();
		tx2.close();
		expect(await recvPromise).toBeNull();
	});

	it("clone on dropped sender throws", () => {
		const [tx, _rx] = channel<number>(8);
		tx.close();
		expect(() => tx.clone()).toThrow();
	});

	it("sender close is idempotent", () => {
		const [tx, _rx] = channel<number>(8);
		tx.close();
		tx.close();
	});

	it("receiver close is idempotent", () => {
		const [_tx, rx] = channel<number>(8);
		rx.close();
		rx.close();
	});

	it("closed() resolves immediately when already closed", async () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		await tx.closed();
	});

	it("receiver close allows draining buffered messages via recv", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		await tx.send(2);
		rx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBe(2);
		expect(await rx.recv()).toBeNull();
	});

	it("send delivers directly when receiver is already waiting", async () => {
		const [tx, rx] = channel<number>(8);
		const recvPromise = rx.recv();
		await tx.send(42);
		expect(await recvPromise).toBe(42);
	});

	it("trySend delivers directly when receiver is already waiting", async () => {
		const [tx, rx] = channel<number>(8);
		const recvPromise = rx.recv();
		tx.trySend(99);
		expect(await recvPromise).toBe(99);
	});

	it("multiple blocked sends are unblocked in order", async () => {
		const [tx, rx] = channel<number>(1);
		await tx.send(0);

		const order: number[] = [];
		const p1 = tx.send(1).then(() => order.push(1));
		const p2 = tx.send(2).then(() => order.push(2));
		const p3 = tx.send(3).then(() => order.push(3));

		expect(await rx.recv()).toBe(0);
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBe(2);
		expect(await rx.recv()).toBe(3);
		await Promise.all([p1, p2, p3]);
		expect(order).toEqual([1, 2, 3]);
	});

	it("receiver close rejects blocked senders with SendError", async () => {
		const [tx, rx] = channel<number>(1);
		await tx.send(1);

		const sendPromise = tx.send(2);
		rx.close();
		await expect(sendPromise).rejects.toThrow(SendError);
	});

	it("SendError preserves the value", async () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		try {
			await tx.send(42);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(42);
		}
	});

	it("Symbol.dispose on sender closes it", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		tx[Symbol.dispose]();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("Symbol.dispose on receiver closes it", async () => {
		const [tx, rx] = channel<number>(8);
		rx[Symbol.dispose]();
		await expect(tx.send(1)).rejects.toThrow(SendError);
	});

	it("reserve returns permit that sends successfully", async () => {
		const [tx, rx] = channel<number>(8);
		const permit = await tx.reserve();
		permit.send(42);
		expect(await rx.recv()).toBe(42);
	});

	it("reserve on dropped sender throws SendError", async () => {
		const [tx, _rx] = channel<number>(8);
		tx.close();
		await expect(tx.reserve()).rejects.toThrow(SendError);
	});

	it("reserve on closed channel throws SendError", async () => {
		const [tx, rx] = channel<number>(8);
		rx.close();
		await expect(tx.reserve()).rejects.toThrow(SendError);
	});

	it("permit double-use throws", async () => {
		const [tx, _rx] = channel<number>(8);
		const permit = await tx.reserve();
		permit.send(1);
		expect(() => permit.send(2)).toThrow("OwnedPermit already used");
	});

	it("permit send on closed channel throws SendError", async () => {
		const [tx, rx] = channel<number>(8);
		const permit = await tx.reserve();
		rx.close();
		expect(() => permit.send(1)).toThrow(SendError);
	});

	it("permit dispose is safe without sending", async () => {
		const [tx, _rx] = channel<number>(8);
		const permit = await tx.reserve();
		permit[Symbol.dispose]();
		expect(() => permit.send(1)).toThrow("OwnedPermit already used");
	});

	it("permit delivers directly to waiting receiver", async () => {
		const [tx, rx] = channel<number>(8);
		const recvPromise = rx.recv();
		const permit = await tx.reserve();
		permit.send(55);
		expect(await recvPromise).toBe(55);
	});

	it("recv returns null after receiver close and buffer drain", async () => {
		const [tx, rx] = channel<number>(8);
		await tx.send(1);
		rx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});
});

describe("unbounded channel", () => {
	it("send and recv basic flow", async () => {
		const [tx, rx] = unboundedChannel<string>();
		tx.send("hello");
		expect(await rx.recv()).toBe("hello");
	});

	it("send is synchronous", () => {
		const [tx, _rx] = unboundedChannel<number>();
		tx.send(1);
		tx.send(2);
		tx.send(3);
	});

	it("disconnection: sender drop -> recv returns null", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("receiver close -> send throws", () => {
		const [tx, rx] = unboundedChannel<number>();
		rx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("async iterator", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx.send(2);
		tx.close();

		const results: number[] = [];
		for await (const v of rx) {
			results.push(v);
		}
		expect(results).toEqual([1, 2]);
	});

	it("tryRecv disconnected throws", () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.close();
		expect(() => rx.tryRecv()).toThrow(TryRecvError);
		try {
			rx.tryRecv();
		} catch (e) {
			expect((e as TryRecvError).kind).toBe("disconnected");
		}
	});

	it("tryRecv empty throws when sender alive but no data", () => {
		const [_tx, rx] = unboundedChannel<number>();
		try {
			rx.tryRecv();
		} catch (e) {
			expect(e).toBeInstanceOf(TryRecvError);
			expect((e as TryRecvError).kind).toBe("empty");
		}
	});

	it("send on dropped sender throws SendError", () => {
		const [tx, _rx] = unboundedChannel<number>();
		tx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("SendError preserves value on unbounded channel", () => {
		const [tx, rx] = unboundedChannel<number>();
		rx.close();
		try {
			tx.send(99);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(99);
		}
	});

	it("clone on dropped sender throws", () => {
		const [tx, _rx] = unboundedChannel<number>();
		tx.close();
		expect(() => tx.clone()).toThrow();
	});

	it("multi-producer via clone", async () => {
		const [tx, rx] = unboundedChannel<string>();
		const tx2 = tx.clone();
		tx.send("a");
		tx2.send("b");
		const results = [await rx.recv(), await rx.recv()];
		expect(results.sort()).toEqual(["a", "b"]);
	});

	it("all cloned senders must drop for recv to return null", async () => {
		const [tx, rx] = unboundedChannel<number>();
		const tx2 = tx.clone();
		tx.close();
		tx2.send(1);
		tx2.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("waiting recv resolves null when all senders drop", async () => {
		const [tx, rx] = unboundedChannel<number>();
		const tx2 = tx.clone();
		const recvPromise = rx.recv();
		tx.close();
		tx2.close();
		expect(await recvPromise).toBeNull();
	});

	it("sender close is idempotent", () => {
		const [tx, _rx] = unboundedChannel<number>();
		tx.close();
		tx.close();
	});

	it("receiver close is idempotent", () => {
		const [_tx, rx] = unboundedChannel<number>();
		rx.close();
		rx.close();
	});

	it("isClosed reflects receiver state", () => {
		const [tx, rx] = unboundedChannel<number>();
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("closed() resolves when receiver closes", async () => {
		const [tx, rx] = unboundedChannel<number>();
		let resolved = false;
		void tx.closed().then(() => {
			resolved = true;
		});
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(false);
		rx.close();
		await new Promise((r) => setTimeout(r, 10));
		expect(resolved).toBe(true);
	});

	it("closed() resolves immediately when already closed", async () => {
		const [tx, rx] = unboundedChannel<number>();
		rx.close();
		await tx.closed();
	});

	it("Symbol.dispose on sender closes it", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx[Symbol.dispose]();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBeNull();
	});

	it("Symbol.dispose on receiver closes it", () => {
		const [tx, rx] = unboundedChannel<number>();
		rx[Symbol.dispose]();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("send delivers directly when receiver is already waiting", async () => {
		const [tx, rx] = unboundedChannel<number>();
		const recvPromise = rx.recv();
		tx.send(42);
		expect(await recvPromise).toBe(42);
	});

	it("FIFO ordering is preserved", async () => {
		const [tx, rx] = unboundedChannel<number>();
		for (let i = 0; i < 100; i++) {
			tx.send(i);
		}
		for (let i = 0; i < 100; i++) {
			expect(await rx.recv()).toBe(i);
		}
	});

	it("receiver close allows draining buffered messages", async () => {
		const [tx, rx] = unboundedChannel<number>();
		tx.send(1);
		tx.send(2);
		rx.close();
		expect(await rx.recv()).toBe(1);
		expect(await rx.recv()).toBe(2);
		expect(await rx.recv()).toBeNull();
	});
});
