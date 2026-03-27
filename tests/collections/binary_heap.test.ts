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
});
