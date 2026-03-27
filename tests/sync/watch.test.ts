import { describe, it, expect } from "vitest";
import {
	watch,
	WatchSender,
	WatchReceiver,
	RecvError,
	SendError,
} from "../../src/sync/watch";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("watch", () => {
	it("initial value accessible via borrow()", () => {
		const [tx, rx] = watch(10);
		expect(rx.borrow()).toBe(10);
		expect(tx.borrow()).toBe(10);
	});

	it("send() updates value", () => {
		const [tx, rx] = watch(0);
		tx.send(42);
		expect(rx.borrow()).toBe(42);
	});

	it("changed() resolves when value changes", async () => {
		const [tx, rx] = watch("a");
		rx.borrowAndUpdate();
		setTimeout(() => tx.send("b"), 10);
		await rx.changed();
		expect(rx.borrow()).toBe("b");
	});

	it("multiple receivers via subscribe()", () => {
		const [tx, _rx] = watch(0);
		const rx1 = tx.subscribe();
		const rx2 = tx.subscribe();
		tx.send(5);
		expect(rx1.borrow()).toBe(5);
		expect(rx2.borrow()).toBe(5);
	});

	it("borrowAndUpdate() marks as seen, changed() waits for new change", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		await rx.changed();
		const val = rx.borrowAndUpdate();
		expect(val).toBe(1);

		let resolved = false;
		const p = rx.changed().then(() => {
			resolved = true;
		});

		await delay(10);
		expect(resolved).toBe(false);

		tx.send(2);
		await p;
		expect(resolved).toBe(true);
		expect(rx.borrow()).toBe(2);
	});

	it("sender close -> changed() rejects with RecvError", async () => {
		const [tx, rx] = watch(0);
		rx.borrowAndUpdate();
		tx.close();
		await expect(rx.changed()).rejects.toThrow(RecvError);
	});

	it("sender close rejects pending changed() waiters", async () => {
		const [tx, rx] = watch(0);
		rx.borrowAndUpdate();
		const p = rx.changed();
		tx.close();
		await expect(p).rejects.toThrow(RecvError);
	});

	it("clone() creates independent receiver", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		rx.borrowAndUpdate();

		const cloned = rx.clone();
		let cloneResolved = false;
		const cloneP = cloned.changed().then(() => {
			cloneResolved = true;
		});

		await delay(10);
		expect(cloneResolved).toBe(false);

		tx.send(2);
		await cloneP;
		expect(cloneResolved).toBe(true);
		expect(cloned.borrowAndUpdate()).toBe(2);
		expect(rx.borrow()).toBe(2);
	});

	it("isClosed tracks receiver count", () => {
		const [tx, rx] = watch(0);
		expect(tx.isClosed()).toBe(false);
		rx.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("sendIfModified returns true and wakes receivers when predicate returns true", async () => {
		const [tx, rx] = watch({ count: 0 });
		rx.borrowAndUpdate();

		let woken = false;
		const p = rx.changed().then(() => {
			woken = true;
		});

		const result = tx.sendIfModified((current) => {
			current.count = 5;
			return true;
		});

		expect(result).toBe(true);
		await p;
		expect(woken).toBe(true);
		expect(rx.borrow().count).toBe(5);
	});

	it("sendIfModified returns false and does not wake when predicate returns false", async () => {
		const [tx, rx] = watch({ count: 0 });
		rx.borrowAndUpdate();

		let woken = false;
		rx.changed().then(() => {
			woken = true;
		});

		const result = tx.sendIfModified((_current) => {
			return false;
		});

		expect(result).toBe(false);
		await delay(20);
		expect(woken).toBe(false);
	});

	it("send after sender close throws SendError", () => {
		const [tx, _rx] = watch(0);
		tx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("SendError preserves the value", () => {
		const [tx, _rx] = watch(0);
		tx.close();
		try {
			tx.send(42);
		} catch (e) {
			expect(e).toBeInstanceOf(SendError);
			expect((e as SendError<number>).value).toBe(42);
		}
	});

	it("send throws when all receivers are closed", () => {
		const [tx, rx] = watch(0);
		rx.close();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("send throws when all receivers including clones are closed", () => {
		const [tx, rx] = watch(0);
		const rx2 = rx.clone();
		rx.close();
		tx.send(1);
		rx2.close();
		expect(() => tx.send(2)).toThrow(SendError);
	});

	it("sendIfModified returns false when sender is closed", () => {
		const [tx, _rx] = watch(0);
		tx.close();
		const result = tx.sendIfModified(() => true);
		expect(result).toBe(false);
	});

	it("sendIfModified returns false when all receivers closed", () => {
		const [tx, rx] = watch(0);
		rx.close();
		const result = tx.sendIfModified(() => true);
		expect(result).toBe(false);
	});

	it("changed() resolves immediately when value is unseen", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		await rx.changed();
		expect(rx.borrow()).toBe(1);
	});

	it("multiple receivers all wake on send", async () => {
		const [tx, rx] = watch(0);
		const rx2 = tx.subscribe();
		rx.borrowAndUpdate();
		rx2.borrowAndUpdate();

		let woke1 = false;
		let woke2 = false;
		const p1 = rx.changed().then(() => { woke1 = true; });
		const p2 = rx2.changed().then(() => { woke2 = true; });

		tx.send(1);
		await Promise.all([p1, p2]);
		expect(woke1).toBe(true);
		expect(woke2).toBe(true);
	});

	it("clone receiver inherits seen version", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		rx.borrowAndUpdate();
		const cloned = rx.clone();

		let resolved = false;
		cloned.changed().then(() => { resolved = true; });

		await delay(10);
		expect(resolved).toBe(false);

		tx.send(2);
		await delay(10);
		expect(resolved).toBe(true);
	});

	it("clone receiver that has not seen initial value resolves changed() immediately", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		const cloned = rx.clone();
		await cloned.changed();
		expect(cloned.borrowAndUpdate()).toBe(1);
	});

	it("receiver close is idempotent", () => {
		const [_tx, rx] = watch(0);
		rx.close();
		rx.close();
	});

	it("sender close is idempotent", () => {
		const [tx, _rx] = watch(0);
		tx.close();
		tx.close();
	});

	it("Symbol.dispose on sender closes it", () => {
		const [tx, rx] = watch(0);
		rx.borrowAndUpdate();
		tx[Symbol.dispose]();
		expect(() => tx.send(1)).toThrow(SendError);
	});

	it("Symbol.dispose on receiver closes it", () => {
		const [tx, rx] = watch(0);
		rx[Symbol.dispose]();
		expect(tx.isClosed()).toBe(true);
	});

	it("borrow does not advance seen version", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		rx.borrow();
		await rx.changed();
		expect(rx.borrowAndUpdate()).toBe(1);
	});

	it("borrowAndUpdate advances seen version so changed() blocks", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		rx.borrowAndUpdate();

		let resolved = false;
		rx.changed().then(() => { resolved = true; });
		await delay(10);
		expect(resolved).toBe(false);

		tx.send(2);
		await delay(10);
		expect(resolved).toBe(true);
	});

	it("sender close rejects changed() on all receivers", async () => {
		const [tx, rx] = watch(0);
		const rx2 = tx.subscribe();
		rx.borrowAndUpdate();
		rx2.borrowAndUpdate();

		const p1 = rx.changed();
		const p2 = rx2.changed();
		tx.close();

		await expect(p1).rejects.toThrow(RecvError);
		await expect(p2).rejects.toThrow(RecvError);
	});

	it("borrow still works after sender close", () => {
		const [tx, rx] = watch(42);
		tx.close();
		expect(rx.borrow()).toBe(42);
	});

	it("isClosed accounts for subscribed receivers", () => {
		const [tx, rx] = watch(0);
		const rx2 = tx.subscribe();
		rx.close();
		expect(tx.isClosed()).toBe(false);
		rx2.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("subscribe increments receiver count after original close", () => {
		const [tx, rx] = watch(0);
		rx.close();
		expect(tx.isClosed()).toBe(true);
		const rx2 = tx.subscribe();
		expect(tx.isClosed()).toBe(false);
		rx2.close();
		expect(tx.isClosed()).toBe(true);
	});

	it("version increments correctly across multiple sends", async () => {
		const [tx, rx] = watch(0);
		rx.borrowAndUpdate();

		tx.send(1);
		await rx.changed();
		rx.borrowAndUpdate();

		tx.send(2);
		await rx.changed();
		rx.borrowAndUpdate();

		tx.send(3);
		await rx.changed();
		expect(rx.borrowAndUpdate()).toBe(3);
	});

	it("changed() after sender close rejects even if value was unseen", async () => {
		const [tx, rx] = watch(0);
		tx.send(1);
		tx.close();
		await expect(rx.changed()).rejects.toThrow(RecvError);
	});
});
