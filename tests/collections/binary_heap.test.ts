import { describe, it, expect } from "vitest";
import { BinaryHeap } from "../../src/collections/binary_heap";

describe("BinaryHeap", () => {
	it("push/pop max-heap order (numbers)", () => {
		const heap = new BinaryHeap<number>();
		heap.push(3);
		heap.push(1);
		heap.push(5);
		heap.push(2);

		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBe(3);
		expect(heap.pop()).toBe(2);
		expect(heap.pop()).toBe(1);
		expect(heap.pop()).toBeUndefined();
	});

	it("custom min-heap comparator", () => {
		const heap = new BinaryHeap<number>((a, b) => {
			if (a < b) return 1;
			if (a > b) return -1;
			return 0;
		});
		heap.push(10);
		heap.push(2);
		heap.push(7);
		heap.push(1);

		expect(heap.pop()).toBe(1);
		expect(heap.pop()).toBe(2);
		expect(heap.pop()).toBe(7);
		expect(heap.pop()).toBe(10);
	});

	it("peek without removing", () => {
		const heap = new BinaryHeap<number>();
		expect(heap.peek()).toBeUndefined();

		heap.push(5);
		heap.push(10);
		expect(heap.peek()).toBe(10);
		expect(heap.length).toBe(2);
	});

	it("isEmpty/length", () => {
		const heap = new BinaryHeap<number>();
		expect(heap.isEmpty()).toBe(true);
		expect(heap.length).toBe(0);

		heap.push(1);
		expect(heap.isEmpty()).toBe(false);
		expect(heap.length).toBe(1);

		heap.push(2);
		expect(heap.length).toBe(2);

		heap.pop();
		expect(heap.length).toBe(1);
	});

	it("toArray returns sorted", () => {
		const heap = new BinaryHeap<number>();
		heap.push(3);
		heap.push(1);
		heap.push(5);
		heap.push(2);

		expect(heap.toArray()).toEqual([5, 3, 2, 1]);
	});

	it("iterator yields elements", () => {
		const heap = new BinaryHeap<number>();
		heap.push(3);
		heap.push(1);
		heap.push(5);

		const items: number[] = [];
		for (const item of heap) {
			items.push(item);
		}
		expect(items.length).toBe(3);
		expect(items.sort((a, b) => a - b)).toEqual([1, 3, 5]);
	});

	it("push many then pop all gives sorted order", () => {
		const heap = new BinaryHeap<number>();
		const values = [4, 8, 2, 9, 1, 7, 3, 6, 5, 10];
		for (const v of values) {
			heap.push(v);
		}

		const result: number[] = [];
		while (!heap.isEmpty()) {
			result.push(heap.pop()!);
		}
		expect(result).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
	});

	it("empty heap operations", () => {
		const heap = new BinaryHeap<number>();
		expect(heap.isEmpty()).toBe(true);
		expect(heap.length).toBe(0);
		expect(heap.pop()).toBeUndefined();
		expect(heap.peek()).toBeUndefined();
		expect(heap.toArray()).toEqual([]);
		expect([...heap]).toEqual([]);
	});

	it("single element", () => {
		const heap = new BinaryHeap<number>();
		heap.push(42);
		expect(heap.peek()).toBe(42);
		expect(heap.length).toBe(1);
		expect(heap.pop()).toBe(42);
		expect(heap.isEmpty()).toBe(true);
		expect(heap.pop()).toBeUndefined();
	});

	it("equal priority elements are all retrievable", () => {
		const heap = new BinaryHeap<number>();
		heap.push(5);
		heap.push(5);
		heap.push(5);
		heap.push(5);
		expect(heap.length).toBe(4);
		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBeUndefined();
	});

	it("already sorted input (ascending)", () => {
		const heap = new BinaryHeap<number>();
		for (let i = 1; i <= 10; i++) heap.push(i);
		const result: number[] = [];
		while (!heap.isEmpty()) result.push(heap.pop()!);
		expect(result).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
	});

	it("already sorted input (descending)", () => {
		const heap = new BinaryHeap<number>();
		for (let i = 10; i >= 1; i--) heap.push(i);
		const result: number[] = [];
		while (!heap.isEmpty()) result.push(heap.pop()!);
		expect(result).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
	});

	it("all same values", () => {
		const heap = new BinaryHeap<number>();
		for (let i = 0; i < 100; i++) heap.push(7);
		expect(heap.length).toBe(100);
		for (let i = 0; i < 100; i++) {
			expect(heap.pop()).toBe(7);
		}
		expect(heap.isEmpty()).toBe(true);
	});

	it("interleaved push and pop maintains heap property", () => {
		const heap = new BinaryHeap<number>();
		heap.push(3);
		heap.push(1);
		expect(heap.pop()).toBe(3);
		heap.push(4);
		heap.push(1);
		expect(heap.pop()).toBe(4);
		heap.push(5);
		expect(heap.pop()).toBe(5);
		expect(heap.pop()).toBe(1);
		expect(heap.pop()).toBe(1);
		expect(heap.pop()).toBeUndefined();
	});

	it("clear then reuse", () => {
		const heap = new BinaryHeap<number>();
		heap.push(10);
		heap.push(20);
		heap.clear();
		expect(heap.isEmpty()).toBe(true);
		expect(heap.length).toBe(0);
		expect(heap.pop()).toBeUndefined();
		heap.push(5);
		heap.push(15);
		expect(heap.pop()).toBe(15);
		expect(heap.pop()).toBe(5);
	});

	it("toArray does not modify the heap", () => {
		const heap = new BinaryHeap<number>();
		heap.push(3);
		heap.push(1);
		heap.push(2);
		const arr = heap.toArray();
		expect(arr).toEqual([3, 2, 1]);
		expect(heap.length).toBe(3);
		expect(heap.peek()).toBe(3);
	});

	it("toArray on empty heap", () => {
		const heap = new BinaryHeap<number>();
		expect(heap.toArray()).toEqual([]);
	});

	it("string max-heap with default comparator", () => {
		const heap = new BinaryHeap<string>();
		heap.push("banana");
		heap.push("apple");
		heap.push("cherry");
		expect(heap.pop()).toBe("cherry");
		expect(heap.pop()).toBe("banana");
		expect(heap.pop()).toBe("apple");
	});

	it("custom comparator: priority by object field", () => {
		type Task = { name: string; priority: number };
		const heap = new BinaryHeap<Task>((a, b) => a.priority - b.priority);
		heap.push({ name: "low", priority: 1 });
		heap.push({ name: "high", priority: 10 });
		heap.push({ name: "mid", priority: 5 });
		expect(heap.pop()!.name).toBe("high");
		expect(heap.pop()!.name).toBe("mid");
		expect(heap.pop()!.name).toBe("low");
	});

	it("large heap maintains correctness", () => {
		const heap = new BinaryHeap<number>();
		const n = 10000;
		for (let i = 0; i < n; i++) heap.push(i);
		expect(heap.length).toBe(n);
		let prev = heap.pop()!;
		while (!heap.isEmpty()) {
			const curr = heap.pop()!;
			expect(curr).toBeLessThanOrEqual(prev);
			prev = curr;
		}
	});

	it("negative numbers", () => {
		const heap = new BinaryHeap<number>();
		heap.push(-5);
		heap.push(-1);
		heap.push(-10);
		heap.push(0);
		expect(heap.pop()).toBe(0);
		expect(heap.pop()).toBe(-1);
		expect(heap.pop()).toBe(-5);
		expect(heap.pop()).toBe(-10);
	});

	it("iterator does not consume elements", () => {
		const heap = new BinaryHeap<number>();
		heap.push(1);
		heap.push(2);
		heap.push(3);
		const items = [...heap];
		expect(items.length).toBe(3);
		expect(heap.length).toBe(3);
	});

	it("pop on single-element heap returns it", () => {
		const heap = new BinaryHeap<number>();
		heap.push(99);
		expect(heap.pop()).toBe(99);
		expect(heap.length).toBe(0);
	});

	it("two elements: pop returns max first", () => {
		const heap = new BinaryHeap<number>();
		heap.push(1);
		heap.push(2);
		expect(heap.pop()).toBe(2);
		expect(heap.pop()).toBe(1);
	});

	it("randomized stress test", () => {
		const heap = new BinaryHeap<number>();
		const values: number[] = [];
		for (let i = 0; i < 500; i++) {
			const v = Math.floor(Math.random() * 1000);
			values.push(v);
			heap.push(v);
		}
		values.sort((a, b) => b - a);
		const result: number[] = [];
		while (!heap.isEmpty()) {
			result.push(heap.pop()!);
		}
		expect(result).toEqual(values);
	});
});
