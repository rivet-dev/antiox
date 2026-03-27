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

	shift(): T | undefined {
		if (this.#len === 0) return undefined;
		const value = this.#buf[this.#head];
		this.#buf[this.#head] = undefined;
		this.#head = (this.#head + 1) % this.#buf.length;
		this.#len--;
		return value;
	}

	#grow(): void {
		const newBuf = new Array(this.#buf.length * 2);
		for (let i = 0; i < this.#len; i++) {
			newBuf[i] = this.#buf[(this.#head + i) % this.#buf.length];
		}
		this.#buf = newBuf;
		this.#head = 0;
	}
}
