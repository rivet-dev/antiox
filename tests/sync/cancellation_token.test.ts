import { describe, it, expect } from "vitest";
import { CancellationToken } from "../../src/sync/cancellation_token";

describe("CancellationToken", () => {
	it("cancel() sets isCancelled", () => {
		const token = new CancellationToken();
		expect(token.isCancelled()).toBe(false);
		token.cancel();
		expect(token.isCancelled()).toBe(true);
	});

	it("cancelled() resolves on cancel", async () => {
		const token = new CancellationToken();
		let resolved = false;

		const p = token.cancelled().then(() => {
			resolved = true;
		});

		expect(resolved).toBe(false);
		token.cancel();
		await p;
		expect(resolved).toBe(true);
	});

	it("child() creates child token", () => {
		const parent = new CancellationToken();
		const child = parent.child();
		expect(child).toBeInstanceOf(CancellationToken);
		expect(child.isCancelled()).toBe(false);
	});

	it("cancelling parent cancels children", () => {
		const parent = new CancellationToken();
		const child = parent.child();

		expect(child.isCancelled()).toBe(false);
		parent.cancel();
		expect(child.isCancelled()).toBe(true);
	});

	it("cancelling child does NOT cancel parent", () => {
		const parent = new CancellationToken();
		const child = parent.child();

		child.cancel();
		expect(child.isCancelled()).toBe(true);
		expect(parent.isCancelled()).toBe(false);
	});

	it("deep nesting: grandchild cancelled by grandparent", () => {
		const grandparent = new CancellationToken();
		const parent = grandparent.child();
		const child = parent.child();

		expect(child.isCancelled()).toBe(false);
		grandparent.cancel();
		expect(parent.isCancelled()).toBe(true);
		expect(child.isCancelled()).toBe(true);
	});

	it("Symbol.dispose cancels", () => {
		const token = new CancellationToken();
		expect(token.isCancelled()).toBe(false);
		token[Symbol.dispose]();
		expect(token.isCancelled()).toBe(true);
	});

	it("cancelled() resolves immediately if already cancelled", async () => {
		const token = new CancellationToken();
		token.cancel();

		let resolved = false;
		await token.cancelled();
		resolved = true;
		expect(resolved).toBe(true);
	});

	it("child of already-cancelled parent is immediately cancelled", () => {
		const parent = new CancellationToken();
		parent.cancel();

		const child = parent.child();
		expect(child.isCancelled()).toBe(true);
	});

	it("cancel is idempotent", () => {
		const token = new CancellationToken();
		token.cancel();
		token.cancel();
		expect(token.isCancelled()).toBe(true);
	});

	it("cancelling one child does not affect siblings", () => {
		const parent = new CancellationToken();
		const child1 = parent.child();
		const child2 = parent.child();

		child1.cancel();

		expect(child1.isCancelled()).toBe(true);
		expect(child2.isCancelled()).toBe(false);
		expect(parent.isCancelled()).toBe(false);
	});

	it("cancelled() on child resolves when parent is cancelled", async () => {
		const parent = new CancellationToken();
		const child = parent.child();

		let childResolved = false;
		const p = child.cancelled().then(() => {
			childResolved = true;
		});

		expect(childResolved).toBe(false);
		parent.cancel();
		await p;
		expect(childResolved).toBe(true);
	});

	it("Symbol.dispose detaches child from parent", () => {
		const parent = new CancellationToken();
		const child = parent.child();

		child[Symbol.dispose]();
		expect(child.isCancelled()).toBe(true);

		// Parent should not be affected
		expect(parent.isCancelled()).toBe(false);
	});

	it("parent cancel after child dispose does not throw", () => {
		const parent = new CancellationToken();
		const child = parent.child();

		child[Symbol.dispose]();
		expect(() => parent.cancel()).not.toThrow();
		expect(parent.isCancelled()).toBe(true);
	});

	it("many children are all cancelled by parent", () => {
		const parent = new CancellationToken();
		const children = Array.from({ length: 100 }, () => parent.child());

		parent.cancel();

		for (const child of children) {
			expect(child.isCancelled()).toBe(true);
		}
	});

	it("deep nesting (4 levels): root cancels all descendants", () => {
		const root = new CancellationToken();
		const level1 = root.child();
		const level2 = level1.child();
		const level3 = level2.child();

		root.cancel();

		expect(level1.isCancelled()).toBe(true);
		expect(level2.isCancelled()).toBe(true);
		expect(level3.isCancelled()).toBe(true);
	});

	it("cancelling mid-level only affects descendants, not ancestors or siblings", () => {
		const root = new CancellationToken();
		const a = root.child();
		const b = root.child();
		const a1 = a.child();
		const a2 = a.child();
		const b1 = b.child();

		a.cancel();

		expect(root.isCancelled()).toBe(false);
		expect(a.isCancelled()).toBe(true);
		expect(a1.isCancelled()).toBe(true);
		expect(a2.isCancelled()).toBe(true);
		expect(b.isCancelled()).toBe(false);
		expect(b1.isCancelled()).toBe(false);
	});

	it("multiple cancelled() listeners all resolve", async () => {
		const token = new CancellationToken();
		const results: number[] = [];

		const p1 = token.cancelled().then(() => results.push(1));
		const p2 = token.cancelled().then(() => results.push(2));
		const p3 = token.cancelled().then(() => results.push(3));

		token.cancel();
		await Promise.all([p1, p2, p3]);

		expect(results).toHaveLength(3);
		expect(results).toContain(1);
		expect(results).toContain(2);
		expect(results).toContain(3);
	});
});
