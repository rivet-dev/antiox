import { Deque } from "../internal/deque";

interface ReadWaiter<T> {
	resolve: (guard: RwLockReadGuard<T>) => void;
}

interface WriteWaiter<T> {
	resolve: (guard: RwLockWriteGuard<T>) => void;
}

// Writer-preferring: new readers wait if a writer is waiting, preventing writer starvation.
export class RwLock<T> {
	#value: T;
	#readerCount = 0;
	#writerActive = false;
	#writerWaiting = 0;
	#readWaiters: Deque<ReadWaiter<T>> = new Deque();
	#writeWaiters: Deque<WriteWaiter<T>> = new Deque();

	constructor(value: T) {
		this.#value = value;
	}

	read(): Promise<RwLockReadGuard<T>> {
		if (!this.#writerActive && this.#writerWaiting === 0) {
			this.#readerCount++;
			return Promise.resolve(new RwLockReadGuard(this));
		}

		return new Promise<RwLockReadGuard<T>>((resolve) => {
			this.#readWaiters.push({ resolve });
		});
	}

	write(): Promise<RwLockWriteGuard<T>> {
		if (!this.#writerActive && this.#readerCount === 0) {
			this.#writerActive = true;
			return Promise.resolve(new RwLockWriteGuard(this));
		}

		this.#writerWaiting++;
		return new Promise<RwLockWriteGuard<T>>((resolve) => {
			this.#writeWaiters.push({ resolve });
		});
	}

	tryRead(): RwLockReadGuard<T> {
		if (this.#writerActive || this.#writerWaiting > 0) {
			throw new Error("RwLock is held or has a waiting writer");
		}
		this.#readerCount++;
		return new RwLockReadGuard(this);
	}

	tryWrite(): RwLockWriteGuard<T> {
		if (this.#writerActive || this.#readerCount > 0) {
			throw new Error("RwLock is held");
		}
		this.#writerActive = true;
		return new RwLockWriteGuard(this);
	}

	_getValue(): T {
		return this.#value;
	}

	_setValue(v: T): void {
		this.#value = v;
	}

	_releaseRead(): void {
		this.#readerCount--;
		if (this.#readerCount === 0) {
			this.#wakeNext();
		}
	}

	_releaseWrite(): void {
		this.#writerActive = false;
		this.#wakeNext();
	}

	// Writers preferred: wake one writer if waiting, otherwise wake all readers.
	#wakeNext(): void {
		if (!this.#writeWaiters.isEmpty()) {
			this.#writerWaiting--;
			this.#writerActive = true;
			const waiter = this.#writeWaiters.shift()!;
			waiter.resolve(new RwLockWriteGuard(this));
			return;
		}

		while (!this.#readWaiters.isEmpty()) {
			this.#readerCount++;
			const waiter = this.#readWaiters.shift()!;
			waiter.resolve(new RwLockReadGuard(this));
		}
	}

	[Symbol.dispose](): void {
		if (this.#writerActive) {
			this._releaseWrite();
		}
		while (this.#readerCount > 0) {
			this._releaseRead();
		}
	}
}

export class RwLockReadGuard<T> {
	#lock: RwLock<T> | null;

	constructor(lock: RwLock<T>) {
		this.#lock = lock;
	}

	get value(): T {
		if (this.#lock === null) {
			throw new Error("RwLockReadGuard has been released");
		}
		return this.#lock._getValue();
	}

	release(): void {
		if (this.#lock === null) return;
		const lock = this.#lock;
		this.#lock = null;
		lock._releaseRead();
	}

	[Symbol.dispose](): void {
		this.release();
	}
}

export class RwLockWriteGuard<T> {
	#lock: RwLock<T> | null;

	constructor(lock: RwLock<T>) {
		this.#lock = lock;
	}

	get value(): T {
		if (this.#lock === null) {
			throw new Error("RwLockWriteGuard has been released");
		}
		return this.#lock._getValue();
	}

	set value(v: T) {
		if (this.#lock === null) {
			throw new Error("RwLockWriteGuard has been released");
		}
		this.#lock._setValue(v);
	}

	release(): void {
		if (this.#lock === null) return;
		const lock = this.#lock;
		this.#lock = null;
		lock._releaseWrite();
	}

	[Symbol.dispose](): void {
		this.release();
	}
}
