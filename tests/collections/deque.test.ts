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
});
