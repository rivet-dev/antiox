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
});
