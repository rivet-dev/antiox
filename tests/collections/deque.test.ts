import { describe, it, expect } from "vitest";
import { Deque } from "../../src/collections/deque";

describe("Deque", () => {
	it("push/shift FIFO order", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.push(3);

		expect(dq.shift()).toBe(1);
		expect(dq.shift()).toBe(2);
		expect(dq.shift()).toBe(3);
		expect(dq.shift()).toBeUndefined();
	});

	it("push/pop LIFO from back", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.push(3);

		expect(dq.pop()).toBe(3);
		expect(dq.pop()).toBe(2);
		expect(dq.pop()).toBe(1);
		expect(dq.pop()).toBeUndefined();
	});

	it("pushFront adds to front", () => {
		const dq = new Deque<string>();
		dq.push("b");
		dq.pushFront("a");

		expect(dq.shift()).toBe("a");
		expect(dq.shift()).toBe("b");
	});

	it("peekFront/peekBack without removing", () => {
		const dq = new Deque<number>();
		dq.push(10);
		dq.push(20);
		dq.push(30);

		expect(dq.peekFront()).toBe(10);
		expect(dq.peekBack()).toBe(30);
		expect(dq.length).toBe(3);
	});

	it("toArray returns all elements in order", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.push(3);

		expect(dq.toArray()).toEqual([1, 2, 3]);
	});

	it("clear empties the deque", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.clear();

		expect(dq.length).toBe(0);
		expect(dq.isEmpty()).toBe(true);
		expect(dq.shift()).toBeUndefined();
	});

	it("iterator yields in order", () => {
		const dq = new Deque<number>();
		dq.push(10);
		dq.push(20);
		dq.push(30);

		const items: number[] = [];
		for (const item of dq) {
			items.push(item);
		}
		expect(items).toEqual([10, 20, 30]);
	});

	it("grows beyond initial capacity", () => {
		const dq = new Deque<number>(4);
		for (let i = 0; i < 20; i++) {
			dq.push(i);
		}
		expect(dq.length).toBe(20);
		expect(dq.toArray()).toEqual(Array.from({ length: 20 }, (_, i) => i));
	});

	it("empty deque operations", () => {
		const dq = new Deque<number>();
		expect(dq.isEmpty()).toBe(true);
		expect(dq.length).toBe(0);
		expect(dq.shift()).toBeUndefined();
		expect(dq.pop()).toBeUndefined();
		expect(dq.peekFront()).toBeUndefined();
		expect(dq.peekBack()).toBeUndefined();
		expect(dq.toArray()).toEqual([]);
		expect([...dq]).toEqual([]);
	});

	it("single element push/pop", () => {
		const dq = new Deque<number>();
		dq.push(1);
		expect(dq.peekFront()).toBe(1);
		expect(dq.peekBack()).toBe(1);
		expect(dq.length).toBe(1);
		expect(dq.pop()).toBe(1);
		expect(dq.isEmpty()).toBe(true);
	});

	it("single element pushFront/shift", () => {
		const dq = new Deque<number>();
		dq.pushFront(1);
		expect(dq.peekFront()).toBe(1);
		expect(dq.peekBack()).toBe(1);
		expect(dq.shift()).toBe(1);
		expect(dq.isEmpty()).toBe(true);
	});

	it("wrap-around: pushFront forces head below zero", () => {
		const dq = new Deque<number>(4);
		dq.pushFront(3);
		dq.pushFront(2);
		dq.pushFront(1);
		expect(dq.toArray()).toEqual([1, 2, 3]);
		expect(dq.shift()).toBe(1);
		expect(dq.shift()).toBe(2);
		expect(dq.shift()).toBe(3);
	});

	it("wrap-around: mixed push/shift causes ring buffer wrap", () => {
		const dq = new Deque<number>(4);
		dq.push(1);
		dq.push(2);
		dq.push(3);
		dq.shift();
		dq.shift();
		dq.push(4);
		dq.push(5);
		dq.push(6);
		expect(dq.toArray()).toEqual([3, 4, 5, 6]);
	});

	it("wrap-around with growth", () => {
		const dq = new Deque<number>(4);
		dq.push(1);
		dq.push(2);
		dq.push(3);
		dq.shift();
		dq.shift();
		// head is now at index 2, len is 1 (only [3])
		// fill to trigger grow with a wrapped buffer
		dq.push(4);
		dq.push(5);
		dq.push(6);
		dq.push(7); // triggers grow
		expect(dq.toArray()).toEqual([3, 4, 5, 6, 7]);
		expect(dq.shift()).toBe(3);
		expect(dq.pop()).toBe(7);
	});

	it("pushFront triggers growth", () => {
		const dq = new Deque<number>(4);
		dq.pushFront(4);
		dq.pushFront(3);
		dq.pushFront(2);
		dq.pushFront(1);
		// buffer full, next pushFront triggers grow
		dq.pushFront(0);
		expect(dq.toArray()).toEqual([0, 1, 2, 3, 4]);
		expect(dq.length).toBe(5);
	});

	it("interleaved pushFront and push", () => {
		const dq = new Deque<number>();
		dq.push(3);
		dq.pushFront(2);
		dq.push(4);
		dq.pushFront(1);
		expect(dq.toArray()).toEqual([1, 2, 3, 4]);
	});

	it("clear then reuse", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.clear();
		expect(dq.isEmpty()).toBe(true);
		dq.push(3);
		dq.pushFront(0);
		expect(dq.toArray()).toEqual([0, 3]);
	});

	it("iterator sees live length (not snapshotted)", () => {
		const dq = new Deque<number>();
		dq.push(1);
		dq.push(2);
		dq.push(3);
		const iter = dq[Symbol.iterator]();
		expect(iter.next()).toEqual({ done: false, value: 1 });
		dq.push(4);
		expect(iter.next()).toEqual({ done: false, value: 2 });
		expect(iter.next()).toEqual({ done: false, value: 3 });
		// iterator reads #len live, so the newly pushed element is visible
		expect(iter.next()).toEqual({ done: false, value: 4 });
		expect(iter.next()).toEqual({ done: true, value: undefined });
	});

	it("iterator on empty deque", () => {
		const dq = new Deque<number>();
		const items = [...dq];
		expect(items).toEqual([]);
	});

	it("minimum capacity is 4 even if 0 is passed", () => {
		const dq = new Deque<number>(0);
		dq.push(1);
		dq.push(2);
		dq.push(3);
		dq.push(4);
		expect(dq.toArray()).toEqual([1, 2, 3, 4]);
	});

	it("minimum capacity is 4 even if negative is passed", () => {
		const dq = new Deque<number>(-10);
		dq.push(1);
		expect(dq.length).toBe(1);
		expect(dq.shift()).toBe(1);
	});

	it("large number of elements", () => {
		const dq = new Deque<number>();
		const n = 10000;
		for (let i = 0; i < n; i++) dq.push(i);
		expect(dq.length).toBe(n);
		expect(dq.peekFront()).toBe(0);
		expect(dq.peekBack()).toBe(n - 1);
		for (let i = 0; i < n; i++) {
			expect(dq.shift()).toBe(i);
		}
		expect(dq.isEmpty()).toBe(true);
	});

	it("pop from back after wrap-around", () => {
		const dq = new Deque<number>(4);
		dq.push(1);
		dq.push(2);
		dq.push(3);
		dq.push(4);
		dq.shift(); // remove 1, head moves
		dq.shift(); // remove 2, head moves
		dq.push(5); // wraps around
		dq.push(6); // wraps around
		expect(dq.pop()).toBe(6);
		expect(dq.pop()).toBe(5);
		expect(dq.pop()).toBe(4);
		expect(dq.pop()).toBe(3);
		expect(dq.pop()).toBeUndefined();
	});

	it("stores undefined and null as valid values", () => {
		const dq = new Deque<undefined | null>();
		dq.push(undefined);
		dq.push(null);
		expect(dq.length).toBe(2);
		expect(dq.peekFront()).toBeUndefined();
		expect(dq.peekBack()).toBeNull();
		expect(dq.shift()).toBeUndefined();
		expect(dq.shift()).toBeNull();
	});

	it("toArray after wrap-around is correct", () => {
		const dq = new Deque<number>(4);
		dq.push(1);
		dq.push(2);
		dq.push(3);
		dq.push(4);
		dq.shift();
		dq.shift();
		dq.push(5);
		dq.push(6);
		expect(dq.toArray()).toEqual([3, 4, 5, 6]);
	});
});
