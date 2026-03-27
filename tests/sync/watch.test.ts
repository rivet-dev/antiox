import { describe, it, expect } from "vitest";
import {
	watch,
	WatchSender,
	WatchReceiver,
	RecvError,
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
});
