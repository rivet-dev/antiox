export class Deque<T> {
	#buf: (T | undefined)[];
	#head = 0;
	#len = 0;

	constructor(capacity = 4) {
		this.#buf = new Array(Math.max(capacity, 4));
	}

	get length(): number {
		return this.#len;
	}

	isEmpty(): boolean {
		return this.#len === 0;
	}

	push(value: T): void {
		if (this.#len === this.#buf.length) {
			this.#grow();
		}
		const idx = (this.#head + this.#len) % this.#buf.length;
		this.#buf[idx] = value;
		this.#len++;
	}

	pushFront(value: T): void {
		if (this.#len === this.#buf.length) {
			this.#grow();
		}
		this.#head = (this.#head - 1 + this.#buf.length) % this.#buf.length;
		this.#buf[this.#head] = value;
		this.#len++;
	}

	shift(): T | undefined {
		if (this.#len === 0) return undefined;
		const value = this.#buf[this.#head];
		this.#buf[this.#head] = undefined;
		this.#head = (this.#head + 1) % this.#buf.length;
		this.#len--;
		return value;
	}

	pop(): T | undefined {
		if (this.#len === 0) return undefined;
		const idx = (this.#head + this.#len - 1) % this.#buf.length;
		const value = this.#buf[idx];
		this.#buf[idx] = undefined;
		this.#len--;
		return value;
	}

	peekFront(): T | undefined {
		if (this.#len === 0) return undefined;
		return this.#buf[this.#head];
	}

	peekBack(): T | undefined {
		if (this.#len === 0) return undefined;
		const idx = (this.#head + this.#len - 1) % this.#buf.length;
		return this.#buf[idx];
	}

	toArray(): T[] {
		const result: T[] = new Array(this.#len);
		for (let i = 0; i < this.#len; i++) {
			result[i] = this.#buf[(this.#head + i) % this.#buf.length] as T;
		}
		return result;
	}

	clear(): void {
		for (let i = 0; i < this.#len; i++) {
			this.#buf[(this.#head + i) % this.#buf.length] = undefined;
		}
		this.#head = 0;
		this.#len = 0;
	}

	[Symbol.iterator](): Iterator<T> {
		let index = 0;
		const self = this;
		return {
			next(): IteratorResult<T> {
				if (index >= self.#len) {
					return { done: true, value: undefined };
				}
				const value = self.#buf[(self.#head + index) % self.#buf.length] as T;
				index++;
				return { done: false, value };
			},
		};
	}

	#grow(): void {
		const newBuf: (T | undefined)[] = new Array(this.#buf.length * 2);
		for (let i = 0; i < this.#len; i++) {
			newBuf[i] = this.#buf[(this.#head + i) % this.#buf.length];
		}
		this.#buf = newBuf;
		this.#head = 0;
	}
}
