function defaultCompare<T>(a: T, b: T): number {
	if (a > b) return 1;
	if (a < b) return -1;
	return 0;
}

export class BinaryHeap<T> {
	#data: T[] = [];
	#compare: (a: T, b: T) => number;

	constructor(compare?: (a: T, b: T) => number) {
		this.#compare = compare ?? defaultCompare;
	}

	get length(): number {
		return this.#data.length;
	}

	isEmpty(): boolean {
		return this.#data.length === 0;
	}

	push(value: T): void {
		this.#data.push(value);
		this.#siftUp(this.#data.length - 1);
	}

	pop(): T | undefined {
		const len = this.#data.length;
		if (len === 0) return undefined;
		if (len === 1) return this.#data.pop();

		const top = this.#data[0];
		this.#data[0] = this.#data.pop()!;
		this.#siftDown(0);
		return top;
	}

	peek(): T | undefined {
		return this.#data[0];
	}

	toArray(): T[] {
		const sorted = this.#data.slice();
		sorted.sort((a, b) => -this.#compare(a, b));
		return sorted;
	}

	clear(): void {
		this.#data.length = 0;
	}

	[Symbol.iterator](): Iterator<T> {
		let index = 0;
		const data = this.#data;
		return {
			next(): IteratorResult<T> {
				if (index >= data.length) {
					return { done: true, value: undefined };
				}
				return { done: false, value: data[index++] };
			},
		};
	}

	#siftUp(index: number): void {
		while (index > 0) {
			const parent = (index - 1) >> 1;
			if (this.#compare(this.#data[index]!, this.#data[parent]!) <= 0) break;
			this.#swap(index, parent);
			index = parent;
		}
	}

	#siftDown(index: number): void {
		const len = this.#data.length;
		while (true) {
			let largest = index;
			const left = 2 * index + 1;
			const right = 2 * index + 2;

			if (left < len && this.#compare(this.#data[left]!, this.#data[largest]!) > 0) {
				largest = left;
			}
			if (right < len && this.#compare(this.#data[right]!, this.#data[largest]!) > 0) {
				largest = right;
			}
			if (largest === index) break;

			this.#swap(index, largest);
			index = largest;
		}
	}

	#swap(i: number, j: number): void {
		const tmp = this.#data[i]!;
		this.#data[i] = this.#data[j]!;
		this.#data[j] = tmp;
	}
}
