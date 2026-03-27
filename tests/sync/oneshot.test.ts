import { describe, it, expect } from "vitest";
import {
	oneshot,
	OneshotSender,
	OneshotReceiver,
	RecvError,
	SendError,
} from "../../src/sync/oneshot";

describe("oneshot", () => {
	it("send then recv", async () => {
		const [tx, rx] = oneshot<number>();
		tx.send(42);
		const value = await rx;
		expect(value).toBe(42);
	});

	it("recv awaits until send", async () => {
		const [tx, rx] = oneshot<string>();
		setTimeout(() => tx.send("hello"), 20);
		const value = await rx;
		expect(value).toBe("hello");
	});

	it("receiver is PromiseLike (await works)", async () => {
		const [tx, rx] = oneshot<number>();
		tx.send(7);
		const value = await rx.then((v) => v * 2);
		expect(value).toBe(14);
	});

	it("sender dispose -> receiver rejects with RecvError", async () => {
		const [tx, rx] = oneshot<number>();
		{
			using _sender = tx;
		}
		await expect(rx).rejects.toThrow(RecvError);
	});

	it("receiver close -> sender throws SendError on send", () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("tryRecv before send throws RecvError", () => {
		const [_tx, rx] = oneshot<number>();
		expect(() => rx.tryRecv()).toThrow(RecvError);
	});

	it("tryRecv after send returns value", () => {
		const [tx, rx] = oneshot<number>();
		tx.send(99);
		expect(rx.tryRecv()).toBe(99);
	});

	it("double send throws SendError", () => {
		const [tx, _rx] = oneshot<number>();
		tx.send(1);
		expect(() => tx.send(2)).toThrow(SendError);
	});

	it("isClosed returns false initially, true after receiver close", () => {
		const [tx, rx] = oneshot<number>();
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("closed() resolves when receiver is dropped", async () => {
		const [tx, rx] = oneshot<number>();
		let resolved = false;
		const closedPromise = tx.closed().then(() => {
			resolved = true;
		});
		expect(resolved).toBe(false);
		rx.close();
		await closedPromise;
		expect(resolved).toBe(true);
	});

	it("closed() resolves immediately if receiver already closed", async () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		await tx.closed();
		expect(tx.isClosed()).toBe(true);
	});

	it("SendError preserves the value", () => {
		const [tx, rx] = oneshot<number>();
		rx.close();
		try {
			tx.send(123);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(123);
		}
	});

	it("send after dispose throws SendError", () => {
		const [tx, _rx] = oneshot<number>();
		tx[Symbol.dispose]();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("sender dispose is idempotent", () => {
		const [tx, _rx] = oneshot<number>();
		tx[Symbol.dispose]();
		tx[Symbol.dispose]();
	});

	it("receiver dispose is idempotent", () => {
		const [_tx, rx] = oneshot<number>();
		rx[Symbol.dispose]();
		rx[Symbol.dispose]();
	});

	it("receiver close is idempotent", () => {
		const [_tx, rx] = oneshot<number>();
		rx.close();
		rx.close();
	});

	it("tryRecv after sender disposed without sending throws RecvError", () => {
		const [tx, rx] = oneshot<number>();
		tx[Symbol.dispose]();
		expect(() => rx.tryRecv()).toThrow(RecvError);
	});

	it("await receiver multiple times after send resolves same value", async () => {
		const [tx, rx] = oneshot<number>();
		tx.send(42);
		expect(await rx).toBe(42);
		expect(await rx).toBe(42);
	});

	it("send undefined as a value", async () => {
		const [tx, rx] = oneshot<undefined>();
		tx.send(undefined);
		const value = await rx;
		expect(value).toBeUndefined();
	});

	it("send null as a value", async () => {
		const [tx, rx] = oneshot<null>();
		tx.send(null);
		const value = await rx;
		expect(value).toBeNull();
	});

	it("send falsy values (0, false, empty string)", async () => {
		const [tx1, rx1] = oneshot<number>();
		tx1.send(0);
		expect(await rx1).toBe(0);

		const [tx2, rx2] = oneshot<boolean>();
		tx2.send(false);
		expect(await rx2).toBe(false);

		const [tx3, rx3] = oneshot<string>();
		tx3.send("");
		expect(await rx3).toBe("");
	});

	it("double send preserves rejected value", () => {
		const [tx, _rx] = oneshot<number>();
		tx.send(1);
		try {
			tx.send(2);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(2);
		}
	});

	it("send after receiver close preserves value in error", () => {
		const [tx, rx] = oneshot<string>();
		rx.close();
		try {
			tx.send("lost");
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<string>).value).toBe("lost");
		}
	});

	it("receiver await rejects with RecvError when sender dropped before await", async () => {
		const [tx, rx] = oneshot<number>();
		tx[Symbol.dispose]();
		await expect(rx).rejects.toThrow(RecvError);
	});

	it("tryRecv returns same value on repeated calls", () => {
		const [tx, rx] = oneshot<number>();
		tx.send(7);
		expect(rx.tryRecv()).toBe(7);
		expect(rx.tryRecv()).toBe(7);
	});

	it("receiver close triggers sender closed() promise", async () => {
		const [tx, rx] = oneshot<number>();
		const closedPromise = tx.closed();
		rx[Symbol.dispose]();
		await closedPromise;
		expect(tx.isClosed()).toBe(true);
	});

	it("isClosed is false after send (sender closed but receiver is not)", () => {
		const [tx, rx] = oneshot<number>();
		tx.send(1);
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});
});
